import type { SuperNode, SubstrateEdge, ConfidenceTier } from '@pigeongraph/schema';
import type { ParsedDocResult } from '../parser/markdown-adr-parser.js';

export interface SemanticEdgeSynthesis {
  targetNodeId: string;
  edge: SubstrateEdge;
  reconciledNodePatch?: Partial<SuperNode['semantic']>;
}

export class SemanticSynthesizer {
  /**
   * Synthesizes semantic edges between parsed documentation and code symbols.
   */
  public synthesizeDocToCode(doc: ParsedDocResult, codeNodes: SuperNode[]): SemanticEdgeSynthesis[] {
    const results: SemanticEdgeSynthesis[] = [];

    for (const node of codeNodes) {
      if (node.kind === 'file') continue;

      const symbolName = node.name.toLowerCase();
      const qualifiedName = node.qualifiedName.toLowerCase();
      const docTitle = doc.title.toLowerCase();

      // 1. Direct Citation in Doc / Spec Match -> IMPLEMENTS_SPEC (EXTRACTED)
      const directReq = doc.requirements.find(
        (req) =>
          req.description.toLowerCase().includes(symbolName) ||
          req.description.toLowerCase().includes(node.name)
      );

      if (directReq) {
        const edge: SubstrateEdge = {
          targetId: `sg://${node.repoId}/${doc.docUri}#${directReq.id}`,
          kind: 'IMPLEMENTS' as any, // Schema SubstrateEdge kind
          confidence: 'EXTRACTED',
          confidenceScore: 0.95,
          provenance: 'llm-inference',
          dispatchMechanism: `IMPLEMENTS_SPEC: ${directReq.id}`,
        };

        const patch: Partial<SuperNode['semantic']> = {
          validityStatus: 'VALID',
          multimodalAssociations: [doc.association],
        };

        results.push({ targetNodeId: node.id, edge, reconciledNodePatch: patch });
        continue;
      }

      // 2. ADR Justification Match -> JUSTIFIED_BY_ADR (INFERRED)
      if (doc.adr) {
        const adrMatches =
          docTitle.includes(symbolName) ||
          doc.adr.summary?.toLowerCase().includes(symbolName) ||
          node.substrate.rawDocstring?.toLowerCase().includes(doc.adr.adrId.toLowerCase());

        if (adrMatches) {
          const confidence: ConfidenceTier = node.substrate.rawDocstring?.toLowerCase().includes(doc.adr.adrId.toLowerCase())
            ? 'EXTRACTED'
            : 'INFERRED';

          const edge: SubstrateEdge = {
            targetId: `sg://${node.repoId}/${doc.docUri}#${doc.adr.adrId}`,
            kind: 'REFERENCES' as any,
            confidence,
            confidenceScore: confidence === 'EXTRACTED' ? 0.95 : 0.8,
            provenance: 'llm-inference',
            dispatchMechanism: `JUSTIFIED_BY_ADR: ${doc.adr.adrId}`,
          };

          const patch: Partial<SuperNode['semantic']> = {
            validityStatus: 'VALID',
            adrReferences: [doc.adr],
            rationaleNodes: doc.rationaleNodes,
          };

          results.push({ targetNodeId: node.id, edge, reconciledNodePatch: patch });
        }
      }
    }

    return results;
  }
}
