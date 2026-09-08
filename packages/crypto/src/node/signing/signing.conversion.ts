import type { CryptoKey } from "../../cryptoKey/cryptoKey.type.js";
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

import { isKeyObject } from "./signing.utils.js";

const PEM_PREFIX = Buffer.from("-----BEGIN", "utf8");

/**
 * Key material accepted by the conversion helpers.
 *
 * - `KeyObject`: used as-is.
 * - `string`: PEM text.
 * - `Uint8Array`/`ArrayBuffer`: PEM text when the bytes start with
 *   `-----BEGIN`, otherwise DER (PKCS#8 for private keys, SPKI for
 *   public keys).
 */
export type KeyMaterial = KeyObject | string | Uint8Array | ArrayBuffer;

function looksLikePem(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PEM_PREFIX.byteLength) {
    return false;
  }

  for (let index = 0; index < PEM_PREFIX.byteLength; index += 1) {
    if (bytes[index] !== PEM_PREFIX[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Converts a CryptoKey holding a PKCS#8 DER Ed25519 key into a KeyObject.
 */
export function cryptoKeyToPrivateKey(key: CryptoKey): KeyObject {
  if (key.algorithm !== "ed25519") {
    throw new TypeError(
      `CryptoKey algorithm "${key.algorithm}" is not supported for Ed25519 signatures.`,
    );
  }

  if (!key.extractable) {
    throw new Error(`Cryptographic key "${key.keyId}" is not extractable.`);
  }

  return createPrivateKey({
    key: Buffer.from(key.bytes()),
    format: "der",
    type: "pkcs8",
  });
}

export function toPrivateKey(key: KeyMaterial): KeyObject {
  if (isKeyObject(key)) {
    return key;
  }

  if (typeof key === "string") {
    return createPrivateKey(key);
  }

  const bytes =
    key instanceof ArrayBuffer ? new Uint8Array(key) : (key as Uint8Array);

  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Invalid private key.");
  }

  if (looksLikePem(bytes)) {
    return createPrivateKey(Buffer.from(bytes));
  }

  return createPrivateKey({
    key: Buffer.from(bytes),
    format: "der",
    type: "pkcs8",
  });
}

export function toPublicKey(key: KeyMaterial): KeyObject {
  if (isKeyObject(key)) {
    return key;
  }

  if (typeof key === "string") {
    return createPublicKey(key);
  }

  const bytes =
    key instanceof ArrayBuffer ? new Uint8Array(key) : (key as Uint8Array);

  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Invalid public key.");
  }

  if (looksLikePem(bytes)) {
    return createPublicKey(Buffer.from(bytes));
  }

  return createPublicKey({
    key: Buffer.from(bytes),
    format: "der",
    type: "spki",
  });
}
