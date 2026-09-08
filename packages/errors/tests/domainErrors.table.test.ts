/**
 * Table-driven test over every domain error class.
 *
 * For each class we assert the default code, statusCode, expose flag,
 * that `toJSON()` carries the class's own diagnostic fields, that `cause`
 * is preserved, that `JSON.stringify` never throws, that `name` follows the
 * class name for subclasses, and that `withMetadata()` preserves message,
 * code, statusCode and own fields.
 *
 * The final test guarantees that every `*Error` class exported from
 * `src/domain` is covered by the table, so new classes cannot be added
 * without a row here.
 */

import { describe, it, expect } from "vitest";
import * as domain from "../src/domain/index.js";
import { BaseError } from "../src/base/core/baseError.core.js";
import { ErrorCode } from "../src/base/types/errorCode.type.js";
import { ErrorSeverity } from "../src/base/types/errorSeverity.type.js";
import { isErrorCode } from "../src/base/types/errorCode.type.js";

const D = domain;
const cause = new Error("root cause");

interface Row {
  readonly name: string;
  readonly make: () => BaseError;
  readonly code: string;
  readonly status: number;
  readonly expose: boolean;
  /** Own fields expected in toJSON() and preserved by withMetadata(). */
  readonly own?: Readonly<Record<string, unknown>>;
  /** Whether the row's constructor accepted `cause`. */
  readonly hasCause?: boolean;
  readonly isOperational?: boolean;
}

const rows: readonly Row[] = [
  // ---- access ----
  { name: "AuthenticationError", make: () => new D.AuthenticationError("m", { cause }), code: ErrorCode.AUTHENTICATION_FAILED, status: 401, expose: true, hasCause: true },
  { name: "AuthorizationError", make: () => new D.AuthorizationError("m", { cause }), code: ErrorCode.FORBIDDEN, status: 403, expose: true, hasCause: true },
  { name: "RateLimitError", make: () => new D.RateLimitError("m", { retryAfterSeconds: 30, cause }), code: ErrorCode.RATE_LIMITED, status: 429, expose: true, own: { retryAfterSeconds: 30 }, hasCause: true },
  // ---- state ----
  { name: "NotFoundError", make: () => new D.NotFoundError("m", { cause }), code: ErrorCode.RESOURCE_NOT_FOUND, status: 404, expose: true, hasCause: true },
  { name: "ConflictError", make: () => new D.ConflictError("m", { cause }), code: ErrorCode.CONFLICT, status: 409, expose: true, hasCause: true },
  { name: "ValidationError", make: () => new D.ValidationError("m", { issues: [{ field: "a", message: "bad" }], cause }), code: ErrorCode.VALIDATION_FAILED, status: 400, expose: true, own: { issues: [{ field: "a", message: "bad" }] }, hasCause: true },
  // ---- app ----
  { name: "ApplicationError", make: () => new D.ApplicationError("m", { cause }), code: ErrorCode.OPERATION_FAILED, status: 500, expose: false, hasCause: true },
  { name: "ConfigurationError", make: () => new D.ConfigurationError("m", { cause }), code: ErrorCode.CONFIGURATION_INVALID, status: 500, expose: false, hasCause: true },
  { name: "DomainError", make: () => new D.DomainError("m", { cause }), code: ErrorCode.OPERATION_FAILED, status: 422, expose: true, hasCause: true },
  { name: "LifecycleError", make: () => new D.LifecycleError("m", { componentId: "c", phase: "start", cause }), code: ErrorCode.LIFECYCLE_COMPONENT, status: 500, expose: false, own: { componentId: "c", phase: "start" }, hasCause: true },
  { name: "LifecycleStateError", make: () => new D.LifecycleStateError("a", "b", "c"), code: ErrorCode.LIFECYCLE_STATE, status: 500, expose: false, own: { componentId: "c", fromState: "a", toState: "b" } },
  { name: "LifecycleTimeoutError", make: () => new D.LifecycleTimeoutError("c", "start", 5, cause), code: ErrorCode.LIFECYCLE_TIMEOUT, status: 500, expose: false, own: { componentId: "c", phase: "start", timeout: 5 }, hasCause: true },
  { name: "LifecycleDependencyError", make: () => new D.LifecycleDependencyError(["a", "b", "a"]), code: ErrorCode.LIFECYCLE_DEPENDENCY, status: 500, expose: false, own: { cycle: ["a", "b", "a"] } },
  { name: "LifecycleComponentError", make: () => new D.LifecycleComponentError("c", "start", cause), code: ErrorCode.LIFECYCLE_COMPONENT, status: 500, expose: false, own: { componentId: "c", phase: "start" }, hasCause: true },
  { name: "LifecycleStartError", make: () => new D.LifecycleStartError("c", cause), code: ErrorCode.LIFECYCLE_START, status: 500, expose: false, own: { componentId: "c", phase: "start" }, hasCause: true },
  { name: "LifecycleStopError", make: () => new D.LifecycleStopError("c", cause), code: ErrorCode.LIFECYCLE_STOP, status: 500, expose: false, own: { componentId: "c", phase: "stop" }, hasCause: true },
  { name: "LifecycleRollbackError", make: () => new D.LifecycleRollbackError("c", cause), code: ErrorCode.LIFECYCLE_ROLLBACK, status: 500, expose: false, own: { componentId: "c" }, hasCause: true },
  { name: "LifecycleDisposedError", make: () => new D.LifecycleDisposedError(), code: ErrorCode.LIFECYCLE_DISPOSED, status: 500, expose: false },
  { name: "ModuleError", make: () => new D.ModuleError("m", { moduleId: "mod", cause }), code: ErrorCode.OPERATION_FAILED, status: 500, expose: false, own: { moduleId: "mod" }, hasCause: true },
  { name: "ModuleNotFoundError", make: () => new D.ModuleNotFoundError("mod"), code: ErrorCode.MODULE_NOT_FOUND, status: 500, expose: false, own: { moduleId: "mod" }, isOperational: false },
  { name: "ModuleLoadError", make: () => new D.ModuleLoadError("mod", undefined, cause), code: ErrorCode.MODULE_LOAD_FAILED, status: 500, expose: false, own: { moduleId: "mod" }, hasCause: true, isOperational: false },
  { name: "ModuleLifecycleError", make: () => new D.ModuleLifecycleError("mod", "init", undefined, cause), code: ErrorCode.MODULE_LIFECYCLE, status: 500, expose: false, own: { moduleId: "mod", phase: "init" }, hasCause: true, isOperational: false },
  { name: "ModuleDependencyError", make: () => new D.ModuleDependencyError("mod", "dep"), code: ErrorCode.MODULE_DEPENDENCY_MISSING, status: 500, expose: false, own: { moduleId: "mod", dependencyId: "dep" } },
  // ---- body ----
  { name: "HttpBodyError", make: () => new D.HttpBodyError("m", { cause }), code: ErrorCode.HTTP_BODY, status: 400, expose: true, hasCause: true },
  { name: "HttpBodyLimitError", make: () => new D.HttpBodyLimitError(10, 20), code: ErrorCode.HTTP_BODY_LIMIT, status: 413, expose: true, own: { limit: 10, received: 20 } },
  { name: "HttpBodyAbortedError", make: () => new D.HttpBodyAbortedError(), code: ErrorCode.HTTP_BODY_ABORTED, status: 408, expose: true },
  { name: "HttpBodyParseError", make: () => new D.HttpBodyParseError("m", cause), code: ErrorCode.HTTP_BODY_PARSE, status: 400, expose: true, hasCause: true },
  { name: "BodyParserError", make: () => new D.BodyParserError("m", { cause }), code: ErrorCode.HTTP_BODY_PARSER, status: 400, expose: true, hasCause: true },
  { name: "UnsupportedBodyTypeError", make: () => new D.UnsupportedBodyTypeError("text/x"), code: ErrorCode.HTTP_UNSUPPORTED_BODY_TYPE, status: 415, expose: true, own: { contentType: "text/x" } },
  { name: "InvalidContentLengthError", make: () => new D.InvalidContentLengthError("abc"), code: ErrorCode.HTTP_INVALID_CONTENT_LENGTH, status: 400, expose: true, own: { value: "abc" } },
  { name: "HttpFormDataError", make: () => new D.HttpFormDataError("m", { cause }), code: ErrorCode.HTTP_FORM_DATA, status: 400, expose: true, hasCause: true },
  { name: "HttpFormDataLimitError", make: () => new D.HttpFormDataLimitError("m"), code: ErrorCode.HTTP_FORM_DATA_LIMIT, status: 413, expose: true },
  { name: "HttpFormDataParseError", make: () => new D.HttpFormDataParseError("m"), code: ErrorCode.HTTP_FORM_DATA_PARSE, status: 400, expose: true },
  { name: "MultipartError", make: () => new D.MultipartError("m", { cause }), code: ErrorCode.HTTP_MULTIPART, status: 400, expose: true, hasCause: true },
  { name: "MultipartParseError", make: () => new D.MultipartParseError("m", cause), code: ErrorCode.HTTP_MULTIPART_PARSE, status: 400, expose: true, hasCause: true },
  { name: "MultipartLimitError", make: () => new D.MultipartLimitError("m"), code: ErrorCode.HTTP_MULTIPART_LIMIT, status: 413, expose: true },
  // ---- documentation ----
  { name: "DocumentationError", make: () => new D.DocumentationError("m", { documentId: "d", cause }), code: ErrorCode.DOCUMENTATION_ERROR, status: 500, expose: false, own: { documentId: "d" }, hasCause: true },
  { name: "DocumentParseError", make: () => new D.DocumentParseError("m", "d", { cause }), code: ErrorCode.DOCUMENT_PARSE, status: 400, expose: true, own: { documentId: "d" }, hasCause: true },
  { name: "DocumentValidationError", make: () => new D.DocumentValidationError("m", "d", { cause }), code: ErrorCode.DOCUMENT_VALIDATION, status: 422, expose: true, own: { documentId: "d" }, hasCause: true },
  { name: "DuplicateDocumentError", make: () => new D.DuplicateDocumentError("d", { cause }), code: ErrorCode.DOCUMENT_DUPLICATE, status: 409, expose: true, own: { documentId: "d" }, hasCause: true },
  { name: "DocumentNotFoundError", make: () => new D.DocumentNotFoundError("d", { cause }), code: ErrorCode.DOCUMENT_NOT_FOUND, status: 404, expose: true, own: { documentId: "d" }, hasCause: true },
  { name: "BrokenDocumentationLinkError", make: () => new D.BrokenDocumentationLinkError("s", "t", { cause }), code: ErrorCode.DOCUMENT_LINK_BROKEN, status: 400, expose: true, own: { documentId: "s", target: "t" }, hasCause: true },
  { name: "InvalidFrontmatterError", make: () => new D.InvalidFrontmatterError("m", "d", { cause }), code: ErrorCode.DOCUMENT_FRONTMATTER_INVALID, status: 400, expose: true, own: { documentId: "d" }, hasCause: true },
  { name: "InvalidNavigationError", make: () => new D.InvalidNavigationError("m", { cause }), code: ErrorCode.DOCUMENT_NAVIGATION_INVALID, status: 400, expose: true, hasCause: true },
  { name: "ExampleValidationError", make: () => new D.ExampleValidationError("m", "d", { cause }), code: ErrorCode.DOCUMENT_EXAMPLE_INVALID, status: 422, expose: true, own: { documentId: "d" }, hasCause: true },
  { name: "GenerationError", make: () => new D.GenerationError("m", { cause }), code: ErrorCode.DOCUMENT_GENERATION, status: 500, expose: false, hasCause: true },
  { name: "DocumentationVersionError", make: () => new D.DocumentationVersionError("m", { cause }), code: ErrorCode.DOCUMENT_VERSION, status: 400, expose: true, hasCause: true },
  // ---- event ----
  { name: "EventError", make: () => new D.EventError("m", { eventType: "t", eventId: "i", handlerId: "h", middlewareId: "mw", cause }), code: ErrorCode.EVENT_HANDLING_FAILED, status: 500, expose: false, own: { eventType: "t", eventId: "i", handlerId: "h", middlewareId: "mw" }, hasCause: true },
  { name: "EventHandlerError", make: () => new D.EventHandlerError("m", { handlerId: "h", eventType: "t", eventId: "i", cause }), code: ErrorCode.EVENT_HANDLER_FAILED, status: 500, expose: false, own: { handlerId: "h", eventType: "t", eventId: "i" }, hasCause: true },
  { name: "EventHandlerNotFoundError", make: () => new D.EventHandlerNotFoundError("h"), code: ErrorCode.EVENT_HANDLER_NOT_FOUND, status: 500, expose: false, own: { handlerId: "h" }, isOperational: false },
  { name: "DuplicateEventHandlerError", make: () => new D.DuplicateEventHandlerError("h"), code: ErrorCode.EVENT_DUPLICATE_HANDLER, status: 500, expose: false, own: { handlerId: "h" }, isOperational: false },
  { name: "EventMiddlewareError", make: () => new D.EventMiddlewareError("m", { middlewareId: "mw", eventType: "t", cause }), code: ErrorCode.EVENT_MIDDLEWARE_FAILED, status: 500, expose: false, own: { middlewareId: "mw", eventType: "t" }, hasCause: true },
  { name: "EventPublishError", make: () => new D.EventPublishError("t", undefined, cause), code: ErrorCode.EVENT_PUBLISH_FAILED, status: 500, expose: false, own: { eventType: "t" }, hasCause: true },
  { name: "InvalidEventError", make: () => new D.InvalidEventError("m", { eventType: "t", cause }), code: ErrorCode.EVENT_INVALID, status: 400, expose: true, own: { eventType: "t" }, hasCause: true },
  { name: "EventTypeNotFoundError", make: () => new D.EventTypeNotFoundError("t"), code: ErrorCode.EVENT_TYPE_NOT_FOUND, status: 500, expose: false, own: { eventType: "t" }, isOperational: false },
  { name: "DuplicateEventDefinitionError", make: () => new D.DuplicateEventDefinitionError("t"), code: ErrorCode.EVENT_DUPLICATE_DEFINITION, status: 500, expose: false, own: { eventType: "t" }, isOperational: false },
  { name: "EventDefinitionNotFoundError", make: () => new D.EventDefinitionNotFoundError("t"), code: ErrorCode.EVENT_DEFINITION_NOT_FOUND, status: 500, expose: false, own: { eventType: "t" }, isOperational: false },
  { name: "EventDispatchAbortedError", make: () => new D.EventDispatchAbortedError(undefined, { eventType: "t" }), code: ErrorCode.EVENT_DISPATCH_ABORTED, status: 499, expose: false, own: { eventType: "t" } },
  { name: "EventEmitterDisposedError", make: () => new D.EventEmitterDisposedError(), code: ErrorCode.EVENT_EMITTER_DISPOSED, status: 500, expose: false, isOperational: false },
  { name: "EventRegistryDisposedError", make: () => new D.EventRegistryDisposedError(), code: ErrorCode.EVENT_REGISTRY_DISPOSED, status: 500, expose: false, isOperational: false },
  { name: "EventBusDisposedError", make: () => new D.EventBusDisposedError(), code: ErrorCode.EVENT_BUS_DISPOSED, status: 500, expose: false, isOperational: false },
  { name: "EventSubscriptionClosedError", make: () => new D.EventSubscriptionClosedError("s"), code: ErrorCode.EVENT_SUBSCRIPTION_CLOSED, status: 410, expose: true, own: { subscriptionId: "s" } },
  { name: "EventTimeoutError", make: () => new D.EventTimeoutError(5, { eventType: "t" }), code: ErrorCode.EVENT_TIMEOUT, status: 504, expose: false, own: { timeoutMs: 5, eventType: "t" } },
  { name: "EventSerializationError", make: () => new D.EventSerializationError("m", { eventType: "t", cause }), code: ErrorCode.EVENT_SERIALIZATION_FAILED, status: 500, expose: false, own: { eventType: "t" }, hasCause: true },
  { name: "EventDeserializationError", make: () => new D.EventDeserializationError("m", cause, { eventType: "t" }), code: ErrorCode.EVENT_DESERIALIZATION_FAILED, status: 400, expose: true, own: { eventType: "t" }, hasCause: true },
  // ---- message ----
  { name: "MessageError", make: () => new D.MessageError("m", { messageType: "t", messageId: "i", handlerId: "h", middlewareId: "mw", cause }), code: ErrorCode.MESSAGE_DISPATCH_FAILED, status: 500, expose: false, own: { messageType: "t", messageId: "i", handlerId: "h", middlewareId: "mw" }, hasCause: true },
  { name: "MessageHandlerError", make: () => new D.MessageHandlerError("m", { handlerId: "h", messageType: "t", cause }), code: ErrorCode.MESSAGE_HANDLER_FAILED, status: 500, expose: false, own: { handlerId: "h", messageType: "t" }, hasCause: true },
  { name: "MessageHandlerNotFoundError", make: () => new D.MessageHandlerNotFoundError("h"), code: ErrorCode.MESSAGE_HANDLER_NOT_FOUND, status: 500, expose: false, own: { handlerId: "h" }, isOperational: false },
  { name: "DuplicateMessageHandlerError", make: () => new D.DuplicateMessageHandlerError("h"), code: ErrorCode.MESSAGE_DUPLICATE_HANDLER, status: 500, expose: false, own: { handlerId: "h" }, isOperational: false },
  { name: "MessageMiddlewareError", make: () => new D.MessageMiddlewareError("m", { middlewareId: "mw", cause }), code: ErrorCode.MESSAGE_MIDDLEWARE_FAILED, status: 500, expose: false, own: { middlewareId: "mw" }, hasCause: true },
  { name: "MessageDispatchError", make: () => new D.MessageDispatchError("t", undefined, cause), code: ErrorCode.MESSAGE_DISPATCH_FAILED, status: 500, expose: false, own: { messageType: "t" }, hasCause: true },
  { name: "InvalidMessageError", make: () => new D.InvalidMessageError("m", { messageType: "t", cause }), code: ErrorCode.MESSAGE_INVALID, status: 400, expose: true, own: { messageType: "t" }, hasCause: true },
  { name: "MessageTypeNotFoundError", make: () => new D.MessageTypeNotFoundError("t"), code: ErrorCode.MESSAGE_TYPE_NOT_FOUND, status: 500, expose: false, own: { messageType: "t" }, isOperational: false },
  { name: "MessageDispatchAbortedError", make: () => new D.MessageDispatchAbortedError(undefined, { messageType: "t" }), code: ErrorCode.MESSAGE_ABORTED, status: 499, expose: false, own: { messageType: "t" } },
  { name: "MessageBusDisposedError", make: () => new D.MessageBusDisposedError(), code: ErrorCode.MESSAGE_BUS_DISPOSED, status: 500, expose: false, isOperational: false },
  { name: "MessageTimeoutError", make: () => new D.MessageTimeoutError(5, { messageType: "t" }), code: ErrorCode.MESSAGE_TIMEOUT, status: 504, expose: false, own: { timeoutMs: 5, messageType: "t" } },
  { name: "MessageValidationError", make: () => new D.MessageValidationError("m", ["bad"], "t"), code: ErrorCode.MESSAGE_VALIDATION_FAILED, status: 422, expose: true, own: { issues: ["bad"], messageType: "t" } },
  { name: "MessageSerializationError", make: () => new D.MessageSerializationError("m", { messageType: "t", cause }), code: ErrorCode.MESSAGE_SERIALIZATION_FAILED, status: 500, expose: false, own: { messageType: "t" }, hasCause: true },
  { name: "MessageDeserializationError", make: () => new D.MessageDeserializationError("m", { messageType: "t", cause }), code: ErrorCode.MESSAGE_DESERIALIZATION_FAILED, status: 400, expose: true, own: { messageType: "t" }, hasCause: true },
  // ---- plugin ----
  { name: "PluginError", make: () => new D.PluginError("m", { pluginName: "p", cause }), code: ErrorCode.PLUGIN_ERROR, status: 500, expose: false, own: { pluginName: "p" }, hasCause: true },
  { name: "PluginRegistrationError", make: () => new D.PluginRegistrationError("m", "p", { cause }), code: ErrorCode.PLUGIN_REGISTRATION, status: 500, expose: false, own: { pluginName: "p" }, hasCause: true, isOperational: false },
  { name: "PluginAlreadyRegisteredError", make: () => new D.PluginAlreadyRegisteredError("p"), code: ErrorCode.PLUGIN_ALREADY_REGISTERED, status: 500, expose: false, own: { pluginName: "p" }, isOperational: false },
  { name: "PluginNotFoundError", make: () => new D.PluginNotFoundError("p"), code: ErrorCode.PLUGIN_NOT_FOUND, status: 500, expose: false, own: { pluginName: "p" }, isOperational: false },
  { name: "PluginDependencyError", make: () => new D.PluginDependencyError("p", "dep"), code: ErrorCode.PLUGIN_DEPENDENCY, status: 500, expose: false, own: { pluginName: "p", dependencyName: "dep" }, isOperational: false },
  { name: "PluginDependencyCycleError", make: () => new D.PluginDependencyCycleError(["a", "b", "a"]), code: ErrorCode.PLUGIN_DEPENDENCY_CYCLE, status: 500, expose: false, own: { cycle: ["a", "b", "a"] }, isOperational: false },
  { name: "PluginInitializationError", make: () => new D.PluginInitializationError("m", "p", { cause }), code: ErrorCode.PLUGIN_INITIALIZATION, status: 500, expose: false, own: { pluginName: "p" }, hasCause: true },
  { name: "PluginStartError", make: () => new D.PluginStartError("m", "p", { cause }), code: ErrorCode.PLUGIN_START, status: 500, expose: false, own: { pluginName: "p" }, hasCause: true },
  { name: "PluginStopError", make: () => new D.PluginStopError("m", "p", { cause }), code: ErrorCode.PLUGIN_STOP, status: 500, expose: false, own: { pluginName: "p" }, hasCause: true },
  { name: "PluginDisposeError", make: () => new D.PluginDisposeError("m", "p", { cause }), code: ErrorCode.PLUGIN_DISPOSE, status: 500, expose: false, own: { pluginName: "p" }, hasCause: true },
  { name: "PluginTimeoutError", make: () => new D.PluginTimeoutError("p", 5), code: ErrorCode.PLUGIN_TIMEOUT, status: 504, expose: false, own: { pluginName: "p", timeout: 5 } },
  { name: "PluginStateError", make: () => new D.PluginStateError("p", "a", "b"), code: ErrorCode.PLUGIN_STATE, status: 500, expose: false, own: { pluginName: "p", fromState: "a", toState: "b" }, isOperational: false },
  // ---- queue ----
  { name: "QueueError", make: () => new D.QueueError("m", { queueName: "q", jobId: "j", workerId: "w", statusCode: 404, cause }), code: ErrorCode.QUEUE_ERROR, status: 404, expose: false, own: { queueName: "q", jobId: "j", workerId: "w" }, hasCause: true },
  { name: "QueueConnectionError", make: () => new D.QueueConnectionError("q", undefined, cause), code: ErrorCode.QUEUE_CONNECTION, status: 500, expose: false, own: { queueName: "q" }, hasCause: true },
  { name: "QueueNotFoundError", make: () => new D.QueueNotFoundError("q"), code: ErrorCode.QUEUE_NOT_FOUND, status: 404, expose: true, own: { queueName: "q" } },
  { name: "QueueClosedError", make: () => new D.QueueClosedError("q"), code: ErrorCode.QUEUE_CLOSED, status: 500, expose: false, own: { queueName: "q" } },
  { name: "QueueDisposedError", make: () => new D.QueueDisposedError("q"), code: ErrorCode.QUEUE_DISPOSED, status: 500, expose: false, own: { queueName: "q" }, isOperational: false },
  { name: "JobError", make: () => new D.JobError("m", { queueName: "q", jobId: "j", cause }), code: ErrorCode.JOB_ERROR, status: 500, expose: false, own: { queueName: "q", jobId: "j" }, hasCause: true },
  { name: "JobNotFoundError", make: () => new D.JobNotFoundError("j", "q"), code: ErrorCode.JOB_NOT_FOUND, status: 404, expose: true, own: { jobId: "j", queueName: "q" } },
  { name: "JobTimeoutError", make: () => new D.JobTimeoutError("j", 5, { queueName: "q" }), code: ErrorCode.JOB_TIMEOUT, status: 504, expose: false, own: { jobId: "j", queueName: "q", timeoutMs: 5 } },
  { name: "JobCancelledError", make: () => new D.JobCancelledError("j", { queueName: "q" }), code: ErrorCode.JOB_CANCELLED, status: 499, expose: false, own: { jobId: "j", queueName: "q" } },
  { name: "JobSerializationError", make: () => new D.JobSerializationError("j", "m", { cause }), code: ErrorCode.JOB_SERIALIZATION, status: 500, expose: false, own: { jobId: "j" }, hasCause: true },
  { name: "JobDeserializationError", make: () => new D.JobDeserializationError("j", "m", { cause }), code: ErrorCode.JOB_DESERIALIZATION, status: 500, expose: false, own: { jobId: "j" }, hasCause: true },
  { name: "JobProcessingError", make: () => new D.JobProcessingError("j", "m", { cause }), code: ErrorCode.JOB_PROCESSING, status: 500, expose: false, own: { jobId: "j" }, hasCause: true },
  { name: "JobDuplicateError", make: () => new D.JobDuplicateError("j", "k", { queueName: "q" }), code: ErrorCode.JOB_DUPLICATE, status: 409, expose: true, own: { jobId: "j", queueName: "q" } },
  { name: "JobMaxAttemptsError", make: () => new D.JobMaxAttemptsError("j", 3, 3), code: ErrorCode.JOB_MAX_ATTEMPTS, status: 500, expose: false, own: { jobId: "j", attempt: 3, maxAttempts: 3 } },
  { name: "JobStalledError", make: () => new D.JobStalledError("j"), code: ErrorCode.JOB_STALLED, status: 500, expose: false, own: { jobId: "j" } },
  { name: "WorkerError", make: () => new D.WorkerError("m", { workerId: "w", queueName: "q", cause }), code: ErrorCode.WORKER_ERROR, status: 500, expose: false, own: { workerId: "w", queueName: "q" }, hasCause: true },
  { name: "WorkerNotFoundError", make: () => new D.WorkerNotFoundError("w"), code: ErrorCode.WORKER_NOT_FOUND, status: 500, expose: false, own: { workerId: "w" }, isOperational: false },
  { name: "WorkerLifecycleError", make: () => new D.WorkerLifecycleError("m", { workerId: "w", cause }), code: ErrorCode.WORKER_LIFECYCLE, status: 500, expose: false, own: { workerId: "w" }, hasCause: true },
  // ---- rpc ----
  { name: "RPCError", make: () => new D.RPCError("m", { procedureName: "p", cause }), code: ErrorCode.RPC_ERROR, status: 500, expose: false, own: { procedureName: "p" }, hasCause: true },
  { name: "RPCProcedureNotFoundError", make: () => new D.RPCProcedureNotFoundError("p"), code: ErrorCode.RPC_PROCEDURE_NOT_FOUND, status: 404, expose: true, own: { procedureName: "p" } },
  { name: "RPCInvalidRequestError", make: () => new D.RPCInvalidRequestError("m", "p"), code: ErrorCode.RPC_INVALID_REQUEST, status: 400, expose: true, own: { procedureName: "p" } },
  { name: "RPCValidationError", make: () => new D.RPCValidationError("m", ["bad"], "p"), code: ErrorCode.RPC_VALIDATION_ERROR, status: 422, expose: true, own: { issues: ["bad"], procedureName: "p" } },
  { name: "RPCAuthenticationError", make: () => new D.RPCAuthenticationError("m", "p"), code: ErrorCode.RPC_UNAUTHORIZED, status: 401, expose: true, own: { procedureName: "p" } },
  { name: "RPCForbiddenError", make: () => new D.RPCForbiddenError("m", "p"), code: ErrorCode.RPC_FORBIDDEN, status: 403, expose: true, own: { procedureName: "p" } },
  { name: "RPCInternalError", make: () => new D.RPCInternalError("m", "p"), code: ErrorCode.RPC_INTERNAL_ERROR, status: 500, expose: false, own: { procedureName: "p" }, isOperational: false },
  { name: "RPCSerializationError", make: () => new D.RPCSerializationError("m", "p"), code: ErrorCode.RPC_SERIALIZATION_ERROR, status: 500, expose: false, own: { procedureName: "p" } },
  { name: "RPCDeserializationError", make: () => new D.RPCDeserializationError("m", "p"), code: ErrorCode.RPC_DESERIALIZATION_ERROR, status: 400, expose: true, own: { procedureName: "p" } },
  { name: "RPCDuplicateProcedureError", make: () => new D.RPCDuplicateProcedureError("p"), code: ErrorCode.RPC_DUPLICATE_PROCEDURE, status: 409, expose: true, own: { procedureName: "p" } },
  { name: "RPCTimeoutError", make: () => new D.RPCTimeoutError(5, "p"), code: ErrorCode.RPC_TIMEOUT, status: 504, expose: false, own: { timeout: 5, procedureName: "p" } },
  { name: "RPCCancelledError", make: () => new D.RPCCancelledError("m", "p"), code: ErrorCode.RPC_CANCELLED, status: 499, expose: false, own: { procedureName: "p" } },
  { name: "RPCTransportError", make: () => new D.RPCTransportError("m", "p"), code: ErrorCode.RPC_TRANSPORT_ERROR, status: 502, expose: false, own: { procedureName: "p" } },
  { name: "RPCUnavailableError", make: () => new D.RPCUnavailableError("m", "p"), code: ErrorCode.RPC_UNAVAILABLE, status: 503, expose: true, own: { procedureName: "p" } },
  { name: "RPCRateLimitedError", make: () => new D.RPCRateLimitedError("m", 2, "p"), code: ErrorCode.RPC_RATE_LIMITED, status: 429, expose: true, own: { retryAfterSeconds: 2, procedureName: "p" } },
  { name: "RPCDeadlineExceededError", make: () => new D.RPCDeadlineExceededError(100, "p"), code: ErrorCode.RPC_DEADLINE_EXCEEDED, status: 504, expose: false, own: { procedureName: "p" } },
  // ---- api ----
  { name: "APIError", make: () => new D.APIError("m", { endpoint: "/e", method: "GET", cause }), code: ErrorCode.API_ERROR, status: 500, expose: false, own: { endpoint: "/e", method: "GET" }, hasCause: true },
  { name: "APIValidationError", make: () => new D.APIValidationError("m", ["bad"], { endpoint: "/e", cause }), code: ErrorCode.API_VALIDATION, status: 422, expose: true, own: { issues: ["bad"], endpoint: "/e" }, hasCause: true },
  { name: "APIAuthenticationError", make: () => new D.APIAuthenticationError("m", { cause }), code: ErrorCode.API_AUTHENTICATION, status: 401, expose: true, hasCause: true },
  { name: "APIAuthorizationError", make: () => new D.APIAuthorizationError("m", { cause }), code: ErrorCode.API_AUTHORIZATION, status: 403, expose: true, hasCause: true },
  { name: "APIRateLimitError", make: () => new D.APIRateLimitError("m", 2, { cause }), code: ErrorCode.API_RATE_LIMIT, status: 429, expose: true, own: { retryAfterSeconds: 2 }, hasCause: true },
  { name: "APITimeoutError", make: () => new D.APITimeoutError(5, { cause }), code: ErrorCode.API_TIMEOUT, status: 504, expose: false, own: { timeoutMs: 5 }, hasCause: true },
  { name: "APIUnavailableError", make: () => new D.APIUnavailableError("m", { cause }), code: ErrorCode.API_UNAVAILABLE, status: 503, expose: true, hasCause: true },
  { name: "APIInternalError", make: () => new D.APIInternalError("m", { cause }), code: ErrorCode.API_INTERNAL, status: 500, expose: false, hasCause: true, isOperational: false },
  { name: "APIIdempotencyError", make: () => new D.APIIdempotencyError("m", { cause }), code: ErrorCode.API_IDEMPOTENCY, status: 409, expose: true, hasCause: true },
  { name: "APINotFoundError", make: () => new D.APINotFoundError("/e", "GET", { cause }), code: ErrorCode.API_NOT_FOUND, status: 404, expose: true, own: { endpoint: "/e", method: "GET" }, hasCause: true },
  { name: "APIConflictError", make: () => new D.APIConflictError("m", { cause }), code: ErrorCode.API_CONFLICT, status: 409, expose: true, hasCause: true },
  { name: "APIOperationNotFoundError", make: () => new D.APIOperationNotFoundError("op", { cause }), code: ErrorCode.API_OPERATION_NOT_FOUND, status: 404, expose: true, own: { endpoint: "op" }, hasCause: true },
  { name: "APIDuplicateOperationError", make: () => new D.APIDuplicateOperationError("op", { cause }), code: ErrorCode.API_DUPLICATE_OPERATION, status: 409, expose: true, own: { endpoint: "op" }, hasCause: true },
  { name: "APIVersionError", make: () => new D.APIVersionError("m", { cause }), code: ErrorCode.API_VERSION, status: 400, expose: true, hasCause: true },
  // ---- scheduler ----
  { name: "SchedulerError", make: () => new D.SchedulerError("m", { jobId: "j", scheduleId: "s", cause }), code: ErrorCode.SCHEDULER_ERROR, status: 500, expose: false, own: { jobId: "j", scheduleId: "s" }, hasCause: true },
  { name: "SchedulerNotStartedError", make: () => new D.SchedulerNotStartedError(), code: ErrorCode.SCHEDULER_NOT_STARTED, status: 503, expose: false, isOperational: false },
  { name: "SchedulerAlreadyStartedError", make: () => new D.SchedulerAlreadyStartedError(), code: ErrorCode.SCHEDULER_ALREADY_STARTED, status: 500, expose: false, isOperational: false },
  { name: "SchedulerStoppedError", make: () => new D.SchedulerStoppedError(), code: ErrorCode.SCHEDULER_STOPPED, status: 503, expose: false, isOperational: false },
  { name: "SchedulerJobNotFoundError", make: () => new D.SchedulerJobNotFoundError("j"), code: ErrorCode.SCHEDULER_JOB_NOT_FOUND, status: 404, expose: true, own: { jobId: "j" } },
  { name: "SchedulerJobAlreadyExistsError", make: () => new D.SchedulerJobAlreadyExistsError("j"), code: ErrorCode.SCHEDULER_JOB_ALREADY_EXISTS, status: 409, expose: true, own: { jobId: "j" } },
  { name: "InvalidJobError", make: () => new D.InvalidJobError("m", "j"), code: ErrorCode.INVALID_JOB, status: 400, expose: true, own: { jobId: "j" } },
  { name: "ScheduleNotFoundError", make: () => new D.ScheduleNotFoundError("s"), code: ErrorCode.SCHEDULE_NOT_FOUND, status: 404, expose: true, own: { scheduleId: "s" } },
  { name: "ScheduleAlreadyExistsError", make: () => new D.ScheduleAlreadyExistsError("s"), code: ErrorCode.SCHEDULE_ALREADY_EXISTS, status: 409, expose: true, own: { scheduleId: "s" } },
  { name: "InvalidScheduleError", make: () => new D.InvalidScheduleError("m", "s"), code: ErrorCode.INVALID_SCHEDULE, status: 400, expose: true, own: { scheduleId: "s" } },
  { name: "CronParseError", make: () => new D.CronParseError("* * *", "too short", { cause }), code: ErrorCode.CRON_PARSE_ERROR, status: 400, expose: true, own: { expression: "* * *", reason: "too short" }, hasCause: true },
  { name: "InvalidDurationError", make: () => new D.InvalidDurationError("5x", { cause }), code: ErrorCode.INVALID_DURATION, status: 400, expose: true, own: { duration: "5x" }, hasCause: true },
  { name: "SchedulerJobExecutionError", make: () => new D.SchedulerJobExecutionError("m", "j", "s", { cause }), code: ErrorCode.SCHEDULER_JOB_EXECUTION_ERROR, status: 500, expose: false, own: { jobId: "j", scheduleId: "s" }, hasCause: true },
  { name: "SchedulerJobTimeoutError", make: () => new D.SchedulerJobTimeoutError(5, "j", { cause }), code: ErrorCode.SCHEDULER_JOB_TIMEOUT, status: 504, expose: false, own: { timeout: 5, jobId: "j" }, hasCause: true },
  { name: "SchedulerJobCancelledError", make: () => new D.SchedulerJobCancelledError("m", "j", { cause }), code: ErrorCode.SCHEDULER_JOB_CANCELLED, status: 499, expose: false, own: { jobId: "j" }, hasCause: true },
  { name: "SchedulerStoreError", make: () => new D.SchedulerStoreError("m", "s", { cause }), code: ErrorCode.SCHEDULER_STORE_ERROR, status: 500, expose: false, own: { scheduleId: "s" }, hasCause: true },
  { name: "SchedulerLockError", make: () => new D.SchedulerLockError("m", "s", { cause }), code: ErrorCode.SCHEDULER_LOCK_ERROR, status: 409, expose: false, own: { scheduleId: "s" }, hasCause: true },
  // ---- schema ----
  { name: "SchemaError", make: () => new D.SchemaError("m", { issues: [{ code: "x" }], cause }), code: ErrorCode.SCHEMA_VALIDATION, status: 400, expose: true, own: { issues: [{ code: "x" }] }, hasCause: true },
  { name: "SchemaTypeError", make: () => new D.SchemaTypeError("string", "number", ["a"]), code: ErrorCode.SCHEMA_INVALID_TYPE, status: 400, expose: true },
  { name: "SchemaLiteralError", make: () => new D.SchemaLiteralError("admin", "user", ["role"]), code: ErrorCode.SCHEMA_INVALID_LITERAL, status: 400, expose: true },
  { name: "SchemaEnumError", make: () => new D.SchemaEnumError(["a", "b"], "c", ["k"]), code: ErrorCode.SCHEMA_INVALID_ENUM, status: 400, expose: true },
  { name: "SchemaStringError", make: () => new D.SchemaStringError("m", ["k"], { minLength: 3 }), code: ErrorCode.SCHEMA_INVALID_STRING, status: 400, expose: true },
  { name: "SchemaNumberError", make: () => new D.SchemaNumberError("m", ["k"], { min: 3 }), code: ErrorCode.SCHEMA_INVALID_NUMBER, status: 400, expose: true },
  { name: "SchemaRequiredError", make: () => new D.SchemaRequiredError(["k"]), code: ErrorCode.SCHEMA_VALIDATION, status: 400, expose: true },
  { name: "SchemaUnionError", make: () => new D.SchemaUnionError(["k"]), code: ErrorCode.SCHEMA_INVALID_UNION, status: 400, expose: true },
  { name: "SchemaUnknownKeyError", make: () => new D.SchemaUnknownKeyError("extra", ["k"]), code: ErrorCode.SCHEMA_UNKNOWN_KEY, status: 400, expose: true },
  // ---- serialization ----
  { name: "SerializationError", make: () => new D.SerializationError("m", { format: "json", depth: 1, maxDepth: 2, size: 3, maxSize: 4, transformerType: "t", serializerName: "s", cause }), code: ErrorCode.SERIALIZATION, status: 500, expose: false, own: { format: "json", depth: 1, maxDepth: 2, size: 3, maxSize: 4, transformerType: "t", serializerName: "s" }, hasCause: true },
  { name: "SerializeError", make: () => new D.SerializeError("m", { format: "json", cause }), code: ErrorCode.SERIALIZATION_FAILED, status: 500, expose: false, own: { format: "json" }, hasCause: true },
  { name: "DeserializeError", make: () => new D.DeserializeError("m", { format: "json", cause }), code: ErrorCode.DESERIALIZATION_FAILED, status: 400, expose: true, own: { format: "json" }, hasCause: true },
  { name: "UnsupportedSerializationFormatError", make: () => new D.UnsupportedSerializationFormatError("yaml"), code: ErrorCode.UNSUPPORTED_FORMAT, status: 400, expose: true, own: { format: "yaml" } },
  { name: "SerializerNotFoundError", make: () => new D.SerializerNotFoundError("s"), code: ErrorCode.SERIALIZER_NOT_FOUND, status: 404, expose: true, own: { serializerName: "s" } },
  { name: "CircularReferenceError", make: () => new D.CircularReferenceError("a.b"), code: ErrorCode.CIRCULAR_REFERENCE, status: 500, expose: false, own: { circularPath: "a.b" } },
  { name: "SerializationDepthError", make: () => new D.SerializationDepthError(5, 3), code: ErrorCode.MAX_DEPTH_EXCEEDED, status: 500, expose: false, own: { depth: 5, maxDepth: 3 } },
  { name: "SerializationPayloadTooLargeError", make: () => new D.SerializationPayloadTooLargeError(10, 5), code: ErrorCode.PAYLOAD_TOO_LARGE, status: 413, expose: false, own: { size: 10, maxSize: 5 } },
  { name: "InvalidSerializedDataError", make: () => new D.InvalidSerializedDataError("m", { format: "json", cause }), code: ErrorCode.INVALID_SERIALIZED_DATA, status: 400, expose: true, own: { format: "json" }, hasCause: true },
  { name: "TransformerError", make: () => new D.TransformerError("Date", "m", { cause }), code: ErrorCode.TRANSFORMER_ERROR, status: 500, expose: false, own: { transformerType: "Date" }, hasCause: true },
  { name: "TransformerNotFoundError", make: () => new D.TransformerNotFoundError("Date"), code: ErrorCode.TRANSFORMER_NOT_FOUND, status: 404, expose: true, own: { transformerType: "Date" } },
];

function ownFieldsOf(
  error: BaseError,
  own: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const json = error.toJSON() as unknown as Record<string, unknown>;
  const metadata = (json.metadata ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(own)) {
    const asProp = (error as unknown as Record<string, unknown>)[key];
    out[key] = key in json ? json[key] : key in metadata ? metadata[key] : asProp;
  }
  return out;
}

describe("domain error table", () => {
  for (const row of rows) {
    describe(row.name, () => {
      it("has the expected defaults", () => {
        const err = row.make();
        expect(err).toBeInstanceOf(BaseError);
        expect(err.code).toBe(row.code);
        expect(isErrorCode(err.code)).toBe(true);
        expect(err.statusCode).toBe(row.status);
        expect(err.expose).toBe(row.expose);
        if (row.isOperational !== undefined) {
          expect(err.isOperational).toBe(row.isOperational);
        }
        if (row.hasCause) {
          expect(err.cause).toBe(cause);
        }
        // 4xx client errors should not be logged at ERROR level by default.
        if (err.statusCode < 500 && err.expose) {
          expect(err.severity).not.toBe(ErrorSeverity.CRITICAL);
        }
      });

      it("serializes own fields and never throws in JSON.stringify", () => {
        const err = row.make();
        expect(() => JSON.stringify(err)).not.toThrow();
        const json = err.toJSON() as unknown as Record<string, unknown>;
        expect(json.name).toBe(row.name);
        expect(json.code).toBe(row.code);
        if (row.own) {
          expect(ownFieldsOf(err, row.own)).toEqual(row.own);
          for (const key of Object.keys(row.own)) {
            const metadata = (json.metadata ?? {}) as Record<string, unknown>;
            expect(key in json || key in metadata).toBe(true);
          }
        }
      });

      it("withMetadata preserves message, code, status and own fields", () => {
        const err = row.make();
        const next = err.withMetadata({ requestId: "r1" });
        expect(next).toBeInstanceOf(err.constructor);
        expect(next.message).toBe(err.message);
        expect(next.code).toBe(err.code);
        expect(next.statusCode).toBe(err.statusCode);
        expect(next.expose).toBe(err.expose);
        expect(next.cause).toBe(err.cause);
        expect(next.getMetadata("requestId")).toBe("r1");
        if (row.own) {
          expect(ownFieldsOf(next, row.own)).toEqual(row.own);
        }
      });

      it("does not hard-code name (name follows the constructor)", () => {
        const err = row.make();
        expect(err.name).toBe(err.constructor.name);
      });
    });
  }

  it("covers every *Error class exported from src/domain", () => {
    const exported = Object.entries(domain)
      .filter(
        ([name, value]) =>
          name.endsWith("Error") &&
          typeof value === "function" &&
          (value as { prototype?: unknown }).prototype instanceof BaseError,
      )
      .map(([name]) => name)
      .sort();
    const covered = rows.map((r) => r.name).sort();
    expect(covered).toEqual(exported);
  });
});
