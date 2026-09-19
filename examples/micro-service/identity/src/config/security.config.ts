import type { SecurityConfig } from "../interfaces/index.js";
import { DEFAULT_JWT_EXPIRY } from "../constants/index.js";

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

/**
 * Creates the security configuration from environment variables.
 */
export function createSecurityConfig(): SecurityConfig {
  return {
    jwtSecret: requireJwtSecret(),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? DEFAULT_JWT_EXPIRY,
  };
}
