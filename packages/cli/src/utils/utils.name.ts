import { CLIValidationError } from "../errors/index.js";

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    // Trim leading/trailing dashes without the quadratic `-+$` scan: the
    // lookbehind pins each attempt to the start of a dash run.
    .replace(/^-+/, "")
    .replace(/(?<!-)-+$/, "");
}

/** Converts an arbitrary name to PascalCase (safe as a TS identifier). */
export function toPascalCase(name: string): string {
  return normalizeName(name)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Converts an arbitrary name to camelCase (safe as a TS identifier). */
export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
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
 */
export function assertGeneratableName(name: string, kind = "name"): string {
  const normalized = normalizeName(name);
  if (normalized === "") {
    throw new CLIValidationError(
      `Invalid ${kind}: "${name}". It must contain at least one letter or digit.`,
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
