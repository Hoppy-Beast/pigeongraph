#!/usr/bin/env node
import { SuperGraphMcpServer } from './server.js';
import { SubstrateDaemon } from '@supergraph/substrate';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const command = args[0] ?? 'serve-mcp';

async function main() {
  const projectRoot = process.cwd();
  const repoId = projectRoot.split(/[/\\]/).pop() ?? 'workspace';

  if (command === 'serve-mcp') {
    const daemon = new SubstrateDaemon({ projectRoot, repoId });
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
    const daemon = new SubstrateDaemon({ projectRoot, repoId });
    await daemon.watcher.flushPendingBatch();

    const server = new SuperGraphMcpServer({ projectRoot, repoId, daemon });
    const result = server.handleToolCall('pigeongraph_explore', { query });
    console.log(JSON.stringify(result, null, 2));
    await daemon.stop();
  } else {
    console.log(`
🐦 PigeonGraph CLI v1.0.0
Author: MD. Mahinur Rahman Prachurza (Hoppy-Beast)

Commands:
  pigeongraph serve-mcp     Start stdio Model Context Protocol (MCP) server
  pigeongraph explore <q>   Query knowledge graph from terminal
    `);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
