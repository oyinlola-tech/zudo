import { generateKeyPairSync, createPublicKey, type KeyObject } from "node:crypto";

import { toPrivateKey, type KeyMaterial } from "./signing.conversion.js";
import { assertKeyObject } from "./signing.utils.js";

/**
 * Generates an Ed25519 key pair.
 */
export function generateEd25519KeyPair(): {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  return Object.freeze({
    privateKey,
    publicKey,
  });
}

/**
 * Exports a private key as PEM.
 */
export function exportPrivateKeyPem(privateKey: KeyObject): string {
  assertKeyObject(privateKey);

  return privateKey
    .export({
      type: "pkcs8",
      format: "pem",
    })
    .toString();
}

/**
 * Exports a public key as PEM.
 */
export function exportPublicKeyPem(publicKey: KeyObject): string {
  assertKeyObject(publicKey);

  return publicKey
    .export({
      type: "spki",
      format: "pem",
    })
    .toString();
}

/**
 * Creates a public key from a private key.
 */
export function derivePublicKey(privateKey: KeyMaterial): KeyObject {
  return createPublicKey(toPrivateKey(privateKey));
}
