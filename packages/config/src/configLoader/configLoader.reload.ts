/**
 * Atomic reload support for the configuration loader.
 *
 * Reloading used to re-apply sources on top of the live store without
 * clearing it. A value that a higher-priority source stopped providing
 * then stayed forever, because its entry still carried the higher
 * priority and no lower source could replace it; and a source failing
 * partway left the store half-applied.
 */

import type { ConfigEntry } from "../configEntry/configEntry.type.js";
import type { ConfigStore } from "../configStore/configStore.core.js";
import { createConfigStore } from "../configStore/configStore.factory.js";

/**
 * Whether an entry was written by one of the loader's sources (and so must
 * be re-derived on reload) rather than by `set()` or `initialValues`.
 */
function isSourceEntry(
  entry: ConfigEntry,
  sourceNames: ReadonlySet<string>,
): boolean {
  return sourceNames.has(entry.source);
}

/**
 * Creates a staging store holding only the entries no source owns
 * (runtime writes, initial values).
 */
export function createReloadStaging(
  store: ConfigStore,
  sourceNames: ReadonlySet<string>,
  freeze: boolean,
): ConfigStore {
  const staging = createConfigStore({ freeze });
  for (const entry of store.getEntries()) {
    if (!isSourceEntry(entry, sourceNames)) staging.setEntry(entry);
  }
  return staging;
}

/**
 * Copies a fully loaded staging store into the live store: keys the
 * reload no longer produces are removed, the rest are written. An entry
 * that was sensitive before the reload stays sensitive.
 */
export function commitReloadStaging(
  store: ConfigStore,
  staging: ConfigStore,
): void {
  const wasSensitive = new Set(
    store
      .getEntries()
      .filter((entry) => entry.sensitive)
      .map((entry) => entry.key),
  );
  for (const key of store.keys()) {
    if (!staging.has(key)) store.delete(key);
  }
  for (const entry of staging.getEntries()) {
    store.setEntry(
      wasSensitive.has(entry.key) ? { ...entry, sensitive: true } : entry,
    );
  }
}
