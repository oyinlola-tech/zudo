import type { CryptoProvider } from "../../cryptoProvider/index.js";

import { getDefaultCryptoProvider } from "../../cryptoProvider/cryptoProvider.default.js";

import { encode } from "../../cryptoEncoding/cryptoEncoding.core.js";

import {
  hashError,
  rethrowAsCryptoError,
} from "../../cryptoErrors/cryptoErrors.helper.js";

export async function serviceHash(
  value: string | Uint8Array,
  provider: CryptoProvider = getDefaultCryptoProvider(),
): Promise<Uint8Array> {
  try {
    return await provider.hash("sha256", value);
  } catch (error) {
    return rethrowAsCryptoError(error, (cause) =>
      hashError("Hashing failed.", "sha256", cause),
    );
  }
}

export async function serviceHashHex(
  value: string | Uint8Array,
  provider?: CryptoProvider,
): Promise<string> {
  return encode(await serviceHash(value, provider), "hex");
}
