/**
 * Worker application configuration.
 */
export interface WorkerConfig {
    readonly nodeEnv: string;
    readonly concurrency: number;
    readonly jobTimeoutMs: number;
}
export declare function loadConfig(): WorkerConfig;
//# sourceMappingURL=config.d.ts.map