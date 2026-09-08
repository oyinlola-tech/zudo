/**
 * Hook composition — merge multiple hook sets.
 *
 * @module hooks/hooks
 */

import type { TransactionHooks } from "../transactionTypes/transactionHooks.js";

/**
 * Merge multiple hook sets into one. Later hooks run after earlier ones.
 */
export function mergeHooks(
  ...hookSets: readonly TransactionHooks[]
): TransactionHooks {
  const merged: TransactionHooks = {};

  for (const hooks of hookSets) {
    if (hooks.beforeBegin) {
      const existing = merged.beforeBegin;
      merged.beforeBegin = existing
        ? async (ctx) => {
            await existing(ctx);
            await hooks.beforeBegin!(ctx);
          }
        : hooks.beforeBegin;
    }
    if (hooks.afterBegin) {
      const existing = merged.afterBegin;
      merged.afterBegin = existing
        ? async (ctx) => {
            await existing(ctx);
            await hooks.afterBegin!(ctx);
          }
        : hooks.afterBegin;
    }
    if (hooks.beforeCommit) {
      const existing = merged.beforeCommit;
      merged.beforeCommit = existing
        ? async (ctx) => {
            await existing(ctx);
            await hooks.beforeCommit!(ctx);
          }
        : hooks.beforeCommit;
    }
    if (hooks.afterCommit) {
      const existing = merged.afterCommit;
      merged.afterCommit = existing
        ? async (ctx) => {
            await existing(ctx);
            await hooks.afterCommit!(ctx);
          }
        : hooks.afterCommit;
    }
    if (hooks.beforeRollback) {
      const existing = merged.beforeRollback;
      merged.beforeRollback = existing
        ? async (ctx) => {
            await existing(ctx);
            await hooks.beforeRollback!(ctx);
          }
        : hooks.beforeRollback;
    }
    if (hooks.afterRollback) {
      const existing = merged.afterRollback;
      merged.afterRollback = existing
        ? async (ctx) => {
            await existing(ctx);
            await hooks.afterRollback!(ctx);
          }
        : hooks.afterRollback;
    }
    if (hooks.onError) {
      const existing = merged.onError;
      merged.onError = existing
        ? async (ctx) => {
            await existing(ctx);
            await hooks.onError!(ctx);
          }
        : hooks.onError;
    }
  }

  return merged;
}
