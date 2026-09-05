import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { FixtureManager } from '../fixture-manager.js';
import { EvalEngine } from '../eval-engine.js';
import { QualityScorer } from '../quality-scorer.js';

describe('EvalEngine & QualityScorer Tests', () => {
  const sandboxDir = resolve('eval-sandbox', 'eval-engine-test');
  let fixtureDir: string;

  before(async () => {
    mkdirSync(sandboxDir, { recursive: true });
    const manager = new FixtureManager({ baseDir: sandboxDir });
    fixtureDir = await manager.createSyntheticFixture('express-app', {
      'src/server.ts': `import express from 'express';
import { handleCheckout } from './controllers/checkout.js';
const app = express();
app.post('/checkout', handleCheckout);
app.listen(3000);`,
      'src/controllers/checkout.ts': `import { processPayment } from '../services/payment.js';
export async function handleCheckout(req, res) {
  const result = await processPayment(req.body);
  res.json(result);
}`,
      'src/services/payment.ts': `export async function processPayment(data) {
  return { status: 'success', id: 'tx_123' };
}`,
    });
  });

  after(() => {
    if (existsSync(sandboxDir)) {
      rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  test('runs Arm A (baseline file search) and captures realistic multi-file token overhead', async () => {
    const engine = new EvalEngine();
    const result = await engine.runArmA(fixtureDir, 'handleCheckout');

    assert.equal(result.arm, 'BASELINE_GREP_AND_READ');
    assert.ok(result.tokens > 50);
    assert.ok(result.turns >= 2); // Inspected multiple files
    assert.equal(result.dynamic_dispatch_captured, false);
  });

  test('runs Arm B (PigeonGraph 1-shot explore) in 1 turn with dynamic route synthesis', async () => {
    const engine = new EvalEngine();
    const result = await engine.runArmB(fixtureDir, 'handleCheckout');

    assert.equal(result.arm, 'PIGEONGRAPH_1SHOT');
    assert.equal(result.turns, 1);
    assert.ok(result.tokens > 0);
    assert.ok(result.duration_ms >= 0);
    assert.ok(result.symbols.length >= 1);
    assert.equal(result.dynamic_dispatch_captured, true);
  });

  test('QualityScorer computes token reduction and accuracy score', async () => {
    const engine = new EvalEngine();
    const armA = await engine.runArmA(fixtureDir, 'handleCheckout');
    const armB = await engine.runArmB(fixtureDir, 'handleCheckout');

    const score = QualityScorer.evaluate(armA, armB);
    assert.ok(score.token_reduction_pct >= 0);
    assert.equal(score.sufficiency_status, 'SUFFICIENT');
    assert.equal(score.dynamic_dispatch_recall, 1.0);
    assert.ok(score.context_headroom_saved > 0 || score.token_reduction_pct >= 0);
  });
});
