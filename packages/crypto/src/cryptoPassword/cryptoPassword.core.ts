import type { CryptoProvider } from "../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../cryptoProvider/cryptoProvider.default.js";

import { CryptoAlgorithm } from "../cryptoConstants/cryptoConstants.type.js";

import { PASSWORD_HASH } from "../cryptoConstants/cryptoConstants.security.js";

import type {
  PasswordHashOptions,
  PasswordHashResult,
} from "./cryptoPassword.type.js";

import {
  assertPassword,
  validateParameters,
} from "./cryptoPassword.validate.js";

import {
  decodePasswordHash,
  PASSWORD_FORMAT_VERSION,
} from "./cryptoPassword.codec.js";

/**
 * Options for `hashPassword` including an optional provider override.
 */
export interface HashPasswordOptions extends PasswordHashOptions {
  readonly provider?: CryptoProvider;
}

/**
 * Hashes a password using scrypt.
 *
 * `saltBytes` and `keyBytes` are honoured, and the returned `salt`/`hash`
 * are exactly the values inside `encoded`.
 */
export async function hashPassword(
  password: string,
  options: HashPasswordOptions = {},
): Promise<PasswordHashResult> {
  assertPassword(password);

  const provider = options.provider ?? getDefaultCryptoProvider();

  const saltBytes = options.saltBytes ?? PASSWORD_HASH.SALT_BYTES;
  const keyBytes = options.keyBytes ?? PASSWORD_HASH.KEY_BYTES;
  const cost = options.cost ?? PASSWORD_HASH.SCRYPT.COST;
  const blockSize = options.blockSize ?? PASSWORD_HASH.SCRYPT.BLOCK_SIZE;
  const parallelization =
    options.parallelization ?? PASSWORD_HASH.SCRYPT.PARALLELIZATION;

  validateParameters({
    saltBytes,
    keyBytes,
    cost,
    blockSize,
    parallelization,
  });

  const salt = new Uint8Array(await provider.randomBytes(saltBytes));

  const encoded = await provider.hashPassword(password, {
    algorithm: "scrypt",
    memoryCost: cost,
    blockSize,
    parallelism: parallelization,
    keyBytes,
    salt,
  });

  const decoded = decodePasswordHash(encoded);

  if (decoded.algorithm !== CryptoAlgorithm.SCRYPT) {
    throw new TypeError("Provider returned a non-scrypt password hash.");
  }

  return Object.freeze({
    algorithm: CryptoAlgorithm.SCRYPT,
    version: PASSWORD_FORMAT_VERSION,
    salt: decoded.salt,
    hash: decoded.hash,
    encoded,
    cost: decoded.cost,
    blockSize: decoded.blockSize,
    parallelization: decoded.parallelization,
  });
}

/**
 * Verifies a password against an encoded password hash.
 *
 * Returns false (never throws) for wrong passwords and for malformed,
 * foreign or out-of-bounds hash strings. A non-string or over-long
 * password also yields false.
 */
export async function verifyPassword(
  password: string,
  encoded: string,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<boolean> {
  try {
    assertPassword(password);

    return await provider.verifyPassword(password, encoded);
  } catch {
    return false;
  }
}
