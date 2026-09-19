export interface DatabaseConfig {
  readonly path: string;
  readonly verbose: boolean;
}

export const databaseConfig: DatabaseConfig = {
  path: process.env["ASSESSMENT_DB_PATH"] ?? "./data/assessment.db",
  verbose: process.env["DB_VERBOSE"] === "true",
};
