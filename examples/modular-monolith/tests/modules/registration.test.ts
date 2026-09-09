import { beforeAll, describe, expect, it } from "vitest";
import { createCommandBus, createQueryBus } from "@zudojs/cqrs";
import { createEventBus } from "@zudojs/events";

import { loadModules } from "../../src/loaders/modules.loader.js";
import { createAppLogger } from "../../src/loggers/logger.js";
import { LoggerLevel } from "@zudojs/logger";

/**
 * Every command and query each module is contracted to expose.
 *
 * Listing them explicitly is the point: renaming or dropping a handler
 * is a breaking change for anyone who built on this template, and a
 * bare "size() > 0" check would not notice.
 */
const COMMANDS = [
  "identity.register-user",
  "identity.update-profile",
  "articles.create",
  "articles.update",
  "articles.publish",
  "articles.delete",
  "comments.create",
  "comments.update",
  "comments.delete",
  "reactions.add",
  "reactions.remove",
  "topics.create",
  "topics.follow",
  "notifications.create",
  "notifications.mark-read",
] as const;

const QUERIES = [
  "identity.get-user",
  "identity.get-profile",
  "articles.get",
  "articles.list",
  "articles.search",
  "comments.list",
  "reactions.get",
  "topics.get",
  "topics.list",
  "notifications.get",
] as const;

describe("module registration", () => {
  let commandBus: ReturnType<typeof createCommandBus>;
  let queryBus: ReturnType<typeof createQueryBus>;

  beforeAll(async () => {
    commandBus = createCommandBus();
    queryBus = createQueryBus();

    const repositories = await import("../../src/repositories/index.js");

    loadModules({
      users: new repositories.SqliteUserRepository(),
      articles: new repositories.SqliteArticleRepository(),
      comments: new repositories.SqliteCommentRepository(),
      reactions: new repositories.SqliteReactionRepository(),
      topics: new repositories.SqliteTopicRepository(),
      followers: new repositories.SqliteTopicFollowerRepository(),
      notifications: new repositories.SqliteNotificationRepository(),
      commandBus,
      queryBus,
      events: createEventBus(),
      logger: createAppLogger(LoggerLevel.ERROR),
    });
  });

  it.each(COMMANDS)("registers the %s command", (type) => {
    expect(commandBus.has(type)).toBe(true);
  });

  it.each(QUERIES)("registers the %s query", (type) => {
    expect(queryBus.has(type)).toBe(true);
  });

  it("registers no handler twice", () => {
    const commands = commandBus.getCommandTypes();
    const queries = queryBus.getQueryTypes();

    expect(new Set(commands).size).toBe(commands.length);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("namespaces every handler by module", () => {
    const all = [
      ...commandBus.getCommandTypes(),
      ...queryBus.getQueryTypes(),
    ];

    expect(all.filter((t) => !t.includes("."))).toEqual([]);
  });
});
