/**
 * @zudojs/docs/validator
 *
 * Document validation for IDs, links, metadata, and navigation.
 */

export { validateDocument } from "./validatorDocument.core.js";
export { validateNoDuplicateIds } from "./validatorDuplicates.core.js";
export {
  validateLinks,
  DEFAULT_MAX_LINK_SCAN_LENGTH,
} from "./validatorLinks.core.js";
export { validateAll, validateNavigation } from "./validatorAll/index.js";
export { toValidationResult } from "./validator.types.js";

export type { ValidationIssue, ValidationResult } from "./validator.types.js";
export type { ValidateLinksOptions } from "./validatorLinks.core.js";
export type { ValidateAllOptions } from "./validatorAll/validatorAll.core.js";
