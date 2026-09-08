import type { CryptoProvider } from "../cryptoProvider/index.js";

import type { TokenEncoding } from "../cryptoToken/cryptoToken.core.js";

import {
  generateToken,
  generateApiKey,
  generateSessionToken,
  generateRefreshToken,
  generateVerificationToken,
  generatePasswordResetToken,
  generateCsrfToken,
  generateOtp,
} from "../cryptoToken/cryptoToken.core.js";

export async function factoryCreateToken(
  bytes = 32,
  prefix?: string,
  encoding: TokenEncoding = "base64url",
  provider?: CryptoProvider,
): Promise<string> {
  return generateToken({
    bytes,
    encoding,
    prefix,
    provider,
  });
}

export async function factoryCreateApiKey(
  provider?: CryptoProvider,
): Promise<string> {
  return generateApiKey(undefined, undefined, provider);
}

export async function factoryCreateSessionToken(
  provider?: CryptoProvider,
): Promise<string> {
  return generateSessionToken(undefined, provider);
}

export async function factoryCreateRefreshToken(
  provider?: CryptoProvider,
): Promise<string> {
  return generateRefreshToken(undefined, provider);
}

export async function factoryCreateVerificationToken(
  provider?: CryptoProvider,
): Promise<string> {
  return generateVerificationToken(undefined, provider);
}

export async function factoryCreatePasswordResetToken(
  provider?: CryptoProvider,
): Promise<string> {
  return generatePasswordResetToken(undefined, provider);
}

export async function factoryCreateCsrfToken(
  provider?: CryptoProvider,
): Promise<string> {
  return generateCsrfToken(undefined, provider);
}

export async function factoryCreateOtp(
  digits = 6,
  provider?: CryptoProvider,
): Promise<string> {
  return generateOtp(digits, provider);
}
