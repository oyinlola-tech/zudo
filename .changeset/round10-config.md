---
"@zudojs/config": minor
---

Round 10 fixes.

- **data/CONFIG-01 (security):** `validate()` honours `secret: true` at any depth — inside nested object schemas, array items, and dotted keys such as `"db.password"` when the source supplied a nested `db` object. The store entry holding the secret is marked sensitive (the whole entry is redacted by `toSafeObject()`).
- **data/CONFIG-02 (security):** every source, not only the environment source, now has keys and values screened: a key naming a password, secret, token, API/private key, credential, DSN, database URL or `*_key` (any segment, case-insensitive), a nested object containing such a key, or a URL with embedded `user:password@` is marked sensitive. New exports `isSensitiveConfigKey`, `isSensitiveConfigValue`, `isSensitiveConfigEntry`. Behaviour change: more values are redacted by `toSafeObject()`, and an environment source's `isSensitive: () => false` no longer disables this screening.
- **data/CONFIG-03:** `reload()` on a layered store (the manager's default) rebuilds source-provided values from scratch in a staging store and commits them only once every source has loaded. A value a higher-priority source stopped providing is dropped, runtime and initial values are kept, a failing source leaves the previous configuration intact, and previously sensitive entries stay sensitive.
- **data/CONFIG-04:** `toConfigJsonValue` / `configValueToString` define keys instead of assigning them, so an own `__proto__` key stays an own key and never replaces the result's prototype.
- **data/CONFIG-06:** `parseConfigNumber` and the typed `number()` getters accept decimal notation only; `"0x1F90"`, `"0b11"` and `"0o17"` are rejected.
