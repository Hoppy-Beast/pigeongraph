import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSpans } from '../src/tools/span-fetcher.js';

function makeLines(n: number): string {
  const lines: string[] = [];
  for (let i = 1; i <= n; i++) lines.push(`line ${i} content here`);
  return lines.join('\n');
}

describe('span-fetcher', () => {
  test('merges overlapping ranges per file', () => {
    const content = makeLines(30);
    const result = fetchSpans(
      [
        { filePath: 'src/a.ts', lineRange: [5, 10] },
        { filePath: 'src/a.ts', lineRange: [8, 15] },
      ],
      { projectRoot: '/tmp/proj', dbContentProvider: () => content }
    );
    assert.equal(result.spans.length, 1);
    assert.deepEqual(result.spans[0].ranges, [[5, 15]]);
    assert.ok(result.spans[0].content.includes('line 5 content here'));
    assert.ok(result.spans[0].content.includes('line 15 content here'));
    assert.ok(!result.spans[0].content.includes('line 16 content here'));
    assert.equal(result.truncated, false);
    const expected = Math.ceil(result.spans[0].content.length / 4);
    assert.equal(result.spans[0].token_count, expected);
  });

  test('missing file returns unavailable placeholder without throwing', () => {
    const result = fetchSpans([{ filePath: 'src/missing.ts', lineRange: [1, 10] }], {
      projectRoot: '/tmp/proj',
      dbContentProvider: () => null,
    });
    assert.equal(result.spans.length, 1);
    assert.equal(result.spans[0].content, '// span unavailable: src/missing.ts');
    assert.equal(result.spans[0].token_count, 0);
    assert.equal(result.truncated, false);
  });

  test('enforces token budget with truncated:true', () => {
    const big = makeLines(100);
    const result = fetchSpans(
      [
        { filePath: 'src/a.ts', lineRange: [1, 50] },
        { filePath: 'src/b.ts', lineRange: [1, 50] },
        { filePath: 'src/c.ts', lineRange: [1, 50] },
      ],
      { projectRoot: '/tmp/proj', tokenBudget: 50, dbContentProvider: () => big }
    );
    assert.equal(result.truncated, true);
    // Each 50-line span costs ~260 tokens, far over budget 50, so nothing fits.
    assert.equal(result.spans.length, 0);

    // Partial budget: exactly enough for the first span only.
    const firstContent = big.split('\n').slice(0, 50).join('\n');
    const oneSpanTokens = Math.ceil(firstContent.length / 4);
    const partial = fetchSpans(
      [
        { filePath: 'src/a.ts', lineRange: [1, 50] },
        { filePath: 'src/b.ts', lineRange: [1, 50] },
      ],
      { projectRoot: '/tmp/proj', tokenBudget: oneSpanTokens, dbContentProvider: () => big }
    );
    assert.equal(partial.spans.length, 1);
    assert.equal(partial.truncated, true);
    // token_count must match length/4 within 20%
    for (const s of result.spans) {
      const expected = Math.ceil(s.content.length / 4);
      const diff = Math.abs(s.token_count - expected) / Math.max(1, expected);
      assert.ok(diff <= 0.2, `token_count off: ${s.token_count} vs ${expected}`);
    }
    // total tokens must not exceed budget (missing-file spans are 0)
    const total = result.spans.reduce((a, s) => a + s.token_count, 0);
    assert.ok(total <= 50, `total ${total} exceeds budget 50`);
  });
});
