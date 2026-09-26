/**
 * Convenience builders for markdown and structured documents.
 *
 * @module document/documentBuilder.convenience
 */

import type {
  DocumentationDocument,
  DocumentationNode,
} from "../docsTypes/index.js";
import {
  createDocument,
  type DocumentBuilderExtras,
} from "./documentBuilder.core.js";

/**
 * Creates a markdown document.
 */
export function createMarkdownDocument(
  id: string,
  title: string,
  markdown: string,
  options?: DocumentBuilderExtras,
): DocumentationDocument {
  return createDocument({
    ...options,
    id,
    title,
    content: { type: "markdown", value: markdown },
  });
}

/**
 * Creates a structured document from AST nodes.
 */
export function createStructuredDocument(
  id: string,
  title: string,
  nodes: readonly DocumentationNode[],
  options?: DocumentBuilderExtras,
): DocumentationDocument {
  return createDocument({
    ...options,
    id,
    title,
    content: { type: "structured", nodes },
  });
}
