/**
 * Fluent builder for creating documentation documents.
 *
 * Provides a chainable API that validates inputs and
 * produces immutable DocumentationDocument objects.
 */

import type {
  DocumentationContent,
  DocumentationDocument,
  DocumentationCategory,
  DocumentationMetadata,
  DocumentationStatus,
} from "../docsTypes/index.js";
import { deepFreezeClone } from "../utils/utils.freeze.js";
import { toTagList, withoutUndefined } from "./documentBuilder.normalize.js";
import { assertValid, validateDocumentOptions } from "./documentBuilder.validate.js";

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
  /**
   * When true, the built document is also run through `validateDocument`
   * and any error issue (unknown `category`, `status`, `visibility`,
   * content type or structured node) throws a `DocumentValidationError`.
   * Defaults to false: the builder checks only `id`, `title` and the
   * presence of `content`, matching earlier releases.
   */
  readonly strict?: boolean;
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
 * affect it. Optional fields that were not supplied are absent from the
 * document rather than present as `undefined`.
 *
 * Only `id`, `title` and `content` are checked here; `category`, `status`
 * and the other enums are checked by `validateDocument`, or at creation
 * time when `strict: true` is passed.
 *
 * @throws {DocumentValidationError} when `id`, `title` or `content` is missing,
 *   the ID is not a valid dot-separated identifier, or (`strict: true`)
 *   `validateDocument` reports an error.
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

  const document: DocumentationDocument = withoutUndefined({
    id: options.id,
    title: options.title,
    description: options.description,
    content: options.content,
    category: options.category,
    tags: toTagList(options.tags as readonly string[] | string | undefined),
    version: options.version,
    status: options.status,
    metadata: options.metadata,
    deprecated: options.deprecated,
    deprecatedMessage: options.deprecatedMessage,
    visibility: options.visibility,
  });

  if (options.strict) {
    assertValid(document);
  }

  return deepFreezeClone(document);
}
