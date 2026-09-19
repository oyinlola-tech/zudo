import type { Token } from "./token.js";
import { DependencyResolutionError } from "../errors/exceptions.js";

/**
 * Rejects a "scoped" resolution that would outlive or escape its scope.
 *
 * - A scoped provider resolved (directly or transitively) while a
 *   singleton is being constructed would be captured by that singleton
 *   and served to every later scope: one request's user, tenant or
 *   transaction leaking into all the others. This is the captive
 *   dependency error mature DI containers raise.
 * - A scoped provider resolved with no active scope has nothing to be
 *   scoped to. It used to behave as transient, which hid the missing
 *   scope; it now fails like `@zudojs/container`'s ScopedResolutionError.
 *
 * @param token - The scoped token being resolved.
 * @param captor - The singleton currently under construction, if any.
 * @param scopeKey - The active scope key, if any.
 * @param chain - The current resolution chain, for the diagnostic.
 * @throws DependencyResolutionError when either rule is broken.
 */
export function assertScopedResolvable(
  token: Token<unknown>,
  captor: Token<unknown> | undefined,
  scopeKey: object | undefined,
  chain: readonly Token<unknown>[],
): void {
  if (captor !== undefined) {
    throw new DependencyResolutionError(
      `Captive dependency: singleton "${describe(captor)}" cannot depend on ` +
        `scoped "${describe(token)}". Register the consumer as "scoped" or ` +
        `"transient", or resolve the scoped dependency lazily per call.`,
      [...chain, token],
    );
  }

  if (scopeKey === undefined) {
    throw new DependencyResolutionError(
      `Scoped provider "${describe(token)}" was resolved outside any scope. ` +
        `Resolve it through container.createScope() or inside an execution ` +
        `context.`,
      [...chain, token],
    );
  }
}

function describe(token: Token<unknown>): string {
  if (typeof token === "function") return token.name || "anonymous class";
  if (typeof token === "symbol") return token.description ?? token.toString();
  return String(token);
}
