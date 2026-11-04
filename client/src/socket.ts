import { session } from "./api";

// Own the subscription, backoff, and session recovery for one table.
export function connect(
  table: string,
  initialSeat: number | null,
  receive: (message: Record<string, unknown>) => void,
  status: (up: boolean) => void,
  refreshSession: () => Promise<unknown> = session,
) {
  let seat = initialSeat;
  let socket: WebSocket;
  let stopped = false;
  let delay = 500;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout>;
  function subscribe() {
    socket.send(
      JSON.stringify(
        seat === null ? { t: "spectate", table } : { t: "join", table, seat },
      ),
    );
  }
  function open() {
    if (stopped) return;
    let ready = false;
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    socket.onopen = subscribe;
    socket.onmessage = (event) => {
      if (stopped) return;
      const message = JSON.parse(event.data);
      if (
        message.t === "error" &&
        message.code === "forbidden" &&
        seat !== null &&
        !ready
      ) {
        seat = null;
        receive({ t: "signed_out" });
        subscribe();
        return;
      }
      if (message.t === "view") {
        ready = true;
        delay = 500;
        failures = 0;
        status(true);
      }
      receive(message);
    };
    socket.onclose = async (event) => {
      if (stopped) return;
      status(false);
      failures = ready ? 0 : failures + 1;
      if (event.code === 1008 || failures >= 3) {
        try {
          await refreshSession();
        } catch {
          receive({
            t: "error",
            message: "Could not restore your session. Retrying…",
          });
        }
      }
      if (!stopped) {
        retry = setTimeout(open, delay);
        delay = Math.min(8000, delay * 2);
      }
    };
    socket.onerror = () => socket.close();
  }
  status(false);
  open();
  return {
    send(message: object) {
      if (!stopped && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ ...message, table }));
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      socket.onclose = null;
      socket.close();
    },
  };
}
