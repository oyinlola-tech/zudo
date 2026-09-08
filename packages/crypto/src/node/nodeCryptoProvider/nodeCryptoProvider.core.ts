import {
  hash as hashImpl,
  hmac as hmacImpl,
} from "./primitives/nodeCryptoProvider.hash.js";

import {
  encrypt as encryptImpl,
  decrypt as decryptImpl,
} from "./primitives/nodeCryptoProvider.encryption.js";

import {
  sign as signImpl,
  verify as verifyImpl,
} from "./primitives/nodeCryptoProvider.signing.js";

import { deriveKey as deriveKeyImpl } from "./operations/nodeCryptoProvider.derivation.js";

import {
  hashPassword as hashPasswordImpl,
  verifyPassword as verifyPasswordImpl,
} from "./operations/nodeCryptoProvider.password.js";

import {
  randomBytesImpl,
  randomIntImpl,
  randomUUIDImpl,
} from "./primitives/nodeCryptoProvider.random.js";

import type {
  CryptoProvider,
  HashAlgorithm,
  HmacAlgorithm,
  CryptoInput,
  EncryptedData,
  EncryptOptions,
  DecryptOptions,
  SignOptions,
  VerifyOptions,
  DeriveKeyOptions,
  PasswordHashProviderOptions,
} from "../../cryptoProvider/index.js";

import type { CryptoCapabilities } from "../../cryptoProvider/cryptoProvider.type.js";

export class NodeCryptoProvider implements CryptoProvider {
  readonly name = "node";
  readonly capabilities: CryptoCapabilities = {
    hash: true,
    hmac: true,
    encryption: true,
    signing: true,
    random: true,
    passwordHashing: true,
    keyDerivation: true,
  };

  async randomBytes(length: number): Promise<Uint8Array> {
    return randomBytesImpl(length);
  }

  async randomInt(min: number, max: number): Promise<number> {
    return randomIntImpl(min, max);
  }

  async randomUUID(): Promise<string> {
    return randomUUIDImpl();
  }

  async hash(algorithm: HashAlgorithm, data: CryptoInput): Promise<Uint8Array> {
    return hashImpl(algorithm, data);
  }

  async hmac(
    algorithm: HmacAlgorithm,
    key: CryptoInput,
    data: CryptoInput,
  ): Promise<Uint8Array> {
    return hmacImpl(algorithm, key, data);
  }

  async encrypt(options: EncryptOptions): Promise<EncryptedData> {
    return encryptImpl(options);
  }

  async decrypt(options: DecryptOptions): Promise<Uint8Array> {
    return decryptImpl(options);
  }

  async sign(options: SignOptions): Promise<Uint8Array> {
    return signImpl(options);
  }

  async verify(options: VerifyOptions): Promise<boolean> {
    return verifyImpl(options);
  }

  async deriveKey(options: DeriveKeyOptions): Promise<Uint8Array> {
    return deriveKeyImpl(options);
  }

  async hashPassword(
    password: CryptoInput,
    options?: PasswordHashProviderOptions,
  ): Promise<string> {
    return hashPasswordImpl(password, options);
  }

  async verifyPassword(password: CryptoInput, hash: string): Promise<boolean> {
    return verifyPasswordImpl(password, hash);
  }
}
