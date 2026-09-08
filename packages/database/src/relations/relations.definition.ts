import type { DatabaseOperationOptions } from "../databaseType/databaseType.type.js";

/**
 * Describes a relation between two database entities.
 */
export interface RelationDefinition<TParent = unknown, TChild = unknown> {
  readonly name: string;
  readonly parent: TParent;
  readonly child: TChild;
  readonly type: RelationType;
  readonly foreignKey: string;
  readonly referencedKey: string;
  readonly nullable?: boolean;
}

/**
 * Supported database relation types.
 */
export type RelationType =
  "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

/**
 * Generic relation loading options.
 */
export interface RelationLoadOptions extends DatabaseOperationOptions {
  /**
   * When `false`, collection relations resolved through a registry are
   * filtered to rows whose soft-delete field is null.
   */
  readonly includeDeleted?: boolean;
  /**
   * Maximum nesting depth allowed for includes (default 5).
   */
  readonly depth?: number;
}

/**
 * Default maximum include depth.
 */
export const DEFAULT_INCLUDE_DEPTH = 5;

/**
 * Options for {@link toPrismaInclude}.
 */
export interface ToPrismaIncludeOptions {
  /**
   * Registry used to validate relation names and detect cycles. When
   * supplied, `parent` identifies the root model.
   */
  readonly registry?: RelationRegistry;
  /**
   * The model the top-level includes belong to (required with `registry`).
   */
  readonly parent?: unknown;
  /**
   * Maximum nesting depth (default {@link DEFAULT_INCLUDE_DEPTH}).
   */
  readonly depth?: number;
  /**
   * When `false`, collection relations are filtered on `softDeleteField`.
   */
  readonly includeDeleted?: boolean;
  /**
   * Soft-delete column applied when `includeDeleted` is `false`
   * (default `deletedAt`).
   */
  readonly softDeleteField?: string;
}

/**
 * Describes a relation that can be included in a query.
 */
export interface RelationInclude {
  readonly relation: string;
  readonly select?: readonly string[];
  readonly include?: readonly RelationInclude[];
}

/**
 * Creates a one-to-one relation definition.
 */
export function oneToOne<TParent = unknown, TChild = unknown>(
  definition: Omit<RelationDefinition<TParent, TChild>, "type">,
): RelationDefinition<TParent, TChild> {
  const relation: RelationDefinition<TParent, TChild> = Object.freeze({
    ...definition,
    type: "one-to-one",
  });

  validateRelation(relation);

  return relation;
}

/**
 * Creates a one-to-many relation definition.
 */
export function oneToMany<TParent = unknown, TChild = unknown>(
  definition: Omit<RelationDefinition<TParent, TChild>, "type">,
): RelationDefinition<TParent, TChild> {
  const relation: RelationDefinition<TParent, TChild> = Object.freeze({
    ...definition,
    type: "one-to-many",
  });

  validateRelation(relation);

  return relation;
}

/**
 * Creates a many-to-one relation definition.
 */
export function manyToOne<TParent = unknown, TChild = unknown>(
  definition: Omit<RelationDefinition<TParent, TChild>, "type">,
): RelationDefinition<TParent, TChild> {
  const relation: RelationDefinition<TParent, TChild> = Object.freeze({
    ...definition,
    type: "many-to-one",
  });

  validateRelation(relation);

  return relation;
}

/**
 * Creates a many-to-many relation definition.
 */
export function manyToMany<TParent = unknown, TChild = unknown>(
  definition: Omit<RelationDefinition<TParent, TChild>, "type">,
): RelationDefinition<TParent, TChild> {
  const relation: RelationDefinition<TParent, TChild> = Object.freeze({
    ...definition,
    type: "many-to-many",
  });

  validateRelation(relation);

  return relation;
}

/**
 * Creates a relation include definition.
 */
export function includeRelation(
  relation: string,
  options: {
    readonly select?: readonly string[];
    readonly include?: readonly RelationInclude[];
  } = {},
): RelationInclude {
  validateRelationName(relation);

  if (options.select !== undefined) {
    for (const field of options.select) {
      validateFieldName(field);
    }
  }

  if (options.include !== undefined) {
    for (const nested of options.include) {
      validateInclude(nested);
    }
  }

  return Object.freeze({
    relation,
    select: options.select
      ? Object.freeze([...new Set(options.select)])
      : undefined,
    include: options.include ? Object.freeze([...options.include]) : undefined,
  });
}

/**
 * Validates a relation include (recursively).
 */
export function validateInclude(include: RelationInclude): void {
  if (!include || typeof include !== "object") {
    throw new TypeError("A relation include is required.");
  }

  validateRelationName(include.relation);

  for (const field of include.select ?? []) {
    validateFieldName(field);
  }

  for (const nested of include.include ?? []) {
    validateInclude(nested);
  }
}

/**
 * Translates relation includes into a Prisma `include` object.
 *
 * When a registry is supplied every relation is validated against the
 * parent model (descending through child models for nested includes) and
 * cyclic includes are rejected. Depth is bounded in all cases.
 */
export function toPrismaInclude(
  includes: readonly RelationInclude[],
  options: ToPrismaIncludeOptions = {},
): Record<string, unknown> {
  const maxDepth = options.depth ?? DEFAULT_INCLUDE_DEPTH;

  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new TypeError("Include depth must be a positive integer.");
  }

  if (options.registry && options.parent === undefined) {
    throw new TypeError(
      "toPrismaInclude requires `parent` when a registry is supplied.",
    );
  }

  return buildInclude(includes, options, options.parent, 1, maxDepth, []);
}

function buildInclude(
  includes: readonly RelationInclude[],
  options: ToPrismaIncludeOptions,
  parent: unknown,
  depth: number,
  maxDepth: number,
  path: readonly RelationDefinition[],
): Record<string, unknown> {
  if (depth > maxDepth) {
    throw new RangeError(
      `Relation include depth exceeds the maximum of ${maxDepth}.`,
    );
  }

  const result: Record<string, unknown> = {};

  for (const include of includes) {
    validateInclude(include);

    if (include.relation in result) {
      throw new TypeError(
        `Relation "${include.relation}" is included more than once.`,
      );
    }

    let definition: RelationDefinition | undefined;

    if (options.registry) {
      definition = options.registry.get(include.relation, parent);

      if (!definition) {
        throw new TypeError(
          `Relation "${include.relation}" is not registered for the parent model.`,
        );
      }

      if (path.includes(definition)) {
        throw new TypeError(
          `Relation include "${include.relation}" is cyclic.`,
        );
      }
    }

    const entry: Record<string, unknown> = {};

    if (include.select && include.select.length > 0) {
      const select: Record<string, boolean> = {};

      for (const field of include.select) {
        select[field] = true;
      }

      entry["select"] = select;
    }

    if (include.include && include.include.length > 0) {
      const nested = buildInclude(
        include.include,
        options,
        definition ? definition.child : undefined,
        depth + 1,
        maxDepth,
        definition ? [...path, definition] : path,
      );

      if (entry["select"]) {
        entry["select"] = { ...(entry["select"] as object), ...nested };
      } else {
        entry["include"] = nested;
      }
    }

    if (
      options.includeDeleted === false &&
      definition &&
      isCollectionRelation(definition)
    ) {
      const field = options.softDeleteField ?? "deletedAt";

      validateFieldName(field);

      entry["where"] = { [field]: null };
    }

    result[include.relation] = Object.keys(entry).length === 0 ? true : entry;
  }

  return result;
}

/**
 * Creates a nested relation include.
 */
export function includeRelations(
  ...includes: readonly RelationInclude[]
): readonly RelationInclude[] {
  return Object.freeze([...includes]);
}

/**
 * Relation registry used by database infrastructure.
 *
 * Relations are keyed by parent model and name, so two models may each
 * define a relation with the same name.
 */
export class RelationRegistry {
  private readonly relations = new Map<unknown, Map<string, RelationDefinition>>();

  /**
   * Registers a relation.
   */
  public register(relation: RelationDefinition): this {
    validateRelation(relation);

    const byName = this.relations.get(relation.parent);

    if (byName?.has(relation.name)) {
      throw new Error(
        `Relation "${relation.name}" is already registered for this parent.`,
      );
    }

    const frozen = Object.freeze({
      ...relation,
    });

    if (byName) {
      byName.set(relation.name, frozen);
    } else {
      this.relations.set(relation.parent, new Map([[relation.name, frozen]]));
    }

    return this;
  }

  /**
   * Registers multiple relations.
   */
  public registerMany(relations: readonly RelationDefinition[]): this {
    for (const relation of relations) {
      this.register(relation);
    }

    return this;
  }

  /**
   * Gets a relation by name.
   *
   * Without `parent` the name must be unique across all parents; an
   * ambiguous lookup throws.
   */
  public get(name: string, parent?: unknown): RelationDefinition | undefined {
    if (parent !== undefined) {
      return this.relations.get(parent)?.get(name);
    }

    const matches = this.findByName(name);

    if (matches.length > 1) {
      throw new Error(
        `Relation "${name}" is registered for multiple parents; specify the parent.`,
      );
    }

    return matches[0];
  }

  /**
   * Checks whether a relation exists.
   */
  public has(name: string, parent?: unknown): boolean {
    if (parent !== undefined) {
      return this.relations.get(parent)?.has(name) ?? false;
    }

    return this.findByName(name).length > 0;
  }

  /**
   * Removes a relation. Without `parent`, every relation with that name is
   * removed.
   */
  public remove(name: string, parent?: unknown): boolean {
    if (parent !== undefined) {
      const byName = this.relations.get(parent);

      const removed = byName?.delete(name) ?? false;

      if (byName && byName.size === 0) {
        this.relations.delete(parent);
      }

      return removed;
    }

    let removed = false;

    for (const [key, byName] of this.relations) {
      if (byName.delete(name)) {
        removed = true;
      }

      if (byName.size === 0) {
        this.relations.delete(key);
      }
    }

    return removed;
  }

  /**
   * Returns all registered relations.
   */
  public all(): readonly RelationDefinition[] {
    return Object.freeze(
      [...this.relations.values()].flatMap((byName) => [...byName.values()]),
    );
  }

  /**
   * Returns relations for a specific parent entity.
   */
  public forParent(parent: unknown): readonly RelationDefinition[] {
    return Object.freeze([...(this.relations.get(parent)?.values() ?? [])]);
  }

  /**
   * Returns relations for a specific child entity.
   */
  public forChild(child: unknown): readonly RelationDefinition[] {
    return Object.freeze(
      this.all().filter((relation) => relation.child === child),
    );
  }

  /**
   * Clears all registered relations.
   */
  public clear(): void {
    this.relations.clear();
  }

  /**
   * Returns the number of registered relations.
   */
  public get size(): number {
    let size = 0;

    for (const byName of this.relations.values()) {
      size += byName.size;
    }

    return size;
  }

  private findByName(name: string): RelationDefinition[] {
    const matches: RelationDefinition[] = [];

    for (const byName of this.relations.values()) {
      const relation = byName.get(name);

      if (relation) {
        matches.push(relation);
      }
    }

    return matches;
  }
}

/**
 * Creates a relation registry.
 */
export function createRelationRegistry(
  relations: readonly RelationDefinition[] = [],
): RelationRegistry {
  const registry = new RelationRegistry();

  registry.registerMany(relations);

  return registry;
}

/**
 * Validates a relation definition.
 */
export function validateRelation(relation: RelationDefinition): void {
  if (!relation || typeof relation !== "object") {
    throw new TypeError("A relation definition is required.");
  }

  validateRelationName(relation.name);

  if (relation.parent === undefined || relation.parent === null) {
    throw new TypeError(
      `Relation "${relation.name}" requires a parent entity.`,
    );
  }

  if (relation.child === undefined || relation.child === null) {
    throw new TypeError(`Relation "${relation.name}" requires a child entity.`);
  }

  if (!isRelationType(relation.type)) {
    throw new TypeError(
      `Relation "${relation.name}" has an invalid relation type.`,
    );
  }

  if (
    typeof relation.foreignKey !== "string" ||
    relation.foreignKey.trim().length === 0
  ) {
    throw new TypeError(`Relation "${relation.name}" requires a foreign key.`);
  }

  if (
    typeof relation.referencedKey !== "string" ||
    relation.referencedKey.trim().length === 0
  ) {
    throw new TypeError(
      `Relation "${relation.name}" requires a referenced key.`,
    );
  }
}

/**
 * Checks whether a value is a supported relation type.
 */
export function isRelationType(value: unknown): value is RelationType {
  return (
    value === "one-to-one" ||
    value === "one-to-many" ||
    value === "many-to-one" ||
    value === "many-to-many"
  );
}

/**
 * Returns whether the relation represents a collection.
 */
export function isCollectionRelation(relation: RelationDefinition): boolean {
  return relation.type === "one-to-many" || relation.type === "many-to-many";
}

/**
 * Returns whether the relation represents a single entity.
 */
export function isSingleRelation(relation: RelationDefinition): boolean {
  return relation.type === "one-to-one" || relation.type === "many-to-one";
}

/**
 * Validates a relation name.
 */
function validateRelationName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("A relation name is required.");
  }

  validateFieldName(name);
}

const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validates a relation or select field name.
 */
function validateFieldName(field: string): void {
  if (typeof field !== "string" || !FIELD_PATTERN.test(field)) {
    throw new TypeError(`Invalid relation field name "${String(field)}".`);
  }
}
