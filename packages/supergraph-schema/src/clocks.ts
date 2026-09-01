/**
 * Monotonic Lamport Clock & Vector Clock Causality Tracker
 */

export class ClockManager {
  private lamportCounter = 0;
  private vectorClock: Record<string, number> = {};
  private readonly actorId: string;

  constructor(actorId: string, initialLamport = 0, initialVector: Record<string, number> = {}) {
    this.actorId = actorId;
    this.lamportCounter = initialLamport;
    this.vectorClock = { ...initialVector };
    if (this.vectorClock[this.actorId] === undefined) {
      this.vectorClock[this.actorId] = 0;
    }
  }

  /**
   * Increments the local clock upon generating a local event/mutation.
   */
  public tick(): { lamport: number; vector: Record<string, number> } {
    this.lamportCounter += 1;
    this.vectorClock[this.actorId] = (this.vectorClock[this.actorId] ?? 0) + 1;
    return {
      lamport: this.lamportCounter,
      vector: { ...this.vectorClock },
    };
  }

  /**
   * Merges an incoming message's clocks according to Lamport & Vector clock rules:
   * L_local = max(L_local, L_remote) + 1
   * V_local[k] = max(V_local[k], V_remote[k])
   */
  public receive(remoteLamport: number, remoteVector: Record<string, number>): {
    lamport: number;
    vector: Record<string, number>;
  } {
    this.lamportCounter = Math.max(this.lamportCounter, remoteLamport) + 1;
    for (const [actor, counter] of Object.entries(remoteVector)) {
      this.vectorClock[actor] = Math.max(this.vectorClock[actor] ?? 0, counter);
    }
    this.vectorClock[this.actorId] = (this.vectorClock[this.actorId] ?? 0) + 1;
    return {
      lamport: this.lamportCounter,
      vector: { ...this.vectorClock },
    };
  }

  public getLamport(): number {
    return this.lamportCounter;
  }

  public getVector(): Record<string, number> {
    return { ...this.vectorClock };
  }
}
