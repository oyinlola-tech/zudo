/**
 * Email processor.
 *
 * Handles the "send-email" job type.
 * In a real application, this would integrate with an email service.
 */
import type { Job } from "@zudojs/queue";
import type { JobContext } from "@zudojs/queue";
import type { SendEmailJobData } from "../jobs/jobs.types.js";
export declare class EmailProcessor {
    readonly name = "send-email";
    process(job: Job<SendEmailJobData>, _context: JobContext<SendEmailJobData>): Promise<void>;
}
//# sourceMappingURL=email.processor.d.ts.map