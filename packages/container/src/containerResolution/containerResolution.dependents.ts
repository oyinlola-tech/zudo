/**
 * Reverse dependency index for cached container instances.
 *
 * `replace()`/`remove()` used to evict only the changed token, so a
 * singleton that had already captured it kept serving the old — by then
 * disposed — instance. Recording which cached instance consumed which
 * token lets eviction cascade to every consumer.
 */

import { ContainerScope as Scope } from "../containerScope/containerScope.type.js";
import type { Token } from "../containerToken/containerToken.type.js";

/** Looks up the lifetime of a registered token. */
export type LifetimeLookup = (token: Token<unknown>) => Scope | undefined;

/**
 * Maps a token to the cached (SINGLETON or SCOPED) instances whose
 * construction resolved it.
 */
export class DependentIndex {
  readonly #dependents = new Map<Token<unknown>, Set<Token<unknown>>>();

  /**
   * Records that the nearest cached ancestor on `path` depends on
   * `token`. Transient ancestors are skipped: they are rebuilt on every
   * resolution, so the cached instance above them is the real consumer.
   */
  record(
    token: Token<unknown>,
    path: readonly Token<unknown>[],
    lifetimeOf: LifetimeLookup,
  ): void {
    for (let i = path.length - 1; i >= 0; i--) {
      const owner = path[i]!;
      const lifetime = lifetimeOf(owner);
      if (lifetime === Scope.SINGLETON || lifetime === Scope.SCOPED) {
        if (owner === token) return;
        let set = this.#dependents.get(token);
        if (set === undefined) {
          set = new Set();
          this.#dependents.set(token, set);
        }
        set.add(owner);
        return;
      }
    }
  }

  /**
   * Returns every token that transitively depends on `token`, nearest
   * consumers last, and forgets them.
   */
  take(token: Token<unknown>): readonly Token<unknown>[] {
    const ordered: Token<unknown>[] = [];
    const visited = new Set<Token<unknown>>([token]);
    const visit = (current: Token<unknown>): void => {
      const direct = this.#dependents.get(current);
      this.#dependents.delete(current);
      if (direct === undefined) return;
      for (const dependent of direct) {
        if (visited.has(dependent)) continue;
        visited.add(dependent);
        visit(dependent);
        ordered.push(dependent);
      }
    };
    visit(token);
    return ordered;
  }

  /** Forgets every recorded dependency. */
  clear(): void {
    this.#dependents.clear();
  }
}
