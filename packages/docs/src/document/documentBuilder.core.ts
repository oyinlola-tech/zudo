/**
 * Fluent builder for creating documentation documents.
 *
 * Provides a chainable API that validates inputs and
 * produces immutable DocumentationDocument objects.
 */

import { DocumentValidationError } from "@zudojs/errors";

import type {
  DocumentationContent,
  DocumentationDocument,
  DocumentationCategory,
  DocumentationMetadata,
  DocumentationNode,
  DocumentationStatus,
} from "../docsTypes/index.js";
import { deepFreezeClone } from "../utils/utils.freeze.js";
import { isValidDocumentId } from "../utils/utils.helper.js";

/**
 * Options for creating a document via the builder.
 */
export interface DocumentBuilderOptions {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly content: DocumentationContent;
  readonly category?: DocumentationCategory;
  readonly tags?: readonly string[];
  readonly version?: string;
  readonly status?: DocumentationStatus;
  readonly metadata?: DocumentationMetadata;
  readonly deprecated?: boolean;
  readonly deprecatedMessage?: string;
  readonly visibility?: "SERVER" | "CLIENT";
}

/**
 * Options accepted by the convenience builders. The positional
 * arguments (`id`, `title`, content) always win over these.
 */
export type DocumentBuilderExtras = Omit<
  Partial<DocumentBuilderOptions>,
  "id" | "title" | "content"
>;

/**
 * Creates a documentation document from structured options.
 *
 * The returned document is a deep-frozen copy: later mutation of the
 * options object (or of nested `content`, `metadata`, `tags`) does not
 * affect it.
 *
 * @throws {DocumentValidationError} when `id`, `title` or `content` is missing
 *   or the ID is not a valid dot-separated identifier.
 *
 * @example
 * ```ts
 * const doc = createDocument({
 *   id: "guides.http.routing",
 *   title: "HTTP Routing",
 *   content: { type: "markdown", value: "# Routing\n\n..." },
 *   category: "guide",
 *   tags: ["http", "routing"],
 * });
 * ```
 */
export function createDocument(
  options: DocumentBuilderOptions,
): DocumentationDocument {
  validateDocumentOptions(options);

  const document: DocumentationDocument = {
    id: options.id,
    title: options.title,
    description: options.description,
    content: options.content,
    category: options.category,
    tags: options.tags ? [...options.tags] : undefined,
    version: options.version,
    status: options.status,
    metadata: options.metadata,
    deprecated: options.deprecated,
    deprecatedMessage: options.deprecatedMessage,
    visibility: options.visibility,
  };

  return deepFreezeClone(document);
}

/**
 * Validates document builder options.
 * Throws on invalid input.
 */
function validateDocumentOptions(options: DocumentBuilderOptions): void {
  if (typeof options.id !== "string" || options.id.trim().length === 0) {
    throw new DocumentValidationError("Document ID is required.");
  }

  if (!isValidDocumentId(options.id)) {
    throw new DocumentValidationError(
      `Document ID "${options.id}" is invalid. Use dot-separated segments of letters, digits, "_" and "-".`,
      options.id,
    );
  }

  if (
    typeof options.title !== "string" ||
    options.title.trim().length === 0
  ) {
    throw new DocumentValidationError(
      "Document title is required.",
      options.id,
    );
  }

  if (!options.content || typeof options.content !== "object") {
    throw new DocumentValidationError(
      "Document content is required.",
      options.id,
    );
  }
}

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
