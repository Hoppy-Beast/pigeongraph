import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicTokenBudgetGuard, BudgetExceededError } from '../dynamic-budget-guard.js';

describe('DynamicTokenBudgetGuard Tests', () => {
  test('allocates correct default tier budgets and enforces global 40k ceiling', () => {
    const guard = new DynamicTokenBudgetGuard();
    assert.equal(guard.getTierLimit('small'), 5000);
    assert.equal(guard.getTierLimit('medium'), 12000);
    assert.equal(guard.getTierLimit('large'), 20000);
    assert.equal(guard.getGlobalCeiling(), 40000);
  });

  test('records usage incrementally and computes remaining tokens', () => {
    const guard = new DynamicTokenBudgetGuard({ globalCeiling: 40000 });
    guard.recordUsage('small', 2500);

    const stats = guard.getUsageStats('small');
    assert.equal(stats.spent, 2500);
    assert.equal(stats.remaining, 2500);
    assert.equal(guard.getTotalGlobalSpent(), 2500);
    assert.equal(guard.getRemainingGlobal(), 37500);
  });

  test('trips circuit breaker when tier budget is exceeded', () => {
    const guard = new DynamicTokenBudgetGuard({
      tierLimits: { small: 3000, medium: 8000, large: 15000 },
    });

    guard.recordUsage('small', 2000);
    assert.equal(guard.isTierExceeded('small'), false);

    assert.throws(
      () => {
        guard.recordUsage('small', 1500); // 2000 + 1500 = 3500 > 3000
      },
      BudgetExceededError
    );
  });

  test('trips global circuit breaker when overall 40k ceiling is reached across multiple tiers', () => {
    const guard = new DynamicTokenBudgetGuard({
      globalCeiling: 10000,
      tierLimits: { small: 5000, medium: 8000, large: 15000 },
    });

    guard.recordUsage('small', 4000);
    guard.recordUsage('medium', 5000);
    // Total spent is now 9000 / 10000

    assert.throws(
      () => {
        guard.recordUsage('large', 2000); // 9000 + 2000 = 11000 > 10000
      },
      BudgetExceededError
    );
  });
});
