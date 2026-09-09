/**
 * Metadata attached to RPC requests and responses.
 */
export interface RPCMetadata {
  readonly requestId?: string;

  readonly correlationId?: string;

  readonly traceId?: string;

  readonly spanId?: string;

  readonly tenantId?: string;

  readonly userId?: string;

  readonly deadline?: number;

  readonly [key: string]: string | number | boolean | undefined;
}

/**
 * Options for creating RPC metadata.
 */
export interface RPCMetadataOptions {
  readonly requestId?: string;

  readonly correlationId?: string;

  readonly traceId?: string;

  readonly spanId?: string;

  readonly tenantId?: string;

  readonly userId?: string;

  readonly deadline?: number;

  readonly [key: string]: string | number | boolean | undefined;
}

/**
 * Creates RPC metadata from options.
 */
export function createRPCMetadata(
  options: RPCMetadataOptions = {},
): RPCMetadata {
  return Object.freeze({ ...options });
}
