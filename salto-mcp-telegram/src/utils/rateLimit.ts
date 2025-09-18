export class RateLimiter {
  private tokens: number;
  private readonly queue: Array<() => void> = [];
  private readonly interval: NodeJS.Timer;

  constructor(
    private readonly limit: number,
    private readonly refillIntervalMs: number
  ) {
    this.tokens = limit;
    this.interval = setInterval(() => this.refill(), this.refillIntervalMs);
    this.interval.unref();
  }

  private refill() {
    this.tokens = this.limit;
    this.processQueue();
  }

  private processQueue() {
    while (this.tokens > 0 && this.queue.length > 0) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      if (resolve) {
        resolve();
      }
    }
  }

  async acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }
}
