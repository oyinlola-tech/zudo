/**
 * Utility helpers for the documentation package.
 */

/** Characters allowed in one segment of a document ID. */
const ID_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Returns true when `id` is a stable dot-separated identifier such as
 * `guides.http.routing`: non-empty segments of letters, digits, `_`
 * and `-`, with no whitespace or empty segments.
 */
export function isValidDocumentId(id: string): boolean {
  if (typeof id !== "string" || id.length === 0) return false;
  return id.split(".").every((segment) => ID_SEGMENT.test(segment));
}

/**
 * Normalizes a document ID to a consistent format.
 * Trims whitespace, collapses consecutive dots and strips leading/trailing dots.
 */
export function normalizeDocumentId(id: string): string {
  return id
    .trim()
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

/**
 * Generates a document ID from a file path.
 * Converts path separators to dots and removes the extension of the
 * final segment only (`guides/v1.2/routing.md` → `guides.v1.2.routing`).
 * Returns an empty string when the path has no usable segment
 * (e.g. `.gitignore`).
 */
export function documentIdFromPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalizedPath.split("/").filter((s) => s.length > 0);

  if (segments.length === 0) return "";

  const last = segments[segments.length - 1] ?? "";
  const stem = last.replace(/\.[^.]+$/, "");

  if (stem.length === 0) return "";

  segments[segments.length - 1] = stem;

  return normalizeDocumentId(segments.join("."));
}

/**
 * Resolves a relative document link against a base ID.
 * "guides.http" + "./routing" → "guides.http.routing"
 *
 * Fragments (`#section`), `.md`/`.mdx` extensions and Windows
 * separators are stripped before resolving.
 */
export function resolveDocumentLink(baseId: string, link: string): string {
  const cleaned = stripLinkDecorations(link);

  if (cleaned.startsWith("/")) {
    return normalizeDocumentId(cleaned.slice(1).replace(/\//g, "."));
  }

  const baseParts = baseId.split(".").filter((p) => p.length > 0);
  baseParts.pop();

  const linkParts = cleaned.split("/");

  for (const part of linkParts) {
    if (part === "..") {
      baseParts.pop();
    } else if (part !== "." && part !== "") {
      baseParts.push(part);
    }
  }

  return normalizeDocumentId(baseParts.join("."));
}

/**
 * Removes a `#fragment`, a trailing `.md`/`.mdx` extension and
 * converts `\` to `/` in a link target.
 */
export function stripLinkDecorations(link: string): string {
  const withoutFragment = link.split("#")[0] ?? "";
  return withoutFragment.replace(/\\/g, "/").replace(/\.mdx?$/i, "");
}

/**
 * Removes fenced code blocks (``` or ~~~) from markdown so that
 * headings and links inside them are not interpreted.
 */
export function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
}

/**
 * Extracts the title from markdown content (first level-1 heading
 * outside fenced code blocks).
 */
export function extractTitleFromMarkdown(markdown: string): string | undefined {
  const match = stripFencedCodeBlocks(markdown).match(/^# ([^\n]+)$/m);
  return match?.[1] ? cleanHeadingText(match[1]) : undefined;
}

/**
 * Extracts headings from markdown content (outside fenced code blocks).
 */
export function extractHeadings(
  markdown: string,
): readonly { level: number; text: string }[] {
  const results: { level: number; text: string }[] = [];
  const pattern = /^(#{1,6}) ([^\n]+)$/gm;
  const source = stripFencedCodeBlocks(markdown);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const hashes = match[1];
    const headingText = match[2];

    if (hashes && headingText) {
      results.push({
        level: hashes.length,
        text: cleanHeadingText(headingText),
      });
    }
  }

  return Object.freeze(results);
}

/** Trims a heading and removes ATX closing hashes (`# Title #`). */
function cleanHeadingText(text: string): string {
  return text.replace(/\s+#+\s*$/, "").trim();
}

/**
 * Strips markdown formatting to plain text.
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // fenced code blocks: keep the code, drop the fences
      .replace(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1[^\n]*$/gm, "$2")
      // html tags
      .replace(/<\/?[a-zA-Z][^>\n]*>/g, "")
      // images before links
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // headings
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s+#+\s*$/gm, "")
      // emphasis (bold before italic, non-greedy)
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, "$1$2")
      .replace(/~~(.+?)~~/g, "$1")
      // inline code
      .replace(/`([^`]+)`/g, "$1")
      // blockquotes, list markers
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      // tables: drop separator rows, unpipe cells
      .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, "")
      .replace(/^\s*\|/gm, "")
      .replace(/\|\s*$/gm, "")
      .replace(/\s*\|\s*/g, " ")
      // horizontal rules
      .replace(/^\s*([-*_]\s*){3,}$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
