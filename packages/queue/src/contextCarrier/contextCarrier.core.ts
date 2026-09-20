/**
 * Context capture at `add()` and restoration around processing.
 *
 * @module contextCarrier/contextCarrier.core
 */

import type { Job } from "../job/job.type.js";
import type { QueueContextCarrier } from "./contextCarrier.type.js";

/**
 * Job metadata key under which captured context values are stored, as a
 * `{ [carrier.key]: value }` record.
 */
export const CONTEXT_METADATA_KEY = "zudo:context";

/**
 * Strips the reserved context key from caller-supplied metadata.
 *
 * The key is owned by the queue on every path: whatever the enqueuer put
 * there is dropped, so `add()` metadata can never supply a context record of
 * its own. Returns the input untouched when there is nothing to strip, so the
 * common case still allocates nothing.
 */
function withoutStoredContext(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata || !Object.hasOwn(metadata, CONTEXT_METADATA_KEY)) {
    return metadata;
  }
  const { [CONTEXT_METADATA_KEY]: _discarded, ...rest } = metadata;
  return rest;
}

/**
 * Captures every carrier's value into a metadata record.
 *
 * {@link CONTEXT_METADATA_KEY} is owned by the queue: a value the caller put
 * under that key is always discarded, whether or not a carrier captured
 * anything, so an enqueuer cannot forge the tenant, correlation id or trace
 * the processor runs under.
 *
 * @param carriers - The queue's context carriers.
 * @param metadata - The job's own metadata, if any.
 * @returns The metadata with a {@link CONTEXT_METADATA_KEY} entry added, or
 *   without one when no carrier captured anything.
 */
export function captureContext(
  carriers: readonly QueueContextCarrier[] | undefined,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!carriers || carriers.length === 0) return withoutStoredContext(metadata);

  const captured: Record<string, unknown> = {};
  let any = false;
  for (const carrier of carriers) {
    const value = carrier.capture();
    if (value === undefined) continue;
    captured[carrier.key] = value;
    any = true;
  }

  if (!any) return withoutStoredContext(metadata);
  return { ...metadata, [CONTEXT_METADATA_KEY]: Object.freeze(captured) };
}

/**
 * Runs `fn` inside every context the job carries, first carrier outermost.
 *
 * @param carriers - The queue's context carriers.
 * @param job - The job about to run.
 * @param fn - The work to run inside the restored context.
 * @returns Whatever `fn` resolves to.
 */
export function runWithContext<T>(
  carriers: readonly QueueContextCarrier[] | undefined,
  job: Job<unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const raw = job.metadata?.[CONTEXT_METADATA_KEY];
  if (!carriers || carriers.length === 0) return fn();
  if (typeof raw !== "object" || raw === null) return fn();
  const stored = raw as Record<string, unknown>;

  let run = fn;
  for (let i = carriers.length - 1; i >= 0; i--) {
    const carrier = carriers[i]!;
    if (!Object.hasOwn(stored, carrier.key)) continue;
    const inner = run;
    run = () => carrier.restore(stored[carrier.key], inner);
  }
  return run();
}
