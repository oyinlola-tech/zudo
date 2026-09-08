/**
 * Stub utilities.
 *
 * Creates fake implementations of interfaces for testing.
 */

/**
 * Properties a stub must never answer with a function.
 *
 * `then` is the important one: answering it makes the stub a thenable, so
 * `await stub` calls it expecting a promise callback. The fake never resolves,
 * and the test hangs until it times out with no indication why.
 */
const NON_CALLABLE_KEYS: ReadonlySet<PropertyKey> = new Set([
  "then",
  "catch",
  "finally",
  Symbol.toPrimitive,
  Symbol.iterator,
  Symbol.asyncIterator,
  Symbol.toStringTag,
]);

/**
 * Creates a stub object from an interface.
 *
 * All methods return undefined by default. Override specific methods
 * by passing an overrides object.
 *
 * @typeParam T - The interface type to stub.
 * @param overrides - Optional method implementations.
 * @returns A stub object matching the interface.
 *
 * @example
 * ```ts
 * interface UserService {
 *   find(id: string): Promise<User | null>;
 *   create(data: CreateUserInput): Promise<User>;
 * }
 *
 * const stub = createStub<UserService>({
 *   find: async (id) => ({ id, name: "Test" }),
 * });
 *
 * expect(await stub.find("123")).toEqual({ id: "123", name: "Test" });
 * ```
 */
export function createStub<T extends object>(
  overrides: Partial<T> = {} as Partial<T>,
): T {
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      // `hasOwn`, not `in`: `in` walks the prototype chain, so `toString`,
      // `constructor` and `valueOf` resolved to undefined instead of stubs.
      if (Object.hasOwn(overrides, prop)) {
        return (overrides as Record<PropertyKey, unknown>)[prop];
      }

      if (NON_CALLABLE_KEYS.has(prop)) return undefined;
      if (typeof prop === "symbol") return undefined;

      return (..._args: unknown[]) => undefined;
    },

    has(_target, prop) {
      return !NON_CALLABLE_KEYS.has(prop);
    },
  });
}

/**
 * Creates a stub class constructor.
 *
 * Instances keep the original prototype, so `instanceof` holds and methods
 * that were not overridden exist as no-ops rather than being absent.
 *
 * @typeParam T - The class type to stub.
 * @param OriginalClass - The class being stubbed.
 * @param overrides - Optional property and method implementations.
 * @returns A stub class constructor.
 *
 * @example
 * ```ts
 * class RealDatabase {
 *   async connect(): Promise<void> {}
 *   async query(sql: string): Promise<unknown[]> { return []; }
 * }
 *
 * const StubDatabase = createStubClass(RealDatabase, {
 *   query: async () => [],
 * });
 *
 * const db = new StubDatabase();
 * expect(db).toBeInstanceOf(RealDatabase);
 * await db.connect();
 * ```
 */
export function createStubClass<T extends object>(
  OriginalClass: new (...args: never[]) => T,
  overrides: Partial<T> = {} as Partial<T>,
): new () => T {
  const prototype = OriginalClass.prototype as Record<PropertyKey, unknown>;

  const methodNames = Object.getOwnPropertyNames(prototype).filter((name) => {
    if (name === "constructor") return false;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    return typeof descriptor?.value === "function";
  });

  class Stub {
    constructor() {
      for (const name of methodNames) {
        (this as Record<PropertyKey, unknown>)[name] = () => undefined;
      }
      for (const [key, value] of Object.entries(overrides)) {
        (this as Record<string, unknown>)[key] = value;
      }
    }
  }

  Object.setPrototypeOf(Stub.prototype, prototype);
  Object.setPrototypeOf(Stub, OriginalClass);

  return Stub as unknown as new () => T;
}
