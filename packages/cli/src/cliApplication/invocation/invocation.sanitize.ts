/**
 * zudojs-cli — Terminal-Safe Text
 *
 * Neutralises control characters in text that echoes user input back to
 * the terminal.
 */

/**
 * C0 and C1 control characters other than tab and newline, plus the Unicode
 * bidirectional overrides that can make a line read differently from what
 * it contains.
 */
const UNSAFE_CHARACTERS =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/**
 * Replaces terminal control characters with a visible escape.
 *
 * Error messages quote what the user passed (`Command "…" was not found.`,
 * `Unknown or invalid option "…"`). An argument carrying ESC sequences —
 * from a script that forwards untrusted input — could otherwise recolour
 * the terminal, rewrite its title, hide text or emit OSC 8 links. The
 * escaped form (`\x1b`) still shows the user what was received.
 *
 * @param text - Text about to be written to the terminal.
 */
export function escapeControlCharacters(text: string): string {
  return text.replace(UNSAFE_CHARACTERS, (character) => {
    const code = character.codePointAt(0)!;
    return code <= 0xff
      ? `\\x${code.toString(16).padStart(2, "0")}`
      : `\\u${code.toString(16).padStart(4, "0")}`;
  });
}
