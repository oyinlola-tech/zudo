export interface ServiceConfig {
  readonly name: string;
  readonly version: string;
  readonly port: number;
  readonly host: string;
}

export const serviceConfig: ServiceConfig = {
  name: "assessment-service",
  version: "0.1.0",
  port: Number(process.env["ASSESSMENT_PORT"] ?? 3003),
  host: process.env["ASSESSMENT_HOST"] ?? "0.0.0.0",
};
