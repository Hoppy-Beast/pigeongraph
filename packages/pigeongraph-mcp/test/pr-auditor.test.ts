import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { PrAuditor } from '../src/audit/pr-auditor.js';
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
});
