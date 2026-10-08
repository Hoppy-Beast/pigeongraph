import type { SuperNode } from '@pigeongraph/schema';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Shared unified blast-radius risk scoring (Task 1.2).
 * Used by both SuperGraphExploreEngine and AnalyticalToolsEngine so the two
 * surfaces cannot diverge.
 *
 * risk = clamp01(nodes*0.05 + files*0.1 + min(exported*0.02, 0.15)
 *                + min(entryPoints*0.1, 0.2) - testOnlyRatio*0.1)
 * Thresholds: score >= 0.75 CRITICAL, >= 0.5 HIGH, >= 0.25 MEDIUM, else LOW.
 * Score is rounded to 2 decimals before thresholding; both are deterministic.
 */
export function computeRisk(nodes: SuperNode[]): { score: number; level: RiskLevel } {
  const files = new Set<string>();
  let exportedCount = 0;
  let entryCount = 0;
  let testCount = 0;

  for (const n of nodes) {
    files.add(n.substrate.sourceLocation.filePath);
    if (n.substrate.modifiers?.includes('exported') || n.substrate.visibility === 'public') {
      exportedCount++;
    }
    if (n.processFlow.isEntryPoint) {
      entryCount++;
    }
    if (isTestFile(n.substrate.sourceLocation.filePath)) {
      testCount++;
    }
  }

  const testOnlyRatio = nodes.length === 0 ? 0 : testCount / nodes.length;
  const raw =
    nodes.length * 0.05 +
    files.size * 0.1 +
    Math.min(exportedCount * 0.02, 0.15) +
    Math.min(entryCount * 0.1, 0.2) -
    testOnlyRatio * 0.1;
  const score = Number(Math.min(1, Math.max(0, raw)).toFixed(2));
  const level: RiskLevel =
    score >= 0.75 ? 'CRITICAL' : score >= 0.5 ? 'HIGH' : score >= 0.25 ? 'MEDIUM' : 'LOW';
  return { score, level };
}

/** True for test-only files: __tests__ dirs, .test./.spec. infixes, test(s)/ dirs. */
export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (
    normalized.includes('__tests__') ||
    normalized.includes('.test.') ||
    normalized.includes('.spec.') ||
    normalized.includes('/test/') ||
    normalized.startsWith('test/') ||
    normalized.includes('/tests/') ||
    normalized.startsWith('tests/')
  );
}
