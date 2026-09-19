/**
 * @zudojs/storage — Round 10 regression tests.
 *
 * One describe block per finding.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { LocalObjectStorage, SIDECAR_DIR } from "../src/objectStorage/index.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = async (storage: LocalObjectStorage, key: string): Promise<string> =>
  Buffer.from(await (await storage.get(key))!.arrayBuffer()).toString();

let root: string;
let storage: LocalObjectStorage;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "zudo-storage-r10-"));
  storage = new LocalObjectStorage(root);
  await storage.put("tenantB/invoice.pdf", bytes("B-SECRET"), {
    contentType: "application/pdf",
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/* ─── INF-02: `..` segments crossed caller-applied prefixes ──────────────── */

describe("INF-02", () => {
  it("refuses a key that climbs out of a tenant prefix", async () => {
    await expect(storage.get("tenantA/../tenantB/invoice.pdf")).rejects.toThrow(
      /Path traversal detected/,
    );
    await expect(
      storage.put("tenantA/../tenantB/invoice.pdf", bytes("OVERWRITTEN")),
    ).rejects.toMatchObject({ code: "STORAGE_PATH_TRAVERSAL" });
    await expect(storage.delete("tenantA/../tenantB/invoice.pdf")).rejects.toThrow();
    expect(await text(storage, "tenantB/invoice.pdf")).toBe("B-SECRET");
  });

  it("refuses `.` and empty segments instead of normalising them", async () => {
    await expect(storage.get("./tenantB/invoice.pdf")).rejects.toThrow();
    await expect(storage.get("tenantB/./invoice.pdf")).rejects.toThrow();
    await expect(storage.get("tenantB//invoice.pdf")).rejects.toMatchObject({
      code: "STORAGE_INVALID_KEY",
    });
    await expect(storage.exists("tenantA\\..\\tenantB/invoice.pdf")).rejects.toThrow();
  });

  it("still accepts dotted names that are not dot segments", async () => {
    await storage.put("a/..b/.c/d..e", bytes("ok"));
    expect(await text(storage, "a/..b/.c/d..e")).toBe("ok");
  });
});

/* ─── INF-03: the metadata tree was writable through a non-normalised key ── */

describe("INF-03", () => {
  it("cannot forge another object's metadata through a dotted key", async () => {
    const forged = `x/../${SIDECAR_DIR}/tenantB/invoice.pdf.json`;
    await expect(
      storage.put(forged, bytes(JSON.stringify({ contentType: "text/html" }))),
    ).rejects.toThrow();
    const meta = await storage.metadata("tenantB/invoice.pdf");
    expect(meta?.contentType).toBe("application/pdf");
    const raw = await readFile(
      join(root, SIDECAR_DIR, "tenantB", "invoice.pdf.json"),
      "utf8",
    );
    expect(raw).not.toContain("text/html");
  });

  it("still refuses the reserved directory addressed directly", async () => {
    await expect(
      storage.put(`${SIDECAR_DIR}/x.json`, bytes("{}")),
    ).rejects.toMatchObject({ code: "STORAGE_RESERVED_KEY" });
  });
});

/* ─── INF-14: every I/O error was reported as "not found" ────────────────── */

describe("INF-14", () => {
  it("surfaces a non-missing I/O error instead of returning null/false", async () => {
    await symlink("loop", join(root, "loop"));
    await expect(storage.get("loop")).rejects.toMatchObject({
      code: "ERR_STORAGE_READ",
    });
    await expect(storage.exists("loop")).rejects.toMatchObject({
      code: "ERR_STORAGE_READ",
    });
    await expect(storage.metadata("loop")).rejects.toMatchObject({
      code: "ERR_STORAGE_READ",
    });
  });

  it("still reports a genuinely missing object as null/false", async () => {
    expect(await storage.get("nope/missing.txt")).toBeNull();
    expect(await storage.exists("tenantB/invoice.pdf/child")).toBe(false);
    expect(await storage.metadata("tenantB")).toBeNull();
    expect(await storage.get("tenantB")).toBeNull();
  });
});
