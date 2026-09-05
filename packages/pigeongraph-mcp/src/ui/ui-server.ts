import { createServer, type Server } from 'node:http';
import { getViewerHtml } from './viewer-html.js';
import type { ClientGraphStore } from '@pigeongraph/client';
import type { SubstrateDatabase } from '@pigeongraph/substrate';

export interface UiServerOptions {
  store?: ClientGraphStore;
  db?: SubstrateDatabase;
  wsPort?: number;
}

export class UiServer {
  private server: Server;
  private options: UiServerOptions;

  constructor(options: UiServerOptions) {
    this.options = options;
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getViewerHtml(this.options.wsPort ?? 5051));
        return;
      }

      if (url.pathname === '/api/graph') {
        const nodes = this.options.store
          ? this.options.store.getAllNodes()
          : this.options.db
          ? this.options.db.getAllNodes()
          : [];

        const edges: Array<{ source: string; target: string; kind: string }> = [];

        for (const node of nodes) {
          if (node.substrate?.outgoingEdges) {
            for (const edge of node.substrate.outgoingEdges) {
              edges.push({
                source: node.id,
                target: edge.targetId,
                kind: edge.kind,
              });
            }
          }
        }

        const lightweightNodes = nodes.map((node) => ({
          id: node.id,
          name: node.name,
          kind: node.kind,
          qualifiedName: node.qualifiedName,
          substrate: {
            language: node.substrate?.language,
            sourceLocation: node.substrate?.sourceLocation,
            symbolSignature: node.substrate?.symbolSignature,
            outgoingEdges: node.substrate?.outgoingEdges,
          },
          versioning: {
            semanticValidityHash: node.versioning?.semanticValidityHash,
          },
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ nodes: lightweightNodes, edges }));
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  }

  public async start(port = 5052): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        const addr = this.server.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : port;
        resolve(boundPort);
      });
      this.server.on('error', reject);
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
