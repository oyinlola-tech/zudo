/**
 * @zudojs/docs/document
 *
 * Document model and builder for creating documentation pages.
 */

export { createDocument } from "./documentBuilder.core.js";
export {
  createMarkdownDocument,
  createStructuredDocument,
} from "./documentBuilder.convenience.js";

export type {
  DocumentBuilderOptions,
  DocumentBuilderExtras,
} from "./documentBuilder.core.js";
