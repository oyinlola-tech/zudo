/**
 * Browser stand-in for `node:crypto`, used only by the Learn terminal bundles.
 *
 * The browser-safe Zudo packages import nothing from `node:crypto` except
 * random helpers, which Web Crypto provides. Every other export throws a
 * message that points the learner at running the example on their computer.
 */

const webCrypto = globalThis.crypto;

function nodeOnly(name) {
  return function () {
    throw new Error(
      "crypto." + name + "() only exists in Node.js. Run this example on your computer (see \"On your computer\" on the lesson page).",
    );
  };
}

export function randomUUID() {
  return webCrypto.randomUUID();
}

export function getRandomValues(array) {
  return webCrypto.getRandomValues(array);
}

export function randomFillSync(array) {
  return webCrypto.getRandomValues(array);
}

export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  webCrypto.getRandomValues(bytes);
  bytes.toString = function (encoding) {
    if (encoding === "hex") return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
    if (encoding === "base64") return btoa(String.fromCharCode.apply(null, this));
    if (encoding === "base64url") {
      return btoa(String.fromCharCode.apply(null, this)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    return Uint8Array.prototype.toString.call(this);
  };
  return bytes;
}

export function randomInt(min, max) {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  const range = max - min;
  const limit = Math.floor(0x100000000 / range) * range;
  const buf = new Uint32Array(1);
  do webCrypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return min + (buf[0] % range);
}

export const createHash = nodeOnly("createHash");
export const createHmac = nodeOnly("createHmac");
export const timingSafeEqual = nodeOnly("timingSafeEqual");
export const scrypt = nodeOnly("scrypt");
export const pbkdf2 = nodeOnly("pbkdf2");
export const createCipheriv = nodeOnly("createCipheriv");
export const createDecipheriv = nodeOnly("createDecipheriv");
export const createSign = nodeOnly("createSign");
export const createVerify = nodeOnly("createVerify");
export const sign = nodeOnly("sign");
export const verify = nodeOnly("verify");
export const generateKeyPairSync = nodeOnly("generateKeyPairSync");
export const createPublicKey = nodeOnly("createPublicKey");
export const createPrivateKey = nodeOnly("createPrivateKey");
export class KeyObject {
  constructor() {
    nodeOnly("KeyObject")();
  }
}

export default {
  randomUUID,
  getRandomValues,
  randomFillSync,
  randomBytes,
  randomInt,
  createHash,
  createHmac,
  timingSafeEqual,
};
