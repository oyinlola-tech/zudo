/**
 * @zudojs/queue/contextCarrier
 *
 * Carries ambient execution context (tenant, correlation id, trace ids)
 * across the queue boundary: captured into job metadata at `add()` and
 * restored around the processor, so a background job runs in the context of
 * the request that enqueued it.
 */

export type { QueueContextCarrier } from "./contextCarrier.type.js";
export {
  CONTEXT_METADATA_KEY,
  captureContext,
  runWithContext,
} from "./contextCarrier.core.js";
