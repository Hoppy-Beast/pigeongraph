export interface QualityScore {
  query: string;
  baseline_tokens: number;
  pigeongraph_tokens: number;
  token_reduction_pct: number;
  context_headroom_saved: number;
  baseline_turns: number;
  pigeongraph_turns: number;
  dynamic_dispatch_recall: number;
  sufficiency_status: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT';
  speedup_factor: number;
}

export class QualityScorer {
  public static evaluate(armA: any, armB: any): QualityScore {
    const baselineTokens = armA.tokens;
    const pigeonTokens = armB.tokens;
    const tokenReductionPct = baselineTokens > 0
      ? Math.max(0, Math.round(((baselineTokens - pigeonTokens) / baselineTokens) * 100))
      : 0;
    const contextHeadroomSaved = Math.max(0, baselineTokens - pigeonTokens);

    const hasSymbols = (armB.symbols?.length ?? 0) > 0;
    const hasFlows = (armB.execution_flows?.call_chains?.length ?? 0) > 0 || (armB.execution_flows?.entry_points?.length ?? 0) > 0;
    const sufficiencyStatus: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT' =
      hasSymbols && (hasFlows || armB.dynamic_dispatch_captured)
        ? 'SUFFICIENT'
        : hasSymbols
        ? 'PARTIAL'
        : 'INSUFFICIENT';

    const baselineDuration = Math.max(1, armA.duration_ms ?? 100);
    const pigeonDuration = Math.max(1, armB.duration_ms ?? 5);
    const speedupFactor = Number((baselineDuration / pigeonDuration).toFixed(1));

    const dynamicRecall = armB.dynamic_dispatch_captured ? 1.0 : 0.0;

    return {
      query: armA.query,
      baseline_tokens: baselineTokens,
      pigeongraph_tokens: pigeonTokens,
      token_reduction_pct: tokenReductionPct,
      context_headroom_saved: contextHeadroomSaved,
      baseline_turns: armA.turns,
      pigeongraph_turns: armB.turns,
      dynamic_dispatch_recall: dynamicRecall,
      sufficiency_status: sufficiencyStatus,
      speedup_factor: speedupFactor,
    };
  }
}
