#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SuperGraphMcpServer } from './server.js';
import { UiServer } from './ui/ui-server.js';
import { PrAuditor } from './audit/pr-auditor.js';
import { AgentInstaller } from './installer/agent-installer.js';
import { SubstrateDaemon, AstExtractor } from '@pigeongraph/substrate';
import { ClientGraphStore } from '@pigeongraph/client';
import { createInterface } from 'node:readline';

export const DOT_LOGO = `⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡤⠀⠂⠀⠀⡀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡴⠿⣂⣷⣤⣨⣺⣱⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢎⠠⡄⢡⣟⠿⣛⡯⣯⣧⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡎⠊⠟⠈⢫⣽⣿⣿⡯⠉⠙⠳
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣜⢃⢇⠀⠠⢀⠘⠻⢻⡧⡄⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠎⠃⢀⠊⠀⠀⠃⠀⠀⠈⡕⢰⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡴⠊⠁⠘⡀⢁⠀⠀⠀⠀⠀⠀⠀⠀⠬⢼⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠞⠀⠀⠠⠆⠁⠎⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⣁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⠄⠀⣀⠔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡄⠛⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡞⠉⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠃⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⡏⡇⠀⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣐⠎⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⡿⢃⠀⣔⣩⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀⠀⠀⠠⣤⠋⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⠋⠀⠠⠎⠅⠀⠀⠀⠀⠀⠀⠀⠀⠂⡃⢄⠆⣠⡰⡬⠓⠁⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⣾⠳⠎⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⡀⣼⢺⣽⣦⣿⠷⠋⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⡠⠔⠓⠂⠀⠀⠀⢀⣠⠰⢲⣶⣾⢷⣾⣿⣿⣿⣿⡟⡭⡼⠁⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⣀⢠⠐⡀⠁⠀⠀⣀⡄⢠⣤⣞⢣⣦⡽⢶⣿⣿⠿⣿⣿⠻⢿⣿⣿⣧⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⣤⣾⠁⢠⢠⣴⣶⡗⠉⣿⠛⠋⠉⠈⢠⣦⣼⡟⠋⠁⠀⠘⣿⣦⣬⣿⣿⣾⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠉⠉⢁⣾⣟⢟⡯⢐⠉⠁⠀⠀⠀⣠⠟⠋⠁⠀⠀⠀⠀⠴⠟⠛⠛⠛⢻⣋⣿⣦⣤⣤⣾⣀⠀⠀⠀⠀
⠀⠀⠀⠎⠋⣠⠿⠁⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠙⠁⠈⠉⠉⠉⠉⠁⠁⠀⠀⠀
⠀⠀⠀⣠⠾⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⢀⡴⠃⠐⠀⠀⠀⢀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣰⣯⢰⡇⠄⡀⡤⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠘⠛⠓⠈⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`;

const args = process.argv.slice(2);
const command = args[0] ?? 'serve-mcp';

async function main() {
  const projectRoot = process.cwd();
  const repoId = projectRoot.split(/[/\\]/).pop() ?? 'workspace';

  const configPath = join(projectRoot, '.pigeongraph', 'config.json');
  let config: any = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      // ignore config read errors
    }
  }

  const wsPort = process.env.PIGEONGRAPH_WS_PORT
    ? parseInt(process.env.PIGEONGRAPH_WS_PORT, 10)
    : config.wsPort;

  const defaultDbDir = join(projectRoot, '.pigeongraph');
  if (!existsSync(defaultDbDir)) {
    try {
      mkdirSync(defaultDbDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  const dbPath = process.env.PIGEONGRAPH_DB_PATH || join(defaultDbDir, 'substrate.db');
  const loneDebounceMs = process.env.PIGEONGRAPH_LONE_DEBOUNCE_MS
    ? parseInt(process.env.PIGEONGRAPH_LONE_DEBOUNCE_MS, 10)
    : config.loneDebounceMs;
  const burstDebounceMs = process.env.PIGEONGRAPH_BURST_DEBOUNCE_MS
    ? parseInt(process.env.PIGEONGRAPH_BURST_DEBOUNCE_MS, 10)
    : config.burstDebounceMs;
  const excludedDirs = config.excludedDirs;

  const daemonOptions = {
    projectRoot,
    repoId,
    wsPort,
    dbPath,
    loneDebounceMs,
    burstDebounceMs,
    excludedDirs,
  };

  if (command === 'serve-mcp') {
    const daemon = new SubstrateDaemon(daemonOptions);
    await daemon.start();

    const server = new SuperGraphMcpServer({
      projectRoot,
      repoId,
      daemon,
    });

    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      const response = server.handleJsonRpcMessage(line);
      if (response) {
        process.stdout.write(response + '\n');
      }
    });

    process.on('SIGINT', async () => {
      await daemon.stop();
      process.exit(0);
    });
  } else if (command === 'index') {
    const isForce = args.includes('--force');
    const { rmSync } = await import('node:fs');
    if (isForce && existsSync(dbPath)) {
      try {
        rmSync(dbPath, { force: true });
        rmSync(`${dbPath}-wal`, { force: true });
        rmSync(`${dbPath}-shm`, { force: true });
      } catch {
        // ignore
      }
    }

    const t0 = performance.now();
    console.log(`⚡ Indexing codebase: ${projectRoot}...`);
    const daemon = new SubstrateDaemon(daemonOptions);
    await daemon.watcher.scanProject();
    const elapsed = Math.round(performance.now() - t0);
    const nodeCount = daemon.db.countNodes();
    const allNodes = daemon.db.getAllNodes();
    const codeSymbols = allNodes.filter((n) =>
      ['function', 'method', 'class', 'interface', 'struct'].includes(n.kind)
    ).length;
    const docSections = allNodes.filter((n) => n.kind === 'section' || n.kind === 'document').length;
    const filesCount = allNodes.filter((n) => n.kind === 'file').length;

    console.log(`
🐦 PigeonGraph Indexing Completed!
📂 Project Root : ${projectRoot}
📊 Total Nodes  : ${nodeCount}
   • Code Symbols     : ${codeSymbols} (functions, methods, classes, structs)
   • Markdown Sections: ${docSections} (architecture, specs, invariants)
   • Files Indexed    : ${filesCount}
⏱️ Duration    : ${elapsed}ms
💾 Database     : ${dbPath}
    `);
    await daemon.stop();
  } else if (command === 'explore') {
    const isRefresh = args.includes('--refresh') || args.includes('--reindex');
    const cleanArgs = args.slice(1).filter((a) => a !== '--refresh' && a !== '--reindex');
    const query = cleanArgs.join(' ');
    if (!query) {
      console.error('Usage: pigeongraph explore <query> [--refresh]');
      process.exit(1);
    }
    const daemon = new SubstrateDaemon(daemonOptions);
    const existingNodes = daemon.db.countNodes();
    if (existingNodes === 0 || isRefresh) {
      await daemon.watcher.scanProject();
    }

    const server = new SuperGraphMcpServer({ projectRoot, repoId, daemon });
    const result = server.handleToolCall('pigeongraph_explore', { query });
    console.log(JSON.stringify(result, null, 2));
    await daemon.stop();
  } else if (command === 'ui') {
    const portIdx = args.indexOf('--port');
    const uiPort = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 5052;

    const daemon = new SubstrateDaemon(daemonOptions);
    await daemon.start();
    await daemon.watcher.flushPendingBatch();

    const uiServer = new UiServer({
      db: daemon.db,
      wsPort: daemonOptions.wsPort ?? 5051,
    });

    const boundPort = await uiServer.start(uiPort);
    const uiUrl = `http://127.0.0.1:${boundPort}`;

    console.log(`
🐦 PigeonGraph Live Architecture Canvas active!
🌐 Visualizer URL : ${uiUrl}
⚡ WebSocket Diff : ws://127.0.0.1:${daemonOptions.wsPort ?? 5051}
📂 Monitored Root : ${projectRoot}

Press Ctrl+C to stop.
    `);

    try {
      const { exec } = await import('node:child_process');
      const startCmd = process.platform === 'win32' ? `start ${uiUrl}` : process.platform === 'darwin' ? `open ${uiUrl}` : `xdg-open ${uiUrl}`;
      exec(startCmd);
    } catch {
      // ignore
    }

    process.on('SIGINT', async () => {
      await uiServer.close();
      await daemon.stop();
      process.exit(0);
    });
  } else if (command === 'audit-pr') {
    const baseIdx = args.indexOf('--base');
    const baseRef = baseIdx !== -1 ? args[baseIdx + 1] : 'HEAD~1';
    const headIdx = args.indexOf('--head');
    const headRef = headIdx !== -1 ? args[headIdx + 1] : 'HEAD';
    const isJson = args.includes('--json');

    const { execSync } = await import('node:child_process');

    let changedFileList: string[] = [];
    try {
      const diffOutput = execSync(`git diff --name-only ${baseRef} ${headRef}`, { encoding: 'utf-8', cwd: projectRoot });
      changedFileList = diffOutput.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } catch {
      console.error(`Failed to inspect git diff between ${baseRef} and ${headRef}`);
      process.exit(1);
    }

    const changedFiles: Array<{ filePath: string; oldContent: string; newContent: string }> = [];
    for (const file of changedFileList) {
      if (!file.match(/\.(ts|js|tsx|jsx|py|go|rs|java|c|cpp)$/i)) continue;
      let oldContent = '';
      let newContent = '';

      try {
        oldContent = execSync(`git show ${baseRef}:${file}`, { encoding: 'utf-8', cwd: projectRoot, stdio: ['pipe', 'pipe', 'ignore'] });
      } catch {
        oldContent = '';
      }

      try {
        const fullPath = await import('node:path').then((p) => p.resolve(projectRoot, file));
        const fs = await import('node:fs');
        if (fs.existsSync(fullPath)) {
          newContent = fs.readFileSync(fullPath, 'utf-8');
        } else {
          newContent = execSync(`git show ${headRef}:${file}`, { encoding: 'utf-8', cwd: projectRoot, stdio: ['pipe', 'pipe', 'ignore'] });
        }
      } catch {
        newContent = '';
      }

      changedFiles.push({ filePath: file, oldContent, newContent });
    }

    const store = new ClientGraphStore();
    const auditor = new PrAuditor({ store, extractor: new AstExtractor() });

    const auditResult = auditor.auditFiles({
      repoId,
      changedFiles,
    });

    if (isJson) {
      console.log(JSON.stringify(auditResult, null, 2));
    } else {
      console.log(auditResult.markdownReport);
    }
  } else if (command === 'init') {
    const res = AgentInstaller.initProject(projectRoot);
    console.log(`
🐦 PigeonGraph Project Initialized!
📂 Project Root : ${projectRoot}
⚙️  Config File  : ${res.configPath}
🎯 Cursor Config: ${res.cursorMcpPath}

Next steps:
- Run 'pigeongraph install-mcp' to register with Claude Desktop & Cursor
- Run 'pigeongraph explore <query>' to query code knowledge
- Run 'pigeongraph ui' to open the live architecture canvas
    `);
  } else if (command === 'install-mcp' || command === 'install') {
    const targetIdx = args.indexOf('--target');
    const target = targetIdx !== -1 ? (args[targetIdx + 1] as any) : 'all';
    const modeIdx = args.indexOf('--mode');
    const mode = modeIdx !== -1 ? (args[modeIdx + 1] as any) : 'auto';

    const res = AgentInstaller.installMcp({ projectRoot, target, mode });
    console.log(`
🐦 PigeonGraph MCP Registration
===============================
Command configured : ${res.commandUsed} ${res.argsUsed.join(' ')}

Target Integrations:
${res.targets
  .map((t) => (t.updated ? `  ✅ ${t.name}: ${t.path}` : `  ⚠️  ${t.name}: Skipped (${t.path})`))
  .join('\n')}

🎉 PigeonGraph registered! Restart your AI agent / IDE to start exploring.
    `);
  } else if (command === 'uninstall-mcp' || command === 'uninstall') {
    const targetIdx = args.indexOf('--target');
    const target = targetIdx !== -1 ? (args[targetIdx + 1] as any) : 'all';

    const res = AgentInstaller.uninstallMcp({ projectRoot, target });
    console.log(`
🐦 PigeonGraph MCP Deregistration
=================================
${res.targets
  .map((t) => (t.updated ? `  ✅ Removed from ${t.name}: ${t.path}` : `  ℹ️  ${t.name}: ${t.details ?? 'Unchanged'}`))
  .join('\n')}

PigeonGraph MCP has been uninstalled.
    `);
  } else {
    console.log(`
\x1b[38;5;215m${DOT_LOGO}\x1b[0m

🐦 PigeonGraph CLI v1.0.4
Author: MD. Mahinur Rahman Prachurza (Hoppy-Beast)

Commands:
  pigeongraph init              Initialize .pigeongraph config & agent MCP files
  pigeongraph index [--force]   Build & persist code knowledge graph
  pigeongraph explore <q>       Query knowledge graph in 1 shot from terminal
  pigeongraph install-mcp       Auto-register MCP with Claude Desktop & Cursor
  pigeongraph uninstall-mcp     Remove MCP from Claude Desktop & Cursor
  pigeongraph ui [--port 5052]  Launch live in-browser architecture visualizer
  pigeongraph audit-pr          Calculate PR blast radius and interface breaking risk
  pigeongraph serve-mcp         Start stdio Model Context Protocol (MCP) server
    `);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
