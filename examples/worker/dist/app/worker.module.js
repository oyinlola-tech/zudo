/**
 * Worker module.
 *
 * Composes processors and manages the worker lifecycle.
 */
import { createInMemoryQueue, createWorker } from "@zudojs/queue";
import { createQueueName } from "@zudojs/queue";
import { EmailProcessor } from "../processors/email.processor.js";
import { ReportProcessor } from "../processors/report.processor.js";
import { CleanupProcessor } from "../processors/cleanup.processor.js";
export class WorkerModule {
    id = "worker";
    name = "Worker Module";
    version = "0.1.0";
    emailQueue;
    reportQueue;
    cleanupQueue;
    emailWorker;
    reportWorker;
    cleanupWorker;
    options;
    constructor(options = {}) {
        this.options = options;
    }
    async initialize() {
        const concurrency = this.options.concurrency ?? 1;
        const jobTimeoutMs = this.options.jobTimeoutMs ?? 30_000;
        // Create queues
        this.emailQueue = createInMemoryQueue(createQueueName("emails"), {
            concurrency,
        });
        this.reportQueue = createInMemoryQueue(createQueueName("reports"), {
            concurrency,
        });
        this.cleanupQueue = createInMemoryQueue(createQueueName("cleanup"), {
            concurrency: 1,
        });
        // Register processors
        const emailProcessor = new EmailProcessor();
        const reportProcessor = new ReportProcessor();
        const cleanupProcessor = new CleanupProcessor();
        this.emailQueue.process(emailProcessor.name, emailProcessor.process.bind(emailProcessor));
        this.reportQueue.process(reportProcessor.name, reportProcessor.process.bind(reportProcessor));
        this.cleanupQueue.process(cleanupProcessor.name, cleanupProcessor.process.bind(cleanupProcessor));
        // Create workers
        this.emailWorker = createWorker("email-worker", this.emailQueue, {
            concurrency,
            timeoutMs: jobTimeoutMs,
        });
        this.reportWorker = createWorker("report-worker", this.reportQueue, {
            concurrency,
            timeoutMs: jobTimeoutMs,
        });
        this.cleanupWorker = createWorker("cleanup-worker", this.cleanupQueue, {
            concurrency: 1,
            timeoutMs: jobTimeoutMs,
        });
    }
    async start() {
        console.log("[WorkerModule] Starting workers...");
        await Promise.all([
            this.emailWorker?.start(),
            this.reportWorker?.start(),
            this.cleanupWorker?.start(),
        ]);
        console.log("[WorkerModule] All workers started");
    }
    async stop() {
        console.log("[WorkerModule] Stopping workers...");
        await Promise.all([
            this.emailWorker?.stop(),
            this.reportWorker?.stop(),
            this.cleanupWorker?.stop(),
        ]);
        console.log("[WorkerModule] All workers stopped");
    }
    getEmailQueue() {
        if (!this.emailQueue) {
            throw new Error("WorkerModule has not been initialized.");
        }
        return this.emailQueue;
    }
    getReportQueue() {
        if (!this.reportQueue) {
            throw new Error("WorkerModule has not been initialized.");
        }
        return this.reportQueue;
    }
    getCleanupQueue() {
        if (!this.cleanupQueue) {
            throw new Error("WorkerModule has not been initialized.");
        }
        return this.cleanupQueue;
    }
}
//# sourceMappingURL=worker.module.js.map