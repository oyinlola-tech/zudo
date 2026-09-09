/**
 * @zudojs/storage — Object Storage Barrel
 */

export { LocalObjectStorage } from "./localObjectStorage.core.js";
export type { LocalObjectStorageOptions } from "./localObjectStorage.core.js";
export {
  isContained,
  resolveBasePath,
  resolveKeyPath,
} from "./localObjectStorage.path.js";
export { DEFAULT_MAX_OBJECT_BYTES } from "./localObjectStorage.write.js";
export { DEFAULT_MAX_KEYS, listObjects } from "./localObjectStorage.list.js";
export type { ListOptions } from "./localObjectStorage.list.js";
export { SIDECAR_DIR } from "./localObjectStorage.sidecar.js";
export type { ObjectAttributes } from "./localObjectStorage.sidecar.js";
