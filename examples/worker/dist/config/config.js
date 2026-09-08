/**
 * Worker application configuration.
 */
export function loadConfig() {
    return {
        nodeEnv: process.env.NODE_ENV ?? "development",
        concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
        jobTimeoutMs: Number(process.env.JOB_TIMEOUT_MS ?? 30_000),
    };
}
//# sourceMappingURL=config.js.map