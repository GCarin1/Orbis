// A reconnecting client of the hub's event stream, for the main process.
import type { StreamEvent } from "@orbis/shared";

export function followStream(hubUrl: string, token: string | null, onEvent: (event: StreamEvent) => void): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: NodeJS.Timeout | null = null;

  const connect = () => {
    if (stopped) return;
    const url = new URL("/api/v1/stream", hubUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (token) url.searchParams.set("token", token);
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      attempt = 0;
      socket?.send(JSON.stringify({ type: "subscribe" }));
    });
    socket.addEventListener("message", (msg) => {
      try {
        const event = JSON.parse(String(msg.data)) as StreamEvent | { type: "subscribed" };
        if (event.type !== "subscribed") onEvent(event as StreamEvent);
      } catch {
        /* not an event */
      }
    });
    socket.addEventListener("close", () => {
      if (stopped) return;
      attempt += 1;
      timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** Math.min(attempt, 5)));
    });
  };
  connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}
