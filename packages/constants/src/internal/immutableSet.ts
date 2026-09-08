/**
 * Internal immutable Set implementation.
 *
 * `Object.freeze` does not protect the internal slots of a `Set`, so a
 * "frozen" Set still allows `.add()`, `.delete()`, and `.clear()` at runtime.
 * This subclass hard-disables all mutators, making it safe to expose
 * security-sensitive sets (e.g. forbidden schema keys) as `ReadonlySet`.
 *
 * @module internal/immutableSet
 */

/**
 * A `Set` whose mutating methods (`add`, `delete`, `clear`) always throw.
 *
 * Values are inserted via `super.add` during construction only; afterwards
 * the collection is permanently immutable.
 */
export class ImmutableSet<T> extends Set<T> {
  constructor(values?: Iterable<T>) {
    super();
    if (values !== undefined) {
      for (const value of values) {
        super.add(value);
      }
    }
    Object.freeze(this);
  }

  /** @throws {TypeError} always — this set is immutable. */
  override add(_value: T): this {
    throw new TypeError("Cannot add to an immutable Set");
  }

  /** @throws {TypeError} always — this set is immutable. */
  override delete(_value: T): boolean {
    throw new TypeError("Cannot delete from an immutable Set");
  }

  /** @throws {TypeError} always — this set is immutable. */
  override clear(): void {
    throw new TypeError("Cannot clear an immutable Set");
  }
}
