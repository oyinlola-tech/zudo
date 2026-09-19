/**
 * @zudojs/storage/objectStorage/objectKey
 *
 * Object key validation for the local object store: keys are opaque, the way
 * object-store keys are, so dot segments are refused rather than normalised,
 * and the reserved metadata tree is refused after normalisation.
 */

export {
  assertCanonicalKey,
  assertResolvedNotReserved,
} from "./objectKey.validator.js";
export { isMissingEntryError, rethrowUnlessMissing } from "./objectKey.errors.js";
