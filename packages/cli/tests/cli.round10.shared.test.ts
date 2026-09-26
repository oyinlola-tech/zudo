import { describe, it, expect } from "vitest";

import * as sharedErrors from "@zudojs/errors";

import * as cliErrors from "../src/errors/index.js";
import { renderConfigFile } from "../src/templates/backendApp/parts/config.template.js";
import { renderAppFile } from "../src/templates/shared/appRuntime.template.js";

describe("LEAF-16", () => {
  it("the generated app resolves NODE_ENV with @zudojs/constants, once, in loadConfig", () => {
    // Round 12 (#14) moved the call from app.ts into configs/index.ts so the
    // value createApp receives is the one loadConfig read.
    const config = renderConfigFile({ defaultPort: 3000, sections: [] });
    expect(config).toContain('import { resolveEnvironment } from "@zudojs/constants";');
    expect(config).toContain("nodeEnv: resolveEnvironment({ NODE_ENV:");
    const source = renderAppFile({ applicationName: "demo", modules: [] });
    expect(source).toContain("environment: options.config.nodeEnv,");
    expect(source).not.toContain("ENVIRONMENTS.find");
  });
});

describe("tooling/CONV-01: CLI errors come from @zudojs/errors", () => {
  it("re-exports the shared classes", () => {
    expect(cliErrors.CLIValidationError).toBe(sharedErrors.CLIValidationError);
    expect(cliErrors.CLIGenerationError).toBe(sharedErrors.CLIGenerationError);
    expect(cliErrors.CLINotInProjectError).toBe(sharedErrors.CLINotInProjectError);
    expect(cliErrors.CLITemplateError).toBe(sharedErrors.CLITemplateError);
    const cause = new Error("io");
    const err = new cliErrors.CLIGenerationError("x", cause);
    expect(err).toBeInstanceOf(sharedErrors.ApplicationError);
    expect(err.cause).toBe(cause);
  });
});
