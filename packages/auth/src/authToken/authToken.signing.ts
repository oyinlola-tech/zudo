/**
 * Internal JWT signing and verification helpers.
 *
 * @module authToken/authToken.signing
 *
 * Not exported from the package barrel — used internally by authToken.core.ts.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type {
  JwtToken,
  TokenId,
  TokenPayload,
  TokenConfig,
  TokenVerificationResult,
} from "../authTypes/authToken.type.js";
import { AuthConfigurationError } from "../authErrors/authError.base.js";
import {
  base64UrlEncode,
  decodeJsonSegment,
  splitToken,
} from "./authToken.encoding.js";

/** HMAC signing algorithm. */
const ALGORITHM = "HS256";

/**
 * Minimum accepted signing-secret length in bytes.
 *
 * HS256 keys should be at least as long as the digest (32 bytes); shorter
 * keys are brute-forceable offline from a single captured token.
 */
export const MIN_SECRET_BYTES = 32;

/**
 * Validate a {@link TokenConfig}'s signing secrets.
 *
 * Called on every mint and every verification. An empty or short secret
 * yields tokens anyone can forge, and Node accepts a zero-length HMAC key
 * without complaint, so this has to be checked explicitly rather than
 * assumed.
 *
 * @throws {AuthConfigurationError} when either secret is missing, shorter
 *   than {@link MIN_SECRET_BYTES}, or when both secrets are identical.
 */
export function assertTokenSecrets(config: TokenConfig): void {
  assertSecret(config?.accessSecret, "accessSecret");
  assertSecret(config?.refreshSecret, "refreshSecret");
  if (config.accessSecret === config.refreshSecret) {
    throw new AuthConfigurationError(
      "TokenConfig.accessSecret and TokenConfig.refreshSecret must differ; " +
        "sharing one secret collapses the separation between access and " +
        "refresh tokens.",
    );
  }
  if (
    config.clockToleranceSeconds !== undefined &&
    (!Number.isFinite(config.clockToleranceSeconds) ||
      config.clockToleranceSeconds < 0 ||
      config.clockToleranceSeconds > 300)
  ) {
    throw new AuthConfigurationError(
      "TokenConfig.clockToleranceSeconds must be between 0 and 300 seconds.",
    );
  }
}

function assertSecret(secret: unknown, field: string): void {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new AuthConfigurationError(
      `TokenConfig.${field} is required and must be a non-empty string.`,
    );
  }
  if (Buffer.byteLength(secret, "utf-8") < MIN_SECRET_BYTES) {
    throw new AuthConfigurationError(
      `TokenConfig.${field} must be at least ${MIN_SECRET_BYTES} bytes; ` +
        "a shorter HMAC key can be recovered offline from a single token.",
    );
  }
}

/**
 * Sign a JWT payload with HMAC SHA-256.
 */
export function signToken(payload: TokenPayload, secret: string): JwtToken {
  const header = base64UrlEncode(
    JSON.stringify({ alg: ALGORITHM, typ: "JWT" }),
  );
  const body = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${header}.${body}`;
  const signature = hmacSha256(signatureInput, secret);
  return `${signatureInput}.${signature}`;
}

/**
 * Verify a JWT token's signature, algorithm, expiration, not-before, type,
 * and (when configured) issuer and audience.
 *
 * Never throws for untrusted input: every failure is reported as
 * `{ valid: false, error }`. Oversized tokens are rejected before anything
 * is decoded.
 */
export function verifyToken(
  token: JwtToken,
  secret: string,
  expectedType: "access" | "refresh",
  config: TokenConfig,
): TokenVerificationResult {
  const parts = splitToken(token);
  if (!parts) {
    return { valid: false, error: "Invalid token format" };
  }

  const [headerB64, bodyB64, signature] = parts;

  const header = decodeJsonSegment(headerB64);
  if (!header) {
    return { valid: false, error: "Invalid header" };
  }
  if (header["alg"] !== ALGORITHM) {
    return { valid: false, error: "Unsupported algorithm" };
  }

  const signatureInput = `${headerB64}.${bodyB64}`;
  const expectedSignature = hmacSha256(signatureInput, secret);

  const sigBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, error: "Invalid signature" };
  }

  const decoded = decodeJsonSegment(bodyB64);
  if (!decoded) {
    return { valid: false, error: "Invalid payload" };
  }
  if (!isTokenPayload(decoded)) {
    return { valid: false, error: "Invalid payload" };
  }
  const payload: TokenPayload = decoded;

  const now = Math.floor(Date.now() / 1000);
  const skew = config.clockToleranceSeconds ?? 0;

  if (payload.exp + skew < now) {
    return { valid: false, error: "Token expired" };
  }

  if (payload.iat - skew > now) {
    return { valid: false, error: "Token issued in the future" };
  }

  const nbf = payload["nbf"];
  if (typeof nbf === "number" && nbf - skew > now) {
    return { valid: false, error: "Token not yet valid" };
  }

  if (payload.typ !== expectedType) {
    return { valid: false, error: `Expected ${expectedType} token` };
  }

  if (config.issuer && payload["iss"] !== config.issuer) {
    return { valid: false, error: "Invalid issuer" };
  }

  if (config.audience && payload["aud"] !== config.audience) {
    return { valid: false, error: "Invalid audience" };
  }

  return { valid: true, payload };
}

/**
 * Narrow a decoded JWT body to a {@link TokenPayload}.
 *
 * Replaces the `as TokenPayload` cast that previously let a `null`, an
 * array, or a payload with a missing/mistyped `sub`, `jti`, `exp`, `iat` or
 * `typ` flow into the caller.
 */
function isTokenPayload(value: Record<string, unknown>): value is TokenPayload {
  if (typeof value["sub"] !== "string" || value["sub"].length === 0) {
    return false;
  }
  if (typeof value["jti"] !== "string" || value["jti"].length === 0) {
    return false;
  }
  if (value["typ"] !== "access" && value["typ"] !== "refresh") return false;
  if (!isFiniteNumber(value["exp"])) return false;
  if (!isFiniteNumber(value["iat"])) return false;
  const roles = value["roles"];
  if (
    roles !== undefined &&
    (!Array.isArray(roles) || roles.some((r) => typeof r !== "string"))
  ) {
    return false;
  }
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Generate a random token ID.
 */
export function generateTokenId(): TokenId {
  return randomBytes(16).toString("hex") as TokenId;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function hmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}
