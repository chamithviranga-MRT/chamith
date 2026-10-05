/** Newline-delimited JSON stream: one `{event, data}` object per line. Works with fetch() + ReadableStream on POST. */
export function ndjsonResponse(run: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>, req: Request): Response {
  const enc = new TextEncoder();
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify({ event, data }) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        await run(send, ac.signal);
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : "Unexpected error" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      ac.abort();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
