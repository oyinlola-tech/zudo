/**
 * Type definitions for frontmatter parsing.
 */

/**
 * Parsed frontmatter result.
 */
export interface ParsedFrontmatter {
  readonly metadata: FrontmatterMetadata;
  readonly content: string;
}

/** Scalar value produced by the frontmatter parser. */
export type FrontmatterScalar = string | number | boolean | null;

/** Any value the frontmatter parser can produce for a key. */
export type FrontmatterValue =
  | FrontmatterScalar
  | readonly FrontmatterScalar[]
  | Readonly<Record<string, FrontmatterScalar>>;

/**
 * Metadata extracted from frontmatter.
 *
 * The named keys below are always returned with the declared type
 * (`version: 1.0` parses to the string `"1.0"`, `tags` items are
 * strings). Unknown keys receive the parser's best-effort scalar,
 * list, or one-level mapping.
 */
export interface FrontmatterMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly version?: string;
  readonly status?: string;
  readonly deprecated?: boolean;
  readonly deprecatedMessage?: string;
  readonly visibility?: string;
  readonly [key: string]: FrontmatterValue | undefined;
}
