/**
 * Marker insertion: the one mechanism `generate` and `add` use to register
 * routes, container entries, integrations and config sections.
 */

import { describe, expect, it } from "vitest";

import {
  MARKERS,
  insertBetweenMarkers,
  linesBetweenMarkers,
  renderMarkerBlock,
} from "../src/wiring/index.js";

const source = `export function registerRoutes(router, deps) {
  registerHealthRoutes(router, deps.health);
${renderMarkerBlock(MARKERS.routes, ["registerExamplesRoutes(router, deps.examplesController);"], "  ")}
}
`;

describe("insertBetweenMarkers", () => {
  it("inserts before the end marker with the marker's indentation", () => {
    const result = insertBetweenMarkers(source, MARKERS.routes, "registerUsersRoutes(router, deps.usersController);");
    expect(result.status).toBe("inserted");
    expect(result.source).toContain(
      "  registerExamplesRoutes(router, deps.examplesController);\n  registerUsersRoutes(router, deps.usersController);\n  // zudojs:routes:end",
    );
  });

  it("is idempotent: a line already between the markers is not added twice", () => {
    const once = insertBetweenMarkers(source, MARKERS.routes, "registerUsersRoutes(router, deps.usersController);");
    const twice = insertBetweenMarkers(once.source, MARKERS.routes, "  registerUsersRoutes(router, deps.usersController);  ");
    expect(twice.status).toBe("present");
    expect(twice.source).toBe(once.source);
  });

  it("leaves a file without markers untouched", () => {
    const plain = "export const x = 1;\n";
    expect(insertBetweenMarkers(plain, MARKERS.routes, "y();")).toEqual({
      status: "missing-markers",
      source: plain,
    });
  });

  it("refuses duplicated or reversed markers instead of guessing", () => {
    const doubled = `${source}\n// zudojs:routes:start\n// zudojs:routes:end\n`;
    expect(insertBetweenMarkers(doubled, MARKERS.routes, "y();").status).toBe("missing-markers");
    const reversed = "// zudojs:routes:end\n// zudojs:routes:start\n";
    expect(insertBetweenMarkers(reversed, MARKERS.routes, "y();").status).toBe("missing-markers");
  });

  it("lists the lines between markers", () => {
    expect(linesBetweenMarkers(source, MARKERS.routes)).toEqual([
      "registerExamplesRoutes(router, deps.examplesController);",
    ]);
  });
});
