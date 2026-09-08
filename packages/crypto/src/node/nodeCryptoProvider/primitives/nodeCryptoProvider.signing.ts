import type {
  SignatureAlgorithm,
  SignOptions,
  VerifyOptions,
} from "../../../cryptoProvider/index.js";
import { isSignatureAlgorithmName } from "../../../cryptoProvider/cryptoProvider.type.js";
import {
  createSign,
  createVerify,
  sign as signImpl,
  verify as verifyImpl,
  type KeyObject,
} from "node:crypto";
import { CryptoOperation } from "@zudojs/errors";
import { toBytes } from "../nodeCryptoProvider.helper.js";
import { signatureError } from "../../../cryptoErrors/cryptoErrors.helper.js";
import {
  toPrivateKey,
  toPublicKey,
} from "../../signing/signing.conversion.js";
import {
  nodeSignatureAlgorithm,
  expectedAsymmetricKeyType,
} from "../../signing/signing.utils.js";

function assertAlgorithm(
  algorithm: unknown,
  operation: CryptoOperation.SIGN | CryptoOperation.VERIFY_SIGNATURE,
): asserts algorithm is SignatureAlgorithm {
  if (!isSignatureAlgorithmName(algorithm)) {
    throw signatureError(
      `Unsupported signature algorithm: ${String(algorithm)}.`,
      operation,
      typeof algorithm === "string" ? algorithm : undefined,
    );
  }
}

/**
 * Ensures the key's type matches the requested algorithm so that the
 * algorithm label is a real integrity assertion (an EC key cannot sign
 * under "rsa-sha256").
 */
function assertKeyType(
  key: KeyObject,
  algorithm: SignatureAlgorithm,
  operation: CryptoOperation.SIGN | CryptoOperation.VERIFY_SIGNATURE,
): void {
  const expected = expectedAsymmetricKeyType(algorithm);

  if (key.asymmetricKeyType !== expected) {
    throw signatureError(
      `Signature algorithm "${algorithm}" requires a ${expected} key, received ${String(key.asymmetricKeyType)}.`,
      operation,
      algorithm,
    );
  }
}

export async function sign(options: SignOptions): Promise<Uint8Array> {
  const algorithm = options.algorithm ?? "ed25519";
  assertAlgorithm(algorithm, CryptoOperation.SIGN);

  const data = toBytes(options.data);

  let privateKey: KeyObject;

  try {
    privateKey = toPrivateKey(options.key);
  } catch (error) {
    throw signatureError(
      "Invalid private key.",
      CryptoOperation.SIGN,
      algorithm,
      error,
    );
  }

  assertKeyType(privateKey, algorithm, CryptoOperation.SIGN);

  try {
    if (algorithm === "ed25519") {
      return new Uint8Array(signImpl(null, data, privateKey));
    }

    const signer = createSign(nodeSignatureAlgorithm(algorithm));
    signer.update(data);
    signer.end();

    return new Uint8Array(signer.sign(privateKey));
  } catch (error) {
    throw signatureError(
      "Signing failed.",
      CryptoOperation.SIGN,
      algorithm,
      error,
    );
  }
}

/**
 * Verifies a signature.
 *
 * Returns false for a malformed key, malformed signature or mismatching
 * data. Throws only for programmer errors (unsupported algorithm, key
 * type that cannot be used with the algorithm).
 */
export async function verify(options: VerifyOptions): Promise<boolean> {
  const algorithm = options.algorithm ?? "ed25519";
  assertAlgorithm(algorithm, CryptoOperation.VERIFY_SIGNATURE);

  if (!(options.signature instanceof Uint8Array)) {
    return false;
  }

  const data = toBytes(options.data);

  let publicKey: KeyObject;

  try {
    publicKey = toPublicKey(options.key);
  } catch {
    return false;
  }

  assertKeyType(publicKey, algorithm, CryptoOperation.VERIFY_SIGNATURE);

  try {
    if (algorithm === "ed25519") {
      return verifyImpl(null, data, publicKey, options.signature);
    }

    const verifier = createVerify(nodeSignatureAlgorithm(algorithm));
    verifier.update(data);
    verifier.end();

    return verifier.verify(publicKey, options.signature);
  } catch {
    return false;
  }
}
