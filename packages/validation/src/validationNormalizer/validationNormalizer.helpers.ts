/**
 * String normalization helpers.
 */

/** Trims leading and trailing whitespace. */
export function normalizeTrim(value: string): string {
  return value.trim();
}

/** Converts consecutive whitespace characters into a single space. */
export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

/** Converts a string to lowercase. */
export function normalizeLowercase(value: string): string {
  return value.toLowerCase();
}

/** Converts a string to uppercase. */
export function normalizeUppercase(value: string): string {
  return value.toUpperCase();
}

/** Normalizes Unicode text using NFC normalization. */
export function normalizeUnicode(value: string): string {
  return value.normalize("NFC");
}

/**
 * Normalizes Unicode text using NFKC, folding compatibility forms.
 *
 * Use this wherever the result identifies something. NFC is canonical only:
 * it leaves ligatures and fullwidth forms distinct from their ASCII
 * spellings, so two visually identical identifiers survive as two values.
 */
export function normalizeUnicodeCompatibility(value: string): string {
  return value.normalize("NFKC");
}

/**
 * Case-folds a string for identifier comparison.
 *
 * `toLowerCase` is a locale-sensitive display transform. Folding through
 * upper- then lower-case is the closest stable approximation available
 * without ICU, and is what identifier comparison needs.
 */
export function foldCase(value: string): string {
  return value.toUpperCase().toLowerCase();
}

/**
 * Normalizes an email address.
 *
 * Only the domain is lowercased. The local part is case-sensitive per RFC
 * 5321, and folding it can merge two distinct mailboxes.
 */
export function normalizeEmail(value: string): string {
  const trimmed = normalizeUnicodeCompatibility(normalizeWhitespace(value));
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;

  return `${trimmed.slice(0, at)}@${foldCase(trimmed.slice(at + 1))}`;
}

/** Normalizes a URL by removing surrounding whitespace. */
export function normalizeUrl(value: string): string {
  return normalizeWhitespace(normalizeUnicode(value));
}

/**
 * Normalizes an identifier by trimming, compatibility-folding and case-folding.
 *
 * The output identifies an account or a resource, so it uses NFKC and a case
 * fold rather than NFC and `toLowerCase`: otherwise two spellings that render
 * identically normalize to two different identifiers.
 */
export function normalizeIdentifier(value: string): string {
  return foldCase(normalizeWhitespace(normalizeUnicodeCompatibility(value)));
}

/** Removes surrounding quotes from a string. */
export function normalizeQuotes(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

/** Removes Unicode byte-order marks from the beginning of text. */
export function removeBom(value: string): string {
  return value.replace(/^\uFEFF/u, "");
}

/**
 * Normalizes an array by applying a normalizer to every item.
 *
 * The normalizer is invoked with the value only. Passing it straight to `map`
 * would also hand it the index and the array, which silently overrides the
 * optional second parameter of functions like `parseInt`.
 */
export function normalizeArray<T>(
  values: readonly T[],
  normalizer: (value: T) => T,
): T[] {
  return values.map((value) => normalizer(value));
}

/** Normalizes an array asynchronously. */
export async function normalizeArrayAsync<T>(
  values: readonly T[],
  normalizer: (value: T) => T | Promise<T>,
): Promise<T[]> {
  return Promise.all(values.map((value) => normalizer(value)));
}

/** Composes multiple normalizers into one. */
export function composeNormalizers<T>(
  ...normalizers: readonly ((value: T) => T)[]
): (value: T) => T {
  return (value: T): T => {
    let current = value;
    for (const normalizer of normalizers) current = normalizer(current);
    return current;
  };
}

/** Creates a normalizer that only changes a value when the predicate returns true. */
export function conditionalNormalizer<T>(
  predicate: (value: T) => boolean,
  normalizer: (value: T) => T,
): (value: T) => T {
  return (value: T): T => (predicate(value) ? normalizer(value) : value);
}

/** Normalizes an optional string. */
export function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return normalizeWhitespace(normalizeUnicode(value));
}

/** Normalizes a nullable string. */
export function normalizeNullableString(value: string | null): string | null {
  if (value === null) return null;
  return normalizeWhitespace(normalizeUnicode(value));
}

/** Normalizes an optional nullable string. */
export function normalizeOptionalNullableString(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  return normalizeWhitespace(normalizeUnicode(value));
}
