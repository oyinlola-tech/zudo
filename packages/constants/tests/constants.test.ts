import { describe, it, expect, vi, afterEach } from "vitest";
import {
  // HTTP
  type HttpMethod,
  HttpMethods,
  HTTP_METHODS,
  SAFE_HTTP_METHODS,
  IDEMPOTENT_HTTP_METHODS,
  type HttpStatusCode,
  HttpStatus,
  isSuccessStatus,
  isRedirectStatus,
  isClientError,
  isServerError,
  isErrorStatus,
  type HttpHeaderName,
  HttpHeader,
  type ContentType,
  ContentTypes,
  Charset,
  buildContentType,

  // Environment
  type Environment,
  Environments,
  ENVIRONMENTS,
  isValidEnvironment,
  NODE_ENV_KEY,
  type ResolveEnvironmentOptions,
  resolveEnvironment,
  isProduction,
  isDevelopment,
  isTest,

  // Time
  type TimeUnit,
  TimeUnits,
  TimeMs,
  DefaultTimeout,
  DefaultRetry,
  toMilliseconds,
  formatDuration,

  // Common
  Limits,
  Defaults,
  Sentinel,
  NONE,
  UNINITIALIZED,
  EMPTY,
  createUserId,
  createEventId,
  createRequestId,
  createCorrelationId,
  createTimestamp,

  // Validation
  ValidationPattern,
  ValidationLength,
  ValidationRange,

  // Cache
  type CacheStrategy,
  CacheStrategies,
  CacheDuration,
  buildCacheControl,

  // Priority
  type Priority,
  Priorities,
  PriorityWeight,
  comparePriority,

  // Common — new factories
  createSessionId,
  createTenantId,
  createMessageId,
  createMessageCausationId,
  createTokenId,
  createUrl,
  createEmailAddress,
  createHexString,
  createBase64String,
  createJsonString,

  // Serialization
  SerializationFormat,
  SerializationContentType,
  SerializationLimits,
  SerializationTags,
  SERIALIZATION_SCHEMA_VERSION,

  // Schema
  type SchemaIssueCode as SchemaIssueCodeType,
  SchemaIssueCode,
  SCHEMA_DEFAULT_MAX_DEPTH,
  SCHEMA_DEFAULT_MAX_STRING_LENGTH,
  SCHEMA_DEFAULT_MAX_ARRAY_LENGTH,
  SCHEMA_DEFAULT_MAX_OBJECT_KEYS,
  SCHEMA_FORBIDDEN_KEYS,
  SCHEMA_STRING_FORMATS,

  // Lifecycle
  type LifecycleState as LifecycleStateType,
  type LifecyclePhase as LifecyclePhaseType,
  LifecycleState,
  LifecyclePhase,
  LIFECYCLE_VALID_TRANSITIONS,
  LIFECYCLE_DEFAULT_CONCURRENCY,
  LIFECYCLE_DEFAULT_RETRY_ATTEMPTS,

  // Runtime
  type Clock,
  type MockClock,
  type Random,
  systemClock,
  createMockClock,
  systemRandom,
  createMockRandom,

  // Errors
  InvalidConstantError,
  ConstantContextError,
} from "../src/index.js";

// ─── HTTP ───────────────────────────────────────────────────────────────────

describe("HttpMethods", () => {
  it("should contain all standard HTTP methods", () => {
    expect(HttpMethods.GET).toBe("GET");
    expect(HttpMethods.POST).toBe("POST");
    expect(HttpMethods.PUT).toBe("PUT");
    expect(HttpMethods.PATCH).toBe("PATCH");
    expect(HttpMethods.DELETE).toBe("DELETE");
    expect(HttpMethods.HEAD).toBe("HEAD");
    expect(HttpMethods.OPTIONS).toBe("OPTIONS");
    expect(HttpMethods.TRACE).toBe("TRACE");
    expect(HttpMethods.CONNECT).toBe("CONNECT");
  });

  it("should have 9 methods in HTTP_METHODS set", () => {
    expect(HTTP_METHODS.size).toBe(9);
  });

  it("should identify safe methods", () => {
    expect(SAFE_HTTP_METHODS.has("GET")).toBe(true);
    expect(SAFE_HTTP_METHODS.has("HEAD")).toBe(true);
    expect(SAFE_HTTP_METHODS.has("OPTIONS")).toBe(true);
    expect(SAFE_HTTP_METHODS.has("POST")).toBe(false);
  });

  it("should identify idempotent methods", () => {
    expect(IDEMPOTENT_HTTP_METHODS.has("GET")).toBe(true);
    expect(IDEMPOTENT_HTTP_METHODS.has("PUT")).toBe(true);
    expect(IDEMPOTENT_HTTP_METHODS.has("DELETE")).toBe(true);
    expect(IDEMPOTENT_HTTP_METHODS.has("POST")).toBe(false);
  });
});

describe("HttpStatus", () => {
  it("should contain all standard status codes", () => {
    expect(HttpStatus.OK).toBe(200);
    expect(HttpStatus.CREATED).toBe(201);
    expect(HttpStatus.NO_CONTENT).toBe(204);
    expect(HttpStatus.BAD_REQUEST).toBe(400);
    expect(HttpStatus.UNAUTHORIZED).toBe(401);
    expect(HttpStatus.NOT_FOUND).toBe(404);
    expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
  });

  it("isSuccessStatus should work", () => {
    expect(isSuccessStatus(200)).toBe(true);
    expect(isSuccessStatus(299)).toBe(true);
    expect(isSuccessStatus(300)).toBe(false);
    expect(isSuccessStatus(199)).toBe(false);
  });

  it("isRedirectStatus should work", () => {
    expect(isRedirectStatus(301)).toBe(true);
    expect(isRedirectStatus(399)).toBe(true);
    expect(isRedirectStatus(400)).toBe(false);
  });

  it("isClientError should work", () => {
    expect(isClientError(400)).toBe(true);
    expect(isClientError(499)).toBe(true);
    expect(isClientError(500)).toBe(false);
  });

  it("isServerError should work", () => {
    expect(isServerError(500)).toBe(true);
    expect(isServerError(599)).toBe(true);
    expect(isServerError(499)).toBe(false);
  });

  it("isErrorStatus should work", () => {
    expect(isErrorStatus(400)).toBe(true);
    expect(isErrorStatus(500)).toBe(true);
    expect(isErrorStatus(200)).toBe(false);
  });
});

describe("HttpHeader", () => {
  it("should contain common headers", () => {
    expect(HttpHeader.CONTENT_TYPE).toBe("Content-Type");
    expect(HttpHeader.AUTHORIZATION).toBe("Authorization");
    expect(HttpHeader.ACCEPT).toBe("Accept");
    expect(HttpHeader.X_REQUEST_ID).toBe("X-Request-Id");
  });
});

describe("ContentTypes", () => {
  it("should contain common MIME types", () => {
    expect(ContentTypes.JSON).toBe("application/json");
    expect(ContentTypes.TEXT_PLAIN).toBe("text/plain");
    expect(ContentTypes.IMAGE_PNG).toBe("image/png");
  });

  it("buildContentType should work", () => {
    expect(buildContentType("application/json")).toBe("application/json");
    expect(buildContentType("application/json", "utf-8")).toBe(
      "application/json; charset=utf-8",
    );
  });
});

// ─── Environment ────────────────────────────────────────────────────────────

describe("Environments", () => {
  it("should contain all environments", () => {
    expect(Environments.DEVELOPMENT).toBe("development");
    expect(Environments.TEST).toBe("test");
    expect(Environments.STAGING).toBe("staging");
    expect(Environments.PRODUCTION).toBe("production");
  });

  it("should have 4 environments", () => {
    expect(ENVIRONMENTS.size).toBe(4);
  });
});

describe("isValidEnvironment", () => {
  it("should accept valid environments", () => {
    expect(isValidEnvironment("development")).toBe(true);
    expect(isValidEnvironment("production")).toBe(true);
    expect(isValidEnvironment("test")).toBe(true);
    expect(isValidEnvironment("staging")).toBe(true);
  });

  it("should reject invalid environments", () => {
    expect(isValidEnvironment("dev")).toBe(false);
    expect(isValidEnvironment("prod")).toBe(false);
    expect(isValidEnvironment("")).toBe(false);
  });
});

describe("resolveEnvironment", () => {
  it("should default to development", () => {
    expect(resolveEnvironment({})).toBe("development");
  });

  it("should resolve from NODE_ENV", () => {
    expect(resolveEnvironment({ NODE_ENV: "production" })).toBe("production");
    expect(resolveEnvironment({ NODE_ENV: "test" })).toBe("test");
    expect(resolveEnvironment({ NODE_ENV: "staging" })).toBe("staging");
  });

  it("should normalise abbreviations", () => {
    expect(resolveEnvironment({ NODE_ENV: "prod" })).toBe("production");
    expect(resolveEnvironment({ NODE_ENV: "dev" })).toBe("development");
  });

  it("should handle case insensitivity", () => {
    expect(resolveEnvironment({ NODE_ENV: "PRODUCTION" })).toBe("production");
    expect(resolveEnvironment({ NODE_ENV: "Development" })).toBe("development");
  });
});

describe("isProduction / isDevelopment / isTest", () => {
  it("should detect production", () => {
    expect(isProduction({ NODE_ENV: "production" })).toBe(true);
    expect(isProduction({ NODE_ENV: "development" })).toBe(false);
  });

  it("should detect development", () => {
    expect(isDevelopment({ NODE_ENV: "development" })).toBe(true);
    expect(isDevelopment({ NODE_ENV: "production" })).toBe(false);
  });

  it("should detect test", () => {
    expect(isTest({ NODE_ENV: "test" })).toBe(true);
    expect(isTest({ NODE_ENV: "development" })).toBe(false);
  });
});

// ─── Time ───────────────────────────────────────────────────────────────────

describe("TimeUnits", () => {
  it("should contain all time units", () => {
    expect(TimeUnits.MILLISECONDS).toBe("milliseconds");
    expect(TimeUnits.SECONDS).toBe("seconds");
    expect(TimeUnits.MINUTES).toBe("minutes");
    expect(TimeUnits.HOURS).toBe("hours");
    expect(TimeUnits.DAYS).toBe("days");
  });
});

describe("TimeMs", () => {
  it("should have correct durations", () => {
    expect(TimeMs.MILLISECOND).toBe(1);
    expect(TimeMs.SECOND).toBe(1_000);
    expect(TimeMs.MINUTE).toBe(60_000);
    expect(TimeMs.HOUR).toBe(3_600_000);
    expect(TimeMs.DAY).toBe(86_400_000);
  });
});

describe("DefaultTimeout", () => {
  it("should have reasonable defaults", () => {
    expect(DefaultTimeout.FAST).toBeLessThan(DefaultTimeout.STANDARD);
    expect(DefaultTimeout.STANDARD).toBeLessThan(DefaultTimeout.SLOW);
    expect(DefaultTimeout.DATABASE).toBeGreaterThan(0);
  });
});

describe("DefaultRetry", () => {
  it("should have reasonable defaults", () => {
    expect(DefaultRetry.MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(DefaultRetry.BASE_DELAY_MS).toBeGreaterThan(0);
    expect(DefaultRetry.BACKOFF_MULTIPLIER).toBeGreaterThan(1);
  });
});

describe("toMilliseconds", () => {
  it("should convert from milliseconds", () => {
    expect(toMilliseconds(5, "milliseconds")).toBe(5);
  });

  it("should convert from seconds", () => {
    expect(toMilliseconds(2, "seconds")).toBe(2_000);
  });

  it("should convert from minutes", () => {
    expect(toMilliseconds(1, "minutes")).toBe(60_000);
  });

  it("should convert from hours", () => {
    expect(toMilliseconds(1, "hours")).toBe(3_600_000);
  });

  it("should convert from days", () => {
    expect(toMilliseconds(1, "days")).toBe(86_400_000);
  });
});

describe("formatDuration", () => {
  it("should format milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("should format seconds", () => {
    expect(formatDuration(5_000)).toBe("5s");
  });

  it("should format minutes with seconds remainder", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(125_600)).toBe("2m 5s");
    expect(formatDuration(150_000)).toBe("2m 30s");
  });

  it("should format whole minutes without seconds", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(120_000)).toBe("2m");
  });

  it("should format hours with minutes remainder (docstring style)", () => {
    expect(formatDuration(4_500_000)).toBe("1h 15m");
  });

  it("should format hours", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
  });

  it("should format hours with minutes", () => {
    expect(formatDuration(5_400_000)).toBe("1h 30m");
  });

  it("should format days", () => {
    expect(formatDuration(86_400_000)).toBe("1d");
  });

  it("should format days with hours", () => {
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });
});

// ─── Common ─────────────────────────────────────────────────────────────────

describe("Limits", () => {
  it("should have reasonable limits", () => {
    expect(Limits.MAX_DISPLAY_LENGTH).toBe(255);
    expect(Limits.MAX_PAGE_SIZE).toBe(100);
    expect(Limits.DEFAULT_PAGE_SIZE).toBe(20);
    expect(Limits.MAX_FILE_SIZE).toBeGreaterThan(0);
  });
});

describe("Defaults", () => {
  it("should have standard defaults", () => {
    expect(Defaults.ENCODING).toBe("utf-8");
    expect(Defaults.CONTENT_TYPE).toBe("application/json");
    expect(Defaults.TIMEZONE).toBe("UTC");
    expect(Defaults.PORT).toBe(3000);
  });
});

describe("Sentinel", () => {
  it("should have sentinel values", () => {
    expect(Sentinel.NULL).toBeNull();
    expect(Sentinel.DELETED).toBe("__DELETED__");
    expect(Sentinel.WILDCARD).toBe("*");
  });
});

describe("Sentinels", () => {
  it("NONE should be NONE", () => {
    expect(NONE).toBe("NONE");
  });

  it("UNINITIALIZED should be UNINITIALIZED", () => {
    expect(UNINITIALIZED).toBe("UNINITIALIZED");
  });

  it("EMPTY should be empty string", () => {
    expect(EMPTY).toBe("");
  });
});

describe("Branded type factories", () => {
  it("createUserId should return branded string", () => {
    const id = createUserId("user-123");
    expect(id).toBe("user-123");
  });

  it("createEventId should return branded string", () => {
    const id = createEventId("evt-456");
    expect(id).toBe("evt-456");
  });

  it("createRequestId should return branded string", () => {
    const id = createRequestId("req-789");
    expect(id).toBe("req-789");
  });

  it("createCorrelationId should return branded string", () => {
    const id = createCorrelationId("corr-abc");
    expect(id).toBe("corr-abc");
  });

  it("createTimestamp should return branded string", () => {
    const ts = createTimestamp("2024-01-01T00:00:00.000Z");
    expect(ts).toBe("2024-01-01T00:00:00.000Z");
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe("ValidationPattern", () => {
  it("should match valid emails", () => {
    expect(ValidationPattern.EMAIL.test("user@example.com")).toBe(true);
    expect(ValidationPattern.EMAIL.test("test.name+tag@domain.co")).toBe(true);
  });

  it("should reject invalid emails", () => {
    expect(ValidationPattern.EMAIL.test("not-an-email")).toBe(false);
    expect(ValidationPattern.EMAIL.test("@example.com")).toBe(false);
  });

  it("should match valid UUIDs", () => {
    expect(
      ValidationPattern.UUID.test("550e8400-e29b-41d4-a716-446655440000"),
    ).toBe(true);
  });

  it("should reject invalid UUIDs", () => {
    expect(ValidationPattern.UUID.test("not-a-uuid")).toBe(false);
    expect(ValidationPattern.UUID.test("550e8400-e29b-41d4-a716")).toBe(false);
  });

  it("should match valid semver", () => {
    expect(ValidationPattern.SEMVER.test("1.0.0")).toBe(true);
    expect(ValidationPattern.SEMVER.test("2.1.3-beta.1")).toBe(true);
  });

  it("should match valid slugs", () => {
    expect(ValidationPattern.SLUG.test("hello-world")).toBe(true);
    expect(ValidationPattern.SLUG.test("my-cool-feature")).toBe(true);
  });
});

describe("ValidationLength", () => {
  it("should have reasonable lengths", () => {
    expect(ValidationLength.SHORT).toBe(64);
    expect(ValidationLength.NAME).toBe(128);
    expect(ValidationLength.EMAIL).toBe(254);
    expect(ValidationLength.URL).toBe(2_048);
  });
});

describe("ValidationRange", () => {
  it("should have reasonable ranges", () => {
    expect(ValidationRange.MIN_PORT).toBe(1);
    expect(ValidationRange.MAX_PORT).toBe(65_535);
    expect(ValidationRange.MAX_PAGE_SIZE).toBe(100);
  });
});

// ─── Cache ──────────────────────────────────────────────────────────────────

describe("CacheStrategies", () => {
  it("should contain all strategies", () => {
    expect(CacheStrategies.NO_STORE).toBe("no-store");
    expect(CacheStrategies.NO_CACHE).toBe("no-cache");
    expect(CacheStrategies.PRIVATE).toBe("private");
    expect(CacheStrategies.PUBLIC).toBe("public");
    expect(CacheStrategies.MUST_REVALIDATE).toBe("must-revalidate");
    expect(CacheStrategies.IMMUTABLE).toBe("immutable");
  });
});

describe("CacheDuration", () => {
  it("should have correct durations", () => {
    expect(CacheDuration.NONE).toBe(0);
    expect(CacheDuration.SHORT).toBe(10);
    expect(CacheDuration.MEDIUM).toBe(300);
    expect(CacheDuration.LONG).toBe(3_600);
  });
});

describe("buildCacheControl", () => {
  it("should build a simple cache control header", () => {
    const result = buildCacheControl({ strategy: "public", maxAge: 3600 });
    expect(result).toBe("public, max-age=3600");
  });

  it("should include stale-while-revalidate", () => {
    const result = buildCacheControl({
      strategy: "public",
      maxAge: 300,
      staleWhileRevalidate: 60,
    });
    expect(result).toBe("public, max-age=300, stale-while-revalidate=60");
  });

  it("should include s-maxage", () => {
    const result = buildCacheControl({
      strategy: "public",
      maxAge: 300,
      sharedMaxAge: 600,
    });
    expect(result).toBe("public, max-age=300, s-maxage=600");
  });

  it("should handle strategy only", () => {
    const result = buildCacheControl({ strategy: "no-store" });
    expect(result).toBe("no-store");
  });
});

// ─── Priority ───────────────────────────────────────────────────────────────

describe("Priorities", () => {
  it("should contain all priority levels", () => {
    expect(Priorities.CRITICAL).toBe("critical");
    expect(Priorities.HIGH).toBe("high");
    expect(Priorities.NORMAL).toBe("normal");
    expect(Priorities.LOW).toBe("low");
    expect(Priorities.BACKGROUND).toBe("background");
  });
});

describe("PriorityWeight", () => {
  it("should have correct weights", () => {
    expect(PriorityWeight.critical).toBe(100);
    expect(PriorityWeight.high).toBe(75);
    expect(PriorityWeight.normal).toBe(50);
    expect(PriorityWeight.low).toBe(25);
    expect(PriorityWeight.background).toBe(10);
  });
});

describe("comparePriority", () => {
  it("should rank critical above high", () => {
    expect(comparePriority("critical", "high")).toBeLessThan(0);
  });

  it("should rank high above normal", () => {
    expect(comparePriority("high", "normal")).toBeLessThan(0);
  });

  it("should return 0 for equal priorities", () => {
    expect(comparePriority("normal", "normal")).toBe(0);
  });

  it("should rank low below normal", () => {
    expect(comparePriority("low", "normal")).toBeGreaterThan(0);
  });
});

// ─── Errors ─────────────────────────────────────────────────────────────────

describe("InvalidConstantError", () => {
  it("should create an error with message", () => {
    const error = new InvalidConstantError("Invalid value provided");
    expect(error.message).toBe("Invalid value provided");
    expect(error.name).toBe("InvalidConstantError");
  });

  it("should be instance of Error", () => {
    const error = new InvalidConstantError("test");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("ConstantContextError", () => {
  it("should create an error with message", () => {
    const error = new ConstantContextError("Wrong context");
    expect(error.message).toBe("Wrong context");
    expect(error.name).toBe("ConstantContextError");
  });

  it("should be instance of Error", () => {
    const error = new ConstantContextError("test");
    expect(error).toBeInstanceOf(Error);
  });
});

// --- Audit regression & coverage tests --------------------------------------

import { ErrorCode, ErrorCategory, ErrorSeverity } from "@zudojs/errors";

describe("derived literal-union types (finding 16)", () => {
  it("HttpStatusCode is the union of HttpStatus values", () => {
    const teapot: HttpStatusCode = HttpStatus.IM_A_TEAPOT;
    expect(teapot).toBe(418);
  });

  it("literal types accept catalogue values", () => {
    const header: HttpHeaderName = HttpHeader.CONTENT_TYPE;
    const ct: ContentType = ContentTypes.JSON;
    const method: HttpMethod = HttpMethods.GET;
    const env: Environment = Environments.PRODUCTION;
    const unit: TimeUnit = TimeUnits.SECONDS;
    const strategy: CacheStrategy = CacheStrategies.PUBLIC;
    const priority: Priority = Priorities.HIGH;
    expect([header, ct, method, env, unit, strategy, priority]).toEqual([
      "Content-Type",
      "application/json",
      "GET",
      "production",
      "seconds",
      "public",
      "high",
    ]);
  });
});

describe("HttpStatus - added codes (finding 21)", () => {
  it("includes 1xx codes", () => {
    expect(HttpStatus.CONTINUE).toBe(100);
    expect(HttpStatus.SWITCHING_PROTOCOLS).toBe(101);
  });

  it("includes the added 2xx/3xx codes", () => {
    expect(HttpStatus.NON_AUTHORITATIVE_INFORMATION).toBe(203);
    expect(HttpStatus.SEE_OTHER).toBe(303);
  });

  it("includes the added 4xx codes", () => {
    expect(HttpStatus.REQUEST_TIMEOUT).toBe(408);
    expect(HttpStatus.LENGTH_REQUIRED).toBe(411);
    expect(HttpStatus.PRECONDITION_FAILED).toBe(412);
    expect(HttpStatus.PAYLOAD_TOO_LARGE).toBe(413);
    expect(HttpStatus.URI_TOO_LONG).toBe(414);
    expect(HttpStatus.UNSUPPORTED_MEDIA_TYPE).toBe(415);
    expect(HttpStatus.RANGE_NOT_SATISFIABLE).toBe(416);
    expect(HttpStatus.IM_A_TEAPOT).toBe(418);
    expect(HttpStatus.TOO_EARLY).toBe(425);
    expect(HttpStatus.UPGRADE_REQUIRED).toBe(426);
    expect(HttpStatus.PRECONDITION_REQUIRED).toBe(428);
    expect(HttpStatus.REQUEST_HEADER_FIELDS_TOO_LARGE).toBe(431);
    expect(HttpStatus.UNAVAILABLE_FOR_LEGAL_REASONS).toBe(451);
  });

  it("includes the added 5xx codes", () => {
    expect(HttpStatus.HTTP_VERSION_NOT_SUPPORTED).toBe(505);
    expect(HttpStatus.INSUFFICIENT_STORAGE).toBe(507);
  });
});

describe("immutable sets (finding 4)", () => {
  const cases: ReadonlyArray<[string, ReadonlySet<string>]> = [
    ["SCHEMA_FORBIDDEN_KEYS", SCHEMA_FORBIDDEN_KEYS],
    ["HTTP_METHODS", HTTP_METHODS],
    ["SAFE_HTTP_METHODS", SAFE_HTTP_METHODS],
    ["IDEMPOTENT_HTTP_METHODS", IDEMPOTENT_HTTP_METHODS],
    ["ENVIRONMENTS", ENVIRONMENTS],
  ];

  it.each(cases)("%s throws on add/delete/clear", (_name, set) => {
    const mutable = set as Set<string>;
    expect(() => mutable.add("evil")).toThrow(TypeError);
    expect(() => mutable.delete([...set][0]!)).toThrow(TypeError);
    expect(() => mutable.clear()).toThrow(TypeError);
  });

  it.each(cases)("%s still supports reads after failed mutation", (_n, set) => {
    expect(set.size).toBeGreaterThan(0);
    expect(set.has([...set][0]!)).toBe(true);
  });

  it("SCHEMA_FORBIDDEN_KEYS guards the prototype-pollution keys", () => {
    expect(SCHEMA_FORBIDDEN_KEYS.has("__proto__")).toBe(true);
    expect(SCHEMA_FORBIDDEN_KEYS.has("constructor")).toBe(true);
    expect(SCHEMA_FORBIDDEN_KEYS.has("prototype")).toBe(true);
    expect(SCHEMA_FORBIDDEN_KEYS.size).toBe(3);
  });
});

describe("Object.isFrozen on constant objects (finding 26)", () => {
  it("all exported const objects are frozen", () => {
    for (const obj of [
      HttpMethods,
      HttpStatus,
      HttpHeader,
      ContentTypes,
      Charset,
      Environments,
      TimeUnits,
      TimeMs,
      DefaultTimeout,
      DefaultRetry,
      Limits,
      Defaults,
      Sentinel,
      ValidationPattern,
      ValidationLength,
      ValidationRange,
      CacheStrategies,
      CacheDuration,
      Priorities,
      PriorityWeight,
      SerializationFormat,
      SerializationContentType,
      SerializationLimits,
      SerializationTags,
      SCHEMA_STRING_FORMATS,
      LIFECYCLE_VALID_TRANSITIONS,
    ]) {
      expect(Object.isFrozen(obj)).toBe(true);
    }
  });
});

// --- Runtime ----------------------------------------------------------------

describe("systemClock", () => {
  it("tracks real time", () => {
    const clock: Clock = systemClock;
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
    expect(clock.Date()).toBeInstanceOf(Date);
  });
});

describe("createMockClock", () => {
  it("returns the fixed time", () => {
    const clock: MockClock = createMockClock(1_000);
    expect(clock.now()).toBe(1_000);
    expect(clock.Date().getTime()).toBe(1_000);
  });

  it("defaults to time 0", () => {
    expect(createMockClock().now()).toBe(0);
  });

  it("advance(ms) moves time forward", () => {
    const clock = createMockClock(500);
    clock.advance(250);
    expect(clock.now()).toBe(750);
    clock.advance(250);
    expect(clock.now()).toBe(1_000);
  });

  it("set(time) jumps to an absolute time", () => {
    const clock = createMockClock(500);
    clock.set(42);
    expect(clock.now()).toBe(42);
    expect(clock.Date().getTime()).toBe(42);
  });
});

describe("systemRandom (crypto-backed, finding 3)", () => {
  it("random() returns values in [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const v = systemRandom.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randomInt stays within inclusive bounds", () => {
    for (let i = 0; i < 200; i++) {
      const v = systemRandom.randomInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("randomInt covers a degenerate single-value range", () => {
    expect(systemRandom.randomInt(5, 5)).toBe(5);
  });

  it("randomString has the right length and alphabet", () => {
    const s = systemRandom.randomString(64);
    expect(s).toHaveLength(64);
    expect(/^[a-z0-9]+$/.test(s)).toBe(true);
    expect(s.includes("undefined")).toBe(false);
  });

  it("randomBytes returns the requested number of bytes", () => {
    const bytes = systemRandom.randomBytes(32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(32);
  });

  it("randomBytes is not constant output", () => {
    const a = systemRandom.randomBytes(16);
    const b = systemRandom.randomBytes(16);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});

describe("createMockRandom (finding 2)", () => {
  it("is deterministic for the same seed", () => {
    const a: Random = createMockRandom(42);
    const b: Random = createMockRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(a.random()).toBe(b.random());
    }
    expect(createMockRandom(7).randomString(16)).toBe(
      createMockRandom(7).randomString(16),
    );
  });

  it("differs across seeds", () => {
    expect(createMockRandom(1).random()).not.toBe(createMockRandom(2).random());
  });

  it("regression: state 653637408 must not yield 1.0", () => {
    // Old implementation divided by 0xffffffff and returned exactly 1.0 here.
    const rng = createMockRandom(653637408);
    const v = rng.random();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("random() always stays in [0, 1)", () => {
    const rng = createMockRandom(123);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randomInt stays within inclusive bounds", () => {
    const rng = createMockRandom(653637408);
    for (let i = 0; i < 1_000; i++) {
      const v = rng.randomInt(0, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it("randomString never contains 'undefined'", () => {
    const rng = createMockRandom(653637408);
    for (let i = 0; i < 50; i++) {
      const s = rng.randomString(32);
      expect(s).toHaveLength(32);
      expect(s.includes("undefined")).toBe(false);
      expect(/^[a-z0-9]+$/.test(s)).toBe(true);
    }
  });

  it("randomBytes yields bytes in [0, 255]", () => {
    const bytes = createMockRandom(9).randomBytes(256);
    expect(bytes).toHaveLength(256);
    for (const b of bytes) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });
});

// --- Lifecycle --------------------------------------------------------------

describe("LIFECYCLE_VALID_TRANSITIONS", () => {
  it("has an entry for every lifecycle state", () => {
    for (const state of Object.values(LifecycleState)) {
      expect(LIFECYCLE_VALID_TRANSITIONS[state]).toBeDefined();
    }
  });

  it("only transitions to known states", () => {
    const known = new Set(Object.values(LifecycleState));
    for (const targets of Object.values(LIFECYCLE_VALID_TRANSITIONS)) {
      for (const target of targets) {
        expect(known.has(target)).toBe(true);
      }
    }
  });

  it("DISPOSED is terminal", () => {
    expect(LIFECYCLE_VALID_TRANSITIONS[LifecycleState.DISPOSED]).toEqual([]);
  });

  it("no state transitions to itself", () => {
    for (const [state, targets] of Object.entries(
      LIFECYCLE_VALID_TRANSITIONS,
    )) {
      expect(targets).not.toContain(state);
    }
  });

  it("exposes all lifecycle phases", () => {
    expect(Object.values(LifecyclePhase)).toEqual([
      "initialize",
      "start",
      "ready",
      "stop",
      "dispose",
    ]);
  });
});

describe("numeric constant consolidation (finding 11)", () => {
  it("lifecycle defaults derive from canonical constants", () => {
    expect(LIFECYCLE_DEFAULT_RETRY_ATTEMPTS).toBe(DefaultRetry.MAX_ATTEMPTS);
    expect(LIFECYCLE_DEFAULT_CONCURRENCY).toBe(Limits.MAX_CONCURRENCY);
  });

  it("page/display/file-size limits agree", () => {
    expect(ValidationRange.MAX_PAGE_SIZE).toBe(Limits.MAX_PAGE_SIZE);
    expect(ValidationLength.DISPLAY).toBe(Limits.MAX_DISPLAY_LENGTH);
    expect(SCHEMA_DEFAULT_MAX_STRING_LENGTH).toBe(Limits.MAX_DISPLAY_LENGTH);
    expect(SerializationLimits.MAX_SIZE).toBe(Limits.MAX_FILE_SIZE);
  });

  it("defaults derive from canonical content-type/charset constants", () => {
    expect(Defaults.CONTENT_TYPE).toBe(ContentTypes.JSON);
    expect(Defaults.ENCODING).toBe(Charset.UTF_8);
    expect(SerializationContentType.JSON).toBe(ContentTypes.JSON);
    expect(SerializationContentType.TEXT).toBe(ContentTypes.TEXT_PLAIN);
    expect(SerializationContentType.OCTET).toBe(ContentTypes.OCTET_STREAM);
  });
});

// --- Schema & serialization -------------------------------------------------

describe("SCHEMA_STRING_FORMATS (findings 6-9)", () => {
  it("references ValidationPattern (single source of truth)", () => {
    expect(SCHEMA_STRING_FORMATS.EMAIL).toBe(ValidationPattern.EMAIL);
    expect(SCHEMA_STRING_FORMATS.URL).toBe(ValidationPattern.URL);
    expect(SCHEMA_STRING_FORMATS.UUID).toBe(ValidationPattern.UUID);
    expect(SCHEMA_STRING_FORMATS.UUID_V4).toBe(ValidationPattern.UUID_V4);
    expect(SCHEMA_STRING_FORMATS.DATETIME).toBe(
      ValidationPattern.ISO_DATE_TIME,
    );
    expect(SCHEMA_STRING_FORMATS.DATE).toBe(ValidationPattern.ISO_DATE);
    expect(SCHEMA_STRING_FORMATS.IPV4).toBe(ValidationPattern.IPV4);
    expect(SCHEMA_STRING_FORMATS.IPV6).toBe(ValidationPattern.IPV6);
    expect(SCHEMA_STRING_FORMATS.HEX_COLOR).toBe(ValidationPattern.HEX_COLOR);
    expect(SCHEMA_STRING_FORMATS.PHONE).toBe(ValidationPattern.PHONE);
  });

  it("DATETIME is anchored and supports fraction/offset (finding 6)", () => {
    const re = SCHEMA_STRING_FORMATS.DATETIME;
    expect(re.test("2024-01-01T00:00:00")).toBe(true);
    expect(re.test("2024-01-01T00:00:00Z")).toBe(true);
    expect(re.test("2024-01-01T00:00:00.123Z")).toBe(true);
    expect(re.test("2024-01-01T00:00:00+02:00")).toBe(true);
    expect(re.test("2024-01-01T00:00:00.5-05:30")).toBe(true);
    expect(re.test("2024-01-01T00:00:00 GARBAGE")).toBe(false);
    expect(re.test("2024-01-01T00:00:00Zzz")).toBe(false);
  });

  it("PHONE no longer accepts '()' (finding 7)", () => {
    expect(SCHEMA_STRING_FORMATS.PHONE.test("()")).toBe(false);
    expect(SCHEMA_STRING_FORMATS.PHONE.test("+2348012345678")).toBe(true);
  });

  it("TIME format still works", () => {
    expect(SCHEMA_STRING_FORMATS.TIME.test("12:34")).toBe(true);
    expect(SCHEMA_STRING_FORMATS.TIME.test("12:34:56")).toBe(true);
    expect(SCHEMA_STRING_FORMATS.TIME.test("noon")).toBe(false);
  });

  it("schema default limits are sane", () => {
    expect(SCHEMA_DEFAULT_MAX_DEPTH).toBe(100);
    expect(SCHEMA_DEFAULT_MAX_STRING_LENGTH).toBe(255);
    expect(SCHEMA_DEFAULT_MAX_ARRAY_LENGTH).toBe(1000);
    expect(SCHEMA_DEFAULT_MAX_OBJECT_KEYS).toBe(100);
  });

  it("SchemaIssueCode values are stable strings", () => {
    expect(SchemaIssueCode.INVALID_TYPE).toBe("invalid_type");
    expect(SchemaIssueCode.MAX_DEPTH_EXCEEDED).toBe("max_depth_exceeded");
  });
});

describe("serialization constants (findings 11, 23)", () => {
  it("MSGPACK uses the de facto x-msgpack MIME type", () => {
    expect(SerializationContentType.MSGPACK).toBe("application/x-msgpack");
  });

  it("formats and tags are stable", () => {
    expect(SerializationFormat.JSON).toBe("json");
    expect(SerializationFormat.MESSAGEPACK).toBe("messagepack");
    expect(SerializationTags.TYPE).toBe("$type");
    expect(SerializationTags.VALUE).toBe("$value");
    expect(SerializationTags.ENCODING).toBe("$encoding");
    expect(SERIALIZATION_SCHEMA_VERSION).toBe(1);
  });

  it("limits are positive", () => {
    expect(SerializationLimits.MAX_SIZE).toBe(10_485_760);
    expect(SerializationLimits.MAX_DEPTH).toBe(128);
    expect(SerializationLimits.MAX_TRANSFORMERS).toBe(256);
    expect(SerializationLimits.MAX_TYPE_TAG_LENGTH).toBe(128);
  });
});

// --- Time extras ------------------------------------------------------------

describe("TimeMs long durations", () => {
  it("WEEK/MONTH/YEAR are correct", () => {
    expect(TimeMs.WEEK).toBe(7 * TimeMs.DAY);
    expect(TimeMs.MONTH).toBe(30 * TimeMs.DAY);
    expect(TimeMs.YEAR).toBe(365 * TimeMs.DAY);
  });
});

// --- Validation patterns ----------------------------------------------------

describe("ValidationPattern.SEMVER (finding 5)", () => {
  it("accepts valid semver", () => {
    for (const v of [
      "0.0.0",
      "1.2.3",
      "10.20.30",
      "1.0.0-alpha",
      "1.0.0-alpha-1",
      "1.0.0-alpha.1",
      "1.0.0-0.3.7",
      "2.0.0-rc.1+build.123",
      "1.2.3+meta-valid",
    ]) {
      expect(ValidationPattern.SEMVER.test(v), v).toBe(true);
    }
  });

  it("rejects invalid semver", () => {
    for (const v of [
      "v1.2.3",
      "01.2.3",
      "1.02.3",
      "1.2",
      "1.2.3-",
      "1.2.3-01",
      "1.2.3+",
      "not-a-version",
    ]) {
      expect(ValidationPattern.SEMVER.test(v), v).toBe(false);
    }
  });
});

describe("ValidationPattern.UUID / UUID_V4 (finding 8)", () => {
  it("UUID accepts any version nibble", () => {
    expect(
      ValidationPattern.UUID.test("550e8400-e29b-11d4-a716-446655440000"),
    ).toBe(true);
    expect(
      ValidationPattern.UUID.test("550e8400-e29b-71d4-c716-446655440000"),
    ).toBe(true);
  });

  it("UUID_V4 requires version 4 and RFC variant", () => {
    expect(
      ValidationPattern.UUID_V4.test("550e8400-e29b-41d4-a716-446655440000"),
    ).toBe(true);
    expect(
      ValidationPattern.UUID_V4.test("550e8400-e29b-11d4-a716-446655440000"),
    ).toBe(false);
    expect(
      ValidationPattern.UUID_V4.test("550e8400-e29b-41d4-c716-446655440000"),
    ).toBe(false);
  });
});

describe("ValidationPattern.IPV6 (finding 9)", () => {
  it("accepts compressed and mapped forms", () => {
    for (const ip of [
      "::1",
      "::",
      "fe80::1",
      "2001:db8::8a2e:370:7334",
      "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      "::ffff:192.0.2.1",
      "::192.0.2.1",
      "64:ff9b::192.0.2.33",
    ]) {
      expect(ValidationPattern.IPV6.test(ip), ip).toBe(true);
    }
  });

  it("rejects invalid IPv6", () => {
    for (const ip of [
      "",
      ":::1",
      "1:2:3:4:5:6:7:8:9",
      "02001:db8::1",
      "fe80::1::2",
      "gggg::1",
      "192.168.0.1",
    ]) {
      expect(ValidationPattern.IPV6.test(ip), ip).toBe(false);
    }
  });
});

describe("ValidationPattern.IPV4", () => {
  it("accepts valid IPv4", () => {
    expect(ValidationPattern.IPV4.test("192.168.0.1")).toBe(true);
    expect(ValidationPattern.IPV4.test("255.255.255.255")).toBe(true);
    expect(ValidationPattern.IPV4.test("0.0.0.0")).toBe(true);
  });

  it("rejects invalid IPv4", () => {
    expect(ValidationPattern.IPV4.test("256.0.0.1")).toBe(false);
    expect(ValidationPattern.IPV4.test("1.2.3")).toBe(false);
    expect(ValidationPattern.IPV4.test("1.2.3.4.5")).toBe(false);
  });
});

describe("ValidationPattern.FILE_NAME (finding 10)", () => {
  it("rejects path traversal names", () => {
    expect(ValidationPattern.FILE_NAME.test(".")).toBe(false);
    expect(ValidationPattern.FILE_NAME.test("..")).toBe(false);
  });

  it("rejects Windows-invalid trailing dot/space", () => {
    expect(ValidationPattern.FILE_NAME.test("report.")).toBe(false);
    expect(ValidationPattern.FILE_NAME.test("report ")).toBe(false);
  });

  it("accepts ordinary names, including dotfiles", () => {
    expect(ValidationPattern.FILE_NAME.test("report.pdf")).toBe(true);
    expect(ValidationPattern.FILE_NAME.test(".gitignore")).toBe(true);
    expect(ValidationPattern.FILE_NAME.test("...three-dots")).toBe(true);
    expect(ValidationPattern.FILE_NAME.test("my file.txt")).toBe(true);
  });

  it("still rejects separators and reserved characters", () => {
    expect(ValidationPattern.FILE_NAME.test("a/b")).toBe(false);
    expect(ValidationPattern.FILE_NAME.test("a\\b")).toBe(false);
    expect(ValidationPattern.FILE_NAME.test("a:b")).toBe(false);
    expect(ValidationPattern.FILE_NAME.test("a|b")).toBe(false);
  });
});

describe("ValidationPattern.EMAIL (finding 30)", () => {
  it("accepts valid addresses", () => {
    expect(ValidationPattern.EMAIL.test("user@example.com")).toBe(true);
    expect(ValidationPattern.EMAIL.test("test.name+tag@domain.co")).toBe(true);
    expect(ValidationPattern.EMAIL.test("a@sub.do-main.org")).toBe(true);
  });

  it("rejects consecutive dots and edge dots/hyphens in the domain", () => {
    expect(ValidationPattern.EMAIL.test("a@b..com")).toBe(false);
    expect(ValidationPattern.EMAIL.test("a@.b.com")).toBe(false);
    expect(ValidationPattern.EMAIL.test("a@-b.com")).toBe(false);
    expect(ValidationPattern.EMAIL.test("a@b-.com")).toBe(false);
    expect(ValidationPattern.EMAIL.test("a@b.com-")).toBe(false);
  });

  it("ValidationLength.EMAIL is the RFC 5321 254 limit", () => {
    expect(ValidationLength.EMAIL).toBe(254);
  });
});

describe("ValidationPattern.STRONG_PASSWORD (finding 29)", () => {
  it("accepts strong passwords, including space/backtick/tilde specials", () => {
    expect(ValidationPattern.STRONG_PASSWORD.test("Abcdef1!")).toBe(true);
    expect(ValidationPattern.STRONG_PASSWORD.test("Abcdef1 x")).toBe(true);
    expect(ValidationPattern.STRONG_PASSWORD.test("Abcdef1`")).toBe(true);
    expect(ValidationPattern.STRONG_PASSWORD.test("Abcdef1~")).toBe(true);
  });

  it("rejects weak passwords", () => {
    expect(ValidationPattern.STRONG_PASSWORD.test("abcdef1!")).toBe(false);
    expect(ValidationPattern.STRONG_PASSWORD.test("ABCDEF1!")).toBe(false);
    expect(ValidationPattern.STRONG_PASSWORD.test("Abcdefgh!")).toBe(false);
    expect(ValidationPattern.STRONG_PASSWORD.test("Abcdefg1")).toBe(false);
    expect(ValidationPattern.STRONG_PASSWORD.test("Ab1!")).toBe(false);
  });
});

describe("ValidationPattern misc patterns", () => {
  it("URL", () => {
    expect(ValidationPattern.URL.test("https://example.com/a?b=1")).toBe(true);
    expect(ValidationPattern.URL.test("http://example.com")).toBe(true);
    expect(ValidationPattern.URL.test("ftp://example.com")).toBe(false);
    expect(ValidationPattern.URL.test("https:// spaced.com")).toBe(false);
  });

  it("PHONE", () => {
    expect(ValidationPattern.PHONE.test("+2348012345678")).toBe(true);
    expect(ValidationPattern.PHONE.test("4915123456789")).toBe(true);
    expect(ValidationPattern.PHONE.test("0123456")).toBe(false);
    expect(ValidationPattern.PHONE.test("12345")).toBe(false);
    expect(ValidationPattern.PHONE.test("(555) 123-4567")).toBe(false);
  });

  it("HEX_COLOR allows 3 or 6 digits", () => {
    expect(ValidationPattern.HEX_COLOR.test("#fff")).toBe(true);
    expect(ValidationPattern.HEX_COLOR.test("#a1b2c3")).toBe(true);
    expect(ValidationPattern.HEX_COLOR.test("#ffff")).toBe(false);
    expect(ValidationPattern.HEX_COLOR.test("fff")).toBe(false);
  });

  it("ALPHANUMERIC", () => {
    expect(ValidationPattern.ALPHANUMERIC.test("abc123")).toBe(true);
    expect(ValidationPattern.ALPHANUMERIC.test("abc-123")).toBe(false);
    expect(ValidationPattern.ALPHANUMERIC.test("")).toBe(false);
  });

  it("ISO_DATE_TIME", () => {
    expect(
      ValidationPattern.ISO_DATE_TIME.test("2024-06-01T12:00:00.000Z"),
    ).toBe(true);
    expect(
      ValidationPattern.ISO_DATE_TIME.test("2024-06-01T12:00:00+01:00"),
    ).toBe(true);
    expect(ValidationPattern.ISO_DATE_TIME.test("2024-06-01")).toBe(false);
  });
});

// --- Environment extras -----------------------------------------------------

describe("resolveEnvironment strict mode (finding 15)", () => {
  it("reads from the NODE_ENV_KEY variable", () => {
    expect(NODE_ENV_KEY).toBe("NODE_ENV");
  });

  it("stays lenient by default", () => {
    expect(resolveEnvironment({ NODE_ENV: "bogus" })).toBe("development");
  });

  it("throws InvalidConstantError on unrecognized values in strict mode", () => {
    expect(() =>
      resolveEnvironment({ NODE_ENV: "bogus" }, { strict: true }),
    ).toThrow(InvalidConstantError);
  });

  it("still resolves valid values in strict mode", () => {
    expect(resolveEnvironment({ NODE_ENV: "prod" }, { strict: true })).toBe(
      "production",
    );
    expect(resolveEnvironment({ NODE_ENV: "staging" }, { strict: true })).toBe(
      "staging",
    );
  });

  it("unset/empty NODE_ENV defaults to development even in strict mode", () => {
    expect(resolveEnvironment({}, { strict: true })).toBe("development");
    expect(resolveEnvironment({ NODE_ENV: "  " }, { strict: true })).toBe(
      "development",
    );
  });
});

describe("isValidEnvironment non-string input", () => {
  it("returns false for non-string values", () => {
    expect(isValidEnvironment(123 as unknown as string)).toBe(false);
    expect(isValidEnvironment(null as unknown as string)).toBe(false);
    expect(isValidEnvironment(undefined as unknown as string)).toBe(false);
  });
});

// --- Cache extras -----------------------------------------------------------

describe("buildCacheControl validation (finding 20)", () => {
  it("ignores duration directives for no-store", () => {
    expect(
      buildCacheControl({
        strategy: "no-store",
        maxAge: 60,
        staleWhileRevalidate: 30,
        sharedMaxAge: 120,
      }),
    ).toBe("no-store");
  });

  it("throws on negative, fractional, or non-finite seconds", () => {
    expect(() => buildCacheControl({ strategy: "public", maxAge: -1 })).toThrow(
      InvalidConstantError,
    );
    expect(() =>
      buildCacheControl({ strategy: "public", maxAge: 1.5 }),
    ).toThrow(InvalidConstantError);
    expect(() =>
      buildCacheControl({ strategy: "public", staleWhileRevalidate: NaN }),
    ).toThrow(InvalidConstantError);
    expect(() =>
      buildCacheControl({ strategy: "public", sharedMaxAge: Infinity }),
    ).toThrow(InvalidConstantError);
  });

  it("accepts zero", () => {
    expect(buildCacheControl({ strategy: "no-cache", maxAge: 0 })).toBe(
      "no-cache, max-age=0",
    );
  });
});

// --- Content type extras ----------------------------------------------------

describe("buildContentType and Charset (finding 22)", () => {
  it("Charset.ASCII is the MIME label us-ascii", () => {
    expect(Charset.ASCII).toBe("us-ascii");
  });

  it("throws on empty mime type or charset", () => {
    expect(() => buildContentType("")).toThrow(InvalidConstantError);
    expect(() => buildContentType("  ")).toThrow(InvalidConstantError);
    expect(() => buildContentType("application/json", "")).toThrow(
      InvalidConstantError,
    );
    expect(() => buildContentType("application/json", "  ")).toThrow(
      InvalidConstantError,
    );
  });

  it("skips charset for multipart types", () => {
    expect(buildContentType(ContentTypes.MULTIPART_FORM_DATA, "utf-8")).toBe(
      "multipart/form-data",
    );
  });
});

// --- Branded factories (finding 25) -----------------------------------------

describe("branded id factories", () => {
  it("creates all id brands as pass-through strings", () => {
    expect(createSessionId("s-1")).toBe("s-1");
    expect(createTenantId("t-1")).toBe("t-1");
    expect(createMessageId("m-1")).toBe("m-1");
    expect(createMessageCausationId("mc-1")).toBe("mc-1");
    expect(createTokenId("tok-1")).toBe("tok-1");
  });
});

describe("createTimestamp validation", () => {
  it("accepts valid ISO 8601 timestamps", () => {
    expect(createTimestamp("2024-01-01T00:00:00.000Z")).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    expect(createTimestamp(new Date().toISOString())).toBeTypeOf("string");
  });

  it("rejects invalid timestamps", () => {
    expect(() => createTimestamp("not-a-date")).toThrow(InvalidConstantError);
    expect(() => createTimestamp("2024-01-01")).toThrow(InvalidConstantError);
    expect(() => createTimestamp("2024-13-45T99:99:99Z")).toThrow(
      InvalidConstantError,
    );
  });
});

describe("createUrl / createEmailAddress", () => {
  it("accepts valid values", () => {
    expect(createUrl("https://example.com/a?b=1")).toBe(
      "https://example.com/a?b=1",
    );
    expect(createEmailAddress("user@example.com")).toBe("user@example.com");
  });

  it("rejects invalid values", () => {
    expect(() => createUrl("not a url")).toThrow(InvalidConstantError);
    expect(() => createEmailAddress("a@b..com")).toThrow(InvalidConstantError);
    expect(() => createEmailAddress(`${"x".repeat(250)}@ex.com`)).toThrow(
      InvalidConstantError,
    );
  });
});

describe("createHexString / createBase64String / createJsonString", () => {
  it("accepts valid values", () => {
    expect(createHexString("deadBEEF")).toBe("deadBEEF");
    expect(createHexString("")).toBe("");
    expect(createBase64String("aGVsbG8=")).toBe("aGVsbG8=");
    expect(createBase64String("")).toBe("");
    expect(createJsonString('{"a":1}')).toBe('{"a":1}');
  });

  it("rejects invalid values", () => {
    expect(() => createHexString("abc")).toThrow(InvalidConstantError);
    expect(() => createHexString("zz")).toThrow(InvalidConstantError);
    expect(() => createBase64String("a===")).toThrow(InvalidConstantError);
    expect(() => createBase64String("!!")).toThrow(InvalidConstantError);
    expect(() => createJsonString("{nope")).toThrow(InvalidConstantError);
  });
});

// --- Sentinel / Defaults changes (finding 24) -------------------------------

describe("Sentinel cleanup", () => {
  it("no longer exposes a useless UNDEFINED sentinel", () => {
    expect(Object.keys(Sentinel)).not.toContain("UNDEFINED");
  });

  it("DATE_FORMAT uses a timezone-offset pattern instead of a literal Z", () => {
    expect(Defaults.DATE_FORMAT).toBe("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  });
});

// --- Error class options pass-through (finding 26) --------------------------

describe("error class option pass-through", () => {
  it("InvalidConstantError defaults", () => {
    const err = new InvalidConstantError("bad");
    expect(err.code).toBe(ErrorCode.CONFIGURATION_INVALID);
    expect(err.category).toBe(ErrorCategory.VALIDATION);
    expect(err.severity).toBe(ErrorSeverity.ERROR);
  });

  it("InvalidConstantError passes through code and metadata", () => {
    const err = new InvalidConstantError("bad", {
      code: ErrorCode.INVALID_INPUT,
      metadata: { field: "x" },
    });
    expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    expect(err.getMetadata("field")).toBe("x");
  });

  it("ConstantContextError passes through metadata", () => {
    const err = new ConstantContextError("wrong context", {
      metadata: { where: "here" },
    });
    expect(err.code).toBe(ErrorCode.INVALID_INPUT);
    expect(err.category).toBe(ErrorCategory.VALIDATION);
    expect(err.getMetadata("where")).toBe("here");
  });
});

// --- Follow-up audit fixes ----------------------------------------------------

describe("resolveEnvironment warns once on unrecognized NODE_ENV (finding 15)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns exactly once per distinct unrecognized value and falls back", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveEnvironment({ NODE_ENV: "prodution" })).toBe("development");
    expect(resolveEnvironment({ NODE_ENV: "prodution" })).toBe("development");
    expect(resolveEnvironment({ NODE_ENV: "prodution" })).toBe("development");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"prodution"');
    expect(warn.mock.calls[0]![0]).toContain("NODE_ENV");

    // a different typo warns again (once)
    expect(resolveEnvironment({ NODE_ENV: "stagin" })).toBe("development");
    expect(resolveEnvironment({ NODE_ENV: "stagin" })).toBe("development");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not warn for recognised, empty, or unset values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveEnvironment({ NODE_ENV: "production" });
    resolveEnvironment({ NODE_ENV: "PROD" });
    resolveEnvironment({ NODE_ENV: "" });
    resolveEnvironment({});
    expect(warn).not.toHaveBeenCalled();
  });

  it("silent option suppresses the warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const opts: ResolveEnvironmentOptions = { silent: true };
    expect(resolveEnvironment({ NODE_ENV: "never-warned-value" }, opts)).toBe(
      "development",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("strict mode throws instead of warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      resolveEnvironment({ NODE_ENV: "strict-only-value" }, { strict: true }),
    ).toThrow(InvalidConstantError);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("as-const enums (finding 17)", () => {
  it("LifecycleState / LifecyclePhase / SchemaIssueCode are frozen plain objects", () => {
    expect(Object.isFrozen(LifecycleState)).toBe(true);
    expect(Object.isFrozen(LifecyclePhase)).toBe(true);
    expect(Object.isFrozen(SchemaIssueCode)).toBe(true);
    // No enum reverse-mapping / prototype noise: keys are exactly the names.
    expect(Object.keys(LifecycleState)).toEqual([
      "IDLE",
      "INITIALIZING",
      "INITIALIZED",
      "STARTING",
      "STARTED",
      "READY",
      "STOPPING",
      "STOPPED",
      "FAILED",
      "DISPOSED",
    ]);
    expect(Object.keys(SchemaIssueCode)).toHaveLength(21);
  });

  it("names double as literal-union types", () => {
    const state: LifecycleStateType = LifecycleState.READY;
    const phase: LifecyclePhaseType = LifecyclePhase.START;
    const code: SchemaIssueCodeType = SchemaIssueCode.TOO_SMALL;
    // plain literals are accepted too (the whole point of dropping `enum`)
    const literalState: LifecycleStateType = "idle";
    expect([state, phase, code, literalState]).toEqual([
      "ready",
      "start",
      "too_small",
      "idle",
    ]);
  });
});

describe("systemRandom.random() is CSPRNG-backed (finding 3)", () => {
  it("does not call Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    for (let i = 0; i < 50; i++) systemRandom.random();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("produces 53-bit-precision floats in [0, 1) that vary", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) {
      const v = systemRandom.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThan(990);
  });
});

describe("createMockClock.set accepts a Date (finding 19)", () => {
  it("sets time from a Date instance", () => {
    const clock = createMockClock(0);
    const date = new Date("2024-06-01T12:00:00.000Z");
    clock.set(date);
    expect(clock.now()).toBe(date.getTime());
    expect(clock.Date().toISOString()).toBe("2024-06-01T12:00:00.000Z");
    clock.advance(1_000);
    expect(clock.Date().toISOString()).toBe("2024-06-01T12:00:01.000Z");
  });

  it("Date() returns a fresh instance each call (mutations do not leak)", () => {
    const clock = createMockClock(5_000);
    clock.Date().setTime(0);
    expect(clock.now()).toBe(5_000);
  });
});

describe("HttpStatus - completed IANA registry (finding 21)", () => {
  it("includes all 1xx codes", () => {
    expect(HttpStatus.PROCESSING).toBe(102);
    expect(HttpStatus.EARLY_HINTS).toBe(103);
  });

  it("includes the remaining 2xx/3xx codes", () => {
    expect(HttpStatus.MULTI_STATUS).toBe(207);
    expect(HttpStatus.ALREADY_REPORTED).toBe(208);
    expect(HttpStatus.IM_USED).toBe(226);
    expect(HttpStatus.MULTIPLE_CHOICES).toBe(300);
  });

  it("includes the remaining 4xx/5xx codes", () => {
    expect(HttpStatus.PAYMENT_REQUIRED).toBe(402);
    expect(HttpStatus.PROXY_AUTHENTICATION_REQUIRED).toBe(407);
    expect(HttpStatus.EXPECTATION_FAILED).toBe(417);
    expect(HttpStatus.MISDIRECTED_REQUEST).toBe(421);
    expect(HttpStatus.LOCKED).toBe(423);
    expect(HttpStatus.FAILED_DEPENDENCY).toBe(424);
    expect(HttpStatus.VARIANT_ALSO_NEGOTIATES).toBe(506);
    expect(HttpStatus.LOOP_DETECTED).toBe(508);
    expect(HttpStatus.NOT_EXTENDED).toBe(510);
    expect(HttpStatus.NETWORK_AUTHENTICATION_REQUIRED).toBe(511);
  });

  it("has no duplicate values and every value is in its category range", () => {
    const values = Object.values(HttpStatus);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThan(600);
    }
  });
});

describe("ValidationPattern.FILE_NAME rejects Windows reserved names (finding 10)", () => {
  it("rejects reserved device names with or without extension, any case", () => {
    for (const name of [
      "CON",
      "con",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "com9",
      "LPT1",
      "lpt9",
      "CON.txt",
      "nul.log",
    ]) {
      expect(ValidationPattern.FILE_NAME.test(name), name).toBe(false);
    }
  });

  it("accepts names that merely start with a reserved word", () => {
    for (const name of [
      "CONSOLE.txt",
      "console",
      "COM10",
      "LPT0",
      "nullable",
    ]) {
      expect(ValidationPattern.FILE_NAME.test(name), name).toBe(true);
    }
  });
});

describe("CacheDuration derives from TimeMs (finding 11)", () => {
  it("second-based durations agree with millisecond durations", () => {
    expect(CacheDuration.SHORT).toBe(10);
    expect(CacheDuration.MEDIUM).toBe((5 * TimeMs.MINUTE) / TimeMs.SECOND);
    expect(CacheDuration.LONG).toBe(TimeMs.HOUR / TimeMs.SECOND);
    expect(CacheDuration.VERY_LONG).toBe(TimeMs.DAY / TimeMs.SECOND);
    expect(CacheDuration.WEEK).toBe(TimeMs.WEEK / TimeMs.SECOND);
    expect(CacheDuration.WEEK).toBe(604_800);
  });

  it("retry upper bounds share a single source of truth", () => {
    expect(ValidationRange.MAX_RETRIES).toBe(Limits.MAX_RETRY_ATTEMPTS);
    expect(DefaultRetry.MAX_ATTEMPTS).toBeLessThanOrEqual(
      Limits.MAX_RETRY_ATTEMPTS,
    );
  });
});
