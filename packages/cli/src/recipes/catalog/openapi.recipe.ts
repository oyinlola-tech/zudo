/**
 * zudojs-cli — `zudojs add openapi`: serves the OpenAPI document generated
 * from the router at /openapi.json and a documentation page at /docs, by
 * adding `mountOpenAPI` to `src/server.ts`.
 */

import { zudojsDependencies } from "../../constants/index.js";
import { openApiServerLines } from "../../templates/shared/server.template.js";
import { MARKERS } from "../../wiring/index.js";
import type { AppRecipe } from "../recipe.type.js";

export const openapiRecipe: AppRecipe = {
  scope: "app",
  feature: "openapi",
  summary: "OpenAPI document at /openapi.json and a docs page at /docs",
  dependencies: zudojsDependencies(["@zudojs/openapi"]),
  serverLines: (context) => {
    const lines = openApiServerLines(context.projectSlug);
    return [
      { marker: MARKERS.serverImports, line: lines.importLine },
      { marker: MARKERS.serverMounts, line: lines.mountLine },
    ];
  },
  nextSteps: () => [
    "Describe routes with the `openapi` route option; hide one with `openapi: false`.",
  ],
};
