/**
 * @zudojs/docs/registry
 *
 * Document registry for storing, retrieving, and filtering documentation.
 */

export {
  DocumentRegistry,
  createDocumentRegistry,
  matchesVisibility,
} from "./registry.core.js";

export type {
  DocumentVisibilityFilter,
  GetAllOptions,
} from "./registry.core.js";
