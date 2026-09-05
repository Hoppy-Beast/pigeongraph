import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { FixtureManager } from '../fixture-manager.js';

describe('FixtureManager Tests', () => {
  const sandboxDir = resolve('eval-sandbox', 'test-fixtures');

  before(() => {
    mkdirSync(sandboxDir, { recursive: true });
  });

  after(() => {
    if (existsSync(sandboxDir)) {
      rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  test('resolves local repo path without downloading', async () => {
    const manager = new FixtureManager({ baseDir: sandboxDir });
    const localDir = join(sandboxDir, 'local-mock');
    mkdirSync(localDir, { recursive: true });
    writeFileSync(join(localDir, 'main.ts'), 'export const hello = "world";');

    const path = await manager.resolveRepo('local-mock', { localPath: localDir });
    assert.equal(path, localDir);
    assert.ok(existsSync(path));
  });

  test('creates minimal synthetic fixture when offline or remote unavailable', async () => {
    const manager = new FixtureManager({ baseDir: sandboxDir });
    const syntheticPath = await manager.createSyntheticFixture('mini-gin', {
      'main.go': `package main
import "github.com/gin-gonic/gin"
func main() {
    r := gin.Default()
    r.GET("/ping", pingHandler)
    r.Run()
}
func pingHandler(c *gin.Context) {
    c.JSON(200, gin.H{"message": "pong"})
}`,
    });

    assert.ok(existsSync(syntheticPath));
    assert.ok(existsSync(join(syntheticPath, 'main.go')));
  });
});
