import { encrypt, randomBytesSecure } from "@zudojs/crypto";

const key = await randomBytesSecure(32);
const iv = await randomBytesSecure(12);
const a = await encrypt(new TextEncoder().encode("first"), key, { iv });
console.log("first ok");
try {
  const b = await encrypt(new TextEncoder().encode("second"), key, { iv });
  console.log("second ok?!", b);
} catch (error: any) {
  console.log(error.name, error.code, error.message);
}
// same iv, different key: should be fine (guard is per key)
const key2 = await randomBytesSecure(32);
const c = await encrypt(new TextEncoder().encode("third"), key2, { iv });
console.log("different key, same iv: ok");
