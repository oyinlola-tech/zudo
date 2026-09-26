/**
 * Provider and source loader types for documentation.
 *
 * Providers abstract where documentation comes from.
 * Source loaders abstract how documentation is read.
 */

import type { DocumentationDocument } from "./documentationDocument.js";

/** A provider that supplies documentation documents. */
export interface DocumentationProvider {
  get(id: string): DocumentationDocument | undefined;
  getAll(): readonly DocumentationDocument[];
}

/**
 * Loads content from a documentation source. A contract only: no loader
 * ships with the package; implement it over the file system, a fetch or
 * a database and pass the result to `parseFrontmatter` / `createDocument`.
 */
export interface DocumentationSourceLoader {
  load(source: string): Promise<string>;
}

/** Sanitizer for rendered content (HTML, MDX). */
export interface DocumentationSanitizer {
  sanitize(content: string): string;
}
