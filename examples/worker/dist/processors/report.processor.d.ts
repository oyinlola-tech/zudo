/**
 * Report processor.
 *
 * Handles the "generate-report" job type.
 * Demonstrates retry behavior with simulated failures.
 */
import type { Job } from "@zudojs/queue";
import type { JobContext } from "@zudojs/queue";
import type { GenerateReportJobData } from "../jobs/jobs.types.js";
export declare class ReportProcessor {
    readonly name = "generate-report";
    private attemptCount;
    process(job: Job<GenerateReportJobData>, _context: JobContext<GenerateReportJobData>): Promise<void>;
}
//# sourceMappingURL=report.processor.d.ts.map