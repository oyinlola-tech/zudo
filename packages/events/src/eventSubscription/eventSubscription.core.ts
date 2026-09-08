/**
 * Event subscription primitives for Zudojs.
 *
 * A subscription represents an active connection between an
 * event listener and an event source.
 *
 * The subscription owns cancellation of that connection, but
 * does not know how events are dispatched.
 */

import { randomBytes } from "node:crypto";

/**
 * Unique identifier assigned to a subscription.
 */
export type EventSubscriptionId = string;

/**
 * Subscription state.
 */
export enum EventSubscriptionState {
  /**
   * Subscription is active.
   */
  ACTIVE = "active",

  /**
   * Subscription has been cancelled.
   */
  CANCELLED = "cancelled",
}

/**
 * Options for creating an event subscription.
 */
export interface EventSubscriptionOptions {
  /**
   * Optional identifier.
   *
   * If omitted, an identifier is generated.
   */
  readonly id?: EventSubscriptionId;

  /**
   * Optional human-readable description.
   */
  readonly description?: string;
}

/**
 * Public event subscription contract.
 */
export interface EventSubscription {
  /**
   * Unique subscription identifier.
   */
  readonly id: EventSubscriptionId;

  /**
   * Optional description.
   */
  readonly description?: string;

  /**
   * Current subscription state.
   */
  readonly state: EventSubscriptionState;

  /**
   * Whether the subscription is currently active.
   */
  readonly active: boolean;

  /**
   * Cancels the subscription.
   *
   * Cancellation is idempotent.
   */
  unsubscribe(): void;
}

/**
 * Internal subscription implementation.
 */
export class EventSubscriptionHandle implements EventSubscription {
  readonly id: EventSubscriptionId;

  readonly description?: string;

  private currentState: EventSubscriptionState;

  private readonly onUnsubscribe: () => void;

  private unsubscribeCalled = false;

  constructor(
    onUnsubscribe: () => void,
    options: EventSubscriptionOptions = {},
  ) {
    this.id = options.id ?? createEventSubscriptionId();

    this.description = options.description;

    this.currentState = EventSubscriptionState.ACTIVE;

    this.onUnsubscribe = onUnsubscribe;
  }

  /**
   * Returns the current subscription state.
   */
  get state(): EventSubscriptionState {
    return this.currentState;
  }

  /**
   * Returns whether the subscription is active.
   */
  get active(): boolean {
    return this.currentState === EventSubscriptionState.ACTIVE;
  }

  /**
   * Cancels the subscription.
   *
   * Calling unsubscribe multiple times has no effect.
   */
  unsubscribe(): void {
    if (this.unsubscribeCalled) {
      return;
    }

    this.unsubscribeCalled = true;

    this.currentState = EventSubscriptionState.CANCELLED;

    this.onUnsubscribe();
  }
}

/**
 * Creates a unique event subscription identifier.
 */
export function createEventSubscriptionId(): EventSubscriptionId {
  return `subscription:${Date.now()}:${randomId()}`;
}

/**
 * Generates the random portion of a subscription identifier.
 */
function randomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return randomBytes(8).toString("hex");
}

/**
 * Creates an already active subscription handle.
 */
export function createEventSubscription(
  onUnsubscribe: () => void,
  options: EventSubscriptionOptions = {},
): EventSubscription {
  return new EventSubscriptionHandle(onUnsubscribe, options);
}

/**
 * Determines whether a value is an event subscription.
 */
export function isEventSubscription(
  value: unknown,
): value is EventSubscription {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (
      value as {
        unsubscribe?: unknown;
      }
    ).unsubscribe === "function" &&
    typeof (
      value as {
        active?: unknown;
      }
    ).active === "boolean"
  );
}

/**
 * A collection of subscriptions that can be disposed together.
 */
export class EventSubscriptionGroup implements EventSubscription {
  readonly id: EventSubscriptionId;

  readonly description?: string;

  private readonly subscriptions: Set<EventSubscription>;

  private currentState: EventSubscriptionState;

  constructor(
    subscriptions: readonly EventSubscription[] = [],
    options: EventSubscriptionOptions = {},
  ) {
    this.id = options.id ?? createEventSubscriptionId();

    this.description = options.description;

    this.subscriptions = new Set(subscriptions);

    this.currentState = EventSubscriptionState.ACTIVE;
  }

  /**
   * Returns the current state.
   */
  get state(): EventSubscriptionState {
    return this.currentState;
  }

  /**
   * Returns whether the group is active.
   */
  get active(): boolean {
    return this.currentState === EventSubscriptionState.ACTIVE;
  }

  /**
   * Number of subscriptions in the group.
   */
  get size(): number {
    return this.subscriptions.size;
  }

  /**
   * Adds a subscription to the group.
   */
  add(subscription: EventSubscription): this {
    if (!this.active) {
      subscription.unsubscribe();

      return this;
    }

    this.subscriptions.add(subscription);

    return this;
  }

  /**
   * Removes a subscription from the group without
   * unsubscribing it.
   */
  remove(subscription: EventSubscription): boolean {
    return this.subscriptions.delete(subscription);
  }

  /**
   * Unsubscribes every subscription in the group.
   *
   * Every subscription is attempted even if one throws; the
   * failures are then re-thrown together as an AggregateError and
   * the failed subscriptions stay in the group so the call can be
   * retried.
   */
  unsubscribe(): void {
    if (!this.active) {
      return;
    }

    const subscriptions = [...this.subscriptions];

    const failures: unknown[] = [];

    for (const subscription of subscriptions) {
      try {
        subscription.unsubscribe();

        this.subscriptions.delete(subscription);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} of ${subscriptions.length} subscriptions failed to unsubscribe.`,
      );
    }

    this.currentState = EventSubscriptionState.CANCELLED;
  }

  /**
   * Returns all subscriptions in the group.
   */
  getAll(): readonly EventSubscription[] {
    return [...this.subscriptions];
  }
}

/**
 * Creates an empty subscription group.
 */
export function createEventSubscriptionGroup(
  options: EventSubscriptionOptions = {},
): EventSubscriptionGroup {
  return new EventSubscriptionGroup([], options);
}
