/**
 * @zudojs/security — HTML entity decoding for the XSS heuristic.
 *
 * Browsers decode character references in attribute values before they
 * interpret a URL, and they drop tabs and newlines inside a scheme. A regex
 * run over the raw text therefore missed `jav&#x61;script:`,
 * `&#106;avascript:`, `javascript&colon;` and `java&#x09;script:`.
 */

/** Named references that matter for smuggling a scheme or a tag. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  colon: ":",
  tab: "\t",
  newline: "\n",
  lpar: "(",
  rpar: ")",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
  sol: "/",
  bsol: "\\",
  period: ".",
  equals: "=",
  nbsp: " ",
});

/** Rounds of decoding, so `&amp;#106;` is unwrapped too. */
const MAX_ROUNDS = 3;

const ENTITY_PATTERN = /&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]{2,10}));?/g;

function decodeOnce(input: string): string {
  return input.replace(
    ENTITY_PATTERN,
    (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      const code =
        dec !== undefined
          ? Number.parseInt(dec, 10)
          : hex !== undefined
            ? Number.parseInt(hex, 16)
            : undefined;
      if (code !== undefined) {
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      const named = name === undefined ? undefined : NAMED_ENTITIES[name.toLowerCase()];
      return named ?? match;
    },
  );
}

/**
 * Decodes numeric (`&#106;`, `&#x6a;`, with or without the trailing `;`)
 * and the relevant named character references, repeatedly, up to three
 * rounds.
 *
 * @param input - Raw text.
 * @returns The decoded text (unchanged when it holds no references).
 */
export function decodeHtmlEntities(input: string): string {
  let current = input;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * True when a script-capable URL scheme appears once whitespace and control
 * characters are removed, as a browser removes them when parsing a URL.
 *
 * @param decoded - Text that has already been entity-decoded.
 */
export function containsObfuscatedScheme(decoded: string): boolean {
  const compact = decoded.replace(/[\u0000- \u007f- ]+/g, "");
  return /(?:javascript|vbscript|livescript):|data:text\/html/i.test(compact);
}
