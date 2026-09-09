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
  private server: Server | null = null;
  private options: UiServerOptions;
  private requestHandler: (req: any, res: any) => void;

  constructor(options: UiServerOptions) {
    this.options = options;
    this.requestHandler = (req, res) => {
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
    };
  }

  public setWsPort(wsPort: number): void {
    this.options.wsPort = wsPort;
  }

  public async start(preferredPort = 5052, maxRetries = 10): Promise<number> {
    return new Promise((resolve, reject) => {
      let currentPort = preferredPort;
      let attempts = 0;

      const tryListen = (portToTry: number) => {
        const srv = createServer(this.requestHandler);

        const onError = (err: any) => {
          srv.removeAllListeners();
          try {
            srv.close();
          } catch {}

          if (err.code === 'EADDRINUSE' && portToTry !== 0 && attempts < maxRetries) {
            attempts += 1;
            currentPort = portToTry + 1;
            tryListen(currentPort);
          } else {
            reject(err);
          }
        };

        srv.once('error', onError);

        srv.once('listening', () => {
          srv.removeListener('error', onError);
          srv.on('error', (err) => {
            console.error(`[UiServer] Runtime error on port ${portToTry}:`, err.message);
          });
          this.server = srv;
          const addr = srv.address();
          const boundPort = typeof addr === 'object' && addr ? addr.port : portToTry;
          resolve(boundPort);
        });

        srv.listen(portToTry);
      };

      tryListen(currentPort);
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }
}
