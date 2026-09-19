/**
 * Secret propagation from a validation schema onto store entries.
 *
 * `validate()` used to look only at the top level of `schema.properties`,
 * so `db.properties.password.secret` — or a `"db.password"` property when
 * the source supplied a nested `db` object — never marked anything
 * sensitive, and `toSafeObject()` printed the password.
 */

import type { AnyConfigSchema } from "../configSchema/index.js";
import type { ConfigStore } from "../configStore/configStore.core.js";

/** Nesting bound for the schema walk. */
const MAX_SCHEMA_DEPTH = 32;

/**
 * Every path (as dotted-key segments) at which a schema declares
 * `secret: true`, including inside nested object and array schemas.
 * Array items contribute the path of the array itself.
 */
export function collectSecretPaths(
  properties: Readonly<Record<string, AnyConfigSchema>>,
): string[][] {
  const paths: string[][] = [];
  const walk = (schema: AnyConfigSchema, path: string[], depth: number) => {
    if (schema.secret) {
      paths.push(path);
      return;
    }
    if (depth >= MAX_SCHEMA_DEPTH) return;
    const nested = schema as {
      readonly properties?: Readonly<Record<string, AnyConfigSchema>>;
      readonly items?: AnyConfigSchema;
      readonly additionalProperties?: boolean | AnyConfigSchema;
    };
    for (const [key, child] of Object.entries(nested.properties ?? {})) {
      walk(child, [...path, ...key.split(".")], depth + 1);
    }
    if (nested.items) walk(nested.items, path, depth + 1);
    if (
      typeof nested.additionalProperties === "object" &&
      nested.additionalProperties.secret
    ) {
      paths.push(path);
    }
  };
  for (const [key, schema] of Object.entries(properties)) {
    walk(schema, key.split("."), 1);
  }
  return paths;
}

/**
 * Marks sensitive every store entry that holds a secret path.
 *
 * A path is owned by the entry whose key is its longest dotted prefix, so
 * both a flat `db.password` entry and a nested `db` object entry are found.
 * When the secret sits inside an entry's value the whole entry is marked,
 * since redaction works per entry. A path with no owning entry holds no
 * value, so there is nothing to redact.
 */
export function markSecretEntries(
  store: ConfigStore,
  paths: readonly (readonly string[])[],
): void {
  for (const path of paths) {
    for (let length = path.length; length > 0; length--) {
      const entry = store.getEntry(path.slice(0, length).join("."));
      if (!entry) continue;
      if (!entry.sensitive) {
        store.set(entry.key, entry.value, {
          source: entry.source,
          sourceType: entry.sourceType,
          priority: entry.priority,
          sensitive: true,
          resolved: entry.resolved,
        });
      }
      break;
    }
  }
}
