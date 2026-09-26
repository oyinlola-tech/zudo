/**
 * Sibling and previous/next resolution over a navigation tree.
 *
 * @module navigation/navigation.adjacent
 */

import type { DocumentationNavigationItem } from "../docsTypes/index.js";
import { MAX_NAVIGATION_DEPTH, flattenNavigation } from "./navigation.core.js";

type Nodes = readonly DocumentationNavigationItem[];

/**
 * Returns the list of document IDs at the same level as `documentId`,
 * including the document itself, in navigation order.
 */
function getLevel(documentId: string, items: Nodes): readonly string[] {
  const seen = new WeakSet<DocumentationNavigationItem>();

  function walk(nodes: Nodes, depth: number): string[] | undefined {
    if (depth > MAX_NAVIGATION_DEPTH) return undefined;

    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);

      if (node.documentId === documentId) {
        return nodes
          .map((n) => n.documentId)
          .filter((id): id is string => typeof id === "string");
      }

      if (node.children) {
        const result = walk(node.children, depth + 1);
        if (result) return result;
      }
    }

    return undefined;
  }

  return walk(items, 0) ?? [];
}

/**
 * Gets sibling document IDs for a given document (the other documents
 * at the same navigation level, excluding the document itself).
 */
export function getSiblings(
  documentId: string,
  items: Nodes,
): readonly string[] {
  return Object.freeze(
    getLevel(documentId, items).filter((id) => id !== documentId),
  );
}

/** Options for `getAdjacent`. */
export interface GetAdjacentOptions {
  /**
   * `"level"` (default) looks only at the documents that share the
   * target's navigation level, so the first item of a section has no
   * `previous`. `"tree"` walks the whole tree in reading order (the
   * order of `flattenNavigation`), crossing section boundaries.
   */
  readonly scope?: "level" | "tree";
}

/**
 * Gets the previous and next document IDs around `documentId`: within its
 * navigation level by default, or across the whole tree in reading order
 * with `{ scope: "tree" }`.
 */
export function getAdjacent(
  documentId: string,
  items: Nodes,
  options: GetAdjacentOptions = {},
): { readonly previous?: string; readonly next?: string } {
  const level =
    options.scope === "tree"
      ? flattenNavigation(items)
      : getLevel(documentId, items);
  const index = level.indexOf(documentId);

  if (index === -1) return Object.freeze({});

  const previous = level[index - 1];
  const next = level[index + 1];

  return Object.freeze({
    ...(previous !== undefined ? { previous } : {}),
    ...(next !== undefined ? { next } : {}),
  });
}
