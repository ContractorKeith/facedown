import { session } from "./api";

// Own the subscription, backoff, and session recovery for one table.
export function connect(
  table: string,
  initialSeat: number | null,
  receive: (message: Record<string, unknown>) => void,
  status: (up: boolean) => void,
  refreshSession: () => Promise<unknown> = session,
  reclaimSeats: number[] = [],
) {
  const candidates = [...reclaimSeats];
  let probing = initialSeat === null && candidates.length > 0;
  let seat = probing ? (candidates.shift() ?? null) : initialSeat;
  let socket: WebSocket;
  let stopped = false;
  let delay = 500;
  let failures = 0;
  let silence: ReturnType<typeof setTimeout>;
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
    let closed = false;
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    const current = socket;
    async function reconnect(code: number) {
      if (stopped || closed) return;
      closed = true;
      clearTimeout(silence);
      current.onclose = null;
      current.onmessage = null;
      status(false);
      failures = ready ? 0 : failures + 1;
      if (code === 1008 || failures >= 3) {
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
    }
    function arm() {
      clearTimeout(silence);
      silence = setTimeout(() => {
        current.close();
        void reconnect(1000);
      }, 45000);
    }
    socket.onopen = () => {
      arm();
      subscribe();
    };
    socket.onmessage = (event) => {
      if (stopped) return;
      arm();
      const message = JSON.parse(event.data);
      if (
        message.t === "error" &&
        message.code === "forbidden" &&
        seat !== null &&
        !ready
      ) {
        seat = probing ? (candidates.shift() ?? null) : null;
        if (!probing) receive({ t: "signed_out" });
        if (seat === null) probing = false;
        subscribe();
        return;
      }
      if (message.t === "view") {
        if (
          message.you !== null &&
          (!Number.isInteger(message.you) || message.you < 0 || message.you > 3)
        ) {
          receive({
            t: "error",
            code: "bad_response",
            message:
              "Server view is missing a valid seat identity. Reconnecting…",
          });
          current.close();
          void reconnect(1000);
          return;
        }
        probing = false;
        seat = message.you;
        ready = true;
        delay = 500;
        failures = 0;
        status(true);
      }
      receive(message);
    };
    socket.onclose = (event) => reconnect(event.code);
    socket.onerror = () => current.close();
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
      clearTimeout(silence);
      socket.onclose = null;
      socket.close();
    },
  };
}
