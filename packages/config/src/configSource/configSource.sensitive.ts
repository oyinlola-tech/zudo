/**
 * Name- and value-based secret detection shared by every configuration
 * source.
 *
 * Only the environment source used to redact by name, so a `password` or
 * `api_key` supplied by a memory, defaults or custom source was printed in
 * clear by `toSafeObject()`, and even the environment pattern missed
 * `DATABASE_URL`-style connection strings and `*_KEY` names.
 */

/**
 * Key names treated as secrets. Matched case-insensitively against the
 * whole dotted key, so any path segment can trigger it.
 */
const SENSITIVE_KEY_PATTERN =
  /(pass(word|wd)?|secret|token|api[_.-]?key|private[_.-]?key|credential|auth|dsn|database[_.-]?url|connection[_.-]?string|(^|[_.-])key$|(^|[_.-])key[_.-])/i;

/** `scheme://user:password@host` — a URL with embedded credentials. */
const CREDENTIAL_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]*@/i;

/** Nesting bound for {@link isSensitiveConfigValue}. */
const MAX_SCAN_DEPTH = 32;

/**
 * Returns whether a configuration key names a secret (passwords, tokens,
 * API/private keys, credentials, DSNs, database URLs, `*_key`).
 */
export function isSensitiveConfigKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Returns whether a configuration value holds a secret: a string URL with
 * embedded `user:password@` credentials, or a nested object with a key that
 * {@link isSensitiveConfigKey} flags anywhere inside it.
 */
export function isSensitiveConfigValue(value: unknown): boolean {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value, depth: 0 },
  ];
  while (pending.length > 0) {
    const next = pending.pop()!;
    const current = next.value;
    if (typeof current === "string") {
      if (CREDENTIAL_URL_PATTERN.test(current)) return true;
      continue;
    }
    if (typeof current !== "object" || current === null) continue;
    if (next.depth >= MAX_SCAN_DEPTH || current instanceof Date) continue;
    const entries = Array.isArray(current)
      ? current.map((item, index) => [String(index), item] as const)
      : Object.entries(current as Record<string, unknown>);
    for (const [key, child] of entries) {
      if (!Array.isArray(current) && isSensitiveConfigKey(key)) return true;
      pending.push({ value: child, depth: next.depth + 1 });
    }
  }
  return false;
}

/**
 * Whether an entry loaded under `key` with `value` must be marked
 * sensitive.
 */
export function isSensitiveConfigEntry(key: string, value: unknown): boolean {
  return isSensitiveConfigKey(key) || isSensitiveConfigValue(value);
}
