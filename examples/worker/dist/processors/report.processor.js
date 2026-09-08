/**
 * Report processor.
 *
 * Handles the "generate-report" job type.
 * Demonstrates retry behavior with simulated failures.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class ReportProcessor {
    name = "generate-report";
    attemptCount = 0;
    async process(job, _context) {
        const { userId, reportType, dateRange } = job.data;
        this.attemptCount++;
        console.log(`[ReportProcessor] Generating ${reportType} report for user ${userId}`);
        console.log(`  Date range: ${dateRange.start} to ${dateRange.end}`);
        console.log(`  Attempt: ${job.attempt}/${job.maxAttempts}`);
        // Simulate processing time
        await sleep(200);
        // Simulate occasional failure for retry demonstration
        if (this.attemptCount % 3 === 0) {
            console.log(`[ReportProcessor] Simulated failure on attempt ${this.attemptCount}`);
            throw new Error("External service temporarily unavailable");
        }
        console.log(`[ReportProcessor] Report generated successfully for user ${userId}`);
    }
}
//# sourceMappingURL=report.processor.js.map