/**
 * Frontmatter module — re-exports from focused files.
 */

export { parseFrontmatter } from "./frontmatter.parser.js";
export { serializeFrontmatter } from "./frontmatter.serializer.js";
export type {
  ParsedFrontmatter,
  FrontmatterMetadata,
  FrontmatterScalar,
  FrontmatterValue,
} from "./frontmatter.types.js";
