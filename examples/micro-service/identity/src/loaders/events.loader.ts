import type { EventBus, Event } from "@zudojs/events";
import { UserCreatedEvent, UserAuthenticatedEvent } from "../events/index.js";

/**
 * Registers event definitions and listeners on the event bus.
 */
export function loadEvents(eventBus: EventBus): void {
  eventBus.register(UserCreatedEvent);
  eventBus.register(UserAuthenticatedEvent);

  eventBus.on(
    "user.created",
    async (
      event: Event<{ readonly userId: string; readonly email: string }>,
    ) => {
      console.log(
        `[identity] User created: ${event.payload.userId} (${event.payload.email})`,
      );
    },
  );

  eventBus.on(
    "user.authenticated",
    async (event: Event<{ readonly userId: string }>) => {
      console.log(`[identity] User authenticated: ${event.payload.userId}`);
    },
  );
}
