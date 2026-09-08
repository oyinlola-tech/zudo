/**
 * Cleanup processor.
 *
 * Handles the "cleanup" job type.
 * Demonstrates scheduled cleanup tasks.
 */
export class CleanupProcessor {
    name = "cleanup";
    async process(job, _context) {
        const { olderThanDays, dryRun } = job.data;
        console.log(`[CleanupProcessor] Cleaning up data older than ${olderThanDays} days`);
        console.log(`  Dry run: ${dryRun ?? false}`);
        // Simulate cleanup work
        await sleep(150);
        const recordsCleaned = Math.floor(Math.random() * 100);
        if (dryRun) {
            console.log(`[CleanupProcessor] Dry run: would have cleaned ${recordsCleaned} records`);
        }
        else {
            console.log(`[CleanupProcessor] Cleaned ${recordsCleaned} records`);
        }
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=cleanup.processor.js.map