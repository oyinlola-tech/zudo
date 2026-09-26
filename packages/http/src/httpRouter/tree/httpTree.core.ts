/**
 * Route tree implementation.
 *
 * @module httpRoute/tree/tree
 */

import type {
  RouteTreeNode,
  RouteTreeOptions,
  RouteTreeMatch,
  RouteTreeSnapshot,
  MutableRouteTreeNode,
} from "./core/httpTree.type.js";

import {
  insertSegment,
  removeRouteFromTree,
  matchesMethod,
  splitPath,
} from "./core/httpTree.helper.js";

import { collectMatches } from "./core/httpTree.traversal.js";

export class RouteTree {
  private readonly root: MutableRouteTreeNode;
  private readonly caseSensitive: boolean;
  private nodeCount = 0;

  constructor(options: RouteTreeOptions = {}) {
    this.caseSensitive = options.caseSensitive ?? false;
    this.root = {
      name: "",
      type: "static",
      children: new Map(),
      methods: new Set(),
      metadata: {},
      optional: false,
      wildcard: false,
    };
  }

  insert(
    path: string,
    handler: unknown,
    methods: readonly string[] = ["GET"],
    metadata: Record<string, unknown> = {},
  ): void {
    const segments = splitPath(path);
    insertSegment(this.root, segments, handler, methods, metadata, this.caseSensitive);
    this.nodeCount++;
  }

  remove(path: string): boolean {
    const segments = splitPath(path);
    const removed = removeRouteFromTree(this.root, segments, this.caseSensitive);
    if (removed) {
      this.nodeCount--;
    }
    return removed;
  }

  /**
   * Finds the most specific route for a path: literal segments first, then
   * parameters, then wildcards, left to right, as the router ranks them.
   * Every parameter along the path is reported.
   */
  lookup(path: string, method?: string): RouteTreeMatch | undefined {
    const segments = splitPath(path);

    for (const { node, params } of collectMatches(this.root, segments, this.caseSensitive)) {
      if (node.handler && (!method || matchesMethod(node, method))) {
        return {
          params: { ...params },
          path,
          handler: node.handler,
          methods: Array.from(node.methods),
          metadata: { ...node.metadata },
        };
      }
    }

    return undefined;
  }

  has(path: string, method?: string): boolean {
    return this.lookup(path, method) !== undefined;
  }

  clear(): void {
    this.root.children.clear();
    this.root.handler = undefined;
    this.root.methods.clear();
    this.root.metadata = {};
    this.nodeCount = 0;
  }

  snapshot(): RouteTreeSnapshot {
    return {
      root: this.freezeNode(this.root),
      timestamp: Date.now(),
      nodeCount: this.nodeCount,
    };
  }

  get size(): number {
    return this.nodeCount;
  }

  private freezeNode(node: MutableRouteTreeNode): RouteTreeNode {
    const children = new Map<string, RouteTreeNode>();
    for (const [key, child] of node.children) {
      children.set(key, this.freezeNode(child));
    }

    return {
      name: node.name,
      type: node.type,
      children,
      handler: node.handler,
      methods: new Set(node.methods),
      metadata: { ...node.metadata },
      optional: node.optional,
      wildcard: node.wildcard,
      param: node.param,
    };
  }
}
