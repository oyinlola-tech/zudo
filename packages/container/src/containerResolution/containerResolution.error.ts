/**
 * @zudojs/container/containerResolution/containerResolution.error
 *
 * Resolution error classes local to this package. They extend the published
 * `ContainerError` base from @zudojs/errors; the published package does not
 * yet ship dedicated classes for these failure modes.
 */

import { ContainerError, ProviderResolutionError } from "@zudojs/errors";

function formatChain(chain: readonly string[]): string {
  return chain.join(" -> ");
}

/**
 * Thrown when a SCOPED registration is resolved without a scope
 * (i.e. directly from the root container).
 */
export class ScopedResolutionError extends ContainerError {
  readonly chain: readonly string[];

  constructor(token: string, chain: readonly string[] = []) {
    const suffix = chain.length > 1 ? ` (chain: ${formatChain(chain)})` : "";
    super(
      `Scoped token ${token} cannot be resolved outside a scope. ` +
        `Create one with container.createScope() and resolve through it.${suffix}`,
      {
        code: "CONTAINER_SCOPED_OUTSIDE_SCOPE",
        token,
        statusCode: 500,
        expose: false,
      },
    );
    this.chain = chain;
  }
}

/**
 * Thrown when a longer-lived consumer (a SINGLETON) would capture a
 * shorter-lived SCOPED dependency, freezing it beyond its scope's lifetime.
 */
export class CaptiveDependencyError extends ContainerError {
  readonly consumer: string;
  readonly dependency: string;
  readonly chain: readonly string[];

  constructor(
    consumer: string,
    dependency: string,
    chain: readonly string[] = [],
  ) {
    const suffix = chain.length > 1 ? ` (chain: ${formatChain(chain)})` : "";
    super(
      `Captive dependency: singleton "${consumer}" depends on scoped "${dependency}". ` +
        `A longer-lived consumer cannot capture a shorter-lived dependency.${suffix}`,
      {
        code: "CONTAINER_CAPTIVE_DEPENDENCY",
        token: dependency,
        statusCode: 500,
        expose: false,
      },
    );
    this.consumer = consumer;
    this.dependency = dependency;
    this.chain = chain;
  }
}

/**
 * Thrown when a resolution chain exceeds `maxResolutionDepth`.
 */
export class MaxResolutionDepthError extends ContainerError {
  readonly depth: number;
  readonly maxDepth: number;
  readonly chain: readonly string[];

  constructor(
    token: string,
    depth: number,
    maxDepth: number,
    chain: readonly string[] = [],
  ) {
    super(
      `Maximum resolution depth of ${maxDepth} exceeded while resolving ` +
        `token ${token} at depth ${depth}.`,
      {
        code: "CONTAINER_MAX_RESOLUTION_DEPTH",
        token,
        statusCode: 500,
        expose: false,
      },
    );
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.chain = chain;
  }
}

/**
 * Thrown when a provider fails while resolving a token. Extends the published
 * `ProviderResolutionError` with the resolution chain that led to the failing
 * token (outermost request first) so callers can inspect it programmatically
 * instead of parsing the message.
 */
export class DependencyResolutionError extends ProviderResolutionError {
  readonly chain: readonly string[];

  constructor(token: string, cause: unknown, chain: readonly string[] = []) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const suffix = chain.length > 0 ? ` (chain: ${formatChain(chain)})` : "";
    super(token, `Failed to resolve ${token}: ${detail}${suffix}`, cause);
    this.chain = Object.freeze([...chain]);
  }

  override toJSON() {
    return { ...super.toJSON(), chain: this.chain };
  }
}

/**
 * Thrown when a factory registered as SINGLETON or SCOPED returns a Promise.
 *
 * The container is synchronous: it would otherwise cache the Promise itself
 * as the instance and the eventual value would never be disposal-tracked.
 * Await the resource before registering it (e.g. `registerValue`), or use a
 * TRANSIENT registration whose callers await the result themselves.
 */
export class AsyncProviderError extends ContainerError {
  readonly scope: string;

  constructor(token: string, scope: string) {
    super(
      `Factory for ${scope} token ${token} returned a Promise. Async factories ` +
        `are not supported for cached (singleton/scoped) registrations: ` +
        `await the value before registering it, or register it as TRANSIENT.`,
      {
        code: "CONTAINER_ASYNC_PROVIDER_UNSUPPORTED",
        token,
        statusCode: 500,
        expose: false,
      },
    );
    this.scope = scope;
  }
}
