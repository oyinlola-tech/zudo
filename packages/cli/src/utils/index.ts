/**
 * zudojs-cli — Utils
 *
 * Shared utility functions for the CLI scaffolding system.
 */

export {
  writeFile,
  writeFileTree,
  mergeBarrelExport,
} from "./utils.fileSystem.js";
export { normalizeName, toPascalCase, toCamelCase } from "./utils.name.js";
export { detectArchitecture } from "./utils.detect.js";
export { execCommand, runStreaming } from "./utils.exec.js";
