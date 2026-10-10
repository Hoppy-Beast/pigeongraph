import { createServer, type Server } from 'node:http';
import { getViewerHtml } from './viewer-html.js';
import type { ClientGraphStore } from '@pigeongraph/client';
import type { SubstrateDatabase } from '@pigeongraph/substrate';
// mcp -> client is the allowed dependency direction, so importing the shared
// risk scorer keeps UI scores identical to explore/analytical tools.
import { computeRisk } from '@pigeongraph/client';
import type { SuperNode } from '@pigeongraph/schema';

export interface UiServerOptions {
  store?: ClientGraphStore;
  db?: SubstrateDatabase;
  wsPort?: number;
}

export interface RiskBreakdown {
  score: number;
  level: string;
  nodes: number;
  files: number;
  exported: number;
  entries: number;
}

function toRiskBreakdown(node: SuperNode): RiskBreakdown {
  const { score, level } = computeRisk([node]);
  const filePath = node.substrate?.sourceLocation?.filePath;
  const exported =
    node.substrate?.modifiers?.includes('exported') || node.substrate?.visibility === 'public' ? 1 : 0;
  const entries = node.processFlow?.isEntryPoint ? 1 : 0;
  return { score, level, nodes: 1, files: filePath ? 1 : 0, exported, entries };
}

type FlowDirection = 'upstream' | 'downstream' | 'both';

function parseDirection(raw: string | null): FlowDirection {
  if (raw === 'upstream' || raw === 'downstream' || raw === 'both') return raw;
  return 'both';
}

function filterByDirection(
  nodeIds: Set<string>,
  edges: Array<{ source: string; target: string; kind: string }>,
  direction: FlowDirection,
  focus: string | null,
): Set<string> {
  if (!focus || direction === 'both' || !nodeIds.has(focus)) {
    if (focus && !nodeIds.has(focus)) return new Set();
    return nodeIds;
  }
  const visited = new Set<string>([focus]);
  const queue: string[] = [focus];
  while (queue.length > 0) {
    const cur = queue.pop() as string;
    for (const e of edges) {
      if (direction === 'upstream' && e.target === cur && !visited.has(e.source)) {
        visited.add(e.source);
        queue.push(e.source);
      } else if (direction === 'downstream' && e.source === cur && !visited.has(e.target)) {
        visited.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return visited;
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

        const direction = parseDirection(url.searchParams.get('direction'));
        const focus = url.searchParams.get('focus');
        const allIds = new Set(nodes.map((n) => n.id));
        const visibleIds = filterByDirection(allIds, edges, direction, focus);
        const filteredNodes = nodes.filter((n) => visibleIds.has(n.id));
        const filteredEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

        const lightweightNodes = filteredNodes.map((node) => ({
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
          riskBreakdown: toRiskBreakdown(node),
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ nodes: lightweightNodes, edges: filteredEdges }));
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
