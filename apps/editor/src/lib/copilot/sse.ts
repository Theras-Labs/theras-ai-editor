// Minimal text/event-stream parser for POST /api/ai/chat/stream (Theras server).
// It accepts chunks that split lines or events at any byte, ignores comment lines (": ping"),
// and joins multi-line "data:" fields with "\n" as the SSE format says.

export type SseParser = {
  /** Adds decoded text. Calls onData once for each complete event. */
  push(chunk: string): void;
  /** Flushes a last event that had no closing empty line. */
  end(): void;
};

export function createSseParser(onData: (data: string) => void): SseParser {
  let buffer = "";
  let data: string[] = [];

  const dispatch = () => {
    if (data.length === 0) return;
    const payload = data.join("\n");
    data = [];
    onData(payload);
  };

  const line = (raw: string) => {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (text === "") return dispatch();
    if (text.startsWith(":")) return; // comment, for example ": ping"
    const colon = text.indexOf(":");
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    // "event", "id" and "retry" are not used by this route.
  };

  return {
    push(chunk) {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        line(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
      }
    },
    end() {
      if (buffer) line(buffer);
      buffer = "";
      dispatch();
    }
  };
}
