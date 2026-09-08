/**
 * JSON output generation for documentation documents.
 */

import type { DocumentationDocument } from "../docsTypes/index.js";
import { matchesVisibility } from "../registry/registry.core.js";
import type { IndexGeneratorOptions } from "./generator.types.js";

/**
 * Generates a JSON representation of a document, including its
 * `visibility`, `deprecated` and `deprecatedMessage` fields.
 */
export function generateJSON(
  document: DocumentationDocument,
): Record<string, unknown> {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    category: document.category,
    tags: document.tags,
    version: document.version,
    status: document.status,
    visibility: document.visibility,
    deprecated: document.deprecated,
    deprecatedMessage: document.deprecatedMessage,
    content: document.content,
    metadata: document.metadata,
  };
}

/**
 * Generates a JSON index for a set of documents.
 *
 * By default only client-visible documents are included (see
 * `IndexGeneratorOptions.visibility`).
 */
export function generateIndex(
  documents: readonly DocumentationDocument[],
  options: IndexGeneratorOptions = {},
): Record<string, unknown>[] {
  const filter = options.visibility ?? "CLIENT";

  return documents
    .filter((doc) => matchesVisibility(doc, filter))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      tags: doc.tags,
      version: doc.version,
      status: doc.status,
      visibility: doc.visibility,
      deprecated: doc.deprecated,
      deprecatedMessage: doc.deprecatedMessage,
    }));
}
