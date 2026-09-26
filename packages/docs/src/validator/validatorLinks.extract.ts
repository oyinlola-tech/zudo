/**
 * Extracts link targets from markdown in every form a renderer turns into
 * a live link: inline `[text](target)`, reference definitions
 * `[label]: target`, raw HTML `href` attributes and `<scheme:…>` autolinks.
 *
 * Every scanner is linear in the input length, so hostile documents
 * (a 99 KB run of `[`, `(` or `<`) are scanned in milliseconds.
 *
 * @module validator/validatorLinks.extract
 */

/** A link target found in markdown. */
export interface ExtractedLink {
  /** The raw target, without `<…>` wrapping. */
  readonly target: string;
  /** True for `![alt](target)` images, which are never validated. */
  readonly isImage: boolean;
}

/** `[text](` or `![alt](`; link text has no `[`, `]` or newline. */
const INLINE_HEAD = /(!?)\[[^[\]\n]*\]\(/g;

/** `[label]: target` at line start; target is `<…>` or non-whitespace. */
const REFERENCE_DEFINITION = /^[ \t]{0,3}\[[^\]\n]*\]:[ \t]*(<[^<>\n]*>|\S+)/gm;

/** A raw HTML tag on one line. `[^<>\n]` keeps a run of `<` linear. */
const HTML_TAG = /<[a-zA-Z][^<>\n]*>/g;

/** `href=` inside a tag: double-quoted, single-quoted or bare. */
const HREF_ATTRIBUTE = /\bhref[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;

/** A CommonMark autolink: `<scheme:rest>` with no whitespace. */
const AUTOLINK = /^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>$/;

/**
 * Returns every distinct link target in `source`, in order of first
 * appearance. `source` must already have fenced code blocks and inline
 * code spans removed. A target found by two scanners (`[x](<t>)` is both
 * an inline link and an autolink) is returned once.
 */
export function extractLinkTargets(source: string): readonly ExtractedLink[] {
  const links: ExtractedLink[] = [];

  extractInlineLinks(source, links);
  extractReferenceDefinitions(source, links);
  extractHtmlLinks(source, links);

  const seen = new Set<string>();

  return links.filter((link) => {
    const key = `${link.isImage ? "!" : ""}${link.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractInlineLinks(source: string, out: ExtractedLink[]): void {
  INLINE_HEAD.lastIndex = 0;
  let head: RegExpExecArray | null;

  while ((head = INLINE_HEAD.exec(source)) !== null) {
    const isImage = head[1] === "!";
    const target = readInlineTarget(source, head.index + head[0].length);

    if (target !== "") out.push({ target, isImage });
  }
}

/**
 * Reads the destination that follows `](`: either `<…>` wrapped, or a run
 * of non-whitespace characters in which parentheses must balance, ending
 * at the first unmatched `)`. A bare destination also stops at `[`, so a
 * link nested in an unclosed one (`[a]([b](javascript:x)`) is still found
 * on its own and no character is scanned by two heads.
 */
function readInlineTarget(source: string, start: number): string {
  let index = start;

  while (index < source.length && (source[index] === " " || source[index] === "\t")) {
    index += 1;
  }

  if (source[index] === "<") {
    const close = source.indexOf(">", index + 1);
    const newline = source.indexOf("\n", index + 1);

    if (close !== -1 && (newline === -1 || close < newline)) {
      return source.slice(index + 1, close);
    }
  }

  let depth = 0;
  const targetStart = index;

  while (index < source.length) {
    const char = source[index] ?? "";

    if (char === "[" || /\s/.test(char)) break;
    if (char === "(") depth += 1;
    if (char === ")") {
      if (depth === 0) break;
      depth -= 1;
    }
    index += 1;
  }

  return source.slice(targetStart, index);
}

function extractReferenceDefinitions(source: string, out: ExtractedLink[]): void {
  for (const match of source.matchAll(REFERENCE_DEFINITION)) {
    const raw = match[1] ?? "";
    const target =
      raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;

    if (target !== "") out.push({ target, isImage: false });
  }
}

function extractHtmlLinks(source: string, out: ExtractedLink[]): void {
  for (const match of source.matchAll(HTML_TAG)) {
    const tag = match[0];
    const autolink = AUTOLINK.exec(tag);

    if (autolink) {
      out.push({ target: autolink[1] ?? "", isImage: false });
      continue;
    }

    const href = HREF_ATTRIBUTE.exec(tag);

    if (!href) continue;

    const target = href[1] ?? href[2] ?? href[3] ?? "";

    if (target !== "") out.push({ target, isImage: false });
  }
}

/**
 * Blanks out inline code spans so links inside them are ignored. The
 * lookarounds anchor each attempt at a whole backtick run, so a long run is
 * not re-scanned from every position inside it.
 */
export function stripInlineCode(markdown: string): string {
  return markdown.replace(/(?<!`)(`+)(?![`\n])[\s\S]*?(?<!`)\1(?!`)/g, (m) =>
    " ".repeat(m.length),
  );
}
