/**
 * Advanced TypeScript utility types.
 *
 * @module typeUtilities/typeUtilities
 */

/**
 * Make all properties deeply readonly.
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

/**
 * Make all properties deeply optional.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends Map<infer K, infer V>
    ? Map<DeepPartial<K>, DeepPartial<V>>
    : T extends Set<infer U>
      ? Set<DeepPartial<U>>
      : T extends object
        ? { [K in keyof T]?: DeepPartial<T[K]> }
        : T;

/**
 * Make all properties deeply required.
 */
export type DeepRequired<T> = T extends (infer U)[]
  ? DeepRequired<U>[]
  : T extends Map<infer K, infer V>
    ? Map<DeepRequired<K>, DeepRequired<V>>
    : T extends Set<infer U>
      ? Set<DeepRequired<U>>
      : T extends object
        ? { [K in keyof T]-?: DeepRequired<T[K]> }
        : T;

/**
 * Flatten nested object types into a single level.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Extract only the string keys of T.
 */
export type StringKeysOf<T> = Extract<keyof T, string>;

/**
 * Extract only the number keys of T.
 */
export type NumberKeysOf<T> = Extract<keyof T, number>;

/**
 * Create a type with all properties optional except the specified keys.
 */
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> &
  Pick<T, K>;

/**
 * Create a type with all properties required except the specified keys.
 */
export type RequiredExcept<T, K extends keyof T> = Required<Omit<T, K>> &
  Pick<T, K>;

/**
 * Create a type that makes the specified keys optional.
 *
 * Named `PartialKeys` to pair with {@link RequireKeys}. It was `OptionalKeys`,
 * which in every other utility library means "the union of `T`'s optional key
 * names" — the opposite kind of thing, and a two-parameter type that reads as
 * a one-parameter one. Use {@link OptionalKeyNames} for that meaning.
 */
export type PartialKeys<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/**
 * The union of `T`'s optional key names.
 *
 * This is what `OptionalKeys<T>` reads as, and there was no type that did it.
 */
export type OptionalKeyNames<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];

/**
 * Create a type that makes specified keys required.
 */
export type RequireKeys<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>;

/**
 * Extract the return type of an async function.
 *
 * The constraint uses `never[]` rather than `unknown[]`. Parameters are
 * contravariant, so `(id: string) => Promise<User>` is **not** assignable to
 * `(...args: unknown[]) => Promise<unknown>` — the previous constraint
 * rejected almost every real async function, and nothing caught it because no
 * test instantiated the type.
 */
export type AsyncReturnType<T extends (...args: never[]) => Promise<unknown>> =
  T extends (...args: never[]) => Promise<infer R> ? R : never;

/**
 * Make a type nullable (allows null).
 */
export type Nullable<T> = T | null;

/**
 * Make a type undefinable (allows undefined).
 */
export type Undefinable<T> = T | undefined;

/**
 * Make a type nullable and undefinable.
 */
export type Maybe<T> = T | null | undefined;

/**
 * Make a type that can be either a value or a Promise of that value.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Extract all nested property paths as dot-notation strings.
 */
export type NestedKeyOf<T> = T extends object
  ? {
      [K in StringKeysOf<T>]: K | `${K}.${NestedKeyOf<T[K]>}`;
    }[StringKeysOf<T>]
  : never;

/**
 * Get the type of a nested property by dot-notation path.
 */
export type NestedValueOf<
  T,
  P extends string,
> = P extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? NestedValueOf<T[Head], Tail>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/**
 * Omit by value type (not key).
 */
export type OmitByValue<T, ValueType> = Pick<
  T,
  { [K in keyof T]: T[K] extends ValueType ? never : K }[keyof T]
>;

/**
 * Extract by value type (not key).
 */
export type PickByValue<T, ValueType> = Pick<
  T,
  { [K in keyof T]: T[K] extends ValueType ? K : never }[keyof T]
>;
