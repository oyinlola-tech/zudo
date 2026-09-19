/**
 * Immutable event snapshots.
 *
 * The emitter used to deep-freeze the event IN PLACE, which froze the
 * publisher's own objects (a later `cart.total = 20` threw) and left
 * Map, Set and Date internals mutable, because `Object.freeze` does not
 * reach them. A snapshot is a frozen COPY: the caller's graph is never
 * touched, and Map, Set and Date are copied into read-only variants
 * whose mutators throw.
 */

/** Throws the TypeError every read-only mutator raises. */
function readOnly(kind: string): never {
  throw new TypeError(`Cannot modify a frozen event ${kind}.`);
}

/** A Date whose setters throw. */
export class FrozenEventDate extends Date {}

for (const key of Object.getOwnPropertyNames(Date.prototype)) {
  if (key.startsWith("set")) {
    Object.defineProperty(FrozenEventDate.prototype, key, {
      value: () => readOnly("Date"),
      configurable: true,
      writable: true,
    });
  }
}

/** A Map whose mutators throw once construction has finished. */
export class FrozenEventMap<K, V> extends Map<K, V> {
  override set(): this {
    return readOnly("Map");
  }
  override delete(): boolean {
    return readOnly("Map");
  }
  override clear(): void {
    readOnly("Map");
  }
}

/** A Set whose mutators throw once construction has finished. */
export class FrozenEventSet<T> extends Set<T> {
  override add(): this {
    return readOnly("Set");
  }
  override delete(): boolean {
    return readOnly("Set");
  }
  override clear(): void {
    readOnly("Set");
  }
}

/** Whether a value is a plain object (literal or null-prototype). */
function isPlainRecord(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function snapshot(value: unknown, seen: Map<object, unknown>): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return seen.get(value);

  if (value instanceof Date) {
    const copy = Object.freeze(new FrozenEventDate(value.getTime()));
    seen.set(value, copy);
    return copy;
  }

  if (value instanceof Map) {
    const copy = new FrozenEventMap<unknown, unknown>();
    seen.set(value, copy);
    for (const [key, item] of value) {
      Map.prototype.set.call(copy, key, snapshot(item, seen));
    }
    return Object.freeze(copy);
  }

  if (value instanceof Set) {
    const copy = new FrozenEventSet<unknown>();
    seen.set(value, copy);
    for (const item of value) {
      Set.prototype.add.call(copy, snapshot(item, seen));
    }
    return Object.freeze(copy);
  }

  const isArray = Array.isArray(value);
  const isError = value instanceof Error;

  // Instances of other classes (and exotic built-ins such as typed
  // arrays, RegExp, URL) cannot be copied faithfully — private fields and
  // internal slots do not survive — so they are passed by reference.
  if (!isArray && !isError && !isPlainRecord(value)) return value;

  const copy: object = isArray
    ? []
    : Object.create(Object.getPrototypeOf(value) as object | null);
  seen.set(value, copy);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if ("value" in descriptor) {
      descriptor.value = snapshot(descriptor.value, seen);
    }
    Object.defineProperty(copy, key, descriptor);
  }

  return Object.freeze(copy);
}

/**
 * Returns a deeply frozen copy of `value`, leaving `value` untouched.
 *
 * Plain objects, arrays and errors are copied (own properties, including
 * a `__proto__` data key, are defined rather than assigned) and frozen.
 * Map, Set and Date become {@link FrozenEventMap}, {@link FrozenEventSet}
 * and {@link FrozenEventDate}, which still pass `instanceof Map` / `Set`
 * / `Date` but throw on mutation. Class instances and other exotic
 * objects are passed by reference. Cycles are preserved.
 */
export function createFrozenEventSnapshot<T>(value: T): T {
  return snapshot(value, new Map<object, unknown>()) as T;
}
