import {
  getDatabaseSyncConstructor,
  type DatabaseSyncLike,
  type StatementLike,
} from './sqlite-adapter.js';
import type { SuperNode, SubstrateEdge } from '@pigeongraph/schema';

export interface FileRecord {
  filePath: string;
  sha256: string;
  sizeBytes: number;
  mtimeMs: number;
  language: string;
  lastParsedEpoch: number;
}

export class SubstrateDatabase {
  private db: DatabaseSyncLike;
  private isInMemory: boolean;

  // Cached prepared statements for high-throughput batch operations
  private upsertFileStmt!: StatementLike;
  private getFileStmt!: StatementLike;
  private deleteFileStmt!: StatementLike;
  private upsertNodeStmt!: StatementLike;
  private deleteFtsStmt!: StatementLike;
  private insertFtsStmt!: StatementLike;
  private deleteEdgesBySourceStmt!: StatementLike;
  private upsertEdgeStmt!: StatementLike;
  private getNodeStmt!: StatementLike;
  private deleteNodeStmt!: StatementLike;
  private deleteFtsNodeStmt!: StatementLike;
  private deleteEdgesBySourceOrTargetStmt!: StatementLike;
  private getNodesByFileStmt!: StatementLike;
  private countNodesStmt!: StatementLike;

  constructor(dbPath: string = ':memory:') {
    this.isInMemory = dbPath === ':memory:';
    const DatabaseSync = getDatabaseSyncConstructor();
    this.db = new DatabaseSync(dbPath);
    this.initPragmasAndSchema();
    this.initPreparedStatements();
  }

  private initPragmasAndSchema(): void {
    if (!this.isInMemory) {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    // Schema initialization
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        file_path TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        language TEXT NOT NULL,
        last_parsed_epoch INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        urn TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL,
        repo_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        language TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        start_column INTEGER NOT NULL,
        end_column INTEGER NOT NULL,
        symbol_signature TEXT,
        visibility TEXT,
        return_type TEXT,
        raw_docstring TEXT,
        raw_json TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        ast_structural_hash TEXT NOT NULL,
        semantic_validity_hash TEXT NOT NULL,
        lamport_clock INTEGER NOT NULL,
        substrate_epoch INTEGER NOT NULL,
        semantic_epoch INTEGER NOT NULL,
        process_epoch INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        kind TEXT NOT NULL,
        confidence TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        provenance TEXT NOT NULL,
        dispatch_mechanism TEXT,
        metadata_json TEXT,
        line INTEGER,
        col INTEGER,
        FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique
        ON edges(source, target, kind, IFNULL(line, -1), IFNULL(col, -1));

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);

      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        id,
        name,
        qualified_name,
        symbol_signature,
        raw_docstring
      );
    `);
  }

  private initPreparedStatements(): void {
    this.upsertFileStmt = this.db.prepare(`
      INSERT INTO files (file_path, sha256, size_bytes, mtime_ms, language, last_parsed_epoch)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        sha256 = excluded.sha256,
        size_bytes = excluded.size_bytes,
        mtime_ms = excluded.mtime_ms,
        language = excluded.language,
        last_parsed_epoch = excluded.last_parsed_epoch;
    `);

    this.getFileStmt = this.db.prepare('SELECT * FROM files WHERE file_path = ?');
    this.deleteFileStmt = this.db.prepare('DELETE FROM files WHERE file_path = ?');

    this.upsertNodeStmt = this.db.prepare(`
      INSERT INTO nodes (
        id, urn, kind, name, qualified_name, repo_id, file_path, language,
        start_line, end_line, start_column, end_column,
        symbol_signature, visibility, return_type, raw_docstring,
        raw_json, content_sha256, ast_structural_hash, semantic_validity_hash,
        lamport_clock, substrate_epoch, semantic_epoch, process_epoch, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        urn = excluded.urn,
        kind = excluded.kind,
        name = excluded.name,
        qualified_name = excluded.qualified_name,
        repo_id = excluded.repo_id,
        file_path = excluded.file_path,
        language = excluded.language,
        start_line = excluded.start_line,
        end_line = excluded.end_line,
        start_column = excluded.start_column,
        end_column = excluded.end_column,
        symbol_signature = excluded.symbol_signature,
        visibility = excluded.visibility,
        return_type = excluded.return_type,
        raw_docstring = excluded.raw_docstring,
        raw_json = excluded.raw_json,
        content_sha256 = excluded.content_sha256,
        ast_structural_hash = excluded.ast_structural_hash,
        semantic_validity_hash = excluded.semantic_validity_hash,
        lamport_clock = excluded.lamport_clock,
        substrate_epoch = excluded.substrate_epoch,
        semantic_epoch = excluded.semantic_epoch,
        process_epoch = excluded.process_epoch,
        updated_at_ms = excluded.updated_at_ms;
    `);

    this.deleteFtsStmt = this.db.prepare('DELETE FROM nodes_fts WHERE id = ?');
    this.insertFtsStmt = this.db.prepare(`
      INSERT INTO nodes_fts (id, name, qualified_name, symbol_signature, raw_docstring)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.deleteEdgesBySourceStmt = this.db.prepare('DELETE FROM edges WHERE source = ?');
    this.upsertEdgeStmt = this.db.prepare(`
      INSERT INTO edges (
        source, target, kind, confidence, confidence_score,
        provenance, dispatch_mechanism, line, col, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, target, kind, IFNULL(line, -1), IFNULL(col, -1)) DO UPDATE SET
        confidence = excluded.confidence,
        confidence_score = excluded.confidence_score,
        provenance = excluded.provenance,
        dispatch_mechanism = excluded.dispatch_mechanism,
        metadata_json = excluded.metadata_json;
    `);

    this.getNodeStmt = this.db.prepare('SELECT raw_json FROM nodes WHERE id = ?');
    this.deleteNodeStmt = this.db.prepare('DELETE FROM nodes WHERE id = ?');
    this.deleteFtsNodeStmt = this.db.prepare('DELETE FROM nodes_fts WHERE id = ?');
    this.deleteEdgesBySourceOrTargetStmt = this.db.prepare('DELETE FROM edges WHERE source = ? OR target = ?');
    this.getNodesByFileStmt = this.db.prepare('SELECT id FROM nodes WHERE file_path = ?');
    this.countNodesStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM nodes');
  }

  private inTransaction = false;

  public runTransaction<T>(fn: () => T): T {
    if (this.inTransaction) {
      return fn();
    }
    this.inTransaction = true;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // ignore rollback error
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  public upsertFile(file: FileRecord): void {
    this.upsertFileStmt.run(file.filePath, file.sha256, file.sizeBytes, file.mtimeMs, file.language, file.lastParsedEpoch);
  }

  public getFile(filePath: string): FileRecord | null {
    const row = this.getFileStmt.get(filePath) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      filePath: row.file_path as string,
      sha256: row.sha256 as string,
      sizeBytes: row.size_bytes as number,
      mtimeMs: row.mtime_ms as number,
      language: row.language as string,
      lastParsedEpoch: row.last_parsed_epoch as number,
    };
  }

  public removeFile(filePath: string): void {
    this.deleteNodesByFile(filePath);
    this.deleteFileStmt.run(filePath);
  }

  public upsertNode(node: SuperNode): void {
    const jsonStr = JSON.stringify(node);
    this.upsertNodeStmt.run(
      node.id,
      node.urn,
      node.kind,
      node.name,
      node.qualifiedName,
      node.repoId,
      node.substrate.sourceLocation.filePath,
      node.substrate.language,
      node.substrate.sourceLocation.startLine,
      node.substrate.sourceLocation.endLine,
      node.substrate.sourceLocation.startColumn,
      node.substrate.sourceLocation.endColumn,
      node.substrate.symbolSignature ?? null,
      node.substrate.visibility ?? null,
      node.substrate.returnType ?? null,
      node.substrate.rawDocstring ?? null,
      jsonStr,
      node.versioning.contentSha256,
      node.versioning.astStructuralHash,
      node.versioning.semanticValidityHash,
      node.versioning.lamportClock,
      node.versioning.layerEpochs.substrateEpoch,
      node.versioning.layerEpochs.semanticEpoch,
      node.versioning.layerEpochs.processEpoch,
      node.versioning.lastModifiedTimestampMs ?? Date.now()
    );

    // Sync FTS
    this.deleteFtsStmt.run(node.id);
    this.insertFtsStmt.run(
      node.id,
      node.name,
      node.qualifiedName,
      node.substrate.symbolSignature ?? '',
      node.substrate.rawDocstring ?? ''
    );

    // Sync edges
    this.deleteEdgesBySourceStmt.run(node.id);
    for (const edge of node.substrate.outgoingEdges) {
      this.upsertEdgeStmt.run(
        node.id,
        edge.targetId,
        edge.kind,
        edge.confidence,
        edge.confidenceScore,
        edge.provenance,
        edge.dispatchMechanism ?? null,
        edge.location?.startLine ?? null,
        edge.location?.startColumn ?? null,
        null
      );
    }
  }

  public getNode(id: string): SuperNode | null {
    const row = this.getNodeStmt.get(id) as { raw_json: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.raw_json) as SuperNode;
  }

  public deleteNode(id: string): void {
    this.deleteFtsNodeStmt.run(id);
    this.deleteEdgesBySourceOrTargetStmt.run(id, id);
    this.deleteNodeStmt.run(id);
  }

  public deleteNodesByFile(filePath: string): string[] {
    const rows = this.getNodesByFileStmt.all(filePath) as Array<{ id: string }>;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    this.runTransaction(() => {
      for (const id of ids) {
        this.deleteFtsNodeStmt.run(id);
        this.deleteEdgesBySourceOrTargetStmt.run(id, id);
        this.deleteNodeStmt.run(id);
      }
    });
    return ids;
  }

  public searchFTS(query: string, limit = 20): SuperNode[] {
    const sanitized = query.replace(/[^\w\s]/g, ' ').trim();
    if (!sanitized) return [];

    const ftsQuery = sanitized.split(/\s+/).map((t) => `"${t}"*`).join(' OR ');
    try {
      const stmt = this.db.prepare(`
        SELECT n.raw_json
        FROM nodes_fts f
        JOIN nodes n ON f.id = n.id
        WHERE nodes_fts MATCH ?
        LIMIT ?
      `);
      const rows = stmt.all(ftsQuery, limit) as Array<{ raw_json: string }>;
      return rows.map((r) => JSON.parse(r.raw_json) as SuperNode);
    } catch {
      const stmt = this.db.prepare(`
        SELECT raw_json FROM nodes
        WHERE name LIKE ? OR qualified_name LIKE ?
        LIMIT ?
      `);
      const term = `%${query}%`;
      const rows = stmt.all(term, term, limit) as Array<{ raw_json: string }>;
      return rows.map((r) => JSON.parse(r.raw_json) as SuperNode);
    }
  }

  public getOutgoingEdges(sourceId: string): SubstrateEdge[] {
    const stmt = this.db.prepare('SELECT * FROM edges WHERE source = ?');
    const rows = stmt.all(sourceId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      targetId: r.target as string,
      kind: r.kind as SubstrateEdge['kind'],
      confidence: r.confidence as SubstrateEdge['confidence'],
      confidenceScore: r.confidence_score as number,
      provenance: r.provenance as SubstrateEdge['provenance'],
      dispatchMechanism: (r.dispatch_mechanism as string) ?? undefined,
    }));
  }

  public getIncomingEdges(targetId: string): Array<{ sourceId: string; edge: SubstrateEdge }> {
    const stmt = this.db.prepare('SELECT * FROM edges WHERE target = ?');
    const rows = stmt.all(targetId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      sourceId: r.source as string,
      edge: {
        targetId: r.target as string,
        kind: r.kind as SubstrateEdge['kind'],
        confidence: r.confidence as SubstrateEdge['confidence'],
        confidenceScore: r.confidence_score as number,
        provenance: r.provenance as SubstrateEdge['provenance'],
        dispatchMechanism: (r.dispatch_mechanism as string) ?? undefined,
      },
    }));
  }

  public getAllNodes(): SuperNode[] {
    const rows = this.db.prepare('SELECT raw_json FROM nodes').all() as Array<{ raw_json: string }>;
    return rows.map((r) => JSON.parse(r.raw_json) as SuperNode);
  }

  public countNodes(): number {
    const row = this.countNodesStmt.get() as { cnt: number };
    return row.cnt;
  }

  public close(): void {
    this.db.close();
  }
}
