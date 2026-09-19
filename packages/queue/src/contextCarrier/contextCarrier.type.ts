/**
 * Context carrier contract.
 *
 * @module contextCarrier/contextCarrier.type
 */

/**
 * Captures one piece of ambient context when a job is added and restores it
 * while the job runs.
 *
 * AsyncLocalStorage does not follow a job from the request that enqueued it
 * into the poller or worker that runs it, so without a carrier every job runs
 * with no tenant, no correlation id and no trace. Keep the captured value
 * small and serializable (an id, not a live object): a broker-backed queue
 * has to store it with the job.
 *
 * @example
 * ```typescript
 * const tenantCarrier: QueueContextCarrier<string> = {
 *   key: "tenantId",
 *   capture: () => tenantStorage.get()?.tenant?.id,
 *   restore: (tenantId, run) =>
 *     tenantStorage.run(contextFor(tenantId), run),
 * };
 * createInMemoryQueue("emails", { contextCarriers: [tenantCarrier] });
 * ```
 */
export interface QueueContextCarrier<TValue = unknown> {
  /** Unique name under which the value is stored with the job. */
  readonly key: string;
  /**
   * Reads the value from the caller's context at `add()`. Returning
   * `undefined` stores nothing.
   */
  capture(): TValue | undefined;
  /**
   * Runs `run` inside the restored context. Called only for jobs that
   * carry a value for this carrier's `key`.
   */
  restore<T>(value: TValue, run: () => Promise<T>): Promise<T>;
}
