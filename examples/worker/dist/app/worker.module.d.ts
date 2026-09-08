/**
 * Worker module.
 *
 * Composes processors and manages the worker lifecycle.
 */
import type { Queue } from "@zudojs/queue";
import type { SendEmailJobData, GenerateReportJobData, CleanupJobData } from "../jobs/jobs.types.js";
export interface WorkerModuleOptions {
    readonly concurrency?: number;
    readonly jobTimeoutMs?: number;
}
export declare class WorkerModule {
    readonly id = "worker";
    readonly name = "Worker Module";
    readonly version = "0.1.0";
    private emailQueue;
    private reportQueue;
    private cleanupQueue;
    private emailWorker;
    private reportWorker;
    private cleanupWorker;
    private readonly options;
    constructor(options?: WorkerModuleOptions);
    initialize(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    getEmailQueue(): Queue<SendEmailJobData>;
    getReportQueue(): Queue<GenerateReportJobData>;
    getCleanupQueue(): Queue<CleanupJobData>;
}
//# sourceMappingURL=worker.module.d.ts.map