/**
 * Internal immutable Set implementation.
 *
 * `Object.freeze` does not protect the internal slots of a `Set`, so a
 * "frozen" Set still allows `.add()`, `.delete()`, and `.clear()` at runtime.
 * Subclassing `Set` and overriding the mutators is not enough either:
 * `Set.prototype.clear.call(instance)` reaches the internal slot directly.
 * This class therefore holds its values in a private `Set` that no outside
 * code can reference, and exposes only the `ReadonlySet` surface.
 *
 * @module internal/immutableSet
 */

const setHas = Set.prototype.has;

/**
 * A read-only set whose mutating methods (`add`, `delete`, `clear`) always
 * throw, and whose backing storage is unreachable from outside the instance.
 *
 * It is not a `Set` subclass, so `instanceof Set` is `false`; iterate it or
 * copy it with `new Set(value)` when a mutable `Set` is needed.
 */
export class ImmutableSet<T> implements ReadonlySet<T> {
  readonly #values: Set<T>;

  constructor(values?: Iterable<T>) {
    this.#values = new Set(values);
    Object.freeze(this);
  }

  /** Number of values in the set. */
  get size(): number {
    return this.#values.size;
  }

  /** Whether `value` is in the set. */
  has(value: T): boolean {
    return setHas.call(this.#values, value);
  }

  /** Calls `callbackfn` once per value, in insertion order. */
  forEach(
    callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this.#values) {
      callbackfn.call(thisArg, value, value, this);
    }
  }

  /** Iterates `[value, value]` pairs, mirroring `Set.prototype.entries`. */
  entries(): SetIterator<[T, T]> {
    return this.#values.entries();
  }

  /** Iterates the values. */
  keys(): SetIterator<T> {
    return this.#values.keys();
  }

  /** Iterates the values. */
  values(): SetIterator<T> {
    return this.#values.values();
  }

  /** Iterates the values. */
  [Symbol.iterator](): SetIterator<T> {
    return this.#values.values();
  }

  /** @throws {TypeError} always — this set is immutable. */
  add(_value: T): never {
    throw new TypeError("Cannot add to an immutable Set");
  }

  /** @throws {TypeError} always — this set is immutable. */
  delete(_value: T): never {
    throw new TypeError("Cannot delete from an immutable Set");
  }

  /** @throws {TypeError} always — this set is immutable. */
  clear(): never {
    throw new TypeError("Cannot clear an immutable Set");
  }
}

Object.freeze(ImmutableSet.prototype);
