// Incremental reader for an upstream text/event-stream body. It calls onData once for each
// complete event with the joined "data:" lines. Comment lines and empty events are skipped.

export async function readSSE(body: ReadableStream<Uint8Array>, onData: (data: string, event: string | null) => void): Promise<void> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let dataLines: string[] = [];
  let eventName: string | null = null;

  const flush = () => {
    if (dataLines.length > 0) onData(dataLines.join("\n"), eventName);
    dataLines = [];
    eventName = null;
  };

  const line = (raw: string) => {
    const l = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (l === "") return flush();
    if (l.startsWith(":")) return;
    const colon = l.indexOf(":");
    const field = colon === -1 ? l : l.slice(0, colon);
    let value = colon === -1 ? "" : l.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
    else if (field === "event") eventName = value;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        line(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer) line(buffer);
    flush();
  } finally {
    reader.releaseLock();
  }
}
