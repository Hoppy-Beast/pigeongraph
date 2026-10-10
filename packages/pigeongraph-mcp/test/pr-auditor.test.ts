import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { PrAuditor, buildSarif, isTestFile } from '../src/audit/pr-auditor.js';
import { ClientGraphStore } from '@pigeongraph/client';
import { AstExtractor } from '@pigeongraph/substrate';

describe('PigeonGraph PR Blast Radius Auditor Tests', () => {
  let auditor: PrAuditor;
  let store: ClientGraphStore;
  let extractor: AstExtractor;

  before(() => {
    store = new ClientGraphStore();
    extractor = new AstExtractor();
    auditor = new PrAuditor({ store, extractor });
  });

  test('PrAuditor identifies SAFE_INTERNAL_REFACTOR when H_semantic_inv is identical', () => {
    const oldCode = `
      export function calculateDiscount(price: number): number {
        // Original 10% discount
        return price * 0.9;
      }
    `;

    const newCode = `
      export function calculateDiscount(price: number): number {
        // Refactored with fast bitwise / optimized math, same signature
        const rate = 0.10;
        return price - (price * rate);
      }
    `;

    const audit = auditor.auditFiles({
      repoId: 'shop-app',
      changedFiles: [
        {
          filePath: 'src/pricing.ts',
          oldContent: oldCode,
          newContent: newCode,
        },
      ],
    });

    assert.equal(audit.totalFilesChanged, 1);
    assert.equal(audit.safeInternalRefactors, 1);
    assert.equal(audit.breakingInterfaceChanges, 0);
    assert.equal(audit.overallRiskLevel, 'LOW');
    assert.ok(audit.markdownReport.includes('Safe internal refactor'));
  });

  test('PrAuditor flags BREAKING_INTERFACE_CHANGE when symbol signature changes', () => {
    const oldCode = `
      export function verifyToken(token: string): boolean {
        return true;
      }
    `;

    const newCode = `
      export function verifyToken(token: string, secretKey: string, maxAgeMs: number): boolean {
        return token.length > 0 && secretKey.length > 0;
      }
    `;

    const audit = auditor.auditFiles({
      repoId: 'auth-app',
      changedFiles: [
        {
          filePath: 'src/auth.ts',
          oldContent: oldCode,
          newContent: newCode,
        },
      ],
    });

    assert.equal(audit.totalFilesChanged, 1);
    assert.equal(audit.breakingInterfaceChanges, 1);
    assert.equal(audit.safeInternalRefactors, 0);
    assert.notEqual(audit.overallRiskLevel, 'LOW');
    assert.ok(audit.markdownReport.includes('BREAKING_INTERFACE_CHANGE') || audit.markdownReport.includes('Signature Changed'));
  });

  test('PrAuditor marks overall risk CRITICAL when breakingInterfaceChanges>=3', () => {
    const oldCode = `
      export function alpha(a: string): boolean { return true; }
      export function beta(b: number): number { return b; }
      export function gamma(c: string): string { return c; }
    `;
    const newCode = `
      export function alpha(a: string, extra: number): boolean { return true; }
      export function beta(b: number, flag: boolean): number { return b; }
      export function gamma(c: string, opts: object): string { return c; }
    `;
    const audit = auditor.auditFiles({
      repoId: 'shop-app',
      changedFiles: [{ filePath: 'src/multi.ts', oldContent: oldCode, newContent: newCode }],
    });
    assert.equal(audit.breakingInterfaceChanges, 3);
    assert.equal(audit.overallRiskLevel, 'CRITICAL');
    assert.ok(audit.markdownReport.includes('CRITICAL'));
  });

  test('PrAuditor marks overall risk CRITICAL when deletedSymbols>=2', () => {
    const oldCode = `
      export function keepMe(a: string): boolean { return true; }
      export function goneOne(b: number): number { return b; }
      export function goneTwo(c: string): string { return c; }
    `;
    const newCode = `
      export function keepMe(a: string): boolean { return true; }
    `;
    const audit = auditor.auditFiles({
      repoId: 'shop-app',
      changedFiles: [{ filePath: 'src/prune.ts', oldContent: oldCode, newContent: newCode }],
    });
    assert.equal(audit.deletedSymbols, 2);
    assert.equal(audit.overallRiskLevel, 'CRITICAL');
    assert.ok(audit.markdownReport.includes('CRITICAL'));
  });

  test('PrAuditor marks overall risk HIGH when breakingInterfaceChanges>=2', () => {
    const oldCode = `
      export function alpha(a: string): boolean { return true; }
      export function beta(b: number): number { return b; }
    `;
    const newCode = `
      export function alpha(a: string, extra: number): boolean { return true; }
      export function beta(b: number, flag: boolean): number { return b; }
    `;
    const audit = auditor.auditFiles({
      repoId: 'shop-app',
      changedFiles: [{ filePath: 'src/pair.ts', oldContent: oldCode, newContent: newCode }],
    });
    assert.equal(audit.breakingInterfaceChanges, 2);
    assert.equal(audit.overallRiskLevel, 'HIGH');
  });

  test('PrAuditor marks CRITICAL when a single breaking change blasts across >=5 files', () => {
    const blastNodes = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map((f) => ({
      substrate: { sourceLocation: { filePath: f } },
    }));
    const fakeStore = {
      bfsBlastRadius: () => ({ nodes: blastNodes, edgeCount: 5, depthMap: new Map() }),
    } as unknown as ClientGraphStore;
    const blastAuditor = new PrAuditor({ store: fakeStore, extractor });
    const audit = blastAuditor.auditFiles({
      repoId: 'blast-app',
      changedFiles: [
        {
          filePath: 'src/core.ts',
          oldContent: `export function run(a: string): boolean { return true; }`,
          newContent: `export function run(a: string, extra: number): boolean { return true; }`,
        },
      ],
    });
    assert.equal(audit.breakingInterfaceChanges, 1);
    assert.equal(audit.details[0].blastRadiusFiles, 5);
    assert.equal(audit.overallRiskLevel, 'CRITICAL');
  });

  test('isTestFile matches risk.ts patterns (__tests__, .test./.spec., test(s)/ dirs)', () => {
    assert.equal(isTestFile('src/__tests__/auth.ts'), true);
    assert.equal(isTestFile('src/auth.test.ts'), true);
    assert.equal(isTestFile('src/auth.spec.ts'), true);
    assert.equal(isTestFile('test/auth.ts'), true);
    assert.equal(isTestFile('src/test/auth.ts'), true);
    assert.equal(isTestFile('tests/auth.ts'), true);
    assert.equal(isTestFile('src/tests/auth.ts'), true);
    assert.equal(isTestFile('src/auth.ts'), false);
  });

  test('PrAuditor labels test-only file changes with testOnly flag and [test-only] summary', () => {
    const audit = auditor.auditFiles({
      repoId: 'auth-app',
      changedFiles: [
        {
          filePath: 'src/auth.test.ts',
          oldContent: `export function verifyToken(token: string): boolean { return true; }`,
          newContent: `export function verifyToken(token: string, secretKey: string): boolean { return token.length > 0; }`,
        },
      ],
    });
    assert.equal(audit.breakingInterfaceChanges, 1);
    assert.equal(audit.details[0].testOnly, true);
    assert.ok(audit.details[0].summary.startsWith('[test-only]'));
    assert.ok(audit.markdownReport.includes('test-only'));
  });

  test('PrAuditor leaves testOnly false for production file changes', () => {
    const audit = auditor.auditFiles({
      repoId: 'auth-app',
      changedFiles: [
        {
          filePath: 'src/auth.ts',
          oldContent: `export function verifyToken(token: string): boolean { return true; }`,
          newContent: `export function verifyToken(token: string, secretKey: string): boolean { return token.length > 0; }`,
        },
      ],
    });
    assert.equal(audit.details[0].testOnly, false);
    assert.ok(!audit.details[0].summary.startsWith('[test-only]'));
  });

  test('buildSarif emits SARIF 2.1.0 with one result per breaking/deleted/new', () => {
    const audit = auditor.auditFiles({
      repoId: 'sarif-app',
      changedFiles: [
        {
          filePath: 'src/mixed.ts',
          oldContent: `
            export function changed(a: string): boolean { return true; }
            export function removed(b: number): number { return b; }
          `,
          newContent: `
            export function changed(a: string, extra: number): boolean { return true; }
            export function added(c: string): string { return c; }
          `,
        },
      ],
    });
    assert.equal(audit.breakingInterfaceChanges, 1);
    assert.equal(audit.deletedSymbols, 1);
    assert.equal(audit.newSymbols, 1);

    const sarif = buildSarif(audit);
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs.length, 1);
    // breaking + deleted + new => 3 results; safe refactors are not findings
    assert.equal(sarif.runs[0].results.length, 3);

    const byRule = new Map(sarif.runs[0].results.map((r) => [r.ruleId, r]));
    assert.equal(byRule.get('BREAKING_INTERFACE_CHANGE')?.level, 'error');
    assert.equal(byRule.get('DELETED_SYMBOL')?.level, 'error');
    assert.equal(byRule.get('NEW_SYMBOL')?.level, 'warning');
    for (const r of sarif.runs[0].results) {
      assert.ok(typeof r.message.text === 'string' && r.message.text.length > 0);
      assert.equal(r.locations[0].physicalLocation.artifactLocation.uri, 'src/mixed.ts');
    }
    // Must survive a JSON round-trip (cli --sarif prints JSON)
    assert.deepEqual(JSON.parse(JSON.stringify(sarif)), sarif);
  });
});
