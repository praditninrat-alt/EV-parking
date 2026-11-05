import { ApiError } from "./api";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) {
    throw new ApiError(429, "RATE_LIMITED", "มีการทำรายการบ่อยเกินไป กรุณาลองอีกครั้งภายหลัง");
  }
  bucket.count += 1;
}
