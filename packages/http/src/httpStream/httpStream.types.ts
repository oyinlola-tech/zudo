/**
 * @zudojs/http/httpStream — Stream option and result types.
 */

export interface HTTPStreamOptions {
  readonly signal?: AbortSignal;

  /**
   * Maximum number of bytes to accept before the stream is destroyed and the
   * operation rejects with a limit error. Defaults to
   * `HTTP_DEFAULTS.BODY_LIMIT` (1 MiB).
   *
   * Pass `Infinity` to opt out deliberately.
   */
  readonly maxBytes?: number;
}

/**
 * Options for the stream **factories**.
 *
 * `highWaterMark` lives here rather than on {@link HTTPStreamOptions} because
 * only stream construction can honour it: a read or a pipe over a stream
 * somebody else created cannot change that stream's buffer size, and
 * accepting the option there told callers they had bounded a buffer when they
 * had not.
 */
export interface HTTPStreamFactoryOptions extends HTTPStreamOptions {
  readonly highWaterMark?: number;
}

export interface StreamPipeOptions extends HTTPStreamOptions {
  readonly end?: boolean;
}

export interface StreamResult {
  readonly bytes: number;
}

export interface StreamProgress {
  readonly bytes: number;
  readonly chunks: number;
}

export type StreamProgressHandler = (progress: StreamProgress) => void;
