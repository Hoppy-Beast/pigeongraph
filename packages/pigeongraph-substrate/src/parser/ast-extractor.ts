import {
  computeContentHash,
  computeAstStructuralHash,
  computeSemanticValidityHash,
  type SuperNode,
  type SubstrateEdge,
  type NodeKind,
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
      case 'markdown':
        this.parseMarkdown(options, lines, fileNode, nodes, edges);
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
      case 'md':
      case 'markdown':
        return 'markdown';
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
    const arrowFnRegex = /^\s*(?:export\s+)?(?:const|let)\s+([a-zA-Z0-9_$]+)(?:\s*:\s*[^=]+)?\s*=\s*(?:async\s*)?(?:<[^>]+>\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+|\()/i;
    const interfaceRegex = /^\s*(?:export\s+)?(?:default\s+)?interface\s+([A-Za-z0-9_$]+)/;
    const enumRegex = /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z0-9_$]+)/;
    const typeAliasRegex = /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*=/;
    const importedSymbolTargets = new Map<string, string>();

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
        const rawSymbols = (importMatch[1] ?? importMatch[2] ?? '').split(',').map((s) => s.trim());
        const modulePath = importMatch[3];
        for (const raw of rawSymbols) {
          if (!raw) continue;
          const asParts = raw.split(/\s+as\s+/i).map((s) => s.trim()).filter(Boolean);
          const original = (asParts[0] ?? raw).replace(/^type\s+/i, '').trim();
          const local = (asParts.length > 1 ? asParts[asParts.length - 1] : original).replace(/^type\s+/i, '').trim();
          if (!local || !original) continue;
          const targetId = `sg://${repoId}/${modulePath}#${original}`;
          importedSymbolTargets.set(local, targetId);
          const importEdge: SubstrateEdge = {
            targetId,
            kind: 'IMPORTS',
            confidence: 'EXTRACTED',
            confidenceScore: 1.0,
            provenance: 'tree-sitter-ast',
            location: {
              filePath,
              startLine: lineNum,
              startColumn: line.indexOf(local),
              endLine: lineNum,
              endColumn: line.indexOf(local) + local.length,
            },
          };
          fileNode.substrate.outgoingEdges.push(importEdge);
          edges.push({ sourceId: fileNode.id, targetId: importEdge.targetId, edge: importEdge });
        }
        continue;
      }

      // Interface / Enum / Type alias declarations
      const typeDecl = (() => {
        const im = line.match(interfaceRegex);
        if (im) return { name: im[1], kind: 'interface' as const };
        const em = line.match(enumRegex);
        if (em) return { name: em[1], kind: 'enum' as const };
        const tm = line.match(typeAliasRegex);
        if (tm) return { name: tm[1], kind: 'type_alias' as const };
        return null;
      })();
      if (typeDecl) {
        const typeNodeId = `sg://${repoId}/${filePath}#${typeDecl.name}`;
        const isExported = trimmed.startsWith('export');
        const typeNode: SuperNode = {
          id: typeNodeId,
          urn: `urn:supergraph:${repoId}:${filePath}#${typeDecl.name}`,
          kind: typeDecl.kind,
          name: typeDecl.name,
          qualifiedName: typeDecl.name,
          repoId,
          versioning: {
            lamportClock,
            vectorClock: { substrate: lamportClock },
            layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
            contentSha256: computeContentHash(line),
            astStructuralHash: computeAstStructuralHash(line),
            semanticValidityHash: computeSemanticValidityHash({ name: typeDecl.name, kind: typeDecl.kind }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: {
              filePath,
              startLine: lineNum,
              startColumn: line.indexOf(typeDecl.name),
              endLine: lineNum + 10,
              endColumn: 1,
            },
            language: 'typescript',
            symbolSignature: line.trim(),
            visibility: isExported ? 'public' : 'internal',
            modifiers: isExported ? ['exported'] : [],
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
        };
        fileNode.substrate.outgoingEdges.push({
          targetId: typeNodeId,
          kind: 'CONTAINS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        });
        nodes.push(typeNode);
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
            let methodSig = trimmed;
            if (!methodSig.includes('{') && !methodSig.includes(';') && (trimmed.includes('(') || trimmed.includes('<'))) {
              for (let k = i + 1; k < Math.min(lines.length, i + 10); k++) {
                methodSig += ' ' + lines[k].trim();
                if (lines[k].includes('{') || lines[k].trim().endsWith(';')) break;
              }
            }

            const mParenStart = methodSig.indexOf('(');
            const mParenEnd = methodSig.lastIndexOf(')');
            const paramsRaw = mParenStart !== -1 && mParenEnd > mParenStart ? methodSig.substring(mParenStart + 1, mParenEnd) : '';
            const afterClose = mParenEnd !== -1 ? methodSig.substring(mParenEnd + 1).trim() : '';
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
      let combinedSig = trimmed;
      if (
        (trimmed.startsWith('export ') || trimmed.startsWith('async ') || trimmed.startsWith('function ') ||
         trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('default ')) &&
        (trimmed.includes('(') || trimmed.includes('<') || trimmed.includes(':') || trimmed.includes('=')) &&
        !trimmed.includes('{') &&
        !trimmed.endsWith(';')
      ) {
        for (let k = i + 1; k < Math.min(lines.length, i + 15); k++) {
          const nextTrimmed = lines[k].trim();
          combinedSig += ' ' + nextTrimmed;
          if (nextTrimmed.includes('{') || nextTrimmed.includes('=>') || nextTrimmed.endsWith(';')) {
            break;
          }
        }
      }

      const fnMatch = combinedSig.match(functionRegex) ?? combinedSig.match(arrowFnRegex);
      if (fnMatch && !currentClassNode) {
        const fnName = fnMatch[1];
        let paramsRaw = fnMatch[2];
        let returnType = fnMatch[3]?.trim();

        if (paramsRaw === undefined) {
          const parenStart = combinedSig.indexOf('(');
          const parenEnd = combinedSig.lastIndexOf(')');
          if (parenStart !== -1 && parenEnd > parenStart) {
            paramsRaw = combinedSig.substring(parenStart + 1, parenEnd);
          }
        }

        if (returnType) {
          returnType = returnType.replace(/[{;=].*$/, '').trim();
        }

        const fnNodeId = `sg://${repoId}/${filePath}#${fnName}`;
        const isExported = combinedSig.includes('export');
        const isAsync = combinedSig.includes('async');
        const cleanSig = combinedSig.replace(/\s*[{;]\s*$/, '').trim();

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
              signature: cleanSig,
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
              startColumn: line.indexOf(fnName) !== -1 ? line.indexOf(fnName) : 0,
              endLine: fnEndLine,
              endColumn: 1,
            },
            language: 'typescript',
            symbolSignature: cleanSig,
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

    // Second pass: TS/JS CALLS resolution (same-file scope + imports map)
    const skipKeywords = new Set([
      'if',
      'for',
      'while',
      'switch',
      'catch',
      'return',
      'throw',
      'new',
      'function',
      'import',
      'export',
      'typeof',
    ]);
    const funcMethodNodes = nodes.filter((n) => n.kind === 'function' || n.kind === 'method');
    for (const callerNode of funcMethodNodes) {
      const startLine = callerNode.substrate.sourceLocation.startLine;
      const endLine = callerNode.substrate.sourceLocation.endLine;
      const bodyLines = lines.slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine));
      const bodyText = bodyLines.join('\n');
      const callSiteRegex = /\b([A-Za-z_$][\w$]*)\s*\(/g;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callSiteRegex.exec(bodyText)) !== null) {
        const calledName = callMatch[1];
        if (skipKeywords.has(calledName)) continue;
        if (calledName === callerNode.name) continue;
        const callee = funcMethodNodes.find(
          (n) =>
            n.id !== callerNode.id &&
            (n.name === calledName ||
              n.qualifiedName === calledName ||
              n.qualifiedName.endsWith(`.${calledName}`))
        );
        let targetId: string | null = null;
        if (callee) {
          targetId = callee.id;
        } else if (importedSymbolTargets.has(calledName)) {
          targetId = importedSymbolTargets.get(calledName) ?? null;
        } else {
          continue;
        }
        if (!targetId) continue;
        const alreadyHas = callerNode.substrate.outgoingEdges.some(
          (e) => e.targetId === targetId && e.kind === 'CALLS'
        );
        if (alreadyHas) continue;
        const callEdge: SubstrateEdge = {
          targetId,
          kind: 'CALLS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        };
        callerNode.substrate.outgoingEdges.push(callEdge);
        edges.push({ sourceId: callerNode.id, targetId, edge: callEdge });
      }
    }
  }

  private parsePython(
    options: ParseOptions,
    lines: string[],
    fileNode: SuperNode,
    nodes: SuperNode[],
    edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    const { repoId, filePath, epoch, lamportClock } = options;
    const defRegex = /^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/i;
    const classRegex = /^\s*class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/i;

    interface PendingRoute {
      method: string;
      path: string;
      decoratorLine: number;
      dispatch: string;
    }
    const pendingRoutes: PendingRoute[] = [];
    const pendingMiddlewares: Array<{ mwName: string; line: number }> = [];

    let currentClass: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Route decorator detection (multiline aware, max 5 lines for balanced parens)
      if (trimmed.startsWith('@')) {
        let decoText = line;
        let openCount = (decoText.match(/\(/g) ?? []).length;
        let closeCount = (decoText.match(/\)/g) ?? []).length;
        let k = i;
        while (openCount > closeCount && k + 1 < lines.length && k - i < 5) {
          k++;
          decoText += '\n' + lines[k];
          openCount = (decoText.match(/\(/g) ?? []).length;
          closeCount = (decoText.match(/\)/g) ?? []).length;
        }
        const methodMatch = decoText.match(
          /@([A-Za-z0-9_\.]+)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i
        );
        if (methodMatch) {
          const prefix = methodMatch[1];
          const segments = prefix.split('.');
          const isRoutePrefix = segments.some(
            (s) => s === 'app' || s === 'router' || s === 'api_router' || s === 'blueprint'
          );
          if (isRoutePrefix) {
            const method = methodMatch[2].toUpperCase();
            const path = methodMatch[3];
            pendingRoutes.push({ method, path, decoratorLine: lineNum, dispatch: `HTTP ${method} ${path}` });
          }
        } else {
          const flaskMatch = decoText.match(/@([A-Za-z0-9_\.]+)\.route\s*\(\s*['"]([^'"]+)['"]/i);
          if (flaskMatch) {
            const path = flaskMatch[2];
            const methodsMatch = decoText.match(/methods\s*=\s*\[([^\]]+)\]/i);
            let methods: string[] = ['GET'];
            if (methodsMatch) {
              const found = methodsMatch[1].match(/['"]?(get|post|put|delete|patch)['"]?/gi);
              if (found && found.length > 0) {
                methods = found.map((s) => s.replace(/['"\s]/g, '').toUpperCase());
              }
            }
            for (const m of methods) {
              pendingRoutes.push({ method: m, path, decoratorLine: lineNum, dispatch: `HTTP ${m} ${path}` });
            }
          }
        }
      }

      // add_middleware detection (multiline aware, max 3 lines for balanced parens)
      if (line.includes('add_middleware')) {
        let mwText = line;
        let mwOpen = (mwText.match(/\(/g) ?? []).length;
        let mwClose = (mwText.match(/\)/g) ?? []).length;
        let kk = i;
        while (mwOpen > mwClose && kk + 1 < lines.length && kk - i < 3) {
          kk++;
          mwText += '\n' + lines[kk];
          mwOpen = (mwText.match(/\(/g) ?? []).length;
          mwClose = (mwText.match(/\)/g) ?? []).length;
        }
        const mwMatch = mwText.match(/\.add_middleware\s*\(\s*([A-Za-z0-9_]+)/);
        if (mwMatch) {
          pendingMiddlewares.push({ mwName: mwMatch[1], line: lineNum });
        }
      }

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
        let pySig = line.trim();
        let pySigEndLine = lineNum;
        if (!pySig.includes('):') && !pySig.includes(') ->') && !pySig.endsWith(':')) {
          for (let k = i + 1; k < Math.min(lines.length, i + 15); k++) {
            pySig += ' ' + lines[k].trim();
            pySigEndLine = k + 1;
            if (lines[k].includes('):') || lines[k].includes(') ->') || lines[k].trim().endsWith(':')) {
              break;
            }
          }
        }

        const parenStart = pySig.indexOf('(');
        const parenEnd = pySig.lastIndexOf(')');
        const paramsRaw = parenStart !== -1 && parenEnd > parenStart ? pySig.substring(parenStart + 1, parenEnd) : '';
        const afterParen = parenEnd !== -1 ? pySig.substring(parenEnd + 1) : '';
        const returnTypeMatch = afterParen.match(/->\s*([^:]+):/);
        const returnType = returnTypeMatch ? returnTypeMatch[1].trim() : undefined;

        const baseIndent = line.search(/\S/);
        let fnEndLine = pySigEndLine;
        for (let j = pySigEndLine; j < lines.length; j++) {
          const l = lines[j];
          if (!l.trim() || l.trim().startsWith('#')) continue;
          const indent = l.search(/\S/);
          if (indent !== -1 && indent <= baseIndent) {
            fnEndLine = j;
            break;
          }
          fnEndLine = j + 1;
        }

        const fnContent = lines.slice(i, fnEndLine).join('\n');
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
            contentSha256: computeContentHash(fnContent),
            astStructuralHash: computeAstStructuralHash(fnContent),
            semanticValidityHash: computeSemanticValidityHash({ name: fnName, kind: 'function', signature: pySig, returnType }),
            lastModifiedTimestampMs: Date.now(),
          },
          substrate: {
            sourceLocation: { filePath, startLine: lineNum, startColumn: line.indexOf(fnName) !== -1 ? line.indexOf(fnName) : 0, endLine: fnEndLine, endColumn: 1 },
            language: 'python',
            symbolSignature: pySig,
            visibility: fnName.startsWith('_') ? 'private' : 'public',
            returnType,
            parameters: this.parseParameters(paramsRaw),
            outgoingEdges: [],
            astEpochTimestamp: new Date().toISOString(),
          },
          semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
          processFlow: { isEntryPoint: !fnName.startsWith('_'), entryPointScore: fnName.startsWith('_') ? 0.1 : 0.6, processFlowSequences: [], crossRepoContracts: [] },
        };
        fileNode.substrate.outgoingEdges.push({ targetId: fnNodeId, kind: 'CONTAINS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' });
        nodes.push(fnNode);

        // Attach pending decorator routes within 15-line window (skip intermediate decorators)
        const validRoutes = pendingRoutes.filter(
          (p) => lineNum - p.decoratorLine >= 0 && lineNum - p.decoratorLine <= 15
        );
        if (validRoutes.length > 0) {
          for (const pr of validRoutes) {
            const routeEdge: SubstrateEdge = {
              targetId: fnNodeId,
              kind: 'HANDLES_ROUTE',
              confidence: 'EXTRACTED',
              confidenceScore: 0.95,
              provenance: 'tree-sitter-ast',
              dispatchMechanism: pr.dispatch,
            };
            fileNode.substrate.outgoingEdges.push(routeEdge);
            edges.push({ sourceId: fileNode.id, targetId: fnNodeId, edge: routeEdge });
          }
          fnNode.processFlow.isEntryPoint = true;
          fnNode.processFlow.entryPointScore = 0.95;
          fnNode.processFlow.entryPointType = 'HTTP_ROUTE';
          for (const pr of validRoutes) {
            const idx = pendingRoutes.indexOf(pr);
            if (idx !== -1) pendingRoutes.splice(idx, 1);
          }
        }
        // Evict stale pending routes older than 15 lines
        for (let s = pendingRoutes.length - 1; s >= 0; s--) {
          if (lineNum - pendingRoutes[s].decoratorLine > 15) pendingRoutes.splice(s, 1);
        }
      }
    }

    // Link add_middleware targets defined in the same file
    for (const pm of pendingMiddlewares) {
      const target = nodes.find(
        (n) =>
          n.name === pm.mwName &&
          (n.kind === 'class' || n.kind === 'function' || n.kind === 'method')
      );
      if (!target) continue;
      const alreadyHas = fileNode.substrate.outgoingEdges.some(
        (e) => e.targetId === target.id && e.kind === 'HANDLES_ROUTE'
      );
      if (alreadyHas) continue;
      const mwEdge: SubstrateEdge = {
        targetId: target.id,
        kind: 'HANDLES_ROUTE',
        confidence: 'EXTRACTED',
        confidenceScore: 0.95,
        provenance: 'tree-sitter-ast',
        dispatchMechanism: `MIDDLEWARE ${pm.mwName}`,
      };
      fileNode.substrate.outgoingEdges.push(mwEdge);
      edges.push({ sourceId: fileNode.id, targetId: target.id, edge: mwEdge });
      target.processFlow.isEntryPoint = true;
      target.processFlow.entryPointScore = 0.95;
      target.processFlow.entryPointType = 'HTTP_ROUTE';
    }

    // Second pass: Python CALLS resolution (same-file scope)
    const skipKeywords = new Set([
      'def',
      'class',
      'if',
      'elif',
      'else',
      'for',
      'while',
      'return',
      'import',
      'from',
      'print',
      'len',
      'range',
      'pass',
      'raise',
      'assert',
      'with',
      'except',
      'try',
      'finally',
      'yield',
      'await',
      'async',
      'lambda',
    ]);
    const funcMethodNodes = nodes.filter((n) => n.kind === 'function' || n.kind === 'method');
    for (const callerNode of funcMethodNodes) {
      const startLine = callerNode.substrate.sourceLocation.startLine;
      const endLine = callerNode.substrate.sourceLocation.endLine;
      const bodyLines = lines.slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine));
      const bodyText = bodyLines.join('\n');
      const callSiteRegex = /\b([A-Za-z_][\w]*)\s*\(/g;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callSiteRegex.exec(bodyText)) !== null) {
        const calledName = callMatch[1];
        if (skipKeywords.has(calledName)) continue;
        if (calledName === callerNode.name) continue;
        const callee = funcMethodNodes.find(
          (n) =>
            n.id !== callerNode.id &&
            (n.name === calledName ||
              n.qualifiedName === calledName ||
              n.qualifiedName.endsWith(`.${calledName}`))
        );
        if (!callee) continue;
        const alreadyHas = callerNode.substrate.outgoingEdges.some(
          (e) => e.targetId === callee.id && e.kind === 'CALLS'
        );
        if (alreadyHas) continue;
        const callEdge: SubstrateEdge = {
          targetId: callee.id,
          kind: 'CALLS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        };
        callerNode.substrate.outgoingEdges.push(callEdge);
        edges.push({ sourceId: callerNode.id, targetId: callee.id, edge: callEdge });
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
    const methodReceiverRegex = /^\s*func\s*\(\s*(?:[a-zA-Z0-9_]+\s+)?\*?([a-zA-Z0-9_]+)(?:\[[^\]]+\])?\s*\)\s*([a-zA-Z0-9_]+)(?:\[[^\]]+\])?\s*\(([^)]*)\)/;
    const functionRegex = /^\s*func\s+([a-zA-Z0-9_]+)(?:\[[^\]]+\])?\s*\(([^)]*)\)/;

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
    const fnRegex = /^\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?(?:extern(?:\s+"[^"]+")?\s+)?fn\s+([a-zA-Z0-9_]+)(?:<[^>]+>)?\s*\(/;

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

  private parseMarkdown(
    options: ParseOptions,
    lines: string[],
    fileNode: SuperNode,
    nodes: SuperNode[],
    edges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    const { repoId, filePath, epoch, lamportClock } = options;

    interface SectionHeading {
      title: string;
      level: number;
      lineNum: number;
    }

    const headings: SectionHeading[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          title: match[2].trim(),
          lineNum: i + 1,
        });
      }
    }

    for (let h = 0; h < headings.length; h++) {
      const heading = headings[h];
      const startLine = heading.lineNum;
      let endLine = lines.length;
      for (let next = h + 1; next < headings.length; next++) {
        if (headings[next].level <= heading.level) {
          endLine = headings[next].lineNum - 1;
          break;
        }
      }

      const sectionLines = lines.slice(startLine - 1, endLine);
      const sectionContent = sectionLines.join('\n');
      const sectionName = heading.title;
      const sectionKind: NodeKind = heading.level === 1 ? 'document' : 'section';
      const sectionNodeId = `sg://${repoId}/${filePath}#${sectionName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      const invariants: string[] = [];
      for (const sline of sectionLines) {
        const invMatch = sline.match(/^[-*]\s*invariant:\s*(.+)$/i);
        if (invMatch) {
          invariants.push(invMatch[1].trim());
        }
      }

      const sectionNode: SuperNode = {
        id: sectionNodeId,
        urn: `urn:supergraph:${repoId}:${filePath}#${sectionName}`,
        kind: sectionKind,
        name: sectionName,
        qualifiedName: `${filePath}#${sectionName}`,
        repoId,
        versioning: {
          lamportClock,
          vectorClock: { substrate: lamportClock },
          layerEpochs: { substrateEpoch: epoch, semanticEpoch: 0, processEpoch: 0 },
          contentSha256: computeContentHash(sectionContent),
          astStructuralHash: computeAstStructuralHash(sectionContent),
          semanticValidityHash: computeSemanticValidityHash({
            name: sectionName,
            kind: sectionKind,
            signature: `#${'#'.repeat(heading.level - 1)} ${sectionName}`,
          }),
          lastModifiedTimestampMs: Date.now(),
        },
        substrate: {
          sourceLocation: {
            filePath,
            startLine,
            startColumn: 0,
            endLine,
            endColumn: (lines[endLine - 1] ?? '').length,
          },
          language: 'markdown',
          symbolSignature: `#${'#'.repeat(heading.level - 1)} ${sectionName}`,
          visibility: 'public',
          rawDocstring: sectionContent.slice(0, 1500),
          outgoingEdges: [],
          astEpochTimestamp: new Date().toISOString(),
        },
        semantic: {
          validityStatus: 'VALID',
          communityClusters: [],
          semanticEmbeddings: [],
          rationaleNodes: invariants.length > 0 ? [{
            purpose: sectionName,
            architecturalPattern: 'Markdown Architectural Section',
            invariants,
          }] : [],
        },
        processFlow: {
          isEntryPoint: heading.level === 1,
          entryPointScore: heading.level === 1 ? 0.8 : 0.2,
          processFlowSequences: [],
          crossRepoContracts: [],
        },
      };

      const containsEdge: SubstrateEdge = {
        targetId: sectionNodeId,
        kind: 'CONTAINS',
        confidence: 'EXTRACTED',
        confidenceScore: 1.0,
        provenance: 'tree-sitter-ast',
        location: {
          filePath,
          startLine,
          startColumn: 0,
          endLine,
          endColumn: (lines[endLine - 1] ?? '').length,
        },
      };

      fileNode.substrate.outgoingEdges.push(containsEdge);
      edges.push({ sourceId: fileNode.id, targetId: sectionNodeId, edge: containsEdge });
      nodes.push(sectionNode);
    }
  }

  private parseParameters(paramsRaw?: string): Array<{ name: string; type: string }> {
    if (!paramsRaw || !paramsRaw.trim()) return [];
    return paramsRaw
      .split(',')
      .map((param) => {
        const parts = param.split(':');
        const rawName = parts[0]?.trim().replace(/^[^a-zA-Z0-9_$]+/, '') ?? 'arg';
        const name = rawName.replace(/[?]$/, '').replace(/=.*$/, '').trim();
        const type = (parts[1]?.trim().replace(/=.*$/, '').trim()) || 'any';
        return { name, type };
      })
      .filter((p) => p.name && p.name !== 'self' && p.name !== 'cls');
  }
}
