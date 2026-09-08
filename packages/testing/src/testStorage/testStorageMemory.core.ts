/**
 * @zudojs/testing — In-memory storage adapter for testing.
 *
 * A simple in-memory key-value store that satisfies the basic
 * cache adapter interface for testing without external dependencies.
 */

/** A simple in-memory store entry. */
interface StoreEntry {
  readonly value: unknown;
  readonly expiresAt: Date | null;
}

/**
 * In-memory storage adapter for testing.
 *
 * Provides basic get/set/delete/has/clear operations
 * without any external dependencies.
 */
export class InMemoryTestStorage {
  private readonly store = new Map<string, StoreEntry>();

  /** Drops the entry when its TTL has passed. Returns the live entry. */
  private live(key: string): StoreEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt && entry.expiresAt.getTime() <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Get a value by key.
   *
   * Returns null for a miss. Use {@link has} to tell a miss apart from a
   * stored `null` — caching a negative result is exactly the case a cache
   * test needs to distinguish.
   */
  get<T = unknown>(key: string): T | null {
    const entry = this.live(key);
    if (!entry) return null;
    return (entry.value ?? null) as T | null;
  }

  /** Set a value with optional TTL in milliseconds. */
  set(key: string, value: unknown, ttlMs?: number): void {
    const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;
    this.store.set(key, { value, expiresAt });
  }

  /** Delete a value by key. Returns true if deleted. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Check if a key exists and is not expired, whatever its value. */
  has(key: string): boolean {
    return this.live(key) !== undefined;
  }

  /** Clear all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Get all live keys, excluding expired entries. */
  keys(): string[] {
    return [...this.store.keys()].filter((key) => this.live(key) !== undefined);
  }

  /** Get the number of live entries. */
  get size(): number {
    return this.keys().length;
  }
}
