/**
 * Worker Example — Entry Point
 *
 * A background worker application built with Zudojs.
 *
 * This example demonstrates:
 * - Background job processing with queues
 * - Multiple job types (email, report, cleanup)
 * - Job retry with exponential backoff
 * - Worker lifecycle management
 * - Graceful shutdown
 */
import { loadConfig } from "./config/config.js";
import { WorkerModule } from "./app/worker.module.js";
import { BackoffType } from "@zudojs/queue";
const config = loadConfig();
async function bootstrap() {
    console.log("Starting worker application...");
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Concurrency: ${config.concurrency}`);
    const workerModule = new WorkerModule({
        concurrency: config.concurrency,
        jobTimeoutMs: config.jobTimeoutMs,
    });
    await workerModule.initialize();
    await workerModule.start();
    // Add some example jobs
    const emailQueue = workerModule.getEmailQueue();
    const reportQueue = workerModule.getReportQueue();
    const cleanupQueue = workerModule.getCleanupQueue();
    // Queue email jobs
    await emailQueue.add("send-email", {
        to: "user@example.com",
        subject: "Welcome to Zudojs",
        body: "Hello! Welcome to the Zudojs framework.",
    });
    await emailQueue.add("send-email", {
        to: "admin@example.com",
        subject: "Worker Started",
        body: "The background worker has started processing jobs.",
    });
    // Queue report job with retry configuration
    await reportQueue.add("generate-report", {
        userId: "user-123",
        reportType: "sales",
        dateRange: {
            start: "2026-01-01",
            end: "2026-08-31",
        },
    }, {
        attempts: 3,
        backoff: {
            type: BackoffType.EXPONENTIAL,
            delay: 1000,
            maxDelay: 10_000,
        },
    });
    // Queue cleanup job
    await cleanupQueue.add("cleanup", {
        olderThanDays: 30,
        dryRun: false,
    });
    console.log("Jobs queued. Worker is processing...");
    // Wait for jobs to process
    await sleep(2000);
    // Print stats
    const emailStats = await emailQueue.getStats();
    const reportStats = await reportQueue.getStats();
    const cleanupStats = await cleanupQueue.getStats();
    console.log("\n--- Queue Statistics ---");
    console.log(`Emails:   ${emailStats.completed} completed, ${emailStats.failed} failed`);
    console.log(`Reports:  ${reportStats.completed} completed, ${reportStats.failed} failed`);
    console.log(`Cleanup:  ${cleanupStats.completed} completed, ${cleanupStats.failed} failed`);
    // Graceful shutdown
    console.log("\nShutting down...");
    await workerModule.stop();
    console.log("Worker stopped.");
    process.exit(0);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// Handle process signals for graceful shutdown
process.on("SIGINT", () => {
    console.log("\nReceived SIGINT. Shutting down...");
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM. Shutting down...");
    process.exit(0);
});
bootstrap().catch((error) => {
    console.error("Failed to start worker:", error);
    process.exit(1);
});
//# sourceMappingURL=main.js.map