import { CLIValidationError } from "../errors/index.js";

export function normalizeName(name: string): string {
  return name
    .trim()
    // Split camelCase and acronym boundaries before lowercasing, so
    // `createBook` becomes `create-book` (class `CreateBookCommand`) rather
    // than `createbook` (`CreatebookCommand`), and `HTTPServer` becomes
    // `http-server`.
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    // Trim leading/trailing dashes without the quadratic `-+$` scan: the
    // lookbehind pins each attempt to the start of a dash run.
    .replace(/^-+/, "")
    .replace(/(?<!-)-+$/, "");
}

/**
 * Prefixes an underscore when the first character cannot start a TypeScript
 * identifier.
 *
 * `normalizeName` keeps digits, so `2fa` came out of the converters as `2fa`
 * and was emitted verbatim as a class name — a syntax error in the generated
 * file, and in every barrel and `app.ts` that imports it. Generators reject
 * such a name up front (see {@link assertGeneratableName}); this is the
 * last-resort guarantee for the callers that do not, such as the project
 * templates rendering `--services 2fa`.
 */
function toIdentifier(value: string): string {
  return /^[0-9]/.test(value) ? `_${value}` : value;
}

/** Converts an arbitrary name to PascalCase (safe as a TS identifier). */
export function toPascalCase(name: string): string {
  return toIdentifier(
    normalizeName(name)
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(""),
  );
}

/** Converts an arbitrary name to camelCase (safe as a TS identifier). */
export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return toIdentifier(pascal.charAt(0).toLowerCase() + pascal.slice(1));
}

/**
 * Pattern for names that may be used verbatim as a path segment
 * (`--service`, `--module`, manifest service entries).
 */
export const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Validates a name that a generator will normalize into file paths and
 * identifiers.
 *
 * `normalizeName` strips everything outside `[a-z0-9-]`, so a name such as
 * `"..."` or `"!!!"` collapses to the empty string and the generator writes
 * `src//.event.ts` with an anonymous exported class. Reject it up front.
 *
 * A name whose normalized form starts with a digit (`2fa`, `401-handler`) is
 * rejected for the same reason: it becomes a class name, and `2faModule` is
 * not a TypeScript identifier. The generated file, the barrel it is appended
 * to and the `app.ts` it is registered in would all stop compiling, and the
 * appends mean the overwrite guard cannot undo it. The converters would
 * rather rename it to `_2faModule`, but a class whose name no longer contains
 * the name that was asked for — and disagrees with its own file name — is a
 * worse surprise than a one-line failure the author can act on.
 */
export function assertGeneratableName(name: string, kind = "name"): string {
  const normalized = normalizeName(name);
  if (normalized === "") {
    throw new CLIValidationError(
      `Invalid ${kind}: "${name}". It must contain at least one letter or digit.`,
    );
  }
  if (/^[0-9]/.test(normalized)) {
    throw new CLIValidationError(
      `Invalid ${kind}: "${name}". It must start with a letter: the name becomes a TypeScript class name, and "${normalized}" is not a valid identifier. Try "two-factor-auth" instead of "2fa".`,
    );
  }
  return normalized;
}

/**
 * Validates a value that is interpolated verbatim into a generated file path.
 *
 * Unlike {@link assertGeneratableName} this does not normalize: the value is
 * used as-is, so `..` or a path separator here would let a generator write
 * outside its base path.
 */
export function assertSafePathSegment(value: string, kind = "value"): string {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new CLIValidationError(
      `Invalid ${kind}: "${value}". Only alphanumeric characters, hyphens, and underscores are allowed.`,
    );
  }
  return value;
}
