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

export function classProvider<T>(
  useClass: Constructor<T>,
  inject: readonly ProviderToken[] = [],
): ClassProvider<T> {
  return Object.freeze({ useClass, inject: Object.freeze([...inject]) });
}
export function factoryProvider<T>(
  useFactory: (...dependencies: unknown[]) => T,
  inject: readonly ProviderToken[] = [],
): FactoryProvider<T> {
  return Object.freeze({ useFactory, inject: Object.freeze([...inject]) });
}
export function valueProvider<T>(useValue: T): ValueProvider<T> {
  return Object.freeze({ useValue });
}
export function existingProvider<T>(
  useExisting: ProviderToken<T>,
): ExistingProvider<T> {
  return Object.freeze({ useExisting });
}

export function provideClass<T>(
  provide: ProviderToken<T>,
  useClass: Constructor<T>,
  inject: readonly ProviderToken[] = [],
): ClassRegistration<T> {
  return Object.freeze({
    provide,
    useClass,
    inject: Object.freeze([...inject]),
  });
}
export function provideFactory<T>(
  provide: ProviderToken<T>,
  useFactory: (...dependencies: unknown[]) => T,
  inject: readonly ProviderToken[] = [],
): FactoryRegistration<T> {
  return Object.freeze({
    provide,
    useFactory,
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
