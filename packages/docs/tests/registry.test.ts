import { describe, it, expect } from "vitest";
import { createDocumentRegistry } from "../src/registry/index.js";
import { createMarkdownDocument } from "../src/document/index.js";
import { DuplicateDocumentError } from "../src/errors/index.js";

function makeDoc(id: string, category?: string, tags?: string[]) {
  return createMarkdownDocument(id, `Title ${id}`, `# ${id}`, {
    category: category as never,
    tags,
  });
}

describe("DocumentRegistry", () => {
  it("registers and retrieves documents", () => {
    const registry = createDocumentRegistry();
    const doc = makeDoc("test.doc");

    registry.register(doc);

    expect(registry.get("test.doc")).toEqual(doc);
    expect(registry.size).toBe(1);
  });

  it("returns undefined for unknown IDs", () => {
    const registry = createDocumentRegistry();
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("throws on duplicate registration", () => {
    const registry = createDocumentRegistry();
    registry.register(makeDoc("dup"));

    expect(() => registry.register(makeDoc("dup"))).toThrow(
      DuplicateDocumentError,
    );
    expect(() => registry.register(makeDoc("dup"))).toThrow(
      'Document "dup" is already registered.',
    );
  });

  it("registers multiple documents", () => {
    const registry = createDocumentRegistry();
    registry.registerAll([makeDoc("a"), makeDoc("b"), makeDoc("c")]);

    expect(registry.size).toBe(3);
    expect(registry.getAll()).toHaveLength(3);
  });

  it("checks if ID exists", () => {
    const registry = createDocumentRegistry();
    registry.register(makeDoc("exists"));

    expect(registry.has("exists")).toBe(true);
    expect(registry.has("nope")).toBe(false);
  });

  it("deletes documents", () => {
    const registry = createDocumentRegistry();
    registry.register(makeDoc("del"));

    expect(registry.delete("del")).toBe(true);
    expect(registry.has("del")).toBe(false);
    expect(registry.size).toBe(0);
  });

  it("clears all documents", () => {
    const registry = createDocumentRegistry();
    registry.registerAll([makeDoc("a"), makeDoc("b")]);

    registry.clear();
    expect(registry.size).toBe(0);
  });

  it("returns all IDs", () => {
    const registry = createDocumentRegistry();
    registry.registerAll([makeDoc("x"), makeDoc("y")]);

    expect(registry.ids()).toEqual(["x", "y"]);
  });

  it("filters by category", () => {
    const registry = createDocumentRegistry();
    registry.register(makeDoc("a", "guide"));
    registry.register(makeDoc("b", "reference"));
    registry.register(makeDoc("c", "guide"));

    expect(registry.byCategory("guide")).toHaveLength(2);
    expect(registry.byCategory("reference")).toHaveLength(1);
  });

  it("filters by tag", () => {
    const registry = createDocumentRegistry();
    registry.register(makeDoc("a", undefined, ["http"]));
    registry.register(makeDoc("b", undefined, ["http", "routing"]));
    registry.register(makeDoc("c", undefined, ["db"]));

    expect(registry.byTag("http")).toHaveLength(2);
    expect(registry.byTag("db")).toHaveLength(1);
  });

  it("returns frozen arrays from getAll", () => {
    const registry = createDocumentRegistry();
    registry.register(makeDoc("a"));

    const all = registry.getAll();
    expect(Object.isFrozen(all)).toBe(true);
  });
});
