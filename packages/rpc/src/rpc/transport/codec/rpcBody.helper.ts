/**
 * Outcome of {@link readBoundedBody}.
 *
 * `too-large` means the body exceeded the limit (by its declared
 * `Content-Length` or while streaming); `unreadable` means the stream
 * failed, was aborted, or was not valid UTF-8.
 */
export type RPCBodyReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "too-large" | "unreadable" };

/**
 * The part of a Fetch API `Request` or `Response` a body read needs.
 */
export interface RPCBodySource {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly headers: Headers;
}

/**
 * Reads a Fetch API body as UTF-8 text without ever buffering more than
 * `maxBytes`.
 *
 * `request.text()` buffers the whole body before anything can check its
 * size, so a peer could make the server hold an arbitrarily large body in
 * memory. This checks the declared `Content-Length` first, then counts
 * bytes as they stream and cancels the stream the moment the limit is
 * crossed. Transport-neutral: `@zudojs/api`'s fetch binding reads request
 * bodies through it too.
 *
 * @param maxBytes Limit in bytes; `0` or less disables the limit.
 */
export async function readBoundedBody(
  source: RPCBodySource,
  maxBytes: number,
): Promise<RPCBodyReadResult> {
  const limited = maxBytes > 0;
  const declared = Number(source.headers.get("content-length") ?? Number.NaN);

  if (limited && Number.isFinite(declared) && declared > maxBytes) {
    await source.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "too-large" };
  }

  if (source.body === null) {
    return { ok: true, text: "" };
  }

  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (limited && total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      concat(chunks, total),
    );
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}
