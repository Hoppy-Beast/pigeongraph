import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentInstaller } from '../src/installer/agent-installer.js';

describe('AgentInstaller Tests', () => {
  const testDir = join(tmpdir(), `pg-installer-test-${Date.now()}`);
  const claudeTestPath = join(testDir, 'claude', 'claude_desktop_config.json');
  const cursorTestPath = join(testDir, '.cursor', 'mcp.json');

  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('detects valid OS config paths', () => {
    const claudePath = AgentInstaller.getClaudeConfigPath();
    assert.ok(claudePath.endsWith('claude_desktop_config.json'));

    const cursorPath = AgentInstaller.getCursorConfigPath(testDir);
    assert.ok(cursorPath.endsWith(join('.cursor', 'mcp.json')));
  });

  test('installs MCP configuration into Claude and Cursor configs', () => {
    const res = AgentInstaller.installMcp({
      projectRoot: testDir,
      claudeConfigPath: claudeTestPath,
      cursorConfigPath: cursorTestPath,
    });

    assert.equal(res.claudeUpdated, true);
    assert.equal(res.cursorUpdated, true);

    assert.ok(existsSync(claudeTestPath));
    assert.ok(existsSync(cursorTestPath));

    const claudeJson = JSON.parse(readFileSync(claudeTestPath, 'utf-8'));
    assert.ok(claudeJson.mcpServers.pigeongraph);
    assert.equal(claudeJson.mcpServers.pigeongraph.command, 'pigeongraph');

    const cursorJson = JSON.parse(readFileSync(cursorTestPath, 'utf-8'));
    assert.ok(cursorJson.mcpServers.pigeongraph);
    assert.equal(cursorJson.mcpServers.pigeongraph.command, 'pigeongraph');
  });

  test('uninstalls MCP configuration cleanly', () => {
    const res = AgentInstaller.uninstallMcp({
      projectRoot: testDir,
      claudeConfigPath: claudeTestPath,
      cursorConfigPath: cursorTestPath,
    });

    assert.equal(res.claudeUpdated, true);
    assert.equal(res.cursorUpdated, true);

    const claudeJson = JSON.parse(readFileSync(claudeTestPath, 'utf-8'));
    assert.equal(claudeJson.mcpServers.pigeongraph, undefined);

    const cursorJson = JSON.parse(readFileSync(cursorTestPath, 'utf-8'));
    assert.equal(cursorJson.mcpServers.pigeongraph, undefined);
  });

  test('initializes project with .pigeongraph and .cursor files', () => {
    const subProject = join(testDir, 'sub-app');
    const initRes = AgentInstaller.initProject(subProject);

    assert.ok(existsSync(initRes.configPath));
    assert.ok(existsSync(initRes.cursorMcpPath));

    const config = JSON.parse(readFileSync(initRes.configPath, 'utf-8'));
    assert.equal(config.wsPort, 5051);
    assert.equal(config.loneDebounceMs, 150);
  });
});
