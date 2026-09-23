/**
 * Queue binding: consumes `@zudojs/queue` jobs by running the operation
 * named by the job, with the job payload as input.
 */

export type { APIQueueBindingOptions, APIQueueTarget } from "./apiQueue.binding.js";

export { bindApiQueue, createApiQueueProcessor } from "./apiQueue.binding.js";
