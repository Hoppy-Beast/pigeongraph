import { WebSocketServer, WebSocket } from 'ws';
import type { GraphDeltaEnvelope, GraphMutation } from '@pigeongraph/schema';
import { ClockManager } from '@pigeongraph/schema';
import { randomUUID } from 'node:crypto';

export interface WebSocketStreamerOptions {
  port: number;
  projectRoot: string;
  clockManager: ClockManager;
}

export class WebSocketStreamer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private clockManager: ClockManager;
  private projectRoot: string;
  private port: number;
  private epochCounter = 1;
  private mutationHistory: GraphDeltaEnvelope[] = [];

  constructor(options: WebSocketStreamerOptions) {
    this.port = options.port;
    this.projectRoot = options.projectRoot;
    this.clockManager = options.clockManager;
  }

  public getPort(): number {
    return this.port;
  }

  public start(maxRetries = 10): Promise<number> {
    return new Promise((resolve, reject) => {
      let currentPort = this.port;
      let attempts = 0;

      const tryListen = (portToTry: number) => {
        const wss = new WebSocketServer({ port: portToTry });

        const onError = (err: any) => {
          wss.removeAllListeners();
          try {
            wss.close();
          } catch {}

          if (err.code === 'EADDRINUSE' && portToTry !== 0 && attempts < maxRetries) {
            attempts += 1;
            currentPort = portToTry + 1;
            tryListen(currentPort);
          } else {
            reject(err);
          }
        };

        wss.once('error', onError);

        wss.once('listening', () => {
          wss.removeListener('error', onError);
          wss.on('error', (err) => {
            console.error(`[WebSocketStreamer] Runtime error on port ${portToTry}:`, err.message);
          });

          this.wss = wss;
          const addr = wss.address();
          this.port = typeof addr === 'object' && addr ? addr.port : portToTry;

          this.wss.on('connection', (ws: WebSocket) => {
            this.clients.add(ws);

            ws.on('message', (message: string) => {
              try {
                const data = JSON.parse(message.toString());
                if (data.type === 'RESYNC' && typeof data.last_seen_epoch === 'number') {
                  this.handleResync(ws, data.last_seen_epoch);
                }
              } catch {
                // Ignore malformed client message
              }
            });

            ws.on('close', () => {
              this.clients.delete(ws);
            });
          });

          resolve(this.port);
        });
      };

      tryListen(currentPort);
    });
  }

  public broadcastMutations(mutations: GraphMutation[], reconcileMode: 'delta' | 'reset_snapshot' = 'delta'): GraphDeltaEnvelope {
    const clock = this.clockManager.tick();
    this.epochCounter += 1;

    const envelope: GraphDeltaEnvelope = {
      protocolVersion: 1,
      epochId: this.epochCounter,
      transactionId: randomUUID(),
      vectorClock: clock.vector,
      timestampMs: Date.now(),
      projectRoot: this.projectRoot,
      reconcileMode,
      mutations,
    };

    // Store in ring buffer (max 1000 items)
    this.mutationHistory.push(envelope);
    if (this.mutationHistory.length > 1000) {
      this.mutationHistory.shift();
    }

    const payload = JSON.stringify(envelope);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }

    return envelope;
  }

  private handleResync(ws: WebSocket, lastSeenEpoch: number): void {
    const missing = this.mutationHistory.filter((env) => env.epochId > lastSeenEpoch);
    if (missing.length > 0 && missing[0].epochId === lastSeenEpoch + 1) {
      // Send sequential catchup frames
      for (const env of missing) {
        ws.send(JSON.stringify(env));
      }
    } else {
      // Signal full snapshot resync needed
      ws.send(
        JSON.stringify({
          protocolVersion: 1,
          epochId: this.epochCounter,
          transactionId: randomUUID(),
          vectorClock: this.clockManager.getVector(),
          timestampMs: Date.now(),
          projectRoot: this.projectRoot,
          reconcileMode: 'reset_snapshot',
          mutations: [],
        })
      );
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      for (const client of this.clients) {
        client.terminate();
      }
      this.clients.clear();
      this.wss.close(() => resolve());
    });
  }
}
