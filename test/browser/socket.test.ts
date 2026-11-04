import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { connect } from "../../client/src/socket";

class Socket {
  static OPEN = 1;
  static all: Socket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void | Promise<void>) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string) {
    Socket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
  shutdown(code: number) {
    this.close();
    return this.onclose?.({ code });
  }
  frame(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const originalSocket = globalThis.WebSocket;
const locationDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "location",
);
const originalTimeout = globalThis.setTimeout;
const originalClear = globalThis.clearTimeout;
const timers = new Map<number, { callback: () => void; ms: number }>();
let nextId = 0;
beforeEach(() => {
  Socket.all = [];
  timers.clear();
  nextId = 0;
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol: "http:", host: "localhost" },
  });
  globalThis.setTimeout = ((callback: () => void, ms: number) => {
    const id = ++nextId;
    timers.set(id, { callback, ms });
    return id;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) =>
    timers.delete(id)) as unknown as typeof clearTimeout;
});
afterEach(() => {
  globalThis.WebSocket = originalSocket;
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClear;
  if (locationDescriptor)
    Object.defineProperty(globalThis, "location", locationDescriptor);
  else Reflect.deleteProperty(globalThis, "location");
});
function current() {
  const socket = Socket.all.at(-1);
  if (!socket) throw new Error("No socket");
  return socket;
}
function retry(ms: number) {
  const job = timers.entries().next().value;
  if (!job) throw new Error("No retry");
  expect(job[1].ms).toBe(ms);
  timers.delete(job[0]);
  job[1].callback();
}
test("accept-then-close backs off until a view arrives; three failures refresh the session", async () => {
  const refresh = mock(async () => "guest");
  const connection = connect(
    "table",
    0,
    () => {},
    () => {},
    refresh,
  );
  try {
    current().open();
    await current().shutdown(1006);
    retry(500);
    current().open();
    await current().shutdown(1006);
    retry(1000);
    current().open();
    await current().shutdown(1006);
    expect(refresh).toHaveBeenCalledTimes(1);
    retry(2000);
    current().open();
    await current().shutdown(1006);
    retry(4000);
    current().open();
    await current().shutdown(1006);
    retry(8000);
    current().open();
    await current().shutdown(1006);
    retry(8000);
    current().open();
    current().frame({ t: "view" });
    await current().shutdown(1000);
    retry(500);
  } finally {
    connection.stop();
  }
});
test("1008 refreshes immediately; a forbidden saved seat becomes a spectator subscription", async () => {
  const refresh = mock(async () => "new guest");
  const receive = mock((_message: Record<string, unknown>) => {});
  const status = mock((_up: boolean) => {});
  const connection = connect("table", 2, receive, status, refresh);
  try {
    current().open();
    current().frame({ t: "view" });
    await current().shutdown(1008);
    expect(refresh).toHaveBeenCalledTimes(1);
    retry(500);
    current().open();
    expect(current().sent.at(-1)).toEqual({
      t: "join",
      table: "table",
      seat: 2,
    });
    current().frame({ t: "error", code: "forbidden" });
    expect(current().sent.at(-1)).toEqual({ t: "spectate", table: "table" });
    expect(receive).toHaveBeenCalledWith({ t: "signed_out" });
    current().frame({ t: "view", view: { hand: [] } });
    expect(status).toHaveBeenLastCalledWith(true);
  } finally {
    connection.stop();
  }
});
test("stopping while session recovery is in flight cannot reopen the socket", async () => {
  let finish = () => {};
  const connection = connect(
    "table",
    0,
    () => {},
    () => {},
    () => new Promise<void>((resolve) => (finish = resolve)),
  );
  const closed = current().shutdown(1008);
  connection.stop();
  finish();
  await closed;
  expect(timers.size).toBe(0);
});

test("an established connection closing does not count as a failed upgrade", async () => {
  const refresh = mock(async () => "guest");
  const connection = connect(
    "table",
    0,
    () => {},
    () => {},
    refresh,
  );
  try {
    current().open();
    current().frame({ t: "view" });
    await current().shutdown(1000);
    retry(500);
    await current().shutdown(1006);
    retry(1000);
    await current().shutdown(1006);
    retry(2000);
    expect(refresh).toHaveBeenCalledTimes(0);
    await current().shutdown(1006);
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally {
    connection.stop();
  }
});
