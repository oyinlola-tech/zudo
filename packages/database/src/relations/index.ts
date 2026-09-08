/**
 * @zudojs/database — Relations
 *
 * Entity relation definitions and registry.
 */

export {
  oneToOne,
  oneToMany,
  manyToOne,
  manyToMany,
  includeRelation,
  includeRelations,
  RelationRegistry,
  createRelationRegistry,
  validateRelation,
  validateInclude,
  toPrismaInclude,
  DEFAULT_INCLUDE_DEPTH,
  isRelationType,
  isCollectionRelation,
  isSingleRelation,
  type RelationDefinition,
  type RelationType,
  type RelationLoadOptions,
  type RelationInclude,
  type ToPrismaIncludeOptions,
} from "./relations.definition.js";
