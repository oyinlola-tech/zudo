/**
 * @zudojs/adapters/websocket
 *
 * WebSocket adapter contracts — bridges Zudojs to WebSocket providers.
 */

import type { Adapter } from "../index.js";

/**
 * WebSocket adapter — manages WebSocket connections.
 */
export interface WebSocketAdapter extends Adapter {
  /** Accepts a WebSocket connection. */
  accept(connection: unknown): Promise<WebSocketSession>;

  /** Closes a WebSocket session. */
  close(
    session: WebSocketSession,
    code?: number,
    reason?: string,
  ): Promise<void>;

  /** Sends a message to a WebSocket session. */
  send(
    session: WebSocketSession,
    data: string | ArrayBuffer | Uint8Array,
  ): Promise<void>;

  /** Broadcasts a message to all sessions. */
  broadcast(data: string | ArrayBuffer | Uint8Array): Promise<void>;
}

/**
 * WebSocket session handle.
 */
export interface WebSocketSession {
  readonly id: string;
  readonly readyState: WebSocketReadyState;
  close(code?: number, reason?: string): void;
  send(data: string | ArrayBuffer | Uint8Array): void;
}

/**
 * WebSocket ready states.
 */
export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}
