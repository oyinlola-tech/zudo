/**
 * Markdown output generation for documentation documents.
 */

import type {
  DocumentationDocument,
  DocumentationContent,
  DocumentationSanitizer,
} from "../docsTypes/index.js";
import { formatScalar } from "../frontmatter/frontmatter.serializer.js";
import type { MarkdownGeneratorOptions } from "./generator.types.js";
import { nodesToMarkdown } from "./generatorMarkdownNodes.js";

/**
 * Generates a markdown string from a document.
 *
 * Frontmatter values are quoted whenever they could be misread
 * (newlines, `:`/`#`, leading `-`), so untrusted titles, descriptions
 * and tags cannot inject metadata keys or terminate the block.
 */
export function generateMarkdown(
  document: DocumentationDocument,
  options: MarkdownGeneratorOptions = {},
): string {
  const { includeFrontmatter = true, includeMeta = false, sanitizer } = options;
  const lines: string[] = [];

  if (includeFrontmatter) {
    lines.push("---");
    lines.push(`title: ${formatScalar(document.title)}`);

    if (document.description) {
      lines.push(`description: ${formatScalar(document.description)}`);
    }

    if (document.category) {
      lines.push(`category: ${formatScalar(document.category)}`);
    }

    if (document.tags && document.tags.length > 0) {
      lines.push("tags:");
      for (const tag of document.tags) {
        lines.push(`  - ${formatScalar(tag)}`);
      }
    }

    if (document.version) {
      lines.push(`version: ${formatScalar(document.version)}`);
    }

    if (document.status) {
      lines.push(`status: ${formatScalar(document.status)}`);
    }

    if (document.visibility) {
      lines.push(`visibility: ${formatScalar(document.visibility)}`);
    }

    if (document.deprecated !== undefined) {
      lines.push(`deprecated: ${formatScalar(document.deprecated)}`);
    }

    if (document.deprecatedMessage) {
      lines.push(`deprecatedMessage: ${formatScalar(document.deprecatedMessage)}`);
    }

    lines.push("---");
    lines.push("");
  }

  if (document.deprecated) {
    lines.push("> **DEPRECATED:**");
    if (document.deprecatedMessage) {
      lines.push(">");
      for (const line of document.deprecatedMessage.split(/\r?\n/)) {
        lines.push(`> ${line}`);
      }
    }
    lines.push("");
  }

  lines.push(contentToMarkdown(document.content, sanitizer));

  if (includeMeta && document.metadata) {
    lines.push("");
    lines.push("---");
    lines.push("");

    if (document.metadata.owner) {
      lines.push(`**Owner:** ${escapeInline(document.metadata.owner)}`);
    }

    if (document.metadata.updatedAt) {
      lines.push(`**Updated:** ${document.metadata.updatedAt.toISOString()}`);
    }
  }

  return lines.join("\n");
}

/**
 * Converts content to markdown string.
 */
function contentToMarkdown(
  content: DocumentationContent,
  sanitizer?: DocumentationSanitizer,
): string {
  switch (content.type) {
    case "markdown":
      return content.value;
    case "html":
    case "mdx":
      return sanitizer ? sanitizer.sanitize(content.value) : content.value;
    case "structured":
      return nodesToMarkdown(content.nodes);
  }
}

/** Collapses newlines so a value cannot break out of its line. */
function escapeInline(value: string): string {
  return value.replace(/\r?\n/g, " ");
}
