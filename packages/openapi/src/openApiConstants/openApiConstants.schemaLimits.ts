/**
 * Implicit size ceilings that `@zudojs/schema` enforces at parse time when a
 * schema sets no explicit `.max()`.
 *
 * The owning constants are `SCHEMA_DEFAULT_MAX_STRING_LENGTH` and
 * `SCHEMA_DEFAULT_MAX_ARRAY_LENGTH` in `@zudojs/constants`. This package does
 * not depend on `@zudojs/constants` yet, so the values are mirrored here and
 * a regression test (`tests/openapi.round10.test.ts`) asserts they equal the
 * source constants. Once the dependency is declared, import them instead.
 */

/** Mirror of `SCHEMA_DEFAULT_MAX_STRING_LENGTH` (`Limits.MAX_DISPLAY_LENGTH`). */
export const SCHEMA_IMPLICIT_MAX_STRING_LENGTH = 255;

/** Mirror of `SCHEMA_DEFAULT_MAX_ARRAY_LENGTH`. */
export const SCHEMA_IMPLICIT_MAX_ARRAY_LENGTH = 1000;
