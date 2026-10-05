/** Concurrency limiter: at most `n` of the wrapped calls run at once. */
export function createLimiter(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((res) => queue.push(res));
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

export interface RetryOptions {
  retries?: number; // additional attempts after the first
  baseMs?: number;
  factor?: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `fn`, retrying failures up to `retries` times (default 2 => 3 attempts total) with backoff. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseMs = 700, factor = 2, shouldRetry = () => true, sleep = defaultSleep } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !shouldRetry(e, attempt)) break;
      await sleep(baseMs * factor ** attempt + Math.floor(Math.random() * 150));
    }
  }
  throw lastErr;
}

/** Runs tasks with a worker pool; resolves when all are done (errors are captured, never thrown). */
export async function runPool<T>(items: T[], n: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let i = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        await worker(items[idx], idx);
      } catch {
        /* workers report their own failures */
      }
    }
  });
  await Promise.all(lanes);
}
