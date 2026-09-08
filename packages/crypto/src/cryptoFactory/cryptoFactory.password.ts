import type { CryptoProvider } from "../cryptoProvider/index.js";

import type {
  PasswordHashOptions,
  PasswordHashResult,
} from "../cryptoPassword/cryptoPassword.type.js";

import {
  hashPassword,
  verifyPassword,
} from "../cryptoPassword/cryptoPassword.core.js";

export type { PasswordHashOptions };

export async function factoryCreatePasswordHash(
  password: string,
  options?: PasswordHashOptions,
  provider?: CryptoProvider,
): Promise<PasswordHashResult> {
  return hashPassword(password, { ...options, provider });
}

export async function factoryVerifyPassword(
  password: string,
  encodedHash: string,
  provider?: CryptoProvider,
): Promise<boolean> {
  return verifyPassword(password, encodedHash, provider);
}
