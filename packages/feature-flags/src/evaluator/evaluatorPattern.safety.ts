/**
 * Guards for the `matches` operator's regular expressions.
 *
 * Flag patterns run on the request path, synchronously, against attribute
 * values the client controls (email, user agent). JavaScript's backtracking
 * engine takes exponential time on a pattern such as `^(a+)+$`: 28 characters
 * cost over three seconds of blocked event loop. Such patterns are refused,
 * and the input a pattern runs against is capped.
 *
 * @module evaluator/evaluatorPattern.safety
 */

/** Longest attribute value a `matches` rule is tested against. */
export const MAX_MATCH_INPUT_LENGTH = 1024;

/**
 * Whether a repetition quantifier starts at `index`: `*`, `+` or `{n…}`.
 *
 * Bounded counts are included on purpose: `(.*a){20}` is polynomial of
 * degree twenty, which is no better in practice.
 */
function isRepetition(pattern: string, index: number): boolean {
  const char = pattern[index];
  if (char === "*" || char === "+") return true;
  return char === "{" && /^\{\d+(,\d*)?\}/.test(pattern.slice(index));
}

/**
 * Whether a pattern can backtrack catastrophically.
 *
 * Conservative: it refuses any repeated group that itself contains a
 * repetition or an alternation (`(a+)+`, `(a|aa)*`, `(\w+\s?){2,}`), and any
 * backreference. Patterns used for targeting — `@example\.com$`,
 * `^(beta|alpha)-` — contain neither.
 */
export function isUnsafePattern(pattern: string): boolean {
  if (/\\[1-9]|\\k</.test(pattern)) return true;

  const stack: boolean[] = [];
  let risky = false;
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      stack.push(risky);
      risky = false;
    } else if (char === ")") {
      const inner = risky;
      risky = stack.pop() ?? false;
      if (isRepetition(pattern, i + 1)) {
        if (inner) return true;
        risky = true;
      } else if (inner) {
        risky = true;
      }
    } else if (char === "|") {
      risky = true;
    } else if (isRepetition(pattern, i)) {
      risky = true;
    }
  }

  return false;
}
