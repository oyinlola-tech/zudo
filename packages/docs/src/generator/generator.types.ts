/**
 * Type definitions for documentation generators.
 */

import type { DocumentationSanitizer } from "../docsTypes/index.js";
import type { DocumentVisibilityFilter } from "../registry/registry.core.js";

/**
 * Options for markdown generation.
 */
export interface MarkdownGeneratorOptions {
  readonly includeFrontmatter?: boolean;
  readonly includeMeta?: boolean;
  /**
   * Applied to `html` and `mdx` content before it is emitted. Markdown
   * and structured content are not passed through the sanitizer.
   */
  readonly sanitizer?: DocumentationSanitizer;
}

/**
 * Options for JSON index generation.
 */
export interface IndexGeneratorOptions {
  /**
   * Which documents to include. Defaults to `"CLIENT"` so that
   * `visibility: "SERVER"` documents never reach a client-side index
   * unless explicitly requested with `"ALL"` or `"SERVER"`.
   */
  readonly visibility?: DocumentVisibilityFilter;
}
