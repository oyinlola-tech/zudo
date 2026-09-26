/**
 * Dependency injection provider definitions for Zudojs.
 * Providers describe how a dependency should be created or retrieved.
 */

import type {
  Constructor,
  InjectionToken,
  Token,
} from "../containerToken/containerToken.type.js";

export type ProviderToken<T = unknown> = Token<T> | InjectionToken<T>;

/**
 * The parameter list a factory receives for an `inject` list: each token is
 * mapped to the type it resolves to, so `[DB, Clock]` gives `[Db, Clock]`.
 * Untyped string/symbol tokens map to `unknown`, and a non-tuple
 * `readonly ProviderToken[]` gives `unknown[]`, as before.
 */
export type InjectedDependencies<Deps extends readonly ProviderToken[]> = {
  -readonly [K in keyof Deps]: Deps[K] extends ProviderToken<infer U>
    ? U
    : never;
};

/** A factory whose parameters are typed from its `inject` list. */
export type InjectedFactory<T, Deps extends readonly ProviderToken[]> = (
  ...dependencies: InjectedDependencies<Deps>
) => T;

/**
 * The constructor parameter list an `inject` list must satisfy. A typed
 * token (`createToken<Db>()`, a class) contributes its type; an untyped
 * string/symbol token contributes `any`, because a class declares its own
 * parameter types and an untyped token carries nothing to check them
 * against. A non-tuple `readonly ProviderToken[]` (a list built at runtime)
 * has no positions to check and accepts any constructor.
 */
export type InjectedConstructorArgs<Deps extends readonly ProviderToken[]> =
  number extends Deps["length"]
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any[]
    : {
        -readonly [K in keyof Deps]: Deps[K] extends ProviderToken<infer U>
          ? unknown extends U
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              any
            : U
          : never;
      };

/**
 * A class whose constructor parameters are typed from its `inject` list, in
 * order: `[DB, Clock]` requires `new (db: Db, clock: Clock)`. Swapping two
 * typed tokens, or omitting the list for a constructor with required
 * parameters, is a compile error instead of a runtime `undefined`.
 */
export type InjectedConstructor<T, Deps extends readonly ProviderToken[]> =
  new (...args: InjectedConstructorArgs<Deps>) => T;

export interface ClassProvider<T> {
  readonly useClass: Constructor<T>;
  /**
   * Tokens resolved and passed to the constructor, in order.
   * Omit (or leave empty) for zero-argument constructors.
   */
  readonly inject?: readonly ProviderToken[];
}
export interface FactoryProvider<T> {
  readonly useFactory: (...dependencies: unknown[]) => T;
  readonly inject?: readonly ProviderToken[];
}
export interface ValueProvider<T> {
  readonly useValue: T;
}
export interface ExistingProvider<T> {
  readonly useExisting: ProviderToken<T>;
}

export type Provider<T = unknown> =
  | ClassProvider<T>
  | FactoryProvider<T>
  | ValueProvider<T>
  | ExistingProvider<T>;

export interface TokenProvider<T = unknown> {
  readonly provide: ProviderToken<T>;
  readonly provider: Provider<T>;
}
export interface ClassRegistration<T = unknown> {
  readonly provide: ProviderToken<T>;
  readonly useClass: Constructor<T>;
  readonly inject?: readonly ProviderToken[];
}
export interface FactoryRegistration<T = unknown> {
  readonly provide: ProviderToken<T>;
  readonly useFactory: (...dependencies: unknown[]) => T;
  readonly inject?: readonly ProviderToken[];
}
export interface ValueRegistration<T = unknown> {
  readonly provide: ProviderToken<T>;
  readonly useValue: T;
}
export interface ExistingRegistration<T = unknown> {
  readonly provide: ProviderToken<T>;
  readonly useExisting: ProviderToken<T>;
}

export type ContainerProvider<T = unknown> =
  | Provider<T>
  | TokenProvider<T>
  | ClassRegistration<T>
  | FactoryRegistration<T>
  | ValueRegistration<T>
  | ExistingRegistration<T>;

export function isClassProvider<T = unknown>(
  provider: Provider<T>,
): provider is ClassProvider<T> {
  return "useClass" in provider && typeof provider.useClass === "function";
}
export function isFactoryProvider<T = unknown>(
  provider: Provider<T>,
): provider is FactoryProvider<T> {
  return "useFactory" in provider && typeof provider.useFactory === "function";
}
export function isValueProvider<T = unknown>(
  provider: Provider<T>,
): provider is ValueProvider<T> {
  return "useValue" in provider;
}
export function isExistingProvider<T = unknown>(
  provider: Provider<T>,
): provider is ExistingProvider<T> {
  return "useExisting" in provider;
}
export function isTokenProvider<T = unknown>(
  provider: ContainerProvider<T>,
): provider is TokenProvider<T> {
  return "provide" in provider && "provider" in provider;
}
export function hasInjectedDependencies<T = unknown>(
  provider: Provider<T>,
): provider is (FactoryProvider<T> | ClassProvider<T>) & {
  readonly inject: readonly ProviderToken[];
} {
  return (
    (isFactoryProvider(provider) || isClassProvider(provider)) &&
    Array.isArray(provider.inject) &&
    provider.inject.length > 0
  );
}

/**
 * Builds a class provider. The constructor's parameters are checked against
 * the `inject` tokens, in order (see {@link InjectedConstructor}); with no
 * list the class must be constructible with no arguments.
 */
export function classProvider<
  T,
  const Deps extends readonly ProviderToken[] = readonly [],
>(
  useClass: InjectedConstructor<T, NoInfer<Deps>>,
  inject: Deps = [] as unknown as Deps,
): ClassProvider<T> {
  return Object.freeze({
    useClass: useClass as Constructor<T>,
    inject: Object.freeze([...inject]),
  });
}
/**
 * Builds a factory provider. The factory's parameters are inferred from the
 * `inject` tokens, in order.
 */
export function factoryProvider<
  T,
  const Deps extends readonly ProviderToken[] = readonly [],
>(
  useFactory: InjectedFactory<T, Deps>,
  inject: Deps = [] as unknown as Deps,
): FactoryProvider<T> {
  return Object.freeze({
    useFactory: useFactory as (...dependencies: unknown[]) => T,
    inject: Object.freeze([...inject]),
  });
}
export function valueProvider<T>(useValue: T): ValueProvider<T> {
  return Object.freeze({ useValue });
}
export function existingProvider<T>(
  useExisting: ProviderToken<T>,
): ExistingProvider<T> {
  return Object.freeze({ useExisting });
}

/**
 * Builds a class registration. The constructor's parameters are checked
 * against the `inject` tokens, in order (see {@link InjectedConstructor}).
 */
export function provideClass<
  T,
  const Deps extends readonly ProviderToken[] = readonly [],
>(
  provide: ProviderToken<T>,
  useClass: InjectedConstructor<T, NoInfer<Deps>>,
  inject: Deps = [] as unknown as Deps,
): ClassRegistration<T> {
  return Object.freeze({
    provide,
    useClass: useClass as Constructor<T>,
    inject: Object.freeze([...inject]),
  });
}
/**
 * Builds a factory registration. The factory's parameters are inferred from
 * the `inject` tokens, in order.
 */
export function provideFactory<
  T,
  const Deps extends readonly ProviderToken[] = readonly [],
>(
  provide: ProviderToken<T>,
  useFactory: InjectedFactory<T, Deps>,
  inject: Deps = [] as unknown as Deps,
): FactoryRegistration<T> {
  return Object.freeze({
    provide,
    useFactory: useFactory as (...dependencies: unknown[]) => T,
    inject: Object.freeze([...inject]),
  });
}
export function provideValue<T>(
  provide: ProviderToken<T>,
  useValue: T,
): ValueRegistration<T> {
  return Object.freeze({ provide, useValue });
}
export function provideExisting<T>(
  provide: ProviderToken<T>,
  useExisting: ProviderToken<T>,
): ExistingRegistration<T> {
  return Object.freeze({ provide, useExisting });
}

export function getProviderToken<T>(
  provider: ContainerProvider<T>,
): ProviderToken<T> | undefined {
  if (isTokenProvider(provider)) return provider.provide;
  return undefined;
}

export function normalizeProvider<T>(
  provider: ContainerProvider<T>,
): Provider<T> {
  if (isTokenProvider(provider)) return provider.provider;
  return provider;
}
