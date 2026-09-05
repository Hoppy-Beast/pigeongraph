#!/usr/bin/env node
import { SuperGraphMcpServer } from './server.js';
import { UiServer } from './ui/ui-server.js';
import { SubstrateDaemon } from '@pigeongraph/substrate';
import { createInterface } from 'node:readline';

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
    await daemon.watcher.flushPendingBatch();

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
  } else {
    console.log(`
🐦 PigeonGraph CLI v1.0.0
Author: MD. Mahinur Rahman Prachurza (Hoppy-Beast)

Commands:
  pigeongraph serve-mcp         Start stdio Model Context Protocol (MCP) server
  pigeongraph explore <q>       Query knowledge graph from terminal
  pigeongraph ui [--port 5052]  Launch live in-browser architecture visualizer
    `);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
