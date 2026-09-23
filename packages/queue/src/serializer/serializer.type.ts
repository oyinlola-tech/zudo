/**
 * Serializer for job payloads.
 *
 * Provides serialization and deserialization of job data.
 */
export interface Serializer {
  /**
   * Marks a serializer that stores values as given. The in-memory queue
   * skips its round trip for such a serializer and keeps the payload by
   * reference, exactly as with `serializePayloads: false`.
   */
  readonly passthrough?: boolean;
  /** Serialize data to a string. */
  serialize<T>(data: T): string;
  /** Deserialize a string to data. */
  deserialize<T>(data: string): T;
}
