/**
 * zudojs-cli — `zudojs add storage`: object storage on the local disk
 * (@zudojs/storage `LocalObjectStorage`) under STORAGE_DIRECTORY.
 */

import { zudojsDependencies } from "../../constants/index.js";
import type { AppRecipe } from "../recipe.type.js";

const source = (): string => `import { mkdir } from "node:fs/promises";

import { LocalObjectStorage } from "@zudojs/storage";

import type { Integration } from "./integration.js";

let storage: LocalObjectStorage | undefined;

/** The object store. Throws before the runtime has started. */
export function objectStorage(): LocalObjectStorage {
  if (storage === undefined) {
    throw new Error("Object storage is not ready: start the runtime first.");
  }
  return storage;
}

export const storageIntegration: Integration = {
  name: "storage",

  async start({ config }) {
    await mkdir(config.storage.directory, { recursive: true });
    storage = new LocalObjectStorage(config.storage.directory);
  },

  async stop() {
    storage = undefined;
  },

  async health() {
    return storage !== undefined;
  },
};
`;

export const storageRecipe: AppRecipe = {
  scope: "app",
  feature: "storage",
  summary: "Local object storage (src/integrations/storage.ts)",
  dependencies: zudojsDependencies(["@zudojs/storage"]),
  env: () => [{ name: "STORAGE_DIRECTORY", value: "./.data/storage" }],
  configSection: `storage: Object.freeze({ directory: text(config, "storage_directory", "./.data/storage") }),`,
  integration: { file: "storage.ts", exportName: "storageIntegration", source },
  gitignore: () => [".data/"],
};
