/**
 * @zudojs/docs/frontmatter
 *
 * YAML frontmatter parsing and serialization for markdown documentation.
 */

export { parseFrontmatter, serializeFrontmatter } from "./frontmatter.core.js";

export type {
  ParsedFrontmatter,
  FrontmatterMetadata,
  FrontmatterScalar,
  FrontmatterValue,
} from "./frontmatter.core.js";
