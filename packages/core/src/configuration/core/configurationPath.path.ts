import { ConfigurationPathError } from "../error/configurationError.error.js";

/**
 * Shared configuration path normalization.
 *
 * This is the single canonical implementation used by the
 * configuration container, keys, schemas, and registry.
 *
 * Paths are trimmed. Paths that still contain whitespace after
 * trimming are rejected instead of silently rewritten, because
 * silently stripping whitespace can turn a typo into a lookup
 * for a completely different configuration value.
 */
export function normalizeConfigurationPath(path: string): string {
  if (typeof path !== "string") {
    throw new ConfigurationPathError(String(path), "path must be a string.");
  }

  const normalized = path.trim();

  if (/\s/.test(normalized)) {
    throw new ConfigurationPathError(path, "path must not contain whitespace.");
  }

  return normalized;
}

/**
 * Normalizes a configuration path and rejects empty results.
 */
export function requireConfigurationPath(path: string): string {
  const normalized = normalizeConfigurationPath(path);

  if (!normalized) {
    throw new ConfigurationPathError(path, "path cannot be empty.");
  }

  return normalized;
}
