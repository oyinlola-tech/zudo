import { describe, it, expect } from "vitest";
import {
  AuthError,
  AuthConfigurationError,
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRevokedError,
  AccountLockedError,
  AccountDeactivatedError,
  AccessDeniedError,
  SessionExpiredError,
  AuthRateLimitError,
} from "../src/index.js";
import { ErrorCategory, ErrorCode, isBaseError } from "@zudojs/errors";

/**
 * Round-7 AUTH-01/AUTH-20: every auth error used to inherit statusCode 500
 * and expose:false from the published BaseError, so a wrong password was
 * reported to the client as an unexposable 500, and every one of them was
 * categorised as an authentication failure.
 */
describe("auth error HTTP semantics", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly error: AuthError;
    readonly statusCode: number;
    readonly code: string;
    readonly category: string;
  }> = [
    {
      name: "AuthError",
      error: new AuthError("generic"),
      statusCode: 401,
      code: ErrorCode.AUTHENTICATION,
      category: ErrorCategory.AUTHENTICATION,
    },
    {
      name: "InvalidCredentialsError",
      error: new InvalidCredentialsError(),
      statusCode: 401,
      code: ErrorCode.INVALID_CREDENTIALS,
      category: ErrorCategory.AUTHENTICATION,
    },
    {
      name: "TokenExpiredError",
      error: new TokenExpiredError(),
      statusCode: 401,
      code: ErrorCode.TOKEN_EXPIRED,
      category: ErrorCategory.AUTHENTICATION,
    },
    {
      name: "TokenInvalidError",
      error: new TokenInvalidError(),
      statusCode: 401,
      code: ErrorCode.TOKEN_INVALID,
      category: ErrorCategory.AUTHENTICATION,
    },
    {
      name: "SessionExpiredError",
      error: new SessionExpiredError(),
      statusCode: 401,
      code: ErrorCode.SESSION_EXPIRED,
      category: ErrorCategory.AUTHENTICATION,
    },
    {
      name: "TokenRevokedError",
      error: new TokenRevokedError(),
      statusCode: 403,
      code: ErrorCode.FORBIDDEN,
      category: ErrorCategory.AUTHORIZATION,
    },
    {
      name: "AccountDeactivatedError",
      error: new AccountDeactivatedError(),
      statusCode: 403,
      code: ErrorCode.FORBIDDEN,
      category: ErrorCategory.AUTHORIZATION,
    },
    {
      name: "AccessDeniedError",
      error: new AccessDeniedError(),
      statusCode: 403,
      code: ErrorCode.ACCESS_DENIED,
      category: ErrorCategory.AUTHORIZATION,
    },
    {
      name: "AccountLockedError",
      error: new AccountLockedError(),
      statusCode: 423,
      code: ErrorCode.FORBIDDEN,
      category: ErrorCategory.RATE_LIMIT,
    },
    {
      name: "AuthRateLimitError",
      error: new AuthRateLimitError(),
      statusCode: 429,
      code: ErrorCode.RATE_LIMITED,
      category: ErrorCategory.RATE_LIMIT,
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.name} is a ${testCase.statusCode} and is exposable`, () => {
      expect(isBaseError(testCase.error)).toBe(true);
      expect(testCase.error.statusCode).toBe(testCase.statusCode);
      expect(testCase.error.expose).toBe(true);
      expect(testCase.error.isPublic()).toBe(true);
      expect(testCase.error.code).toBe(testCase.code);
      expect(testCase.error.category).toBe(testCase.category);
      expect(testCase.error.name).toBe(testCase.name);
      expect(testCase.error).toBeInstanceOf(AuthError);
    });
  }

  it("never reports an auth failure as a 5xx", () => {
    for (const { error } of cases) {
      expect(error.statusCode).toBeLessThan(500);
    }
  });

  it("AuthConfigurationError is a non-exposed 500", () => {
    const error = new AuthConfigurationError("secret missing");
    expect(error.statusCode).toBe(500);
    expect(error.expose).toBe(false);
    expect(error.isPublic()).toBe(false);
    expect(error.code).toBe(ErrorCode.CONFIGURATION_INVALID);
    expect(error.category).toBe(ErrorCategory.CONFIGURATION);
    expect(error.isOperationalError()).toBe(false);
  });

  it("carries retryAfterSeconds metadata for throttling errors", () => {
    expect(new AccountLockedError().getMetadata("retryAfterSeconds")).toBe(900);
    expect(
      new AccountLockedError(undefined, {
        retryAfterSeconds: 30,
      }).getMetadata("retryAfterSeconds"),
    ).toBe(30);
    expect(new AuthRateLimitError().getMetadata("retryAfterSeconds")).toBe(60);
    expect(
      new AuthRateLimitError(undefined, {
        retryAfterSeconds: 5,
      }).getMetadata("retryAfterSeconds"),
    ).toBe(5);
  });

  it("carries requiredPermission metadata on AccessDeniedError", () => {
    const error = new AccessDeniedError("nope", {
      requiredPermission: "billing:refund",
    });
    expect(error.getMetadata("requiredPermission")).toBe("billing:refund");
    expect(new AccessDeniedError().getMetadata("requiredPermission")).toBe(
      undefined,
    );
  });

  it("survives withMetadata() without losing its status or category", () => {
    const derived = new AccountLockedError().withMetadata({ attempts: 6 });
    expect(derived.statusCode).toBe(423);
    expect(derived.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(derived.getMetadata("attempts")).toBe(6);
    expect(derived.getMetadata("retryAfterSeconds")).toBe(900);
  });

  it("serialises the status code and exposure flag", () => {
    const json = new InvalidCredentialsError().toJSON();
    expect(json.statusCode).toBe(401);
    expect(json.expose).toBe(true);
  });
});
