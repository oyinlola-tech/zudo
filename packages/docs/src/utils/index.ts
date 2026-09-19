/**
 * @zudojs/docs/utils
 *
 * Utility helpers for document ID normalization, link resolution, and markdown parsing.
 */

export {
  isValidDocumentId,
  normalizeDocumentId,
  documentIdFromPath,
  resolveDocumentLink,
  stripLinkDecorations,
  stripFencedCodeBlocks,
  extractTitleFromMarkdown,
  extractHeadings,
} from "./utils.helper.js";
export { stripMarkdown } from "./utils.markdownText.js";

export { deepFreeze, deepFreezeClone } from "./utils.freeze.js";
