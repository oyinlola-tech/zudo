/**
 * @zudojs/adapters/messaging
 *
 * Messaging adapter contracts — bridges Zudojs messaging to external providers.
 */

import type { Adapter, AdapterOperationOptions } from "../index.js";

/**
 * Messaging adapter — connects Zudojs message bus to external providers.
 *
 * Examples: RabbitMQ, Kafka, Redis Streams, NATS, AWS SQS, Google Pub/Sub.
 */
export interface MessageAdapter extends Adapter {
  /** Publishes a message to the external provider. */
  publish(
    topic: string,
    message: unknown,
    options?: AdapterOperationOptions,
  ): Promise<void>;

  /** Subscribes to a topic with a handler. */
  subscribe(topic: string, handler: MessageHandler): Promise<Subscription>;

  /** Unsubscribes from a topic. */
  unsubscribe(subscription: Subscription): Promise<void>;
}

/**
 * Message handler function.
 */
export type MessageHandler = (message: unknown) => Promise<void> | void;

/**
 * Subscription handle.
 */
export interface Subscription {
  readonly id: string;
  readonly topic: string;
  unsubscribe(): Promise<void>;
}
