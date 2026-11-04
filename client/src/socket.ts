// A connection owns one table subscription, including every reconnect.
export function connect(
  table: string,
  seat: number | null,
  receive: (message: Record<string, unknown>) => void,
  status: (up: boolean) => void,
) {
  let socket: WebSocket;
  let stopped = false;
  let delay = 500;
  let retry: ReturnType<typeof setTimeout>;
  function open() {
    if (stopped) return;
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    socket.onopen = () => {
      delay = 500;
      socket.send(
        JSON.stringify(
          seat === null ? { t: "spectate", table } : { t: "join", table, seat },
        ),
      );
    };
    socket.onmessage = (event) => {
      if (stopped) return;
      const message = JSON.parse(event.data);
      if (message.t === "view") status(true);
      receive(message);
    };
    socket.onclose = () => {
      status(false);
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
      if (socket.readyState === WebSocket.OPEN)
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
