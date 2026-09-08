/**
 * @zudojs/docs/generator
 *
 * Output generators — markdown and JSON for documentation.
 */

export { generateMarkdown } from "./generatorMarkdown.core.js";
export {
  nodesToMarkdown,
  clampHeadingLevel,
  fenceFor,
  sanitizeLanguage,
  tableCell,
} from "./generatorMarkdownNodes.js";
export { generateJSON, generateIndex } from "./generatorJson.core.js";

export type {
  MarkdownGeneratorOptions,
  IndexGeneratorOptions,
} from "./generator.types.js";
