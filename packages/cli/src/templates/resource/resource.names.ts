/**
 * zudojs-cli — Names derived from a resource name.
 *
 * `users` gives the file slug `users`, the classes `UsersController`,
 * `UsersService` and `UsersRepository`, the record type `User`, the Prisma
 * model `User` (delegate `user`, table `users`) and the path
 * `/api/v1/users`.
 */

import { CLIValidationError } from "../../errors/index.js";
import {
  assertGeneratableName,
  toCamelCase,
  toPascalCase,
} from "../../utils/utils.name.js";

/** Every identifier and path a resource's files use. */
export interface ResourceNames {
  /** kebab-case slug: file names, table name, OpenAPI tag. */
  readonly slug: string;
  /** PascalCase of the name as given: class prefix (`UsersService`). */
  readonly pascal: string;
  /** camelCase of the name as given: container key prefix. */
  readonly camel: string;
  /** PascalCase singular: record type and schema prefix (`User`). */
  readonly entity: string;
  /** camelCase singular: Prisma delegate (`prisma.user`). */
  readonly entityCamel: string;
  /** Human label for messages and summaries (`user`). */
  readonly label: string;
  /** Collection path (`/api/v1/users`). */
  readonly routePath: string;
}

/**
 * Names that would shadow a global the generated files rely on (a `Record`
 * entity type hides TypeScript's `Record<K, V>`, `Promise` breaks every
 * async signature).
 */
const RESERVED_ENTITY_NAMES = new Set([
  "Array", "Boolean", "Date", "Error", "Function", "Headers", "Map", "Number",
  "Object", "Promise", "Record", "Request", "Response", "Set", "String",
  "Symbol", "URL",
]);

/** Naive English singular, enough for resource names (`users` → `user`). */
export function singularize(slug: string): string {
  if (/ies$/.test(slug) && slug.length > 4) return `${slug.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/.test(slug)) return slug.slice(0, -2);
  if (/[^s]s$/.test(slug)) return slug.slice(0, -1);
  return slug;
}

/**
 * Derives {@link ResourceNames} from a raw name.
 *
 * A name containing a path separator or `..` is refused outright rather
 * than normalized: `generate resource ../../x` used to be accepted and
 * silently became `x`, which hides a typo or an attack in a script.
 *
 * @throws {CLIValidationError} For unusable or reserved names.
 */
export function resourceNames(raw: string): ResourceNames {
  if (/[\\/]|\.\./.test(raw)) {
    throw new CLIValidationError(
      `Invalid resource name: "${raw}". Use a plain name such as "users"; paths are not allowed.`,
    );
  }
  const slug = assertGeneratableName(raw, "resource name");
  const singular = singularize(slug);
  const entity = toPascalCase(singular);
  if (RESERVED_ENTITY_NAMES.has(entity)) {
    throw new CLIValidationError(
      `Invalid resource name: "${raw}". "${entity}" would shadow a JavaScript global; choose another name (for example "${slug}-items").`,
    );
  }
  return {
    slug,
    pascal: toPascalCase(slug),
    camel: toCamelCase(slug),
    entity,
    entityCamel: toCamelCase(singular),
    label: singular.replace(/-/g, " "),
    routePath: `/api/v1/${slug}`,
  };
}

/** Words spelled with a vowel but said with a consonant sound ("a user"). */
const CONSONANT_SOUND = /^(u[bcdfghjklmnpqrstvwxyz][aeiou]|uu|eu|ewe|one|once)/;
/** Words spelled with a consonant but said with a vowel sound ("an hour"). */
const VOWEL_SOUND = /^(hour|honest|honor|honour|heir)/;

/**
 * Prefixes `noun` with "a" or "an" by its (approximate) opening sound:
 * `example` → "an example", `user` → "a user", `hour` → "an hour".
 * Pass `capitalize` for the start of a sentence ("An example").
 */
export function withArticle(noun: string, capitalize = false): string {
  const word = noun.toLowerCase();
  const vowel = VOWEL_SOUND.test(word) || (/^[aeiou]/.test(word) && !CONSONANT_SOUND.test(word));
  const article = vowel ? "an" : "a";
  return `${capitalize ? article.charAt(0).toUpperCase() + article.slice(1) : article} ${noun}`;
}
