/**
 * Markdown → plain text, in linear time.
 *
 * `stripMarkdown` is exported for building search excerpts, so it sees
 * untrusted input. The previous version used `\s` inside `m`-flag line
 * regexes; there `\s` also matches `\n`, and adjacent `\s*` runs let the
 * engine split one whitespace run in O(n²) ways from each of n line starts
 * (2 KB of newlines took ~6 s). Every pattern here is unambiguous: line
 * patterns use `[ \t]` only, no two quantifiers compete for the same
 * characters, and bracketed spans cannot contain their own opener, so each
 * start position scans only up to the next opener.
 */

/** HTML tags. `[^<>\n]` stops at the next `<`, so `<a<a<a…` stays linear. */
const HTML_TAG = /<\/?[a-zA-Z][^<>\n]*>/g;

/**
 * Removes HTML tags until the result stops changing. A single pass is not
 * enough: stripping the inner tag of `<<b>b>x` re-forms `<b>x`.
 */
export function stripHtmlTags(text: string): string {
  let current = text;
  let previous: string;
  do {
    previous = current;
    current = current.replace(HTML_TAG, "");
  } while (current !== previous);
  return current;
}

/**
 * Drops the outer pipes of table rows, then turns each inner separator (a
 * run of spaces/tabs/pipes that holds a pipe) into one space.
 */
function unpipeCells(text: string): string {
  return text
    .replace(/^[ \t]*\|[ \t]*/gm, "")
    .replace(/\|[ \t]*$/gm, "")
    .replace(/[ \t|]+/g, (run) => (run.includes("|") ? " " : run));
}

/** A table separator row such as `| --- | :-: |`. */
const TABLE_SEPARATOR =
  /^[ \t]*(?:\|[ \t]*)?:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*(?:\|[ \t]*)?$/gm;

/**
 * Closing ATX hashes (`# Title ##`). The lookbehind anchors each attempt at
 * the start of a hash run, so a long run not at line end is scanned once.
 */
function stripClosingHashes(text: string): string {
  return text.replace(
    /(?<!#)#+[ \t]*$/gm,
    (hashes, offset: number, whole: string) => {
      const before = whole[offset - 1];
      return before === " " || before === "\t" ? "" : hashes;
    },
  );
}

/** Trailing spaces/tabs on each line, removed with a single linear pass. */
function trimLineEnds(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/**
 * Strips markdown formatting to plain text.
 */
export function stripMarkdown(markdown: string): string {
  const withoutFences = markdown.replace(
    /^(`{3,}(?!`)|~{3,}(?!~))[^\n]*\n([\s\S]*?)^\1[^\n]*$/gm,
    "$2",
  );
  const text = stripHtmlTags(withoutFences)
    // images before links; text and target cannot contain their own opener
    .replace(/!\[([^[\]\n]*)\]\([^()\n]*\)/g, "$1")
    .replace(/\[([^[\]\n]+)\]\([^()\n]+\)/g, "$1")
    // headings
    .replace(/^#{1,6}[ \t]+/gm, "");
  return trimLineEnds(
    unpipeCells(
      stripClosingHashes(text)
        // emphasis (bold before italic); spans cannot hold their delimiter
        .replace(/\*\*((?:[^*\n]|\*(?!\*))+)\*\*/g, "$1")
        .replace(/__((?:[^_\n]|_(?!_))+)__/g, "$1")
        .replace(/\*([^*\n]+)\*/g, "$1")
        .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/gm, "$1$2")
        .replace(/~~([^~\n]+)~~/g, "$1")
        // inline code
        .replace(/`([^`\n]+)`/g, "$1")
        // blockquotes, list markers
        .replace(/^[ \t]*>[ \t]?/gm, "")
        .replace(/^[ \t]*[-*+][ \t]+/gm, "")
        .replace(/^[ \t]*\d+\.[ \t]+/gm, "")
        // tables: drop separator rows, then unpipe cells
        .replace(TABLE_SEPARATOR, "")
        // horizontal rules
        .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ""),
    ),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
