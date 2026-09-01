import { SubstrateDatabase } from './db/database.js';
import { WebSocketStreamer } from './stream/ws-server.js';
import { AdaptiveWatcher } from './watcher/adaptive-watcher.js';
import { ClockManager } from '@pigeongraph/schema';

export interface SubstrateDaemonOptions {
  projectRoot: string;
  repoId: string;
  dbPath?: string;
  wsPort?: number;
}

export class SubstrateDaemon {
  public db: SubstrateDatabase;
  public streamer: WebSocketStreamer;
  public watcher: AdaptiveWatcher;
  public clockManager: ClockManager;

  constructor(options: SubstrateDaemonOptions) {
    this.clockManager = new ClockManager('substrate-daemon');
    this.db = new SubstrateDatabase(options.dbPath ?? ':memory:');
    this.streamer = new WebSocketStreamer({
      port: options.wsPort ?? 5051,
      projectRoot: options.projectRoot,
      clockManager: this.clockManager,
    });
    this.watcher = new AdaptiveWatcher({
      projectRoot: options.projectRoot,
      repoId: options.repoId,
      db: this.db,
      streamer: this.streamer,
      clockManager: this.clockManager,
    });
  }

  public async start(): Promise<void> {
    await this.streamer.start();
    this.watcher.start();
  }

  public async stop(): Promise<void> {
    this.watcher.close();
    await this.streamer.close();
    this.db.close();
  }
}
