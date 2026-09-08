import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { SubstrateDatabase } from '../db/database.js';
import { AstExtractor } from '../parser/ast-extractor.js';
import { DynamicDispatchSynthesizer } from '../parser/dynamic-synthesizer.js';
import { WebSocketStreamer } from '../stream/ws-server.js';
import { ClockManager, type GraphMutation, type SuperNode } from '@pigeongraph/schema';

export interface AdaptiveWatcherOptions {
  projectRoot: string;
  repoId: string;
  db: SubstrateDatabase;
  streamer?: WebSocketStreamer;
  clockManager: ClockManager;
  loneDebounceMs?: number;
  burstDebounceMs?: number;
  excludedDirs?: string[];
}

export class AdaptiveWatcher {
  private projectRoot: string;
  private repoId: string;
  private db: SubstrateDatabase;
  private streamer?: WebSocketStreamer;
  private clockManager: ClockManager;
  private loneDebounceMs: number;
  private burstDebounceMs: number;
  private excludedDirs: Set<string>;

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

    const defaultExcludes: string[] = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.venv',
      'venv',
      '__pycache__',
      '.next',
      '.nuxt',
      '.turbo',
      '.cache',
    ];
    this.excludedDirs = new Set(options.excludedDirs ?? defaultExcludes);
  }

  public async scanProject(targetDir = this.projectRoot): Promise<void> {
    const { readdir } = await import('node:fs/promises');
    const { join, relative } = await import('node:path');

    const scan = async (dir: string) => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const name = entry.name;
          if (name.startsWith('.') || this.excludedDirs.has(name)) {
            continue;
          }
          const full = join(dir, name);
          if (entry.isDirectory()) {
            await scan(full);
          } else if (entry.isFile()) {
            if (name.match(/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|md)$/i)) {
              const rel = relative(this.projectRoot, full).replace(/\\/g, '/');
              this.pendingFiles.add(rel);
            }
          }
        }
      } catch {
        // ignore unreadable directory
      }
    };

    await scan(targetDir);
    await this.flushPendingBatch();
  }

  public async start(): Promise<void> {
    await this.scanProject();

    this.fsWatcher = watch(this.projectRoot, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const normalizedPath = filename.replace(/\\/g, '/');

      // Filter out ignored directories
      const segments = normalizedPath.split('/');
      if (segments.some((seg) => seg.startsWith('.') || this.excludedDirs.has(seg))) {
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
    const filesToDelete: string[] = [];

    interface FileParsedUpdate {
      relPath: string;
      content: string;
      mtimeMs: number;
      sizeBytes: number;
      fileHash: string;
      nodes: SuperNode[];
      edges: any[];
    }
    const updatesToApply: FileParsedUpdate[] = [];

    for (const relPath of filesToProcess) {
      const absPath = join(this.projectRoot, relPath);
      let content: string;
      let mtimeMs: number;
      let sizeBytes: number;

      try {
        const fileStat = await stat(absPath);
        if (fileStat.isDirectory()) continue;
        mtimeMs = fileStat.mtimeMs;
        sizeBytes = fileStat.size;
      } catch {
        filesToDelete.push(relPath);
        continue;
      }

      // Fast mtime & size bypass check
      const prevFile = this.db.getFile(relPath);
      if (prevFile && prevFile.mtimeMs === mtimeMs && prevFile.sizeBytes === sizeBytes) {
        continue;
      }

      try {
        content = await readFile(absPath, 'utf8');
      } catch {
        filesToDelete.push(relPath);
        continue;
      }

      fileContents.set(relPath, content);

      const { nodes, edges, fileHash } = this.extractor.parseFile({
        repoId: this.repoId,
        filePath: relPath,
        content,
        epoch: this.currentEpoch,
        lamportClock: this.clockManager.getLamport(),
      });

      if (prevFile && prevFile.sha256 === fileHash) {
        this.db.upsertFile({
          filePath: relPath,
          sha256: fileHash,
          sizeBytes,
          mtimeMs,
          language: nodes[0]?.substrate.language ?? 'plaintext',
          lastParsedEpoch: prevFile.lastParsedEpoch,
        });
        continue;
      }

      updatesToApply.push({
        relPath,
        content,
        mtimeMs,
        sizeBytes,
        fileHash,
        nodes,
        edges,
      });
    }

    // Apply database updates and deletions in a single transaction
    this.db.runTransaction(() => {
      for (const delPath of filesToDelete) {
        const deletedIds = this.db.deleteNodesByFile(delPath);
        this.db.removeFile(delPath);
        for (const id of deletedIds) {
          mutations.push({ type: 'NodeDelete', nodeId: id });
        }
        mutations.push({ type: 'FileDelete', filePath: delPath });
      }

      for (const update of updatesToApply) {
        this.db.upsertFile({
          filePath: update.relPath,
          sha256: update.fileHash,
          sizeBytes: update.sizeBytes,
          mtimeMs: update.mtimeMs,
          language: update.nodes[0]?.substrate.language ?? 'plaintext',
          lastParsedEpoch: this.currentEpoch,
        });

        this.db.deleteNodesByFile(update.relPath);

        for (const node of update.nodes) {
          this.db.upsertNode(node);
          mutations.push({ type: 'NodeUpsert', node });
          allBatchNodes.push(node);
        }
      }
    });

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
