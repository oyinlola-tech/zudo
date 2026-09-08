/**
 * Dependency registration definitions for Zudojs.
 * A registration is the container's normalized description of a dependency.
 */

import {
  ContainerScope,
  DEFAULT_CONTAINER_SCOPE,
  resolveContainerScope,
} from "../containerScope/containerScope.type.js";
import type {
  ContainerProvider,
  ProviderToken,
} from "../containerProvider/containerProvider.core.js";
import {
  getProviderToken,
  normalizeProvider,
} from "../containerProvider/containerProvider.core.js";
import type {
  Constructor,
  InjectionToken,
  Token,
} from "../containerToken/containerToken.type.js";
import {
  describeToken,
  unwrapToken,
} from "../containerToken/containerToken.type.js";

export type RegistrationToken<T = unknown> = Token<T> | InjectionToken<T>;

/** The type a registration token resolves to (`unknown` for untyped tokens). */
export type ResolvedToken<T extends RegistrationToken> =
  T extends RegistrationToken<infer U> ? U : never;

/**
 * Maps a tuple of registration tokens to a tuple of their resolved types, so
 * `resolveMany([LOGGER, DB])` is typed `[Logger, Db]`.
 */
export type ResolvedTokens<Tokens extends readonly RegistrationToken[]> = {
  -readonly [K in keyof Tokens]: Tokens[K] extends RegistrationToken
    ? ResolvedToken<Tokens[K]>
    : never;
};

export interface RegistrationMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly module?: string;
  readonly exported?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ContainerRegistration<T = unknown> {
  readonly token: RegistrationToken<T>;
  readonly provider: ContainerProvider<T>;
  readonly scope: ContainerScope;
  readonly metadata: RegistrationMetadata;
  readonly createdAt: Date;
}

export interface CreateRegistrationOptions extends RegistrationMetadata {
  readonly scope?: ContainerScope;
}

export interface MutableRegistrationState<T = unknown> {
  readonly token: RegistrationToken<T>;
  readonly provider: ContainerProvider<T>;
  scope: ContainerScope;
  metadata: RegistrationMetadata;
  createdAt: Date;
}

export function createRegistration<T>(
  token: RegistrationToken<T>,
  provider: ContainerProvider<T>,
  options: CreateRegistrationOptions = {},
): ContainerRegistration<T> {
  const normalizedToken = unwrapToken(token);
  const normalizedProvider = normalizeProvider(provider);
  const registration: ContainerRegistration<T> = {
    token: normalizedToken,
    provider: normalizedProvider,
    scope: resolveContainerScope(options.scope),
    metadata: createRegistrationMetadata(options, normalizedToken),
    createdAt: new Date(),
  };
  return Object.freeze({
    ...registration,
    metadata: Object.freeze({
      ...registration.metadata,
      metadata: registration.metadata.metadata
        ? Object.freeze({ ...registration.metadata.metadata })
        : undefined,
    }),
  });
}

function createRegistrationMetadata<T>(
  options: CreateRegistrationOptions,
  token: Token<T>,
): RegistrationMetadata {
  return {
    name: options.name ?? describeToken(token),
    description: options.description,
    module: options.module,
    exported: options.exported,
    metadata: options.metadata
      ? Object.freeze({ ...options.metadata })
      : undefined,
  };
}

export function createMutableRegistrationState<T>(
  registration: ContainerRegistration<T>,
): MutableRegistrationState<T> {
  return {
    token: registration.token,
    provider: registration.provider,
    scope: registration.scope,
    metadata: registration.metadata,
    createdAt: registration.createdAt,
  };
}

export function freezeRegistration<T>(
  state: MutableRegistrationState<T>,
): ContainerRegistration<T> {
  return Object.freeze({
    token: state.token,
    provider: state.provider,
    scope: state.scope,
    metadata: Object.freeze({
      ...state.metadata,
      metadata: state.metadata.metadata
        ? Object.freeze({ ...state.metadata.metadata })
        : undefined,
    }),
    createdAt: state.createdAt,
  });
}

export function getRegistrationToken<T>(
  registration: ContainerRegistration<T>,
): Token<T> {
  return unwrapToken(registration.token);
}

export function getRegistrationProviderToken<T>(
  registration: ContainerRegistration<T>,
): ProviderToken<T> | undefined {
  return getProviderToken(registration.provider);
}

export function isSingletonRegistration<T>(
  registration: ContainerRegistration<T>,
): boolean {
  return registration.scope === ContainerScope.SINGLETON;
}

export function isScopedRegistration<T>(
  registration: ContainerRegistration<T>,
): boolean {
  return registration.scope === ContainerScope.SCOPED;
}

export function isTransientRegistration<T>(
  registration: ContainerRegistration<T>,
): boolean {
  return registration.scope === ContainerScope.TRANSIENT;
}

export function shouldCacheRegistration<T>(
  registration: ContainerRegistration<T>,
): boolean {
  return (
    registration.scope === ContainerScope.SINGLETON ||
    registration.scope === ContainerScope.SCOPED
  );
}

export function describeRegistration<T>(
  registration: ContainerRegistration<T>,
): string {
  const name = registration.metadata.name ?? describeToken(registration.token);
  return `${name} [${registration.scope}]`;
}

export function withRegistrationScope<T>(
  registration: ContainerRegistration<T>,
  scope: ContainerScope,
): ContainerRegistration<T> {
  return Object.freeze({
    ...registration,
    scope: resolveContainerScope(scope),
  });
}

export function withRegistrationMetadata<T>(
  registration: ContainerRegistration<T>,
  metadata: RegistrationMetadata,
): ContainerRegistration<T> {
  return Object.freeze({
    ...registration,
    metadata: Object.freeze({
      ...registration.metadata,
      ...metadata,
      metadata: {
        ...(registration.metadata.metadata ?? {}),
        ...(metadata.metadata ?? {}),
      },
    }),
  });
}

export function assertValidRegistrationToken<T>(
  token: RegistrationToken<T>,
): void {
  const normalized = unwrapToken(token);
  if (
    typeof normalized !== "string" &&
    typeof normalized !== "symbol" &&
    typeof normalized !== "function"
  ) {
    throw new TypeError("Container registration requires a valid token.");
  }
}

export function assertValidProvider<T>(provider: ContainerProvider<T>): void {
  if (provider === null || typeof provider !== "object") {
    throw new TypeError("Container registration requires a valid provider.");
  }
}

export function defineRegistration<T>(
  token: RegistrationToken<T>,
  provider: ContainerProvider<T>,
  options: CreateRegistrationOptions = {},
): ContainerRegistration<T> {
  assertValidRegistrationToken(token);
  assertValidProvider(provider);
  return createRegistration(token, provider, options);
}

export const DEFAULT_REGISTRATION_SCOPE: ContainerScope =
  DEFAULT_CONTAINER_SCOPE;

export type RegistrationMap = ReadonlyMap<
  Token<unknown>,
  ContainerRegistration<unknown>
>;

export function createRegistrationMap(
  registrations: readonly ContainerRegistration[],
): RegistrationMap {
  const map = new Map<Token<unknown>, ContainerRegistration<unknown>>();
  for (const reg of registrations) map.set(unwrapToken(reg.token), reg);
  return map;
}
