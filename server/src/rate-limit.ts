import type { Request, Response, NextFunction } from "express";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export function createTokenBucketRateLimiter(capacity: number, refillPerMinute: number) {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = refillPerMinute / 60000;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = buckets.get(ip) ?? { tokens: capacity, lastRefill: now };

    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    bucket.tokens -= 1;
    buckets.set(ip, bucket);
    next();
  };
}

