/**
 * Processor interface and registry.
 *
 * Provides the core Processor type and a registry for
 * managing job processors.
 */
export { createProcessorRegistry } from "./processor.core.js";

export { assertProcessor, isProcessor } from "./processor.type.js";

export type {
  Processor,
  ProcessorInfo,
  ProcessorRegistry,
} from "./processor.type.js";
