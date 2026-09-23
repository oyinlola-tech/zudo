/**
 * zudojs-cli — Which files a resource-family schematic writes.
 *
 * `resource`, `route`, `controller`, `service`, `repository` and `dto` all write part
 * of the same DTO → repository → service → controller → routes chain. Each
 * writes its own layer ("primary") and any lower layer that does not exist
 * yet ("required"), so whatever it writes compiles on its own:
 * `generate controller users` also writes the users service, repository
 * and DTO when they are missing, and never touches them when they exist.
 *
 * `service` used to have a generator of its own that wrote
 * `services/<name>/<name>.service.ts`, a second layout next to the
 * `services/<name>.service.ts` every other schematic and the container
 * wiring use; `generate controller` after `generate service` then wrote a
 * second, unrelated service. It is part of the chain now.
 */

import type { ResourceLayer } from "../../templates/resource/index.js";

/** Schematics served by the resource generator. */
export const RESOURCE_SCHEMATICS = [
  "resource",
  "route",
  "controller",
  "service",
  "repository",
  "dto",
] as const;

/** A schematic served by the resource generator. */
export type ResourceSchematic = (typeof RESOURCE_SCHEMATICS)[number];

/** Whether `schematic` is served by the resource generator. */
export function isResourceSchematic(schematic: string): schematic is ResourceSchematic {
  return (RESOURCE_SCHEMATICS as readonly string[]).includes(schematic);
}

/** The layers a schematic owns, and the ones it needs underneath. */
export interface ResourcePlan {
  readonly primary: readonly ResourceLayer[];
  readonly required: readonly ResourceLayer[];
  /** Whether the routes are registered and the controller constructed. */
  readonly register: boolean;
}

/** The {@link ResourcePlan} of each schematic. */
export function planResource(schematic: ResourceSchematic): ResourcePlan {
  switch (schematic) {
    case "resource":
      return {
        primary: ["dto", "repository", "service", "controller", "routes", "test"],
        required: [],
        register: true,
      };
    case "route":
      return {
        primary: ["routes"],
        required: ["dto", "repository", "service", "controller"],
        register: true,
      };
    case "controller":
      return { primary: ["controller"], required: ["dto", "repository", "service"], register: false };
    case "service":
      return { primary: ["service"], required: ["dto", "repository"], register: false };
    case "repository":
      return { primary: ["repository"], required: ["dto"], register: false };
    case "dto":
      return { primary: ["dto"], required: [], register: false };
  }
}
