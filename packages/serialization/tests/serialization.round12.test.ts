/**
 * Round 12 regressions for @zudojs/serialization (academy finding #74).
 */

import { SERIALIZATION_SCHEMA_VERSION } from "@zudojs/constants";
import { InvalidSerializedDataError, SerializationError } from "@zudojs/errors";
import { describe, expect, it } from "vitest";

import {
  JSONSerializer,
  createEnvelope,
  deserializeFromEnvelope,
  serializeToEnvelope,
  unwrapEnvelope,
} from "../src/index.js";

describe("#74 envelope version is the wire-format version", () => {
  it("refuses to produce an envelope this build cannot read back", () => {
    expect(() => createEnvelope("{}", "json", { version: 2 })).toThrow(SerializationError);
    expect(() => createEnvelope("{}", "json", { version: 2 })).toThrow(/schemaVersion/);
    expect(() => createEnvelope("{}", "json", { version: 0 })).toThrow(SerializationError);
    expect(() => createEnvelope("{}", "json", { version: 1.5 })).toThrow(SerializationError);
  });

  it("round-trips the current version", () => {
    const envelope = createEnvelope("{}", "json", { version: SERIALIZATION_SCHEMA_VERSION });
    expect(unwrapEnvelope(envelope, "json")).toBe("{}");
  });

  it("carries the application's type and schemaVersion verbatim", () => {
    const envelope = createEnvelope('{"id":1}', "json", {
      type: "OrderPlaced",
      schemaVersion: "2026-01",
    });
    expect(envelope.metadata.type).toBe("OrderPlaced");
    expect(envelope.metadata.schemaVersion).toBe("2026-01");
    expect(envelope.metadata.version).toBe(SERIALIZATION_SCHEMA_VERSION);
    expect(unwrapEnvelope(envelope)).toBe('{"id":1}');
    expect(createEnvelope("{}").metadata).not.toHaveProperty("type");
  });

  it("serializeToEnvelope stamps application metadata", () => {
    const serializer = new JSONSerializer();
    const envelope = serializeToEnvelope({ id: 1 }, serializer, "json", undefined, {
      type: "OrderPlaced",
      schemaVersion: 3,
    });
    expect(envelope.metadata.type).toBe("OrderPlaced");
    expect(envelope.metadata.schemaVersion).toBe(3);
    expect(deserializeFromEnvelope<{ id: number }>(envelope, serializer, "json")).toEqual({
      id: 1,
    });
  });

  it("rejects malformed application metadata from the wire", () => {
    const base = createEnvelope("{}");
    expect(() =>
      unwrapEnvelope({ ...base, metadata: { ...base.metadata, type: 7 } } as never),
    ).toThrow(InvalidSerializedDataError);
    expect(() =>
      unwrapEnvelope({
        ...base,
        metadata: { ...base.metadata, schemaVersion: { v: 1 } },
      } as never),
    ).toThrow(InvalidSerializedDataError);
  });
});
