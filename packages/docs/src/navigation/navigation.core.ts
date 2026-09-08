/**
 * Navigation model for documentation.
 *
 * Provides breadcrumb generation, tree flattening, and
 * link resolution for documentation navigation structures.
 *
 * Every walker tolerates shared or cyclic nodes (a node is visited at
 * most once) and stops at `MAX_NAVIGATION_DEPTH`, so malformed trees
 * never overflow the stack.
 */

import type {
  DocumentationBreadcrumb,
  DocumentationNavigationItem,
} from "../docsTypes/index.js";

/** Maximum nesting depth any walker will descend. */
export const MAX_NAVIGATION_DEPTH = 64;

type Nodes = readonly DocumentationNavigationItem[];

/**
 * Generates breadcrumbs for a given document ID
 * by walking the navigation tree. Intermediate section nodes keep
 * their `documentId` when they have one, so section landing pages
 * stay linkable.
 */
export function getBreadcrumbs(
  documentId: string,
  items: Nodes,
): readonly DocumentationBreadcrumb[] {
  const path: DocumentationBreadcrumb[] = [];
  const seen = new WeakSet<DocumentationNavigationItem>();

  function walk(nodes: Nodes, depth: number): boolean {
    if (depth > MAX_NAVIGATION_DEPTH) return false;

    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);

      if (node.documentId === documentId) {
        path.push(toBreadcrumb(node));
        return true;
      }

      if (node.children) {
        path.push(toBreadcrumb(node));
        if (walk(node.children, depth + 1)) {
          return true;
        }
        path.pop();
      }
    }

    return false;
  }

  walk(items, 0);
  return Object.freeze(path);
}

function toBreadcrumb(
  node: DocumentationNavigationItem,
): DocumentationBreadcrumb {
  return node.documentId === undefined
    ? { title: node.title }
    : { title: node.title, documentId: node.documentId };
}

/**
 * Flattens a navigation tree into a list of all document IDs in order.
 * A document referenced more than once appears once, at its first position.
 */
export function flattenNavigation(items: Nodes): readonly string[] {
  const result: string[] = [];
  const ids = new Set<string>();
  const seen = new WeakSet<DocumentationNavigationItem>();

  function walk(nodes: Nodes, depth: number): void {
    if (depth > MAX_NAVIGATION_DEPTH) return;

    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);

      if (node.documentId && !ids.has(node.documentId)) {
        ids.add(node.documentId);
        result.push(node.documentId);
      }

      if (node.children) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(items, 0);
  return Object.freeze(result);
}

/**
 * Finds a navigation item by document ID.
 */
export function findNavigationItem(
  documentId: string,
  items: Nodes,
): DocumentationNavigationItem | undefined {
  const seen = new WeakSet<DocumentationNavigationItem>();

  function walk(
    nodes: Nodes,
    depth: number,
  ): DocumentationNavigationItem | undefined {
    if (depth > MAX_NAVIGATION_DEPTH) return undefined;

    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);

      if (node.documentId === documentId) {
        return node;
      }

      if (node.children) {
        const found = walk(node.children, depth + 1);
        if (found) return found;
      }
    }

    return undefined;
  }

  return walk(items, 0);
}

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

/**
 * Gets the previous and next document IDs at the same navigation level.
 */
export function getAdjacent(
  documentId: string,
  items: Nodes,
): { readonly previous?: string; readonly next?: string } {
  const level = getLevel(documentId, items);
  const index = level.indexOf(documentId);

  if (index === -1) return Object.freeze({});

  const previous = level[index - 1];
  const next = level[index + 1];

  return Object.freeze({
    ...(previous !== undefined ? { previous } : {}),
    ...(next !== undefined ? { next } : {}),
  });
}
