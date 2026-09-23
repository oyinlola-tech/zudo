/**
 * zudojs-cli — Where a resource's files go.
 */

import { posix } from "node:path";

/** Placement of a resource inside a generated project (POSIX, relative). */
export interface ResourceLayout {
  /** Directory the layer folders live in: `src`, `src/modules/billing`. */
  readonly base: string;
  /** The app's source root: `src`, `apps/gateway/src`. */
  readonly appSrc: string;
  /** The app's root (holds package.json): `""`, `apps/gateway`. */
  readonly appRoot: string;
  /** Whether the app has Prisma set up (prisma/schema.prisma exists). */
  readonly prisma: boolean;
}

/** Import prefix from a layer folder of `layout` to the app's src root. */
export function toAppSrc(layout: ResourceLayout, layerDir: string): string {
  const from = posix.join(layout.base, layerDir);
  const rel = posix.relative(from, layout.appSrc);
  return rel === "" ? "." : rel;
}

/** Joins path segments, dropping empty ones. */
export function joinPath(...parts: readonly string[]): string {
  return posix.join(...parts.filter((part) => part.length > 0));
}
