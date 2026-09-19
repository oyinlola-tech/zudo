/**
 * Audit round 10 phase 2 regressions for @zudojs/openapi: the shared
 * `OpenAPIError` (edge/CONV-02) and the schema limits read from
 * `@zudojs/constants` instead of a mirrored copy (edge HANDOFF 4).
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BaseError,
  ErrorCode,
  OpenAPIError as SharedOpenAPIError,
} from "@zudojs/errors";

import {
  OpenAPIDocumentError,
  OpenAPIError,
  createOpenAPIError,
  isOpenAPIError,
} from "../src/index.js";

describe("edge/CONV-02 (phase 2): OpenAPIError is the @zudojs/errors class", () => {
  it("re-exports the shared class and keeps the helpers", () => {
    expect(OpenAPIError).toBe(SharedOpenAPIError);
    const base = createOpenAPIError("x");
    expect(base).toBeInstanceOf(BaseError);
    expect(base.statusCode).toBe(500);
    expect(base.expose).toBe(false);
    expect(base.code).toBe(ErrorCode.OPENAPI_DOCUMENT);
    expect(isOpenAPIError(new OpenAPIDocumentError("doc"))).toBe(true);
    expect(new OpenAPIDocumentError("doc")).toBeInstanceOf(SharedOpenAPIError);
  });
});

describe("edge HANDOFF 4: no mirrored schema limits", () => {
  it("the mirror file is deleted", () => {
    const mirror = fileURLToPath(
      new URL(
        "../src/openApiConstants/openApiConstants.schemaLimits.ts",
        import.meta.url,
      ),
    );
    expect(existsSync(mirror)).toBe(false);
  });
});
