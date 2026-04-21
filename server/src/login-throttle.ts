interface LoginAttemptState {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
}

export class LoginThrottle {
  private windowMs: number;
  private blockMs: number;
  private maxAttempts: number;
  private stateByKey = new Map<string, LoginAttemptState>();

  constructor(input: {
    windowSeconds: number;
    blockSeconds: number;
    maxAttempts: number;
  }) {
    this.windowMs = Math.max(1, input.windowSeconds) * 1000;
    this.blockMs = Math.max(1, input.blockSeconds) * 1000;
    this.maxAttempts = Math.max(1, input.maxAttempts);
  }

  public check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const state = this.stateByKey.get(key);
    if (!state) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (state.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((state.blockedUntil - now) / 1000)),
      };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  public recordFailure(key: string): void {
    const now = Date.now();
    const existing = this.stateByKey.get(key);

    if (!existing || now - existing.firstFailureAt > this.windowMs) {
      this.stateByKey.set(key, {
        failures: 1,
        firstFailureAt: now,
        blockedUntil: 0,
      });
      return;
    }

    const failures = existing.failures + 1;
    const blockedUntil = failures >= this.maxAttempts ? now + this.blockMs : existing.blockedUntil;
    this.stateByKey.set(key, {
      failures,
      firstFailureAt: existing.firstFailureAt,
      blockedUntil,
    });
  }

  public recordSuccess(key: string): void {
    this.stateByKey.delete(key);
  }
}

