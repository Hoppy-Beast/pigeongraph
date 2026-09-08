import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SubstrateDatabase } from '../src/db/database.js';
import { AstExtractor } from '../src/parser/ast-extractor.js';
import { DynamicDispatchSynthesizer } from '../src/parser/dynamic-synthesizer.js';
import { AdaptiveWatcher } from '../src/watcher/adaptive-watcher.js';
import { ClockManager, type SuperNode } from '@pigeongraph/schema';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Indexing Performance & Caching Tests', () => {
  let db: SubstrateDatabase;
  let extractor: AstExtractor;
  let synthesizer: DynamicDispatchSynthesizer;
  let clock: ClockManager;
  let tempDir: string;

  before(() => {
    db = new SubstrateDatabase(':memory:');
    extractor = new AstExtractor();
    synthesizer = new DynamicDispatchSynthesizer();
    clock = new ClockManager('test-perf');
    tempDir = mkdtempSync(join(tmpdir(), 'pg-test-perf-'));
  });

  after(() => {
    db.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('SubstrateDatabase supports runTransaction and bulk node upserts', () => {
    const nodes: SuperNode[] = [];
    for (let i = 0; i < 500; i++) {
      nodes.push({
        id: `sg://repo/file${i}.ts#fn${i}`,
        urn: `urn:supergraph:repo:file${i}.ts#fn${i}`,
        kind: 'function',
        name: `fn${i}`,
        qualifiedName: `fn${i}`,
        repoId: 'repo',
        versioning: {
          lamportClock: 1,
          vectorClock: { substrate: 1 },
          layerEpochs: { substrateEpoch: 1, semanticEpoch: 0, processEpoch: 0 },
          contentSha256: 'a'.repeat(64),
          astStructuralHash: 'b'.repeat(64),
          semanticValidityHash: 'c'.repeat(64),
        },
        substrate: {
          sourceLocation: { filePath: `file${i}.ts`, startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
          language: 'typescript',
          outgoingEdges: [],
          astEpochTimestamp: new Date().toISOString(),
        },
        semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
        processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
      });
    }

    const startTime = performance.now();
    (db as any).runTransaction(() => {
      for (const node of nodes) {
        db.upsertNode(node);
      }
    });
    const elapsed = performance.now() - startTime;

    assert.equal(db.countNodes(), 500);
    assert.ok(elapsed < 2000, `Transaction bulk insert took ${elapsed}ms, expected < 2000ms`);
  });

  test('DynamicDispatchSynthesizer scales linearly with large node sets without O(N^2) blowup', () => {
    const largeNodes: SuperNode[] = [];
    const fileContents = new Map<string, string>();

    for (let i = 0; i < 1000; i++) {
      const filePath = `src/module_${i % 20}.ts`;
      const content = `
        export function handler_${i}() {}
        app.get('/route_${i}', handler_${i});
      `;
      fileContents.set(filePath, content);
      largeNodes.push({
        id: `sg://app/${filePath}#handler_${i}`,
        urn: `urn:supergraph:app:${filePath}#handler_${i}`,
        kind: 'function',
        name: `handler_${i}`,
        qualifiedName: `handler_${i}`,
        repoId: 'app',
        versioning: {
          lamportClock: 1,
          vectorClock: { substrate: 1 },
          layerEpochs: { substrateEpoch: 1, semanticEpoch: 0, processEpoch: 0 },
          contentSha256: '0'.repeat(64),
          astStructuralHash: '0'.repeat(64),
          semanticValidityHash: '0'.repeat(64),
        },
        substrate: {
          sourceLocation: { filePath, startLine: 2, startColumn: 0, endLine: 3, endColumn: 1 },
          language: 'typescript',
          outgoingEdges: [],
          astEpochTimestamp: new Date().toISOString(),
        },
        semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
        processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
      });
    }

    const t0 = performance.now();
    const result = synthesizer.synthesize(largeNodes, fileContents);
    const duration = performance.now() - t0;

    assert.ok(result.synthesizedEdges.length > 0, 'Should synthesize route edges');
    assert.ok(duration < 1500, `DynamicDispatchSynthesizer took ${duration}ms for 1000 nodes, expected < 1500ms`);
  });

  test('AdaptiveWatcher skips unmodified files using mtime/size cache', async () => {
    const filePath = join(tempDir, 'sample.ts');
    writeFileSync(filePath, 'export function alpha() { return 1; }\n');

    const testDb = new SubstrateDatabase(':memory:');
    const watcher = new AdaptiveWatcher({
      projectRoot: tempDir,
      repoId: 'test-cache',
      db: testDb,
      clockManager: clock,
    });

    await watcher.scanProject();
    const firstCount = testDb.countNodes();
    assert.ok(firstCount >= 2, 'File node and function node should be created');

    const fileRec = testDb.getFile('sample.ts');
    assert.ok(fileRec, 'File record should exist in DB');
    const prevEpoch = fileRec.lastParsedEpoch;

    await watcher.scanProject();
    const secondRec = testDb.getFile('sample.ts');
    assert.equal(secondRec?.lastParsedEpoch, prevEpoch, 'Epoch should remain unchanged because file was skipped');

    writeFileSync(filePath, 'export function alpha() { return 2; }\nexport function beta() { return 3; }\n');
    await watcher.scanProject();
    const thirdRec = testDb.getFile('sample.ts');
    assert.ok(thirdRec!.lastParsedEpoch > prevEpoch, 'Epoch should increment after file modification');
    assert.ok(testDb.countNodes() >= 3, 'Should have new function beta');

    watcher.close();
    testDb.close();
  });

  test('AdaptiveWatcher excludes test, docs, and custom configured directories', async () => {
    const testsDir = join(tempDir, 'tests');
    const docsDir = join(tempDir, 'docs');
    const srcDir = join(tempDir, 'src');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });
    mkdirSync(srcDir, { recursive: true });

    writeFileSync(join(testsDir, 'test_something.ts'), 'export function testSomething() {}\n');
    writeFileSync(join(docsDir, 'guide.ts'), 'export function docExample() {}\n');
    writeFileSync(join(srcDir, 'core.ts'), 'export function coreLogic() {}\n');

    const testDb = new SubstrateDatabase(':memory:');
    const watcher = new AdaptiveWatcher({
      projectRoot: tempDir,
      repoId: 'test-exclude',
      db: testDb,
      clockManager: clock,
      excludedDirs: ['tests', 'docs'],
    });

    await watcher.scanProject();

    const files = testDb.getAllNodes().filter((n) => n.kind === 'file');
    const filePaths = files.map((f) => f.qualifiedName);

    assert.ok(filePaths.includes('src/core.ts'), 'src/core.ts must be indexed');
    assert.ok(!filePaths.some((p) => p.includes('tests/')), 'tests/ should be excluded');
    assert.ok(!filePaths.some((p) => p.includes('docs/')), 'docs/ should be excluded');

    watcher.close();
    testDb.close();
  });
});
