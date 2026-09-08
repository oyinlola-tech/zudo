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
  stripMarkdown,
} from "./utils.helper.js";

export { deepFreeze, deepFreezeClone } from "./utils.freeze.js";
