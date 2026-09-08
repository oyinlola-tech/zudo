/**
 * @zudojs/cqrs
 *
 * Command Query Responsibility Segregation primitives for the Zudojs framework.
 * Provides buses, handlers, middleware, and execution infrastructure.
 */

// Core types (interfaces, type aliases, type guards)
//
// The handler *interfaces* are exported as `CommandHandlerContract` /
// `QueryHandlerContract` because the abstract classes below own the bare
// `CommandHandler` / `QueryHandler` names.
export {
  type CqrsContext,
  type CommandHandler as CommandHandlerContract,
  type QueryHandler as QueryHandlerContract,
  type CommandHandlerFunction,
  type QueryHandlerFunction,
  type CommandHandlerLike,
  type QueryHandlerLike,
  type CommandMiddleware,
  type QueryMiddleware,
  type CqrsMiddleware,
  type CqrsRequest,
  type CommandHandlerRegistration,
  type QueryHandlerRegistration,
  type CqrsBusOptions,
  type CommandOf,
  type QueryOf,
  type CqrsRequestType,
  type CqrsPayload,
  isCqrsRequest,
} from "./cqrsTypes/index.js";

// Command (classes, factories, type guards)
export {
  Command,
  type CommandOptions,
  MetadataCommand,
  createCommand,
  getCommandType,
  isCommand,
  commandType,
  CommandHandler,
  FunctionCommandHandler,
  createCommandHandler,
  isCommandHandler,
  isCommandHandlerLike,
  executeCommandHandler,
  CommandBus,
  type CommandBusOptions,
  type CommandRegistration,
  createCommandBus,
  type CommandResultStatus,
  type CommandResult,
  type CreateCommandResultOptions,
  createCommandResult,
  createFailedCommandResult,
  isSuccessfulCommandResult,
  isFailedCommandResult,
  unwrapCommandResult,
  withCommandResultMetadata,
} from "./command/index.js";

// Query (classes, factories, type guards)
export {
  Query,
  type QueryOptions,
  MetadataQuery,
  createQuery,
  getQueryType,
  isQuery,
  queryType,
  QueryHandler,
  FunctionQueryHandler,
  createQueryHandler,
  isQueryHandler,
  isQueryHandlerLike,
  executeQueryHandler,
  QueryBus,
  type QueryBusOptions,
  type QueryRegistration,
  createQueryBus,
  type QueryResultStatus,
  type QueryResult,
  type CreateQueryResultOptions,
  createQueryResult,
  createFailedQueryResult,
  isSuccessfulQueryResult,
  isFailedQueryResult,
  unwrapQueryResult,
  withQueryResultMetadata,
} from "./query/index.js";

// Events — re-exports base Zudojs Event types + CQRS extensions
export {
  type Event,
  type EventInput,
  type EventDefinition,
  type EventType,
  type EventPayload,
  isEvent,
  createEvent as createBaseEvent,
  createEventId as createBaseEventId,
} from "@zudojs/events";

export * from "./cqrsEvents/index.js";

// Middleware
export * from "./cqrsMiddleware/index.js";

// Handler Registry
export * from "./handlerRegistry/index.js";

// Decorators (explicit list: nothing here may shadow the class exports above)
export {
  type CqrsHandlerKind,
  type CqrsHandlerMetadata,
  type CommandHandlerMetadata,
  type QueryHandlerMetadata,
  type CqrsClass,
  type DecoratedCqrsClass,
  CqrsHandler,
  CommandHandlerFor,
  QueryHandlerFor,
  getCqrsHandlerMetadata,
  getCommandHandlerMetadata,
  getQueryHandlerMetadata,
  getCqrsType,
  isCqrsHandler,
  isDecoratedCommandHandler,
  isDecoratedQueryHandler,
  createCommandHandlerDecorator,
  createQueryHandlerDecorator,
} from "./cqrsDecorators/index.js";

// Execution Context
export * from "./cqrsContext/index.js";

// Errors
export * from "./cqrsErrors/index.js";
