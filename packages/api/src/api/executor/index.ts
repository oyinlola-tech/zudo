/**
 * @zudojs/api/executor
 *
 * Runs an operation through its interceptor pipeline: interceptors first,
 * then input validation, the handler under its deadline and abort signal,
 * and output validation.
 */

export { APIExecutor } from "./executor.core.js";

export { normalizeAPIError } from "./executor.normalize.js";

export type { APIExecutorOptions } from "./executor.type.js";
