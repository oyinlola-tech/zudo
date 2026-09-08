import { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";

import type { Pbkdf2Digest } from "../cryptoProvider/cryptoProvider.type.js";

import type {
  PasswordHashParameters,
  Pbkdf2PasswordAlgorithm,
} from "./cryptoPassword.type.js";

import {
  decodeBase64Url,
  parsePositiveInteger,
  validateParameters,
  validatePbkdf2Parameters,
} from "./cryptoPassword.validate.js";

/**
 * Current password hash encoding format version.
 */
export const PASSWORD_FORMAT_VERSION = "v1";

const PBKDF2_ALGORITHMS: ReadonlyMap<string, Pbkdf2Digest> = new Map([
  [CryptoAlgorithm.PBKDF2_SHA256, "sha256"],
  [CryptoAlgorithm.PBKDF2_SHA384, "sha384"],
  [CryptoAlgorithm.PBKDF2_SHA512, "sha512"],
]);

/**
 * Returns the PBKDF2 password algorithm label for a digest.
 */
export function pbkdf2PasswordAlgorithm(
  digest: Pbkdf2Digest,
): Pbkdf2PasswordAlgorithm {
  switch (digest) {
    case "sha256":
      return CryptoAlgorithm.PBKDF2_SHA256;
    case "sha384":
      return CryptoAlgorithm.PBKDF2_SHA384;
    case "sha512":
      return CryptoAlgorithm.PBKDF2_SHA512;
    default:
      throw new TypeError(`Unsupported PBKDF2 digest: ${String(digest)}.`);
  }
}

/**
 * Decodes an encoded password hash into its parameters.
 *
 * Supported formats:
 *
 * - `v1$scrypt$<N>$<r>$<p>$<salt>.<hash>`
 * - `v1$pbkdf2-<digest>$<iterations>$<salt>.<hash>`
 *
 * All binary fields are canonical Base64URL. Parameters are validated
 * against `PASSWORD_HASH.LIMITS`, so a decoded hash is always safe to
 * re-derive.
 */
export function decodePasswordHash(encoded: string): PasswordHashParameters {
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new TypeError("Password hash must be a non-empty string.");
  }

  const parts = encoded.split("$");
  const version = parts[0];
  const algorithm = parts[1];

  if (version !== PASSWORD_FORMAT_VERSION) {
    throw new TypeError(`Unsupported password hash version: ${String(version)}.`);
  }

  if (algorithm === CryptoAlgorithm.SCRYPT) {
    if (parts.length !== 6) {
      throw new TypeError("Invalid password hash format.");
    }

    const [, , costPart, blockSizePart, parallelizationPart, payload] =
      parts as [string, string, string, string, string, string];

    const cost = parsePositiveInteger(costPart, "cost");
    const blockSize = parsePositiveInteger(blockSizePart, "blockSize");
    const parallelization = parsePositiveInteger(
      parallelizationPart,
      "parallelization",
    );

    const { salt, hash } = decodePayload(payload);

    validateParameters({
      saltBytes: salt.byteLength,
      keyBytes: hash.byteLength,
      cost,
      blockSize,
      parallelization,
    });

    return Object.freeze({
      version,
      algorithm: CryptoAlgorithm.SCRYPT,
      salt,
      hash,
      cost,
      blockSize,
      parallelization,
    });
  }

  const digest =
    algorithm === undefined ? undefined : PBKDF2_ALGORITHMS.get(algorithm);

  if (digest !== undefined) {
    if (parts.length !== 4) {
      throw new TypeError("Invalid password hash format.");
    }

    const [, , iterationsPart, payload] = parts as [
      string,
      string,
      string,
      string,
    ];

    const iterations = parsePositiveInteger(iterationsPart, "iterations");

    const { salt, hash } = decodePayload(payload);

    validatePbkdf2Parameters({
      saltBytes: salt.byteLength,
      keyBytes: hash.byteLength,
      iterations,
    });

    return Object.freeze({
      version,
      algorithm: algorithm as Pbkdf2PasswordAlgorithm,
      digest,
      salt,
      hash,
      iterations,
    });
  }

  throw new TypeError(
    `Unsupported password hash algorithm: ${String(algorithm)}.`,
  );
}

/**
 * Encodes password hashing parameters into a portable string.
 */
export function encodePasswordHash(parameters: PasswordHashParameters): string {
  if (parameters.version !== PASSWORD_FORMAT_VERSION) {
    throw new TypeError(
      `Unsupported password hash version: ${parameters.version}.`,
    );
  }

  const payload = [
    Buffer.from(parameters.salt).toString("base64url"),
    Buffer.from(parameters.hash).toString("base64url"),
  ].join(".");

  if (parameters.algorithm === CryptoAlgorithm.SCRYPT) {
    validateParameters({
      saltBytes: parameters.salt.byteLength,
      keyBytes: parameters.hash.byteLength,
      cost: parameters.cost,
      blockSize: parameters.blockSize,
      parallelization: parameters.parallelization,
    });

    return [
      parameters.version,
      parameters.algorithm,
      parameters.cost,
      parameters.blockSize,
      parameters.parallelization,
      payload,
    ].join("$");
  }

  if (PBKDF2_ALGORITHMS.has(parameters.algorithm)) {
    validatePbkdf2Parameters({
      saltBytes: parameters.salt.byteLength,
      keyBytes: parameters.hash.byteLength,
      iterations: parameters.iterations,
    });

    return [
      parameters.version,
      parameters.algorithm,
      parameters.iterations,
      payload,
    ].join("$");
  }

  throw new TypeError(
    `Unsupported password hash algorithm: ${String(
      (parameters as { algorithm: unknown }).algorithm,
    )}.`,
  );
}

function decodePayload(payload: string): {
  readonly salt: Uint8Array;
  readonly hash: Uint8Array;
} {
  const payloadParts = payload.split(".");

  if (payloadParts.length !== 2) {
    throw new TypeError("Invalid password hash payload.");
  }

  const [encodedSalt, encodedHash] = payloadParts as [string, string];

  const salt = decodeBase64Url(encodedSalt);
  const hash = decodeBase64Url(encodedHash);

  if (salt.byteLength === 0) {
    throw new TypeError("Password hash salt cannot be empty.");
  }

  if (hash.byteLength === 0) {
    throw new TypeError("Password hash cannot be empty.");
  }

  return { salt, hash };
}
