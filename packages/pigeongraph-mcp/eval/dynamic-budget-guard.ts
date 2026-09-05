export type RepoTier = 'small' | 'medium' | 'large';

export interface TierLimits {
  small: number;
  medium: number;
  large: number;
}

export interface DynamicBudgetOptions {
  globalCeiling?: number;
  tierLimits?: Partial<TierLimits>;
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class DynamicTokenBudgetGuard {
  private globalCeiling: number;
  private tierLimits: TierLimits;
  private spentPerTier: Record<RepoTier, number> = {
    small: 0,
    medium: 0,
    large: 0,
  };
  private totalGlobalSpent = 0;

  constructor(options: DynamicBudgetOptions = {}) {
    this.globalCeiling = options.globalCeiling ?? 40000;
    this.tierLimits = {
      small: options.tierLimits?.small ?? 5000,
      medium: options.tierLimits?.medium ?? 12000,
      large: options.tierLimits?.large ?? 20000,
    };
  }

  public getTierLimit(tier: RepoTier): number {
    return this.tierLimits[tier];
  }

  public getGlobalCeiling(): number {
    return this.globalCeiling;
  }

  public getTotalGlobalSpent(): number {
    return this.totalGlobalSpent;
  }

  public getRemainingGlobal(): number {
    return Math.max(0, this.globalCeiling - this.totalGlobalSpent);
  }

  public isTierExceeded(tier: RepoTier): boolean {
    return this.spentPerTier[tier] >= this.tierLimits[tier];
  }

  public isGlobalCeilingExceeded(): boolean {
    return this.totalGlobalSpent >= this.globalCeiling;
  }

  public getUsageStats(tier: RepoTier): { spent: number; limit: number; remaining: number } {
    const limit = this.tierLimits[tier];
    const spent = this.spentPerTier[tier];
    return {
      spent,
      limit,
      remaining: Math.max(0, limit - spent),
    };
  }

  public recordUsage(tier: RepoTier, tokens: number): void {
    const nextTierTotal = this.spentPerTier[tier] + tokens;
    const nextGlobalTotal = this.totalGlobalSpent + tokens;

    if (nextTierTotal > this.tierLimits[tier]) {
      throw new BudgetExceededError(
        `Tier budget for '${tier}' exceeded! Attempted: ${nextTierTotal}, Limit: ${this.tierLimits[tier]}`
      );
    }

    if (nextGlobalTotal > this.globalCeiling) {
      throw new BudgetExceededError(
        `Global evaluation token ceiling exceeded! Attempted: ${nextGlobalTotal}, Ceiling: ${this.globalCeiling}`
      );
    }

    this.spentPerTier[tier] = nextTierTotal;
    this.totalGlobalSpent = nextGlobalTotal;
  }
}
