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

import { collectCandidates } from "./core/httpTree.traversal.js";

export class RouteTree {
  private readonly root: MutableRouteTreeNode;
  private nodeCount = 0;

  constructor(_options: RouteTreeOptions = {}) {
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
    insertSegment(this.root, segments, handler, methods, metadata);
    this.nodeCount++;
  }

  remove(path: string): boolean {
    const segments = splitPath(path);
    const removed = removeRouteFromTree(this.root, segments);
    if (removed) {
      this.nodeCount--;
    }
    return removed;
  }

  lookup(path: string, method?: string): RouteTreeMatch | undefined {
    const segments = splitPath(path);
    const candidates = collectCandidates(this.root, segments);

    for (const candidate of candidates) {
      if (candidate.handler && (!method || matchesMethod(candidate, method))) {
        return {
          params: this.extractParams(segments, candidate),
          path,
          handler: candidate.handler,
          methods: Array.from(candidate.methods),
          metadata: { ...candidate.metadata },
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

  private extractParams(
    segments: readonly string[],
    node: MutableRouteTreeNode,
  ): Record<string, string> {
    const params: Record<string, string> = {};

    if (node.type === "parameter" && node.param) {
      params[node.param] = segments[segments.length - 1] ?? "";
    }

    return params;
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
