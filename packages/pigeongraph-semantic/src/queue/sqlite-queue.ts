import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

export type JobPriority = 0 | 1 | 2 | 3;
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'SUPERSEDED' | 'FAILED';

export interface SemanticJob {
  id: string;
  jobKey: string;
  filePath: string;
  contentHash: string;
  priority: JobPriority;
  epoch: number;
  jobType: string;
  payloadJson: string;
  status: JobStatus;
  retryCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export class SQLiteSemanticQueue {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_jobs (
        id TEXT PRIMARY KEY,
        job_key TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        priority INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        job_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_priority ON semantic_jobs(status, priority, created_at_ms);
      CREATE INDEX IF NOT EXISTS idx_jobs_file ON semantic_jobs(file_path, status);
    `);
  }

  public enqueue(params: {
    filePath: string;
    contentHash: string;
    priority: JobPriority;
    epoch: number;
    jobType: string;
    payload?: Record<string, unknown>;
  }): SemanticJob {
    const jobKey = createHash('sha256')
      .update(`${params.filePath}|${params.contentHash}|${params.jobType}`)
      .digest('hex');

    const now = Date.now();
    const id = `job_${jobKey.substring(0, 16)}_${params.epoch}`;

    // Supersede any existing pending jobs for this file if epoch is newer
    this.db.prepare(`
      UPDATE semantic_jobs
      SET status = 'SUPERSEDED', updated_at_ms = ?
      WHERE file_path = ? AND status = 'PENDING' AND epoch < ?
    `).run(now, params.filePath, params.epoch);

    const payloadJson = JSON.stringify(params.payload ?? {});

    const stmt = this.db.prepare(`
      INSERT INTO semantic_jobs (
        id, job_key, file_path, content_hash, priority, epoch,
        job_type, payload_json, status, retry_count, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        priority = excluded.priority,
        epoch = excluded.epoch,
        payload_json = excluded.payload_json,
        updated_at_ms = excluded.updated_at_ms;
    `);

    stmt.run(
      id,
      jobKey,
      params.filePath,
      params.contentHash,
      params.priority,
      params.epoch,
      params.jobType,
      payloadJson,
      now,
      now
    );

    return {
      id,
      jobKey,
      filePath: params.filePath,
      contentHash: params.contentHash,
      priority: params.priority,
      epoch: params.epoch,
      jobType: params.jobType,
      payloadJson,
      status: 'PENDING',
      retryCount: 0,
      createdAtMs: now,
      updatedAtMs: now,
    };
  }

  public dequeue(): SemanticJob | null {
    const now = Date.now();
    const row = this.db.prepare(`
      SELECT * FROM semantic_jobs
      WHERE status = 'PENDING'
      ORDER BY priority ASC, created_at_ms ASC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;

    if (!row) return null;

    const id = row.id as string;
    this.db.prepare(`
      UPDATE semantic_jobs
      SET status = 'RUNNING', updated_at_ms = ?
      WHERE id = ?
    `).run(now, id);

    return {
      id,
      jobKey: row.job_key as string,
      filePath: row.file_path as string,
      contentHash: row.content_hash as string,
      priority: row.priority as JobPriority,
      epoch: row.epoch as number,
      jobType: row.job_type as string,
      payloadJson: row.payload_json as string,
      status: 'RUNNING',
      retryCount: row.retry_count as number,
      createdAtMs: row.created_at_ms as number,
      updatedAtMs: now,
    };
  }

  public complete(jobId: string): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE semantic_jobs
      SET status = 'COMPLETED', updated_at_ms = ?
      WHERE id = ?
    `).run(now, jobId);
  }

  public fail(jobId: string, canRetry = true): void {
    const now = Date.now();
    const row = this.db.prepare('SELECT retry_count FROM semantic_jobs WHERE id = ?').get(jobId) as { retry_count: number } | undefined;
    const retryCount = (row?.retry_count ?? 0) + 1;

    if (canRetry && retryCount <= 3) {
      this.db.prepare(`
        UPDATE semantic_jobs
        SET status = 'PENDING', retry_count = ?, updated_at_ms = ?
        WHERE id = ?
      `).run(retryCount, now, jobId);
    } else {
      this.db.prepare(`
        UPDATE semantic_jobs
        SET status = 'FAILED', retry_count = ?, updated_at_ms = ?
        WHERE id = ?
      `).run(retryCount, now, jobId);
    }
  }

  public getPendingCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM semantic_jobs WHERE status = 'PENDING'").get() as { cnt: number };
    return row.cnt;
  }

  public close(): void {
    this.db.close();
  }
}
