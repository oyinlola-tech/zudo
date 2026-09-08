/**
 * Route tree types.
 *
 * @module httpRoute/tree/types
 */

export interface RouteTreeNode {
  readonly name: string;
  readonly type: RouteTreeNodeType;
  readonly children: ReadonlyMap<string, RouteTreeNode>;
  readonly handler?: unknown;
  readonly methods: ReadonlySet<string>;
  readonly metadata: Record<string, unknown>;
  readonly optional: boolean;
  readonly wildcard: boolean;
  readonly param?: string;
}

export type RouteTreeNodeType =
  "static" | "parameter" | "wildcard" | "optional";

/**
 * Options for {@link RouteTree}.
 *
 * Deliberately empty. `caseSensitive` and `strict` were declared here and never
 * read — case sensitivity and trailing-slash handling are owned by
 * `RouterOptions` and applied by `RouteMatcher`, which is the path requests
 * actually take. Declaring them here again promised behaviour this structure
 * never implemented.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RouteTreeOptions {}

export interface RouteTreeMatch {
  readonly params: Record<string, string>;
  readonly path: string;
  readonly handler: unknown;
  readonly methods: readonly string[];
  readonly metadata: Record<string, unknown>;
}

export interface RouteTreeSnapshot {
  readonly root: RouteTreeNode;
  readonly timestamp: number;
  readonly nodeCount: number;
}

export interface MutableRouteTreeNode {
  name: string;
  type: RouteTreeNodeType;
  children: Map<string, MutableRouteTreeNode>;
  handler?: unknown;
  methods: Set<string>;
  metadata: Record<string, unknown>;
  optional: boolean;
  wildcard: boolean;
  param?: string;
}
