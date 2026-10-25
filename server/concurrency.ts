export type ConcurrencyLease = {
  release(): void;
};

export type PracticePlanConcurrency = {
  tryAcquire(): ConcurrencyLease | null;
  get activeCount(): number;
};

export function createConcurrencyLimiter(maxActive: number): PracticePlanConcurrency {
  let activeCount = 0;

  return {
    get activeCount(): number {
      return activeCount;
    },
    tryAcquire(): ConcurrencyLease | null {
      if (activeCount >= maxActive) return null;
      activeCount += 1;
      let released = false;
      return {
        release(): void {
          if (released) return;
          released = true;
          activeCount -= 1;
        },
      };
    },
  };
}
