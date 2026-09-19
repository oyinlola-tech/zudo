import { BaseError, ErrorCode, ErrorCategory } from "@zudojs/errors";

/**
 * Error thrown when a gateway-specific failure occurs.
 */
export class GatewayError extends BaseError {
  constructor(
    message: string,
    options: { code?: string; statusCode?: number; cause?: unknown } = {},
  ) {
    super(message, {
      code: options.code ?? ErrorCode.INTERNAL_ERROR,
      category: ErrorCategory.INTERNAL,
      statusCode: options.statusCode ?? 500,
      expose: false,
      isOperational: true,
      cause: options.cause,
    });
  }
}

/**
 * Error thrown when a downstream service is unreachable or times out.
 */
export class ServiceUnavailableError extends BaseError {
  public readonly serviceName: string;

  constructor(serviceName: string, cause?: unknown) {
    super(`Service "${serviceName}" is unavailable`, {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      category: ErrorCategory.EXTERNAL_SERVICE,
      statusCode: 503,
      expose: true,
      isOperational: true,
      cause,
    });
    this.serviceName = serviceName;
  }
}
