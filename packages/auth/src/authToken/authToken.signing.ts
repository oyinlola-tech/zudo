/**
 * Internal JWT signing and verification helpers.
 *
 * @module authToken/authToken.signing
 *
 * Not exported from the package barrel — used internally by authToken.core.ts.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";
import type {
  JwtToken,
  TokenId,
  TokenPayload,
  TokenConfig,
  TokenVerificationResult,
} from "../authTypes/authToken.type.js";

/** HMAC signing algorithm. */
const ALGORITHM = "HS256";

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
 * Verify a JWT token's signature, algorithm, expiration, type,
 * and (when configured) issuer and audience.
 */
export function verifyToken(
  token: JwtToken,
  secret: string,
  expectedType: "access" | "refresh",
  config: TokenConfig,
): TokenVerificationResult {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid token format" };
  }

  const [headerB64, bodyB64, signature] = parts;

  let header: { alg?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64!)) as { alg?: string };
  } catch {
    return { valid: false, error: "Invalid header" };
  }
  if (header.alg !== ALGORITHM) {
    return { valid: false, error: "Unsupported algorithm" };
  }

  const signatureInput = `${headerB64}.${bodyB64}`;
  const expectedSignature = hmacSha256(signatureInput, secret);

  const sigBuffer = Buffer.from(signature ?? "", "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { valid: false, error: "Invalid signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(bodyB64!)) as TokenPayload;
  } catch {
    return { valid: false, error: "Invalid payload" };
  }

  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp !== "number") {
    return { valid: false, error: "Missing expiration" };
  }

  if (payload.exp < now) {
    return { valid: false, error: "Token expired" };
  }

  if (payload.typ !== expectedType) {
    return { valid: false, error: `Expected ${expectedType} token` };
  }

  if (config.issuer && payload.iss !== config.issuer) {
    return { valid: false, error: "Invalid issuer" };
  }

  if (config.audience && payload.aud !== config.audience) {
    return { valid: false, error: "Invalid audience" };
  }

  return { valid: true, payload };
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

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}
