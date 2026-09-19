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
 * Captures every carrier's value into a metadata record.
 *
 * @param carriers - The queue's context carriers.
 * @param metadata - The job's own metadata, if any.
 * @returns The metadata with a {@link CONTEXT_METADATA_KEY} entry added, or
 *   the input unchanged when no carrier captured anything.
 */
export function captureContext(
  carriers: readonly QueueContextCarrier[] | undefined,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!carriers || carriers.length === 0) return metadata;

  const captured: Record<string, unknown> = {};
  let any = false;
  for (const carrier of carriers) {
    const value = carrier.capture();
    if (value === undefined) continue;
    captured[carrier.key] = value;
    any = true;
  }

  if (!any) return metadata;
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
