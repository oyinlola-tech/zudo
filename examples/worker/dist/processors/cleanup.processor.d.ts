/**
 * Cleanup processor.
 *
 * Handles the "cleanup" job type.
 * Demonstrates scheduled cleanup tasks.
 */
import type { Job } from "@zudojs/queue";
import type { JobContext } from "@zudojs/queue";
import type { CleanupJobData } from "../jobs/jobs.types.js";
export declare class CleanupProcessor {
    readonly name = "cleanup";
    process(job: Job<CleanupJobData>, _context: JobContext<CleanupJobData>): Promise<void>;
}
//# sourceMappingURL=cleanup.processor.d.ts.map