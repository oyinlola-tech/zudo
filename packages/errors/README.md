# @zudojs/errors

Shared error base class, error codes, and error handling utilities for the Zudojs framework.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-errors](https://zudojs.oyinlola.site/docs/packages-errors) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-errors.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/errors
```

## Quick Start

```typescript
import {
  ApplicationError,
  ErrorCode,
  serializePublicError,
  toBaseError,
} from "@zudojs/errors";

throw new ApplicationError("Something went wrong", {
  code: ErrorCode.INTERNAL_ERROR,
  statusCode: 500,
  metadata: { orderId: "ord_123" },
});

// Anywhere you catch: normalize, enrich, and produce a client-safe body
try {
  await work();
} catch (thrown) {
  const error = toBaseError(thrown).withMetadata({ requestId });
  logger.error(error.toLogObject()); // stack + cause chain, sensitive metadata redacted
  res.status(error.statusCode).json(serializePublicError(error));
  // -> { code, message, category, statusCode } — no stack, no cause,
  //    and no metadata unless the error is exposable (or keys are allow-listed)
}
```

## Features

- `BaseError` with stable `code`, `category`, `severity`, `statusCode`, `expose`, `isOperational`, deep-frozen `metadata` and `cause`
- `ErrorCode`, `ErrorCategory` and `ErrorSeverity` enums with guards (`isErrorCode`, ...)
- Domain, infrastructure and system error families (access, state, HTTP, database, network, container, adapter, crypto, ...) with factories and type guards
- Base classes for other packages' error families, so their `instanceof` checks match: `TransactionError` (+ 10 subclasses), `MiddlewareLimitExceededError` / `MiddlewareDepthExceededError` / `MiddlewareRateLimitError` / `MiddlewareAbortedError`, `TraversalLimitError`, `HttpMiddlewareError` / `HttpMiddlewarePipelineError` / `HttpRequestGuardError`, `OpenAPIError`, `AuthError`, `OAuthError` (with `ErrorCode.OAUTH_*`), `CqrsError`, `ObservabilityError`, `InvalidConstantError` / `ConstantContextError`, and the `zudojs-cli` errors `CLIValidationError` / `CLIGenerationError` / `CLINotInProjectError` / `CLITemplateError`
- `withMetadata()` copies any error (including subclasses with custom constructors) with extra metadata
- Serialization: `toJSON()`/`toLogObject()` for trusted logs (cycle-safe cause chains truncated with `"[MaxDepth]"` after 8 levels across the whole chain; metadata under sensitive keys, sensitive keys in object causes and submitted issue values are redacted, so `JSON.stringify(error)` is safe to log), `serializePublicError` / `ErrorSerializer` / `ErrorHandler.toPublicResult` for untrusted clients (recursive redaction, metadata allow-list)
- Metadata utilities: `createErrorMetadata`, `mergeErrorMetadata`, `sanitizeErrorMetadata` (drops unsupported values) and `redactErrorMetadata` (removes secrets)
- Normalization (`toBaseError`, `normalizeUnknownError`, `ErrorHandler.normalize`) that keeps the thrown value as `cause` and classifies unknown failures as internal, non-operational 500s
- Error mapping registry (`ErrorMapperRegistry`, `mapErrorType`, declarative `ErrorMapping`)
- Cross-package safe type guards (`isBaseError` recognises instances from another installed copy of the package)

## Use Cases

- Consistent error handling across packages
- HTTP status code mapping
- Error categorization for monitoring
- User-friendly, non-leaking error responses
