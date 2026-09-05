import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { AstExtractor, DynamicDispatchSynthesizer } from '@pigeongraph/substrate';
import { ClientGraphStore, DualBufferReconciler, SuperGraphExploreEngine } from '@pigeongraph/client';
import type { SuperNode, GraphDeltaEnvelope } from '@pigeongraph/schema';

export interface ArmAResult {
  arm: 'BASELINE_GREP_AND_READ';
  query: string;
  turns: number;
  tokens: number;
  inspected_files: string[];
  dynamic_dispatch_captured: boolean;
  residual_occupancy_tokens: number;
  duration_ms: number;
}

export interface ArmBResult {
  arm: 'PIGEONGRAPH_1SHOT';
  query: string;
  turns: 1;
  tokens: number;
  duration_ms: number;
  symbols: Array<{ uid: string; name: string; kind: string; filePath: string }>;
  execution_flows: any;
  dynamic_dispatches: any[];
  dynamic_dispatch_captured: boolean;
  blast_radius?: any;
  residual_occupancy_tokens: number;
  raw_response: any;
}

export class EvalEngine {
  private extractor = new AstExtractor();
  private synthesizer = new DynamicDispatchSynthesizer();

  private collectSourceFiles(dir: string, fileList: string[] = []): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === '.git' ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.nyc_output'
        ) {
          continue;
        }
        this.collectSourceFiles(fullPath, fileList);
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'md'].includes(ext ?? '')) {
          fileList.push(fullPath);
        }
      }
    }
    return fileList;
  }

  public async runArmA(repoPath: string, query: string): Promise<ArmAResult> {
    const start = performance.now();
    const files = this.collectSourceFiles(repoPath);
    const queryTerm = query.toLowerCase();

    const matchingFiles: string[] = [];
    let totalContentChars = 0;

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf8');
        if (content.toLowerCase().includes(queryTerm)) {
          matchingFiles.push(file);
          totalContentChars += content.length;
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Agent reading matching files plus imports (simulate minimum 2 turns for multi-file verification)
    const turns = Math.max(2, matchingFiles.length);
    const contentTokens = Math.ceil(totalContentChars / 4);
    const turnOverhead = turns * 150; // System instructions + tool call framing
    const totalTokens = contentTokens + turnOverhead;

    const duration = performance.now() - start;

    return {
      arm: 'BASELINE_GREP_AND_READ',
      query,
      turns,
      tokens: totalTokens,
      inspected_files: matchingFiles.map((f) => relative(repoPath, f)),
      dynamic_dispatch_captured: false, // Baseline grep cannot resolve runtime routes or event emitters
      residual_occupancy_tokens: contentTokens,
      duration_ms: Number(duration.toFixed(2)),
    };
  }

  public async runArmB(repoPath: string, query: string): Promise<ArmBResult> {
    const start = performance.now();
    const repoId = repoPath.split(/[/\\]/).pop() ?? 'eval-repo';
    const files = this.collectSourceFiles(repoPath);

    const store = new ClientGraphStore();
    const reconciler = new DualBufferReconciler(store);
    const allNodes: SuperNode[] = [];
    const fileContentsMap = new Map<string, string>();

    let epoch = 1;
    let lamportClock = 1;

    for (const file of files) {
      try {
        const relPath = relative(repoPath, file).replace(/\\/g, '/');
        const content = readFileSync(file, 'utf8');
        fileContentsMap.set(relPath, content);

        const parseResult = this.extractor.parseFile({
          repoId,
          filePath: relPath,
          content,
          epoch: epoch++,
          lamportClock: lamportClock++,
        });

        allNodes.push(...parseResult.nodes);
      } catch {
        // Skip on parse exception
      }
    }

    // Dynamic Dispatch Synthesis
    const synthResult = this.synthesizer.synthesize(allNodes, fileContentsMap);

    const envelope: GraphDeltaEnvelope = {
      protocolVersion: 1,
      epochId: 1,
      transactionId: `eval-${Date.now()}`,
      vectorClock: { eval: 1 },
      timestampMs: Date.now(),
      projectRoot: repoPath,
      reconcileMode: 'delta',
      mutations: [
        ...allNodes.map((node) => ({ type: 'NodeUpsert' as const, node })),
        ...synthResult.synthesizedEdges.map((e) => ({
          type: 'EdgeUpsert' as const,
          sourceId: e.sourceId,
          targetId: e.targetId,
          edge: e.edge,
        })),
      ],
    };

    reconciler.applySubstrateDelta(envelope);

    const exploreEngine = new SuperGraphExploreEngine(store);
    const rawResponse = exploreEngine.explore({
      query,
      include_blast_radius: true,
    });

    const jsonStr = JSON.stringify(rawResponse);
    const tokens = Math.ceil(jsonStr.length / 4) + 150; // Payload tokens + single turn framing
    const duration = performance.now() - start;

    const dynamicDispatchCaptured =
      rawResponse.dynamic_dispatches.length > 0 ||
      rawResponse.execution_flows.entry_points.some((e) => e.type === 'HTTP_ROUTE');

    return {
      arm: 'PIGEONGRAPH_1SHOT',
      query,
      turns: 1,
      tokens,
      duration_ms: Number(duration.toFixed(2)),
      symbols: rawResponse.symbols,
      execution_flows: rawResponse.execution_flows,
      dynamic_dispatches: rawResponse.dynamic_dispatches,
      dynamic_dispatch_captured: dynamicDispatchCaptured,
      blast_radius: rawResponse.blast_radius,
      residual_occupancy_tokens: tokens - 150,
      raw_response: rawResponse,
    };
  }
}
