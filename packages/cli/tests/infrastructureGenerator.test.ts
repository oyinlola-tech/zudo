/**
 * zudojs-cli — Infrastructure Generator Tests
 *
 * Tests for InfrastructureGenerator.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { InfrastructureGenerator } from "../src/generators/infrastructure/infrastructure.generator.js";
import { writeFileTree } from "../src/utils/utils.fileSystem.js";

vi.mock("../src/utils/utils.fileSystem.js", () => ({
  writeFileTree: vi.fn(async () => {}),
}));

describe("InfrastructureGenerator", () => {
  beforeEach(() => {
    vi.mocked(writeFileTree).mockClear();
  });

  it("creates an instance", () => {
    const generator = new InfrastructureGenerator();
    expect(generator).toBeTruthy();
  });

  it("generates simple docker-compose for monolith", async () => {
    const generator = new InfrastructureGenerator();

    await generator.generate(
      {
        projectName: "test-project",
        architecture: "monolith",
        database: "postgresql",
        packageManager: "pnpm",
      },
      "/tmp",
    );

    // The previous version of this test only asserted that writeFileTree had
    // been called, so it would have passed for any output at all.
    const mock = vi.mocked(writeFileTree);
    expect(mock).toHaveBeenCalledTimes(1);
    const [basePath, files] = mock.mock.calls[0]!;
    expect(basePath).toBe("/tmp");

    const written = files as Record<string, string>;
    expect(Object.keys(written)).toEqual(
      expect.arrayContaining([
        "docker-compose.yml",
        ".dockerignore",
        "Dockerfile",
      ]),
    );
    expect(written["docker-compose.yml"]).toContain("postgres");
    // A monolith has no per-service Dockerfiles.
    expect(
      Object.keys(written).some((f) => f.startsWith("apps/services/")),
    ).toBe(false);
  });

  it("rejects a service name that would escape the target directory", async () => {
    const generator = new InfrastructureGenerator();

    await expect(
      generator.generate(
        {
          projectName: "test-project",
          architecture: "microservice",
          database: "postgresql",
          packageManager: "pnpm",
          services: ["../../etc/passwd"],
        },
        "/tmp",
      ),
    ).rejects.toThrow(/Invalid service name/);
  });

});
