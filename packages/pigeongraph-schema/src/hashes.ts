import { createHash } from 'node:crypto';

/**
 * Computes SHA-256 hash of raw file content or node text.
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Computes AST structural hash representing normalized AST syntax subtree.
 * Ignores comments and whitespace differences.
 */
export function computeAstStructuralHash(normalizedAstString: string): string {
  return createHash('sha256').update(normalizedAstString.trim(), 'utf8').digest('hex');
}

/**
 * Computes Semantic Invariant Hash over public interface & signature.
 * If this hash does NOT change across edits, Layer 2 semantic annotations
 * (conceptual summaries, ADR linkages, Leiden clustering) remain valid.
 */
export function computeSemanticValidityHash(params: {
  name: string;
  kind: string;
  visibility?: string;
  signature?: string;
  returnType?: string;
  modifiers?: string[];
  parameters?: Array<{ name: string; type: string }>;
  decorators?: string[];
}): string {
  const normalizedPayload = JSON.stringify({
    name: params.name,
    kind: params.kind,
    visibility: params.visibility ?? 'public',
    signature: (params.signature ?? '').trim(),
    returnType: params.returnType ?? '',
    modifiers: (params.modifiers ?? []).slice().sort(),
    parameters: (params.parameters ?? []).map((p) => ({ name: p.name, type: p.type })),
    decorators: (params.decorators ?? []).slice().sort(),
  });

  return createHash('sha256').update(normalizedPayload, 'utf8').digest('hex');
}
