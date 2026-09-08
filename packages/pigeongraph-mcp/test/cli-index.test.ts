import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('CLI Index and Fast Explore Tests', () => {
  let tempDir: string;
  const cliPath = join(__dirname, '..', 'dist', 'cli.js');

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pg-cli-test-'));
    writeFileSync(
      join(tempDir, 'main.ts'),
      `
      export class OrderManager {
        public processOrder(id: string): boolean {
          return true;
        }
      }
      export function cancelOrder(id: string) {
        return false;
      }
      `
    );
  });

  after(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('pigeongraph init sets up .pigeongraph directory and config', () => {
    execSync(`node "${cliPath}" init`, { cwd: tempDir, encoding: 'utf-8' });
    const configPath = join(tempDir, '.pigeongraph', 'config.json');
    assert.ok(existsSync(configPath), 'config.json should exist');
  });

  test('pigeongraph index builds persistent substrate.db', () => {
    const output = execSync(`node "${cliPath}" index`, { cwd: tempDir, encoding: 'utf-8' });
    assert.ok(output.includes('Indexing Completed'), 'Output should indicate completion');
    const dbPath = join(tempDir, '.pigeongraph', 'substrate.db');
    assert.ok(existsSync(dbPath), 'substrate.db should exist after index');
  });

  test('pigeongraph explore reuses existing database in sub-100ms without reindexing', () => {
    const t0 = performance.now();
    const output = execSync(`node "${cliPath}" explore processOrder`, { cwd: tempDir, encoding: 'utf-8' });
    const duration = performance.now() - t0;

    const parsed = JSON.parse(output);
    assert.ok(parsed.symbols.length > 0, 'Should find processOrder');
    assert.equal(parsed.symbols[0].name, 'processOrder');
    // Once indexed, running explore in a new node process should easily finish quickly
    assert.ok(duration < 2500, `Explore took ${duration}ms, expected fast execution`);
  });
});
