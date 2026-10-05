export interface StreamEvent {
  event: string;
  data: any;
}

/** Reads an NDJSON fetch response, calling `onEvent` for every complete line as it arrives. */
export async function readNdjson(res: Response, onEvent: (e: StreamEvent) => void): Promise<void> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const flush = (line: string) => {
    const t = line.trim();
    if (!t) return;
    try {
      onEvent(JSON.parse(t) as StreamEvent);
    } catch {
      /* ignore a malformed line rather than killing the stream */
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      flush(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  flush(buf);
}
