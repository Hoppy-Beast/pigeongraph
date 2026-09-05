#!/usr/bin/env node
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

  const wsPort = process.env.PIGEONGRAPH_WS_PORT ? parseInt(process.env.PIGEONGRAPH_WS_PORT, 10) : undefined;
  const dbPath = process.env.PIGEONGRAPH_DB_PATH || undefined;
  const loneDebounceMs = process.env.PIGEONGRAPH_LONE_DEBOUNCE_MS ? parseInt(process.env.PIGEONGRAPH_LONE_DEBOUNCE_MS, 10) : undefined;
  const burstDebounceMs = process.env.PIGEONGRAPH_BURST_DEBOUNCE_MS ? parseInt(process.env.PIGEONGRAPH_BURST_DEBOUNCE_MS, 10) : undefined;

  const daemonOptions = {
    projectRoot,
    repoId,
    wsPort,
    dbPath,
    loneDebounceMs,
    burstDebounceMs,
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
  } else if (command === 'explore') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('Usage: pigeongraph explore <query>');
      process.exit(1);
    }
    const daemon = new SubstrateDaemon(daemonOptions);
    await daemon.watcher.scanProject();

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

🐦 PigeonGraph CLI v1.0.0
Author: MD. Mahinur Rahman Prachurza (Hoppy-Beast)

Commands:
  pigeongraph init              Initialize .pigeongraph config & agent MCP files
  pigeongraph install-mcp       Auto-register MCP with Claude Desktop & Cursor
  pigeongraph uninstall-mcp     Remove MCP from Claude Desktop & Cursor
  pigeongraph explore <q>       Query knowledge graph in 1 shot from terminal
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
