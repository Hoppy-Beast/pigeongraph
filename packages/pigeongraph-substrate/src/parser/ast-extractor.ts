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
      case 'go':
        this.parseGo(options, lines, fileNode, nodes, edges);
        break;
      case 'rust':
        this.parseRust(options, lines, fileNode, nodes, edges);
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
    const functionRegex = /^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*(?:\(([^)]*)\))?/i;
    const arrowFnRegex = /^\s*(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:<[^>]+>\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+|\()/i;

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
      if (
        currentClassNode &&
        braceDepth <= classBraceDepth + 1 &&
        trimmed.includes('(') &&
        !trimmed.startsWith('if') &&
        !trimmed.startsWith('for') &&
        !trimmed.startsWith('while') &&
        !trimmed.startsWith('switch') &&
        !trimmed.startsWith('catch') &&
        !trimmed.startsWith('return') &&
        !trimmed.startsWith('throw') &&
        !trimmed.startsWith('const') &&
        !trimmed.startsWith('let') &&
        !trimmed.startsWith('var') &&
        !trimmed.startsWith('case') &&
        !trimmed.startsWith('await') &&
        !trimmed.startsWith('yield')
      ) {
        const parenIdx = trimmed.indexOf('(');
        const beforeParen = trimmed.substring(0, parenIdx).trim();

        if (
          !beforeParen.includes('.') &&
          !beforeParen.includes(':') &&
          !beforeParen.includes('=') &&
          !beforeParen.includes('"') &&
          !beforeParen.includes("'") &&
          !beforeParen.includes('`')
        ) {
          const tokens = beforeParen.split(/\s+/);
          const methodName = tokens[tokens.length - 1];

          if (
            methodName &&
            /^[a-zA-Z0-9_$]+$/.test(methodName) &&
            methodName !== 'function' &&
            methodName !== 'constructor' &&
            methodName !== 'if' &&
            methodName !== 'for' &&
            methodName !== 'new'
          ) {
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

          let methodEndLine = lineNum;
          let methodBraces = 0;
          let foundMethodOpen = false;
          for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
              if (ch === '{') { methodBraces++; foundMethodOpen = true; }
              if (ch === '}') { methodBraces--; }
            }
            if (foundMethodOpen && methodBraces <= 0) {
              methodEndLine = j + 1;
              break;
            }
          }
          if (!foundMethodOpen) methodEndLine = Math.min(lineNum + 5, lines.length);
          const methodContent = lines.slice(i, methodEndLine).join('\n');

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
              contentSha256: computeContentHash(methodContent),
              astStructuralHash: computeAstStructuralHash(methodContent),
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
                endLine: methodEndLine,
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

        let fnEndLine = lineNum;
        let fnBraces = 0;
        let foundOpen = false;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') { fnBraces++; foundOpen = true; }
            if (ch === '}') { fnBraces--; }
          }
          if (foundOpen && fnBraces <= 0) {
            fnEndLine = j + 1;
            break;
          }
        }
        if (!foundOpen) fnEndLine = Math.min(lineNum + 5, lines.length);
        const fnContent = lines.slice(i, fnEndLine).join('\n');

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
            contentSha256: computeContentHash(fnContent),
            astStructuralHash: computeAstStructuralHash(fnContent),
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
              endLine: fnEndLine,
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
    const defRegex = /^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/i;
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
    const fnRegex = /(?:fn|func|function|def)\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/i;

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

  private parseGo(
    options: ParseOptions,
    lines: string[],
    fileNode: SuperNode,
    nodes: SuperNode[],
    edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    const { repoId, filePath, epoch, lamportClock } = options;

    const singleImportRegex = /^\s*import\s+(?:([a-zA-Z0-9_]+)\s+)?"([^"]+)"/;
    const typeStructRegex = /^\s*type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/;
    const methodReceiverRegex = /^\s*func\s*\(\s*(?:[a-zA-Z0-9_]+\s+)?\*?([a-zA-Z0-9_]+)\s*\)\s*([a-zA-Z0-9_]+)\s*\(([^)]*)\)/;
    const functionRegex = /^\s*func\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/;

    let inImportBlock = false;
    const structNodes = new Map<string, SuperNode>();
    const funcNodes: Array<{ node: SuperNode; startLine: number; endLine: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      if (!trimmed || trimmed.startsWith('//')) continue;

      if (trimmed === 'import (' || trimmed.startsWith('import (')) {
        inImportBlock = true;
        continue;
      }
      if (inImportBlock) {
        if (trimmed === ')') {
          inImportBlock = false;
          continue;
        }
        const blockMatch = trimmed.match(/(?:([a-zA-Z0-9_]+)\s+)?"([^"]+)"/);
        if (blockMatch) {
          const importPath = blockMatch[2];
          const edge: SubstrateEdge = {
            targetId: `sg://${repoId}/${importPath}`,
            kind: 'IMPORTS',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            provenance: 'tree-sitter-ast',
            location: { filePath, startLine: lineNum, startColumn: 0, endLine: lineNum, endColumn: line.length },
          };
          fileNode.substrate.outgoingEdges.push(edge);
          edges.push({ sourceId: fileNode.id, targetId: edge.targetId, edge });
        }
        continue;
      }

      const singleImportMatch = trimmed.match(singleImportRegex);
      if (singleImportMatch) {
        const importPath = singleImportMatch[2];
        const edge: SubstrateEdge = {
          targetId: `sg://${repoId}/${importPath}`,
          kind: 'IMPORTS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
          location: { filePath, startLine: lineNum, startColumn: 0, endLine: lineNum, endColumn: line.length },
        };
        fileNode.substrate.outgoingEdges.push(edge);
        edges.push({ sourceId: fileNode.id, targetId: edge.targetId, edge });
        continue;
      }

      // Struct / Interface
      const typeMatch = trimmed.match(typeStructRegex);
      if (typeMatch) {
        const typeName = typeMatch[1];
        const kind = typeMatch[2] === 'struct' ? ('struct' as const) : ('interface' as const);
        const nodeId = `sg://${repoId}/${filePath}#${typeName}`;
        const isExported = /^[A-Z]/.test(typeName);

        const typeNode: SuperNode = {
          id: nodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${typeName}`,
          kind,
          name: typeName,
          qualifiedName: typeName,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: typeName, kind }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(typeName), endLine: lineNum + 10, endColumn: 1 },
            language: 'go',
            symbolSignature: line.trim(),
            visibility: isExported ? 'public' : 'internal',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
        };

        structNodes.set(typeName, typeNode);
        fileNode.substrate.outgoingEdges.push({
          targetId: nodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });
        nodes.push(typeNode);
        continue;
      }

      // Method Receiver
      const methodMatch = line.match(methodReceiverRegex);
      if (methodMatch) {
        const receiverType = methodMatch[1];
        const methodName = methodMatch[2];
        const paramsRaw = methodMatch[3];
        const qname = `${receiverType}.${methodName}`;
        const nodeId = `sg://${repoId}/${filePath}#${qname}`;
        const isExported = /^[A-Z]/.test(methodName);

        const methodNode: SuperNode = {
          id: nodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${qname}`,
          kind: 'method',
          name: methodName,
          qualifiedName: qname,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: methodName, kind: 'method', signature: line.trim() }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(methodName), endLine: lineNum + 8, endColumn: 1 },
            language: 'go',
            symbolSignature: line.trim(),
            visibility: isExported ? 'public' : 'internal',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: isExported, entryPointScore: isExported ? 0.7 : 0.2, processFlowSequences: [], crossRepoContracts: [] },
        };

        const parentStruct = structNodes.get(receiverType);
        if (parentStruct) {
          parentStruct.substrate.outgoingEdges.push({
            targetId: nodeId,
            kind: 'CONTAINS',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            provenance: 'tree-sitter-ast',
          });
        }
        fileNode.substrate.outgoingEdges.push({
          targetId: nodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });
        nodes.push(methodNode);
        funcNodes.push({ node: methodNode, startLine: lineNum, endLine: Math.min(lineNum + 15, lines.length) });
        continue;
      }

      // Standalone Function
      const fnMatch = line.match(functionRegex);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const paramsRaw = fnMatch[2];
        const nodeId = `sg://${repoId}/${filePath}#${fnName}`;
        const isExported = /^[A-Z]/.test(fnName);

        const fnNode: SuperNode = {
          id: nodeId,
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
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(fnName), endLine: lineNum + 8, endColumn: 1 },
            language: 'go',
            symbolSignature: line.trim(),
            visibility: isExported ? 'public' : 'internal',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: isExported, entryPointScore: isExported ? 0.8 : 0.2, processFlowSequences: [], crossRepoContracts: [] },
        };

        fileNode.substrate.outgoingEdges.push({
          targetId: nodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });
        nodes.push(fnNode);
        funcNodes.push({ node: fnNode, startLine: lineNum, endLine: Math.min(lineNum + 15, lines.length) });
        continue;
      }
    }

    // Call Resolution Pass in Go
    const callRegex = /(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\(/g;
    for (const { node, startLine, endLine } of funcNodes) {
      const bodyLines = lines.slice(startLine, endLine);
      for (const bodyLine of bodyLines) {
        let match: RegExpExecArray | null;
        while ((match = callRegex.exec(bodyLine)) !== null) {
          const calledName = match[2];
          if (calledName === 'func' || calledName === 'if' || calledName === 'for' || calledName === 'switch' || calledName === 'return') continue;
          if (calledName === node.name) continue;

          const callee = nodes.find(
            (n) => (n.kind === 'function' || n.kind === 'method') && (n.name === calledName || n.qualifiedName.endsWith(`.${calledName}`))
          );
          if (callee && callee.id !== node.id) {
            const alreadyHas = node.substrate.outgoingEdges.some((e) => e.targetId === callee.id && e.kind === 'CALLS');
            if (!alreadyHas) {
              const callEdge: SubstrateEdge = {
                targetId: callee.id,
                kind: 'CALLS',
                confidence: 'EXTRACTED',
                confidenceScore: 1.0,
                provenance: 'tree-sitter-ast',
              };
              node.substrate.outgoingEdges.push(callEdge);
              edges.push({ sourceId: node.id, targetId: callee.id, edge: callEdge });
            }
          }
        }
      }
    }
  }

  private parseRust(
    options: ParseOptions,
    lines: string[],
    fileNode: SuperNode,
    nodes: SuperNode[],
    edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    const { repoId, filePath, epoch, lamportClock } = options;

    const modRegex = /^\s*(?:pub\s+)?mod\s+([a-zA-Z0-9_]+);/;
    const useRegex = /^\s*(?:pub\s+)?use\s+([^;]+);/;
    const typeRegex = /^\s*(?:pub(?:\([^)]+\))?\s+)?(struct|enum|trait)\s+([a-zA-Z0-9_]+)/;
    const implRegex = /^\s*impl(?:\s+<[^>]+>)?\s+(?:[a-zA-Z0-9_:]+\s+for\s+)?([a-zA-Z0-9_]+)/;
    const fnRegex = /^\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(/;

    let currentImplStruct: string | null = null;
    let braceDepth = 0;
    let implBraceDepth = 0;
    const structNodes = new Map<string, SuperNode>();
    const funcNodes: Array<{ node: SuperNode; startLine: number; endLine: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

      if (currentImplStruct && braceDepth < implBraceDepth) {
        currentImplStruct = null;
      }

      // mod declaration
      const modMatch = trimmed.match(modRegex);
      if (modMatch) {
        const modName = modMatch[1];
        const edge: SubstrateEdge = {
          targetId: `sg://${repoId}/${modName}`,
          kind: 'IMPORTS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        };
        fileNode.substrate.outgoingEdges.push(edge);
        edges.push({ sourceId: fileNode.id, targetId: edge.targetId, edge });
        continue;
      }

      // use statement
      const useMatch = trimmed.match(useRegex);
      if (useMatch) {
        const usePath = useMatch[1].trim();
        const edge: SubstrateEdge = {
          targetId: `sg://${repoId}/${usePath}`,
          kind: 'IMPORTS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        };
        fileNode.substrate.outgoingEdges.push(edge);
        edges.push({ sourceId: fileNode.id, targetId: edge.targetId, edge });
        continue;
      }

      // struct / enum / trait
      const typeMatch = trimmed.match(typeRegex);
      if (typeMatch) {
        const kindStr = typeMatch[1];
        const typeName = typeMatch[2];
        const kind = kindStr === 'struct' ? ('struct' as const) : kindStr === 'enum' ? ('enum' as const) : ('trait' as const);
        const nodeId = `sg://${repoId}/${filePath}#${typeName}`;
        const isPub = trimmed.startsWith('pub');

        const typeNode: SuperNode = {
          id: nodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${typeName}`,
          kind,
          name: typeName,
          qualifiedName: typeName,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: typeName, kind }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(typeName), endLine: lineNum + 8, endColumn: 1 },
            language: 'rust',
            symbolSignature: line.trim(),
            visibility: isPub ? 'public' : 'internal',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
        };

        structNodes.set(typeName, typeNode);
        fileNode.substrate.outgoingEdges.push({
          targetId: nodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });
        nodes.push(typeNode);
        continue;
      }

      // impl block
      const implMatch = trimmed.match(implRegex);
      if (implMatch) {
        currentImplStruct = implMatch[1];
        implBraceDepth = braceDepth;
        continue;
      }

      // fn declaration (method or standalone function)
      const fnMatch = line.match(fnRegex);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const isPub = trimmed.startsWith('pub');
        const qname = currentImplStruct ? `${currentImplStruct}::${fnName}` : fnName;
        const nodeId = `sg://${repoId}/${filePath}#${qname}`;

        const fnNode: SuperNode = {
          id: nodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${qname}`,
          kind: currentImplStruct ? 'method' : 'function',
          name: fnName,
          qualifiedName: qname,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: fnName, kind: currentImplStruct ? 'method' : 'function', signature: line.trim() }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(fnName), endLine: lineNum + 8, endColumn: 1 },
            language: 'rust',
            symbolSignature: line.trim(),
            visibility: isPub ? 'public' : 'internal',
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: isPub, entryPointScore: isPub ? 0.8 : 0.2, processFlowSequences: [], crossRepoContracts: [] },
        };

        if (currentImplStruct) {
          const parentStruct = structNodes.get(currentImplStruct);
          if (parentStruct) {
            parentStruct.substrate.outgoingEdges.push({
              targetId: nodeId,
              kind: 'CONTAINS',
              confidence: 'EXTRACTED',
              confidenceScore: 1.0,
              provenance: 'tree-sitter-ast',
            });
          }
        }
        fileNode.substrate.outgoingEdges.push({
          targetId: nodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });
        nodes.push(fnNode);
        funcNodes.push({ node: fnNode, startLine: lineNum, endLine: Math.min(lineNum + 15, lines.length) });
        continue;
      }
    }

    // Call Resolution Pass in Rust
    const callRegex = /(?:([a-zA-Z0-9_]+)(?:::|\.))?([a-zA-Z0-9_]+)\s*\(/g;
    for (const { node, startLine, endLine } of funcNodes) {
      const bodyLines = lines.slice(startLine, endLine);
      for (const bodyLine of bodyLines) {
        let match: RegExpExecArray | null;
        while ((match = callRegex.exec(bodyLine)) !== null) {
          const calledName = match[2];
          if (calledName === 'fn' || calledName === 'if' || calledName === 'match' || calledName === 'for' || calledName === 'while' || calledName === 'println') continue;
          if (calledName === node.name) continue;

          const callee = nodes.find(
            (n) => (n.kind === 'function' || n.kind === 'method') && (n.name === calledName || n.qualifiedName.endsWith(`::${calledName}`))
          );
          if (callee && callee.id !== node.id) {
            const alreadyHas = node.substrate.outgoingEdges.some((e) => e.targetId === callee.id && e.kind === 'CALLS');
            if (!alreadyHas) {
              const callEdge: SubstrateEdge = {
                targetId: callee.id,
                kind: 'CALLS',
                confidence: 'EXTRACTED',
                confidenceScore: 1.0,
                provenance: 'tree-sitter-ast',
              };
              node.substrate.outgoingEdges.push(callEdge);
              edges.push({ sourceId: node.id, targetId: callee.id, edge: callEdge });
            }
          }
        }
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
