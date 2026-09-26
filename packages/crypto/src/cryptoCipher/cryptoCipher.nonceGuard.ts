import { createHash } from "node:crypto";

import { CryptoOperation } from "@zudojs/errors";

import { cipherError } from "../cryptoErrors/cryptoErrors.helper.js";

/**
 * Upper bound on remembered (key, iv) pairs. Past it the oldest entries
 * are forgotten first, so the guard is best-effort for very long-lived
 * processes but exact for the reuse patterns that occur in practice
 * (a fixed iv hard-coded next to a fixed key).
 */
export const IV_REUSE_GUARD_CAPACITY = 65_536;

const seen = new Set<string>();

function fingerprint(key: Uint8Array, iv: Uint8Array): string {
  return createHash("sha256")
    .update("zudojs-crypto-iv-reuse-guard-v1")
    .update(Uint8Array.from([key.byteLength]))
    .update(key)
    .update(iv)
    .digest("base64url");
}

/**
 * Rejects a caller-supplied AES-GCM iv that this process has already used
 * under the same key.
 *
 * AES-GCM is catastrophically broken by nonce reuse: two messages encrypted
 * under one (key, iv) pair leak the XOR of their plaintexts and allow the
 * authentication key to be recovered. A random iv drawn per call (the
 * default when `iv` is omitted) never trips this guard; it exists to catch
 * the hard-coded or counter-reset iv before it reaches the cipher.
 *
 * The guard is per process: it cannot see ivs used by other processes or
 * before a restart, so it is a safety net, not a substitute for a scheme
 * that guarantees uniqueness (random ivs, or a durable counter).
 *
 * @throws {CryptoError} `CRYPTO_CIPHER` when the pair was already used.
 */
export function assertIvNotReused(key: Uint8Array, iv: Uint8Array): void {
  const entry = fingerprint(key, iv);

  if (seen.has(entry)) {
    throw cipherError(
      "AES-256-GCM iv has already been used with this key in this process; " +
        "reusing a GCM nonce under one key breaks confidentiality and " +
        "authenticity. Omit `iv` to draw a fresh random one per call.",
      CryptoOperation.ENCRYPT,
      "aes-256-gcm",
    );
  }

  if (seen.size >= IV_REUSE_GUARD_CAPACITY) {
    const oldest = seen.values().next();
    if (!oldest.done) {
      seen.delete(oldest.value);
    }
  }

  seen.add(entry);
}
