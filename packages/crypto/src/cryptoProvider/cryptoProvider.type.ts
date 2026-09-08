/**
 * Supported hash algorithm identifiers.
 */
export type HashAlgorithm =
  | "sha256"
  | "sha384"
  | "sha512"
  | "sha3-256"
  | "sha3-384"
  | "sha3-512";

/**
 * Supported HMAC algorithm identifiers.
 */
export type HmacAlgorithm = "sha256" | "sha384" | "sha512";

/**
 * Supported PBKDF2 digest identifiers.
 */
export type Pbkdf2Digest = "sha256" | "sha384" | "sha512";

/**
 * Supported encryption algorithm identifiers.
 *
 * Only AES-256-GCM is implemented.
 */
export type EncryptionAlgorithm = "aes-256-gcm";

/**
 * Supported signature algorithm identifiers.
 */
export type SignatureAlgorithm =
  | "ed25519"
  | "rsa-sha256"
  | "rsa-sha384"
  | "rsa-sha512"
  | "ecdsa-sha256"
  | "ecdsa-sha384"
  | "ecdsa-sha512";

/**
 * Supported key derivation algorithm identifiers at the provider level.
 */
export type KeyDerivationAlgorithm = "pbkdf2" | "scrypt";

/**
 * Supported encoding formats.
 */
export type EncodingFormat = "hex" | "base64" | "base64url" | "utf8";

/**
 * Normalized cryptographic input.
 *
 * For keys, a `string` is interpreted as PEM text and a `Uint8Array` as
 * either PEM text (when it starts with `-----BEGIN`) or DER bytes.
 */
export type CryptoInput = string | Uint8Array | ArrayBuffer;

/**
 * Capabilities of a crypto provider.
 */
export interface CryptoCapabilities {
  readonly hash: boolean;
  readonly hmac: boolean;
  readonly encryption: boolean;
  readonly signing: boolean;
  readonly random: boolean;
  readonly passwordHashing: boolean;
  readonly keyDerivation: boolean;
}

export const HASH_ALGORITHM_NAMES: ReadonlySet<string> = new Set<HashAlgorithm>(
  ["sha256", "sha384", "sha512", "sha3-256", "sha3-384", "sha3-512"],
);

export const HMAC_ALGORITHM_NAMES: ReadonlySet<string> = new Set<HmacAlgorithm>(
  ["sha256", "sha384", "sha512"],
);

export const PBKDF2_DIGEST_NAMES: ReadonlySet<string> = new Set<Pbkdf2Digest>([
  "sha256",
  "sha384",
  "sha512",
]);

export const SIGNATURE_ALGORITHM_NAMES: ReadonlySet<string> =
  new Set<SignatureAlgorithm>([
    "ed25519",
    "rsa-sha256",
    "rsa-sha384",
    "rsa-sha512",
    "ecdsa-sha256",
    "ecdsa-sha384",
    "ecdsa-sha512",
  ]);

/**
 * Returns whether a value names a supported hash algorithm.
 */
export function isHashAlgorithmName(value: unknown): value is HashAlgorithm {
  return typeof value === "string" && HASH_ALGORITHM_NAMES.has(value);
}

/**
 * Returns whether a value names a supported HMAC algorithm.
 */
export function isHmacAlgorithmName(value: unknown): value is HmacAlgorithm {
  return typeof value === "string" && HMAC_ALGORITHM_NAMES.has(value);
}

/**
 * Returns whether a value names a supported PBKDF2 digest.
 */
export function isPbkdf2Digest(value: unknown): value is Pbkdf2Digest {
  return typeof value === "string" && PBKDF2_DIGEST_NAMES.has(value);
}

/**
 * Returns whether a value names a supported signature algorithm.
 */
export function isSignatureAlgorithmName(
  value: unknown,
): value is SignatureAlgorithm {
  return typeof value === "string" && SIGNATURE_ALGORITHM_NAMES.has(value);
}
