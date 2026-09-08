/**
 * @zudojs/observability — Processors
 *
 * Batching and simple processors for spans, and a batching log transport.
 */

export {
  BatchSpanProcessor,
  createBatchSpanProcessor,
  SimpleSpanProcessor,
  createSimpleSpanProcessor,
  noopSpanExporter,
  type BatchSpanProcessorOptions,
} from "./processor.batch.js";

export {
  BatchLogProcessor,
  createBatchLogProcessor,
  type BatchLogProcessorOptions,
} from "./processor.log.js";
