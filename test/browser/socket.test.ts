import { expect, mock, test } from "bun:test";
import { connect } from "../../client/src/socket";
import { current, retry, Socket, timers } from "./socket-fixture";

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
    current().frame({ t: "view", you: 0 });
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
    current().frame({ t: "view", you: 2 });
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
    current().frame({ t: "view", you: null, view: { hand: [] } });
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
    current().frame({ t: "view", you: 0 });
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

test("ping renews the 45-second silence deadline and silence reconnects with backoff", async () => {
  const connection = connect(
    "table",
    0,
    () => {},
    () => {},
  );
  try {
    current().open();
    current().frame({ t: "view", you: 0 });
    const first = [...timers.keys()][0];
    current().frame({ t: "ping" });
    expect(timers.has(first as number)).toBe(false);
    expect(timers.size).toBe(1);
    const silent = current();
    retry(45000);
    expect(current().readyState).toBe(3);
    // A silent transport may never complete its close handshake.
    retry(500);
    expect(Socket.all).toHaveLength(2);
    current().open();
    silent.onerror?.();
    expect(current().readyState).toBe(1);
  } finally {
    connection.stop();
  }
  expect(timers.size).toBe(0);
});

test("fresh-tab reclaim probes occupied seats and trusts you, without comparing names", () => {
  const received = mock((_message: Record<string, unknown>) => {});
  const connection = connect(
    "table",
    null,
    received,
    () => {},
    undefined,
    [0, 2],
  );
  try {
    current().open();
    expect(current().sent.at(-1)?.seat).toBe(0);
    current().frame({ t: "error", code: "forbidden" });
    expect(current().sent.at(-1)?.seat).toBe(2);
    current().frame({ t: "view", you: 2 });
    expect(received).not.toHaveBeenCalledWith({ t: "signed_out" });
  } finally {
    connection.stop();
  }
});

test("a view without a valid you is a protocol error, never a successful subscription", () => {
  for (const you of [undefined, 4, "0"]) {
    const receive = mock((_message: Record<string, unknown>) => {});
    const status = mock((_up: boolean) => {});
    const connection = connect("table", 0, receive, status);
    try {
      current().open();
      current().frame({ t: "view", you });
      expect(receive).toHaveBeenCalledWith(
        expect.objectContaining({ t: "error", code: "bad_response" }),
      );
      expect(status).not.toHaveBeenCalledWith(true);
      expect(current().readyState).toBe(3);
    } finally {
      connection.stop();
    }
  }
});
