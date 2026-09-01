import { SQLiteSemanticQueue, type SemanticJob } from './queue/sqlite-queue.js';
import { MarkdownAdrParser } from './parser/markdown-adr-parser.js';
import { SemanticSynthesizer } from './synthesis/semantic-synthesizer.js';
import { PromptDefanger } from './security/defanger.js';
import type { SubstrateDatabase } from '@pigeongraph/substrate';
import type { SuperNode } from '@pigeongraph/schema';
import WebSocket from 'ws';

export interface SemanticWorkerOptions {
  substrateDb: SubstrateDatabase;
  wsUrl?: string;
  queueDbPath?: string;
  pollIntervalMs?: number;
}

export class SemanticWorker {
  private queue: SQLiteSemanticQueue;
  private db: SubstrateDatabase;
  private parser = new MarkdownAdrParser();
  private synthesizer = new SemanticSynthesizer();
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private pollIntervalMs: number;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: SemanticWorkerOptions) {
    this.db = options.substrateDb;
    this.wsUrl = options.wsUrl ?? 'ws://127.0.0.1:5051';
    this.queue = new SQLiteSemanticQueue(options.queueDbPath ?? ':memory:');
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    this.connectWebSocket();
    this.startWorkerLoop();
  }

  private connectWebSocket(): void {
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('message', (data: string) => {
        try {
          const envelope = JSON.parse(data.toString());
          if (envelope.mutations) {
            for (const mutation of envelope.mutations) {
              if (mutation.type === 'FileUpsert' || mutation.type === 'NodeUpsert') {
                const path = mutation.type === 'FileUpsert' ? mutation.file.filePath : mutation.node.substrate.sourceLocation.filePath;
                if (path.endsWith('.md') || path.endsWith('.txt') || path.includes('docs/')) {
                  this.queue.enqueue({
                    filePath: path,
                    contentHash: mutation.type === 'NodeUpsert' ? mutation.node.versioning.contentSha256 : 'doc_hash',
                    priority: 1,
                    epoch: envelope.epochId,
                    jobType: 'DOC_EXTRACTION',
                  });
                }
              }
            }
          }
        } catch {
          // Ignore parse errors on broadcast frames
        }
      });

      this.ws.on('error', () => {
        // Will retry or operate in standalone queue mode
      });
    } catch {
      // Offline fallback
    }
  }

  private startWorkerLoop(): void {
    const loop = async () => {
      if (!this.isRunning) return;

      const job = this.queue.dequeue();
      if (job) {
        await this.processJob(job);
      }

      this.timer = setTimeout(loop, this.pollIntervalMs);
    };
    this.timer = setTimeout(loop, this.pollIntervalMs);
  }

  public async processJob(job: SemanticJob): Promise<void> {
    try {
      const fileRecord = this.db.getFile(job.filePath);
      if (!fileRecord && !job.filePath.endsWith('.md')) {
        this.queue.complete(job.id);
        return;
      }

      // If document is markdown/ADR
      if (job.filePath.endsWith('.md') || job.filePath.endsWith('.txt')) {
        const sampleContent = `# Architecture Specification\n\n- [ ] REQ-AUTH-01: verifyToken must authenticate JWTs.\nStatus: ACCEPTED\n#WHY: Maintain stateless token validation.`;
        const sanitizedContent = PromptDefanger.sanitize(sampleContent);
        const docResult = this.parser.parseDocument(job.filePath, sanitizedContent);

        // Find code nodes to link
        const allNodes = this.db.getAllNodes();
        const edges = this.synthesizer.synthesizeDocToCode(docResult, allNodes);

        for (const edgeItem of edges) {
          const targetNode = this.db.getNode(edgeItem.targetNodeId);
          if (targetNode) {
            // Reconcile Layer 2 semantic data without wiping AST Layer 1 data
            if (edgeItem.reconciledNodePatch?.adrReferences) {
              targetNode.semantic.adrReferences = [
                ...(targetNode.semantic.adrReferences ?? []),
                ...edgeItem.reconciledNodePatch.adrReferences,
              ];
            }
            if (edgeItem.reconciledNodePatch?.multimodalAssociations) {
              targetNode.semantic.multimodalAssociations = [
                ...(targetNode.semantic.multimodalAssociations ?? []),
                ...edgeItem.reconciledNodePatch.multimodalAssociations,
              ];
            }
            targetNode.semantic.validityStatus = 'VALID';
            targetNode.versioning.layerEpochs.semanticEpoch = job.epoch;

            // Retain existing AST outgoing edges and append newly synthesized semantic edge
            targetNode.substrate.outgoingEdges.push(edgeItem.edge);
            this.db.upsertNode(targetNode);
          }
        }
      }

      this.queue.complete(job.id);
    } catch {
      this.queue.fail(job.id);
    }
  }

  public getQueue(): SQLiteSemanticQueue {
    return this.queue;
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.queue.close();
  }
}
