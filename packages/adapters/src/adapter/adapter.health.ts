/**
 * @zudojs/adapters/adapter
 *
 * Health aggregation and configuration for registered adapters.
 *
 * `LifecycleAdapter.health()` and `configure()` were part of the contract
 * with nothing in the package that called them. `AdapterRegistry.healthAll()`
 * and `AdapterRegistry.configure()` delegate here.
 */

import { AdapterConfigurationError } from "@zudojs/errors";

import type { Adapter } from "./adapter.type.js";
import { withRetry } from "./adapter.retry.js";
import type {
  AdapterHealth,
  AdapterHealthStatus,
  AdapterOperationOptions,
  LifecycleAdapter,
} from "../lifecycle/lifecycle.type.js";

/** Aggregated health of every adapter that implements `health()`. */
export interface AdapterHealthReport {
  /** The worst status across `adapters`; `"healthy"` when none report. */
  readonly status: AdapterHealthStatus;
  /** Per-adapter health, keyed by normalized adapter name. */
  readonly adapters: Readonly<Record<string, AdapterHealth>>;
}

const RANK: Readonly<Record<AdapterHealthStatus, number>> = {
  healthy: 0,
  degraded: 1,
  unhealthy: 2,
};

function unhealthy(message: string): AdapterHealth {
  return { status: "unhealthy", message, timestamp: Date.now() };
}

/**
 * Runs one health check, bounded by `timeout` and `signal`, retried according
 * to `retry`.
 */
async function checkOne(
  adapter: LifecycleAdapter,
  options: AdapterOperationOptions,
): Promise<AdapterHealth> {
  return attemptCheck(adapter, options);
}

/** Runs a single health-check attempt, bounded by `timeout` and `signal`. */
async function attemptCheck(
  adapter: LifecycleAdapter,
  options: AdapterOperationOptions,
): Promise<AdapterHealth> {
  if (options.signal?.aborted) return unhealthy("Health check aborted.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const guards: Promise<AdapterHealth>[] = [];
  if (options.timeout !== undefined) {
    guards.push(
      new Promise((resolve) => {
        timer = setTimeout(
          () =>
            resolve(
              unhealthy(`Health check timed out after ${options.timeout} ms.`),
            ),
          options.timeout,
        );
      }),
    );
  }
  if (options.signal) {
    const signal = options.signal;
    guards.push(
      new Promise((resolve) => {
        onAbort = () => resolve(unhealthy("Health check aborted."));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    );
  }
  try {
    const check = Promise.resolve()
      .then(() => adapter.health?.() as Promise<AdapterHealth> | AdapterHealth)
      .catch((error: unknown) =>
        unhealthy(error instanceof Error ? error.message : String(error)),
      );
    return await Promise.race([check, ...guards]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Collects health from every adapter that implements `health()`. A check that
 * throws, rejects, times out or is aborted is reported as `"unhealthy"`
 * instead of failing the whole report.
 */
export async function collectAdapterHealth(
  entries: ReadonlyArray<readonly [string, Adapter]>,
  options: AdapterOperationOptions = {},
): Promise<AdapterHealthReport> {
  // `Object.create(null)`, not `{}`: assigning `adapters["__proto__"]` on an
  // ordinary object runs the inherited prototype setter, so the entry would
  // vanish from the report and an unhealthy adapter would be invisible.
  const adapters: Record<string, AdapterHealth> = {};
  await Promise.all(
    entries
      .filter(
        ([, adapter]) =>
          typeof (adapter as LifecycleAdapter).health === "function",
      )
      .map(async ([name, adapter]) => {
        adapters[name] = await checkOne(adapter as LifecycleAdapter, options);
      }),
  );
  let status: AdapterHealthStatus = "healthy";
  for (const health of Object.values(adapters)) {
    const rank = RANK[health.status] ?? RANK.unhealthy;
    if (rank > RANK[status])
      status = rank === RANK.unhealthy ? "unhealthy" : health.status;
  }
  return Object.freeze({ status, adapters: Object.freeze(adapters) });
}

/**
 * Passes options to an adapter's `configure()` hook.
 *
 * @throws {AdapterConfigurationError} If the adapter has no `configure()` hook.
 */
export async function configureAdapter(
  name: string,
  adapter: Adapter,
  options: unknown,
): Promise<void> {
  const configurable = adapter as LifecycleAdapter;
  if (typeof configurable.configure !== "function") {
    throw new AdapterConfigurationError(
      name,
      new Error(`Adapter "${name}" does not implement configure().`),
    );
  }
  await configurable.configure(options);
}
