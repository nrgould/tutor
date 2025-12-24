/**
 * Simple in-memory cache with TTL support
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a value in the cache with TTL in milliseconds
   */
  set<T>(key: string, value: T, ttlMs: number = 60000): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear entries matching a prefix
   */
  clearPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

// Singleton cache instances for different purposes
export const topicsCache = new MemoryCache(50);
export const memoriesCache = new MemoryCache(100);
export const conversationsCache = new MemoryCache(50);

// Cache TTLs in milliseconds
export const CACHE_TTL = {
  TOPICS: 30000, // 30 seconds
  MEMORIES: 60000, // 1 minute
  CONVERSATIONS: 30000, // 30 seconds
  SETTINGS: 120000, // 2 minutes
};

/**
 * Cache wrapper for async functions
 */
export function withCache<T>(
  cache: MemoryCache,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  return fetcher().then((value) => {
    cache.set(key, value, ttlMs);
    return value;
  });
}

/**
 * Debounce function for reducing excessive calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Throttle function for rate limiting
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun >= limitMs) {
      lastRun = now;
      fn(...args);
    }
  };
}
