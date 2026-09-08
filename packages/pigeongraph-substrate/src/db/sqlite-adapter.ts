import { createRequire } from 'node:module';

export interface StatementLike {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DatabaseSyncLike {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
}

export type DatabaseSyncConstructor = new (path: string, options?: unknown) => DatabaseSyncLike;

let cachedConstructor: DatabaseSyncConstructor | null = null;

export function getDatabaseSyncConstructor(): DatabaseSyncConstructor {
  if (cachedConstructor) {
    return cachedConstructor;
  }

  const req = createRequire(import.meta.url);

  // 1. Try native node:sqlite (Node.js >= 22.5.0)
  try {
    const nodeSqlite = req('node:sqlite');
    if (nodeSqlite && nodeSqlite.DatabaseSync) {
      cachedConstructor = nodeSqlite.DatabaseSync;
      return cachedConstructor!;
    }
  } catch {}

  // 2. Try better-sqlite3 (Node.js 20 fallback if installed)
  try {
    const BetterSqlite3 = req('better-sqlite3');
    if (BetterSqlite3) {
      cachedConstructor = class BetterSqlite3Adapter implements DatabaseSyncLike {
        private db: any;
        constructor(path: string, options?: any) {
          this.db = new BetterSqlite3(path, options);
        }
        exec(sql: string): void {
          this.db.exec(sql);
        }
        prepare(sql: string): StatementLike {
          return this.db.prepare(sql);
        }
        close(): void {
          this.db.close();
        }
      } as unknown as DatabaseSyncConstructor;
      return cachedConstructor!;
    }
  } catch {}

  // 3. Neither available - informative, actionable error
  const currentVersion = process.version;
  throw new Error(
    `\n❌ PigeonGraph requires Node.js >= 22.5.0 (Node 24 LTS recommended) for native zero-dependency SQLite with FTS5.\n` +
    `   Current environment: Node.js ${currentVersion}\n\n` +
    `👉 To upgrade in Google Colab / Ubuntu / Debian, run:\n` +
    `   !curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs\n\n` +
    `👉 To upgrade on your machine via n:\n` +
    `   npx -y n 22\n\n` +
    `👉 Alternatively, install better-sqlite3 for Node 20:\n` +
    `   npm install better-sqlite3\n`
  );
}
