import type { GatewayConfig } from "../interfaces/index.js";

/** Reads JWT_SECRET and refuses to start without a strong one. */
function requireJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be set to at least 32 characters (generate one with `openssl rand -hex 32`).",
    );
  }
  return secret;
}

export function createGatewayConfig(): GatewayConfig {
  return {
    port: parseInt(process.env["GATEWAY_PORT"] ?? "3000", 10),
    host: process.env["GATEWAY_HOST"] ?? "localhost",
    jwtSecret: requireJwtSecret(),
    corsOrigin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
    services: {
      identity: {
        name: "identity",
        url: process.env["IDENTITY_SERVICE_URL"] ?? "http://localhost:3001",
        timeout: 10_000,
      },
      enrollment: {
        name: "enrollment",
        url: process.env["ENROLLMENT_SERVICE_URL"] ?? "http://localhost:3002",
        timeout: 10_000,
      },
      assessment: {
        name: "assessment",
        url: process.env["ASSESSMENT_SERVICE_URL"] ?? "http://localhost:3003",
        timeout: 10_000,
      },
      notification: {
        name: "notification",
        url: process.env["NOTIFICATION_SERVICE_URL"] ?? "http://localhost:3004",
        timeout: 10_000,
      },
    },
  };
}
