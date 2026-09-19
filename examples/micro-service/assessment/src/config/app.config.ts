export interface AssessmentConfig {
  readonly port: number;
  readonly host: string;
  readonly serviceName: string;
  readonly databasePath: string;
}

export const assessmentConfig: AssessmentConfig = {
  port: Number(process.env["ASSESSMENT_PORT"] ?? 3003),
  host: process.env["ASSESSMENT_HOST"] ?? "0.0.0.0",
  serviceName: "assessment-service",
  databasePath: process.env["ASSESSMENT_DB_PATH"] ?? "./data/assessment.db",
};
