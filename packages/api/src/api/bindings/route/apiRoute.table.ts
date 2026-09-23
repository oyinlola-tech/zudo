import type { APIOperation } from "../../operation/operation.type.js";

import type { APIOperationSource } from "../shared/apiBinding.type.js";

import type { APIOperationRoute } from "./apiRoute.type.js";

import { listOperations } from "../shared/apiBinding.helper.js";

import { resolveApiRoute, routeConflictKey } from "./apiRoute.resolver.js";

/**
 * Options for {@link describeApiRoutes}.
 */
export interface DescribeApiRoutesOptions {
  /** Prefix for every route, e.g. `"/api"`. */
  readonly basePath?: string;
}

/** A route paired with the operation it runs. */
export interface APIRouteEntry {
  readonly route: APIOperationRoute;
  readonly operation: APIOperation;
  readonly segments: readonly string[];
}

/**
 * Result of matching a request against a route table.
 */
export type APIRouteMatch =
  | { readonly kind: "found"; readonly entry: APIRouteEntry; readonly params: Readonly<Record<string, string>> }
  | { readonly kind: "method-not-allowed"; readonly allow: readonly string[] }
  | { readonly kind: "not-found" }
  | { readonly kind: "bad-path" };

/**
 * Describes the HTTP route of every operation — the structural contract
 * `@zudojs/http` mounts and `@zudojs/openapi` documents.
 *
 * @throws {TypeError | RangeError} if a route is invalid, or if two
 * operations bind the same method and path shape.
 */
export function describeApiRoutes(
  operations: APIOperationSource,
  options: DescribeApiRoutesOptions = {},
): readonly APIOperationRoute[] {
  return Object.freeze(compileEntries(operations, options.basePath).map((e) => e.route));
}

function compileEntries(operations: APIOperationSource, basePath?: string): APIRouteEntry[] {
  const owners = new Map<string, string>();
  const entries = listOperations(operations).map((operation) => {
    const route = resolveApiRoute(operation, basePath);
    const key = routeConflictKey(route);
    const owner = owners.get(key);
    if (owner !== undefined) {
      throw new RangeError(
        `Operations "${owner}" and "${operation.name}" both bind ${route.method} ${route.path}.`,
      );
    }
    owners.set(key, operation.name);
    const segments = route.path === "/" ? [] : route.path.slice(1).split("/");
    return { route, operation, segments };
  });

  return entries.sort((a, b) => specificity(a.segments, b.segments));
}

/** Orders literal segments before parameters, so `/users/me` beats `/users/:id`. */
function specificity(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const diff = Number(a[i]!.startsWith(":")) - Number(b[i]!.startsWith(":"));
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * A compiled, immutable route table.
 */
export interface APIRouteTable {
  readonly entries: readonly APIRouteEntry[];
  match(method: string, pathname: string): APIRouteMatch;
}

/**
 * Compiles operations into a route table for request matching.
 *
 * @throws {TypeError | RangeError} as {@link describeApiRoutes}.
 */
export function compileRouteTable(operations: APIOperationSource, basePath?: string): APIRouteTable {
  const entries = Object.freeze(compileEntries(operations, basePath));

  return Object.freeze({
    entries,
    match(method: string, pathname: string): APIRouteMatch {
      const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
      const parts = trimmed === "/" || trimmed === "" ? [] : trimmed.slice(1).split("/");
      const allow = new Set<string>();

      for (const entry of entries) {
        const params = matchSegments(entry.segments, parts);
        if (params === "bad") {
          return { kind: "bad-path" };
        }
        if (params === undefined) {
          continue;
        }
        if (entry.route.method === method) {
          return { kind: "found", entry, params };
        }
        allow.add(entry.route.method);
      }

      return allow.size > 0
        ? { kind: "method-not-allowed", allow: [...allow] }
        : { kind: "not-found" };
    },
  });
}

function matchSegments(
  template: readonly string[],
  parts: readonly string[],
): Record<string, string> | undefined | "bad" {
  if (template.length !== parts.length) {
    return undefined;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < template.length; i += 1) {
    const expected = template[i]!;
    const actual = parts[i]!;
    if (expected.startsWith(":")) {
      if (actual.length === 0) {
        return undefined;
      }
      try {
        params[expected.slice(1)] = decodeURIComponent(actual);
      } catch {
        return "bad";
      }
    } else if (expected !== actual) {
      return undefined;
    }
  }
  return params;
}
