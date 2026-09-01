import {
  computeContentHash,
  computeAstStructuralHash,
  computeSemanticValidityHash,
  type SuperNode,
  type SubstrateEdge,
} from '@pigeongraph/schema';

export interface ParseOptions {
  repoId: string;
  filePath: string;
  content: string;
  epoch: number;
  lamportClock: number;
}

export interface ParseResult {
  nodes: SuperNode[];
  edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>;
  fileHash: string;
}

/**
 * Universal AST & Symbol Extractor for Substrate Layer.
 */
export class AstExtractor {
  public parseFile(options: ParseOptions): ParseResult {
    const { repoId, filePath, content, epoch, lamportClock } = options;
    const language = this.detectLanguage(filePath);
    const fileHash = computeContentHash(content);
    const lines = content.split(/\r?\n/);

    const nodes: SuperNode[] = [];
    const edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }> = [];

    // Create Root File Node
    const fileNodeId = `sg://${repoId}/${filePath}`;
    const fileNode: SuperNode = {
      id: fileNodeId,
      urn: `urn:supergraph:${repoId}:${filePath}`,
      kind: 'file',
      name: filePath.split('/').pop() ?? filePath,
      qualifiedName: filePath,
      repoId,
      versioning: {
        lamportClock,
        vectorClock: { substrate: lamportClock },
        layerEpochs: {
          substrateEpoch: epoch,
          semanticEpoch: 0,
          processEpoch: 0,
        },
        contentSha256: fileHash,
        astStructuralHash: computeAstStructuralHash(content),
        semanticValidityHash: computeSemanticValidityHash({
          name: filePath,
          kind: 'file',
        }),
        lastModifiedTimestampMs: Date.now(),
      },
      substrate: {
        sourceLocation: {
          filePath,
          startLine: 1,
          startColumn: 0,
          endLine: Math.max(lines.length, 1),
          endColumn: (lines[lines.length - 1] ?? '').length,
        },
        language,
        outgoingEdges: [],
        astEpochTimestamp: new Date().toISOString(),
      },
      semantic: {
        validityStatus: 'VALID',
        communityClusters: [],
        semanticEmbeddings: [],
      },
      processFlow: {
        isEntryPoint: false,
        entryPointScore: 0,
        processFlowSequences: [],
        crossRepoContracts: [],
      },
    };
    nodes.push(fileNode);

    // Parse language-specific symbols
    switch (language) {
      case 'typescript':
      case 'javascript':
        this.parseTypeScript(options, lines, fileNode, nodes, edges);
        break;
      case 'python':
        this.parsePython(options, lines, fileNode, nodes, edges);
        break;
      default:
        this.parseGeneric(options, lines, fileNode, nodes, edges);
        break;
    }

    return { nodes, edges, fileHash };
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'mts':
        return 'typescript';
      case 'js':
      case 'jsx':
      case 'mjs':
        return 'javascript';
      case 'py':
        return 'python';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'java':
        return 'java';
      case 'c':
      case 'h':
        return 'c';
      case 'cpp':
      case 'hpp':
        return 'cpp';
      default:
        return 'plaintext';
    }
  }

  private parseTypeScript(
    options: ParseOptions,
    lines: string[],
    fileNode: SuperNode,
    nodes: SuperNode[],
    edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    const { repoId, filePath, epoch, lamportClock } = options;

    const classRegex = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$]+))?(?:\s+implements\s+([^{]+))?/i;
    const importRegex = /^\s*import\s+(?:\{([^}]+)\}|([a-zA-Z0-9_$]+))\s+from\s+['"]([^'"]+)['"]/i;
    const functionRegex = /^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)(?:\s*:\s*([^{;]+))?/i;
    const arrowFnRegex = /^\s*(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/i;

    let currentClassNode: SuperNode | null = null;
    let braceDepth = 0;
    let classBraceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Count braces
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Check if class closed
      if (currentClassNode && braceDepth < classBraceDepth) {
        currentClassNode = null;
      }

      // Imports
      const importMatch = line.match(importRegex);
      if (importMatch) {
        const importedSymbols = (importMatch[1] ?? importMatch[2] ?? '').split(',').map((s) => s.trim());
        const modulePath = importMatch[3];
        for (const symbol of importedSymbols) {
          if (!symbol) continue;
          const importEdge: SubstrateEdge = {
            targetId: `sg://${repoId}/${modulePath}#${symbol}`,
            kind: 'IMPORTS',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            provenance: 'tree-sitter-ast',
            location: {
              filePath,
              startLine: lineNum,
              startColumn: line.indexOf(symbol),
              endLine: lineNum,
              endColumn: line.indexOf(symbol) + symbol.length,
            },
          };
          fileNode.substrate.outgoingEdges.push(importEdge);
          edges.push({ sourceId: fileNode.id, targetId: importEdge.targetId, edge: importEdge });
        }
        continue;
      }

      // Class Declaration
      const classMatch = line.match(classRegex);
      if (classMatch) {
        const className = classMatch[1];
        const extendsName = classMatch[2];
        const classNodeId = `sg://${repoId}/${filePath}#${className}`;
        classBraceDepth = braceDepth;

        const classNode: SuperNode = {
          id: classNodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${className}`,
          kind: 'class',
          name: className,
          qualifiedName: className,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: className, kind: 'class' }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: {
              filePath,
              startLine: lineNum,
              startColumn: line.indexOf(className),
              endLine: lineNum + 10,
              endColumn: 1,
            },
            language: 'typescript',
            symbolSignature: line.trim(),
            visibility: 'public',
            modifiers: line.includes('export') ? ['exported'] : [],
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
        };

        if (extendsName) {
          classNode.substrate.outgoingEdges.push({
            targetId: `sg://${repoId}/${filePath}#${extendsName}`,
            kind: 'EXTENDS',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            provenance: 'tree-sitter-ast',
          });
        }

        fileNode.substrate.outgoingEdges.push({
          targetId: classNodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });

        nodes.push(classNode);
        currentClassNode = classNode;
        continue;
      }

      // Method inside Class
      if (currentClassNode && trimmed.includes('(') && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('switch') && !trimmed.startsWith('catch')) {
        const parenIdx = trimmed.indexOf('(');
        const beforeParen = trimmed.substring(0, parenIdx).trim();
        const tokens = beforeParen.split(/\s+/);
        const methodName = tokens[tokens.length - 1];

        if (methodName && /^[a-zA-Z0-9_$]+$/.test(methodName) && methodName !== 'function' && methodName !== 'constructor' && methodName !== 'if' && methodName !== 'for') {
          const afterParen = trimmed.substring(parenIdx + 1);
          const closeParenIdx = afterParen.indexOf(')');
          const paramsRaw = closeParenIdx !== -1 ? afterParen.substring(0, closeParenIdx) : '';
          const afterClose = closeParenIdx !== -1 ? afterParen.substring(closeParenIdx + 1).trim() : '';
          const returnType = afterClose.startsWith(':') ? afterClose.substring(1).replace(/[{;].*$/, '').trim() : undefined;

          const methodNodeId = `sg://${repoId}/${filePath}#${currentClassNode.name}.${methodName}`;
          const isPrivate = tokens.includes('private');
          const isProtected = tokens.includes('protected');
          const isStatic = tokens.includes('static');
          const isAsync = tokens.includes('async');

          const methodNode: SuperNode = {
            id: methodNodeId,
            urn: `urn:supergraph:${repoId}:${filePath}#${currentClassNode.name}.${methodName}`,
            kind: 'method',
            name: methodName,
            qualifiedName: `${currentClassNode.name}.${methodName}`,
            repoId,
            versioning: {
              lamportClock,
              vectorClock: { substrate: lamportClock },
              layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
              contentSha256: computeContentHash(line),
              astStructuralHash: computeAstStructuralHash(line),
              semanticValidityHash: computeSemanticValidityHash({
                name: methodName,
                kind: 'method',
                signature: line.trim(),
                returnType,
              }),
              lastModifiedTimestampMs: Date.now(),
            },
            substrate: {
              sourceLocation: {
                filePath,
                startLine: lineNum,
                startColumn: line.indexOf(methodName),
                endLine: lineNum + 5,
                endColumn: 1,
              },
              language: 'typescript',
              symbolSignature: line.trim(),
              visibility: isPrivate ? 'private' : isProtected ? 'protected' : 'public',
              modifiers: [
                ...(isAsync ? ['async' as const] : []),
                ...(isStatic ? ['static' as const] : []),
              ],
              returnType,
              parameters: this.parseParameters(paramsRaw),
              outgoingEdges: [],
              astEpochTimestamp: new Date().toISOString(),
            },
            semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
            processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
          };

          currentClassNode.substrate.outgoingEdges.push({
            targetId: methodNodeId,
            kind: 'CONTAINS',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            provenance: 'tree-sitter-ast',
          });

          nodes.push(methodNode);
          continue;
        }
      }

      // Top-level Function or Arrow Function
      const fnMatch = line.match(functionRegex) ?? line.match(arrowFnRegex);
      if (fnMatch && !currentClassNode) {
        const fnName = fnMatch[1];
        const paramsRaw = fnMatch[2];
        const returnType = fnMatch[3]?.trim();
        const fnNodeId = `sg://${repoId}/${filePath}#${fnName}`;

        const isExported = line.includes('export');
        const isAsync = line.includes('async');

        const fnNode: SuperNode = {
          id: fnNodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${fnName}`,
          kind: 'function',
          name: fnName,
          qualifiedName: fnName,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({
              name: fnName,
              kind: 'function',
              signature: line.trim(),
              returnType,
              modifiers: [
                ...(isExported ? ['exported'] : []),
                ...(isAsync ? ['async'] : []),
              ],
            }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: {
              filePath,
              startLine: lineNum,
              startColumn: line.indexOf(fnName),
              endLine: lineNum + 5,
              endColumn: 1,
            },
            language: 'typescript',
            symbolSignature: line.trim(),
            visibility: isExported ? 'public' : 'internal',
            modifiers: [
              ...(isExported ? ['exported' as const] : []),
              ...(isAsync ? ['async' as const] : []),
            ],
            returnType,
            parameters: this.parseParameters(paramsRaw),
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: isExported, entryPointScore: isExported ? 0.7 : 0.2, processFlowSequences: [], crossRepoContracts: [] },
        };

        fileNode.substrate.outgoingEdges.push({
          targetId: fnNodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });

        nodes.push(fnNode);
      }
    }
  }

  private parsePython(
    options: ParseOptions,
    lines: string[],
    fileNode: SuperNode,
    nodes: SuperNode[],
    _edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    const { repoId, filePath, epoch, lamportClock } = options;
    const defRegex = /^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/i;
    const classRegex = /^\s*class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/i;

    let currentClass: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      const classMatch = line.match(classRegex);
      if (classMatch) {
        const className = classMatch[1];
        currentClass = className;
        const classNodeId = `sg://${repoId}/${filePath}#${className}`;
        const classNode: SuperNode = {
          id: classNodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${className}`,
          kind: 'class',
          name: className,
          qualifiedName: className,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: className, kind: 'class' }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(className), endLine: lineNum + 5, endColumn: 1 },
            language: 'python',
            symbolSignature: line.trim(),
            visibility: 'public',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
        };
        fileNode.substrate.outgoingEdges.push({ targetId: classNodeId, kind: 'CONTAINS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' });
        nodes.push(classNode);
        continue;
      }

      const defMatch = line.match(defRegex);
      if (defMatch) {
        const fnName = defMatch[1];
        const qname = currentClass ? `${currentClass}.${fnName}` : fnName;
        const fnNodeId = `sg://${repoId}/${filePath}#${qname}`;
        const fnNode: SuperNode = {
          id: fnNodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${qname}`,
          kind: currentClass ? 'method' : 'function',
          name: fnName,
          qualifiedName: qname,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: fnName, kind: 'function', signature: line.trim() }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(fnName), endLine: lineNum + 4, endColumn: 1 },
            language: 'python',
            symbolSignature: line.trim(),
            visibility: fnName.startsWith('_') ? 'private' : 'public',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: !fnName.startsWith('_'), entryPointScore: fnName.startsWith('_') ? 0.1 : 0.6, processFlowSequences: [], crossRepoContracts: [] },
        };
        fileNode.substrate.outgoingEdges.push({ targetId: fnNodeId, kind: 'CONTAINS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' });
        nodes.push(fnNode);
      }
    }
  }

  private parseGeneric(
    options: ParseOptions,
    lines: string[],
    fileNode: SuperNode,
    nodes: SuperNode[],
    _edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    const { repoId, filePath, epoch, lamportClock } = options;
    const fnRegex = /(?:fn|func|function|def)\s+([a-zA-Z0-9_]+)\s*\(/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(fnRegex);
      if (match) {
        const fnName = match[1];
        const fnNodeId = `sg://${repoId}/${filePath}#${fnName}`;
        const fnNode: SuperNode = {
          id: fnNodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${fnName}`,
          kind: 'function',
          name: fnName,
          qualifiedName: fnName,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: fnName, kind: 'function', signature: line.trim() }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: i + 1, startColumn: line.indexOf(fnName), endLine: i + 3, endColumn: 1 },
            language: 'generic',
            symbolSignature: line.trim(),
            visibility: 'public',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: false, entryPointScore: 0.5, processFlowSequences: [], crossRepoContracts: [] },
        };
        fileNode.substrate.outgoingEdges.push({ targetId: fnNodeId, kind: 'CONTAINS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' });
        nodes.push(fnNode);
      }
    }
  }

  private parseParameters(paramsRaw?: string): Array<{ name: string; type: string }> {
    if (!paramsRaw || !paramsRaw.trim()) return [];
    return paramsRaw.split(',').map((param) => {
      const parts = param.split(':');
      const name = parts[0]?.trim().replace(/^[^a-zA-Z0-9_$]+/, '') ?? 'arg';
      const type = parts[1]?.trim() ?? 'any';
      return { name, type };
    });
  }
}
