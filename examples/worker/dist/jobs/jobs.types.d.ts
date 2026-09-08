/**
 * Job type definitions.
 *
 * Jobs contain data, not business logic.
 * Processors handle the actual work.
 */
export interface SendEmailJobData {
    readonly to: string;
    readonly subject: string;
    readonly body: string;
    readonly from?: string;
}
export interface GenerateReportJobData {
    readonly userId: string;
    readonly reportType: "sales" | "activity" | "summary";
    readonly dateRange: {
        readonly start: string;
        readonly end: string;
    };
}
export interface CleanupJobData {
    readonly olderThanDays: number;
    readonly dryRun?: boolean;
}
//# sourceMappingURL=jobs.types.d.ts.map