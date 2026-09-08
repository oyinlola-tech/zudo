import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import type { DerivedKeyResult } from "../cryptoProvider/index.js";

import { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";

import { PASSWORD_HASH } from "../cryptoConstants/cryptoConstants.security.js";

import type {
  Pbkdf2Options,
  ScryptOptions,
} from "./cryptoKeyDerivation.type.js";

import {
  validatePbkdf2Options,
  validateScryptOptions,
} from "./cryptoKeyDerivation.validate.js";

function pbkdf2Label(
  digest: "sha256" | "sha384" | "sha512",
):
  | CryptoAlgorithm.PBKDF2_SHA256
  | CryptoAlgorithm.PBKDF2_SHA384
  | CryptoAlgorithm.PBKDF2_SHA512 {
  switch (digest) {
    case "sha256":
      return CryptoAlgorithm.PBKDF2_SHA256;
    case "sha384":
      return CryptoAlgorithm.PBKDF2_SHA384;
    case "sha512":
      return CryptoAlgorithm.PBKDF2_SHA512;
  }
}

/**
 * Derives a key from a password using PBKDF2-HMAC.
 *
 * The digest option is honoured end to end and reflected in
 * `result.algorithm` (`pbkdf2-sha256`, `pbkdf2-sha384` or `pbkdf2-sha512`).
 */
export async function derivePbkdf2(
  password: string | Uint8Array,
  options: Pbkdf2Options = {},
): Promise<DerivedKeyResult> {
  const provider = options.provider ?? getDefaultCryptoProvider();
  const iterations = options.iterations ?? PASSWORD_HASH.PBKDF2.ITERATIONS;
  const keyLength = options.keyLength ?? 32;
  const digest = options.digest ?? "sha256";
  const salt =
    options.salt ??
    new Uint8Array(await provider.randomBytes(options.saltLength ?? 16));

  validatePbkdf2Options(iterations, keyLength, salt, digest);

  const key = await provider.deriveKey({
    password,
    salt,
    algorithm: "pbkdf2",
    keyLength,
    iterations,
    digest,
  });

  return Object.freeze({
    algorithm: pbkdf2Label(digest),
    digest,
    key,
    salt: new Uint8Array(salt),
  });
}

/**
 * Derives a key using scrypt.
 *
 * `blockSize` and `maxMemory` are forwarded to the provider, so work
 * factors above the default (e.g. N = 2^17) are usable.
 */
export async function deriveScrypt(
  password: string | Uint8Array,
  options: ScryptOptions = {},
): Promise<DerivedKeyResult> {
  const provider = options.provider ?? getDefaultCryptoProvider();
  const keyLength = options.keyLength ?? 32;
  const cost = options.cost ?? PASSWORD_HASH.SCRYPT.COST;
  const blockSize = options.blockSize ?? PASSWORD_HASH.SCRYPT.BLOCK_SIZE;
  const parallelization =
    options.parallelization ?? PASSWORD_HASH.SCRYPT.PARALLELIZATION;
  const salt =
    options.salt ??
    new Uint8Array(await provider.randomBytes(options.saltLength ?? 16));

  validateScryptOptions(
    keyLength,
    cost,
    blockSize,
    parallelization,
    salt,
    options.maxMemory,
  );

  const key = await provider.deriveKey({
    password,
    salt,
    algorithm: "scrypt",
    keyLength,
    memoryCost: cost,
    blockSize,
    parallelism: parallelization,
    maxMemory: options.maxMemory,
  });

  return Object.freeze({
    algorithm: CryptoAlgorithm.SCRYPT,
    key,
    salt: new Uint8Array(salt),
  });
}

/**
 * Derives a key using the selected key derivation algorithm.
 */
export async function deriveKey(
  password: string | Uint8Array,
  algorithm: CryptoAlgorithm,
  options: Pbkdf2Options | ScryptOptions = {},
): Promise<DerivedKeyResult> {
  switch (algorithm) {
    case CryptoAlgorithm.PBKDF2_SHA256:
      return derivePbkdf2(password, {
        ...(options as Pbkdf2Options),
        digest: "sha256",
      });

    case CryptoAlgorithm.PBKDF2_SHA384:
      return derivePbkdf2(password, {
        ...(options as Pbkdf2Options),
        digest: "sha384",
      });

    case CryptoAlgorithm.PBKDF2_SHA512:
      return derivePbkdf2(password, {
        ...(options as Pbkdf2Options),
        digest: "sha512",
      });

    case CryptoAlgorithm.SCRYPT:
      return deriveScrypt(password, options as ScryptOptions);

    default:
      throw new TypeError(
        `Unsupported key derivation algorithm: ${String(algorithm)}.`,
      );
  }
}
