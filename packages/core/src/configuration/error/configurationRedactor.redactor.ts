import type {
  Configuration,
  ConfigurationValue,
} from "../core/configuration.js";

/**
 * Default configuration paths and key fragments that should
 * be treated as sensitive.
 *
 * Matching is case-insensitive.
 */
export const DEFAULT_SENSITIVE_PATTERNS: readonly string[] = [
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "client_secret",
  "authorization",
  "auth",
  "credential",
  "credentials",
  "dsn",
  "connectionstring",
  "connection_string",
];

/**
 * Default value used when a sensitive configuration value
 * is redacted.
 */
export const DEFAULT_REDACTION_VALUE = "[REDACTED]";

/**
 * Options for ConfigurationRedactor.
 */
export interface ConfigurationRedactorOptions {
  /**
   * Additional patterns that should be treated as sensitive.
   */
  readonly sensitivePatterns?: readonly string[];

  /**
   * Exact configuration paths that should be treated
   * as sensitive.
   */
  readonly sensitivePaths?: readonly string[];

  /**
   * Value used when redacting sensitive data.
   *
   * Defaults to "[REDACTED]".
   */
  readonly redactionValue?: string;

  /**
   * Whether nested objects and arrays should be traversed.
   *
   * Defaults to true.
   */
  readonly deep?: boolean;
}

/**
 * Result of checking whether a configuration path
 * contains sensitive information.
 */
export interface ConfigurationSensitivity {
  /**
   * Whether the path is sensitive.
   */
  readonly sensitive: boolean;

  /**
   * Reason the path was classified as sensitive.
   */
  readonly reason?: "pattern" | "exact-path";
}

/**
 * Safe representation of configuration.
 */
export type RedactedConfiguration = ConfigurationValue;

/**
 * Redacts sensitive configuration values.
 *
 * This class deliberately operates on copies and never mutates
 * the original configuration object.
 */
export class ConfigurationRedactor {
  private readonly sensitivePatterns: readonly string[];

  private readonly sensitivePaths: ReadonlySet<string>;

  private readonly redactionValue: string;

  private readonly deep: boolean;

  public constructor(options: ConfigurationRedactorOptions = {}) {
    this.sensitivePatterns = [
      ...DEFAULT_SENSITIVE_PATTERNS,
      ...(options.sensitivePatterns ?? []),
    ].map((pattern) => normalizePattern(pattern));

    this.sensitivePaths = new Set(
      (options.sensitivePaths ?? []).map((path) => normalizePath(path)),
    );

    this.redactionValue = options.redactionValue ?? DEFAULT_REDACTION_VALUE;

    this.deep = options.deep ?? true;
  }

  /**
   * Determines whether a configuration path is sensitive.
   */
  public isSensitive(path: string): boolean {
    return this.checkSensitivity(path).sensitive;
  }

  /**
   * Provides detailed sensitivity information.
   */
  public checkSensitivity(path: string): ConfigurationSensitivity {
    const normalizedPath = normalizePath(path);

    if (this.sensitivePaths.has(normalizedPath)) {
      return {
        sensitive: true,
        reason: "exact-path",
      };
    }

    /*
     * Pattern matching runs on the original casing so camelCase
     * word boundaries (apiToken → api token) survive.
     */
    const pathSegments = path.trim().split(".");

    for (const segment of pathSegments) {
      if (this.matchesSensitivePattern(segment)) {
        return {
          sensitive: true,
          reason: "pattern",
        };
      }
    }

    if (this.matchesSensitivePattern(path.trim())) {
      return {
        sensitive: true,
        reason: "pattern",
      };
    }

    return {
      sensitive: false,
    };
  }

  /**
   * Redacts a complete Configuration instance.
   *
   * The returned object is safe to use for logging and
   * diagnostics.
   */
  public redact(configuration: Configuration): RedactedConfiguration {
    return this.redactValue(configuration.toObject(), "");
  }

  /**
   * Redacts a plain configuration object.
   */
  public redactObject(value: ConfigurationValue): RedactedConfiguration {
    return this.redactValue(value, "");
  }

  /**
   * Redacts a single configuration value at a known path.
   */
  public redactValueAtPath(
    path: string,
    value: ConfigurationValue,
  ): ConfigurationValue {
    if (this.isSensitive(path)) {
      return this.redactionValue;
    }

    if (!this.deep) {
      return value;
    }

    return this.redactValue(value, path);
  }

  /**
   * Recursively redacts objects and arrays.
   */
  private redactValue(
    value: ConfigurationValue,
    parentPath: string,
  ): ConfigurationValue {
    if (value === null || value === undefined) {
      return value;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (parentPath && this.isSensitive(parentPath)) {
        return this.redactionValue;
      }

      return value;
    }

    if (Array.isArray(value)) {
      if (!this.deep) {
        return value;
      }

      return value.map((item, index) =>
        this.redactValue(
          item,
          parentPath ? `${parentPath}.${index}` : String(index),
        ),
      );
    }

    /*
     * The result is built with a null prototype so keys such as
     * "__proto__" are stored as ordinary own properties instead
     * of hitting Object.prototype setters and vanishing.
     */
    const result: Record<string, ConfigurationValue> = Object.create(
      null,
    ) as Record<string, ConfigurationValue>;

    for (const [key, childValue] of Object.entries(value)) {
      const path = parentPath ? `${parentPath}.${key}` : key;

      if (this.isSensitive(path)) {
        result[key] = this.redactionValue;

        continue;
      }

      result[key] = this.deep ? this.redactValue(childValue, path) : childValue;
    }

    return result;
  }

  /**
   * Checks whether a path segment matches one of the
   * configured sensitive patterns.
   *
   * Matching is word-boundary aware: the segment is split into
   * words on separators and camelCase transitions, and a pattern
   * matches only when a consecutive run of words spells it out.
   * This means "apiToken" and "access_token" match "token", but
   * "tokenizer" and "secretary" do not match "token"/"secret".
   */
  private matchesSensitivePattern(value: string): boolean {
    const words = splitWords(value);

    if (words.length === 0) {
      return false;
    }

    return this.sensitivePatterns.some((pattern) =>
      matchesWordRun(words, pattern),
    );
  }

  /**
   * Redacts sensitive-looking fragments from free-form text such
   * as error messages.
   *
   * Occurrences of "<sensitive>=value", "<sensitive>: value", and
   * "<sensitive> value" have their value replaced. This is a
   * best-effort scrub for diagnostics; it does not guarantee that
   * arbitrary text contains no secrets.
   */
  public redactText(text: string): string {
    let result = text;

    for (const pattern of this.sensitivePatterns) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expression = new RegExp(
        `(${escaped}[a-z0-9_-]*\\s*[=:]\\s*)("[^"]*"|'[^']*'|\\S+)`,
        "gi",
      );
      result = result.replace(expression, `$1${this.redactionValue}`);
    }

    return result;
  }
}

/**
 * Splits an identifier into normalized lowercase words.
 *
 * Splitting occurs on non-alphanumeric separators and on
 * camelCase transitions.
 */
function splitWords(value: string): readonly string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 0);
}

/**
 * Checks whether a consecutive run of words spells out
 * the supplied pattern.
 */
function matchesWordRun(words: readonly string[], pattern: string): boolean {
  const target = splitWords(pattern).join("");

  if (!target) {
    return false;
  }

  for (let start = 0; start < words.length; start++) {
    let accumulated = "";

    for (let index = start; index < words.length; index++) {
      accumulated += words[index];

      if (accumulated === target) {
        return true;
      }

      if (accumulated.length >= target.length) {
        break;
      }
    }
  }

  return false;
}

/**
 * Creates a ConfigurationRedactor.
 */
export function createConfigurationRedactor(
  options: ConfigurationRedactorOptions = {},
): ConfigurationRedactor {
  return new ConfigurationRedactor(options);
}

/**
 * Redacts configuration using the default redaction rules.
 */
export function redactConfiguration(
  configuration: Configuration,
): RedactedConfiguration {
  return createConfigurationRedactor().redact(configuration);
}

/**
 * Normalizes a configuration path.
 */
function normalizePath(path: string): string {
  return path.trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * Normalizes a sensitivity pattern.
 */
function normalizePattern(pattern: string): string {
  return pattern.trim().replace(/\s+/g, "").toLowerCase();
}
