import type { ServiceConfig } from "../interfaces/index.js";

const identityUrl =
  process.env["IDENTITY_SERVICE_URL"] ?? "http://localhost:3001";
const enrollmentUrl =
  process.env["ENROLLMENT_SERVICE_URL"] ?? "http://localhost:3002";
const assessmentUrl =
  process.env["ASSESSMENT_SERVICE_URL"] ?? "http://localhost:3003";
const notificationUrl =
  process.env["NOTIFICATION_SERVICE_URL"] ?? "http://localhost:3004";

export interface ServiceConfigs {
  readonly identity: ServiceConfig;
  readonly enrollment: ServiceConfig;
  readonly assessment: ServiceConfig;
  readonly notification: ServiceConfig;
}

export const serviceConfigs: ServiceConfigs = {
  identity: Object.freeze({
    name: "identity",
    url: identityUrl,
    timeout: 10_000,
  }),
  enrollment: Object.freeze({
    name: "enrollment",
    url: enrollmentUrl,
    timeout: 10_000,
  }),
  assessment: Object.freeze({
    name: "assessment",
    url: assessmentUrl,
    timeout: 10_000,
  }),
  notification: Object.freeze({
    name: "notification",
    url: notificationUrl,
    timeout: 10_000,
  }),
};
