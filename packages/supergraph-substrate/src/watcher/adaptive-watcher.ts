import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { SubstrateDatabase } from '../db/database.js';
import { AstExtractor } from '../parser/ast-extractor.js';
import { DynamicDispatchSynthesizer } from '../parser/dynamic-synthesizer.js';
import { WebSocketStreamer } from '../stream/ws-server.js';
import { ClockManager, type GraphMutation, type SuperNode } from '@supergraph/schema';

export interface AdaptiveWatcherOptions {
  projectRoot: string;
  repoId: string;
  db: SubstrateDatabase;
  streamer?: WebSocketStreamer;
  clockManager: ClockManager;
  loneDebounceMs?: number;
  burstDebounceMs?: number;
}

export class AdaptiveWatcher {
  private projectRoot: string;
  private repoId: string;
  private db: SubstrateDatabase;
  private streamer?: WebSocketStreamer;
  private clockManager: ClockManager;
  private loneDebounceMs: number;
  private burstDebounceMs: number;

  private extractor = new AstExtractor();
  private synthesizer = new DynamicDispatchSynthesizer();

  private pendingFiles = new Set<string>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private fsWatcher: FSWatcher | null = null;
  private currentEpoch = 1;

  constructor(options: AdaptiveWatcherOptions) {
    this.projectRoot = resolve(options.projectRoot);
    this.repoId = options.repoId;
    this.db = options.db;
    this.streamer = options.streamer;
    this.clockManager = options.clockManager;
    this.loneDebounceMs = options.loneDebounceMs ?? 150;
    this.burstDebounceMs = options.burstDebounceMs ?? 1500;
  }

  public start(): void {
    this.fsWatcher = watch(this.projectRoot, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const normalizedPath = filename.replace(/\\/g, '/');

      // Filter out ignored paths (.git, node_modules, dist, etc.)
      if (
        normalizedPath.includes('.git/') ||
        normalizedPath.includes('node_modules/') ||
        normalizedPath.includes('/dist/') ||
        normalizedPath.includes('.temp')
      ) {
        return;
      }

      this.enqueueFile(normalizedPath);
    });
  }

  public enqueueFile(relPath: string): void {
    this.pendingFiles.add(relPath);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const delay = this.pendingFiles.size <= 2 ? this.loneDebounceMs : this.burstDebounceMs;
    this.debounceTimer = setTimeout(() => {
      this.flushPendingBatch().catch((err) => {
        console.error('Error syncing file batch:', err);
      });
    }, delay);
  }

  public async flushPendingBatch(): Promise<{ processedFiles: number; mutationsCount: number }> {
    const filesToProcess = Array.from(this.pendingFiles);
    this.pendingFiles.clear();
    this.debounceTimer = null;

    if (filesToProcess.length === 0) {
      return { processedFiles: 0, mutationsCount: 0 };
    }

    this.currentEpoch += 1;
    const mutations: GraphMutation[] = [];
    const allBatchNodes: SuperNode[] = [];
    const fileContents = new Map<string, string>();

    for (const relPath of filesToProcess) {
      const absPath = join(this.projectRoot, relPath);
      let content: string;
      let mtimeMs: number;
      let sizeBytes: number;

      try {
        const fileStat = await stat(absPath);
        if (fileStat.isDirectory()) continue;
        content = await readFile(absPath, 'utf8');
        mtimeMs = fileStat.mtimeMs;
        sizeBytes = fileStat.size;
      } catch {
        // File was deleted
        const deletedIds = this.db.deleteNodesByFile(relPath);
        this.db.removeFile(relPath);
        for (const id of deletedIds) {
          mutations.push({ type: 'NodeDelete', nodeId: id });
        }
        mutations.push({ type: 'FileDelete', filePath: relPath });
        continue;
      }

      fileContents.set(relPath, content);

      // Check if content hash changed
      const prevFile = this.db.getFile(relPath);
      const { nodes, edges, fileHash } = this.extractor.parseFile({
        repoId: this.repoId,
        filePath: relPath,
        content,
        epoch: this.currentEpoch,
        lamportClock: this.clockManager.getLamport(),
      });

      if (prevFile && prevFile.sha256 === fileHash) {
        // Skip un-modified file content
        continue;
      }

      // Upsert into DB
      this.db.upsertFile({
        filePath: relPath,
        sha256: fileHash,
        sizeBytes,
        mtimeMs,
        language: nodes[0]?.substrate.language ?? 'plaintext',
        lastParsedEpoch: this.currentEpoch,
      });

      // Clear old nodes for this file
      this.db.deleteNodesByFile(relPath);

      for (const node of nodes) {
        this.db.upsertNode(node);
        mutations.push({ type: 'NodeUpsert', node });
        allBatchNodes.push(node);
      }
    }

    // Dynamic Dispatch Synthesis across batch
    if (allBatchNodes.length > 0) {
      const synthesis = this.synthesizer.synthesize(allBatchNodes, fileContents);
      for (const edge of synthesis.synthesizedEdges) {
        mutations.push({
          type: 'EdgeUpsert',
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          edge: edge.edge,
        });
      }
    }

    // Broadcast mutation diff
    if (mutations.length > 0 && this.streamer) {
      this.streamer.broadcastMutations(mutations);
    }

    return {
      processedFiles: filesToProcess.length,
      mutationsCount: mutations.length,
    };
  }

  public close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
  }
}
