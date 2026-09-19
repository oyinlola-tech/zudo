import { defineEvent } from "@zudojs/events";

/**
 * Event emitted when a new user is created.
 */
export const UserCreatedEvent = defineEvent<
  "user.created",
  {
    readonly userId: string;
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly role: string;
  }
>("user.created");

/**
 * Event emitted when a user successfully authenticates.
 */
export const UserAuthenticatedEvent = defineEvent<
  "user.authenticated",
  {
    readonly userId: string;
    readonly email: string;
  }
>("user.authenticated");
