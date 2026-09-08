import type {
  HashAlgorithm,
  HmacAlgorithm,
  CryptoInput,
} from "../../../cryptoProvider/index.js";
import { createHash, createHmac } from "node:crypto";
import { toBytes, nodeHashAlgorithm } from "../nodeCryptoProvider.helper.js";

export async function hash(
  algorithm: HashAlgorithm,
  data: CryptoInput,
): Promise<Uint8Array> {
  const digestName = nodeHashAlgorithm(algorithm);
  const normalized = toBytes(data);
  const hasher = createHash(digestName);
  hasher.update(normalized);
  return new Uint8Array(hasher.digest());
}

export async function hmac(
  algorithm: HmacAlgorithm,
  key: CryptoInput,
  data: CryptoInput,
): Promise<Uint8Array> {
  const digestName = nodeHashAlgorithm(algorithm);
  const normalizedKey = toBytes(key);

  if (normalizedKey.byteLength === 0) {
    throw new TypeError("HMAC key must not be empty.");
  }

  const normalizedData = toBytes(data);
  const h = createHmac(digestName, normalizedKey);
  h.update(normalizedData);
  return new Uint8Array(h.digest());
}
