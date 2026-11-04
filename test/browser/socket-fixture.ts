import { afterEach, beforeEach, expect } from "bun:test";
export class Socket {
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
export const timers = new Map<number, { callback: () => void; ms: number }>();
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
export function current() {
  const socket = Socket.all.at(-1);
  if (!socket) throw new Error("No socket");
  return socket;
}
export function retry(ms: number) {
  const job = timers.entries().next().value;
  if (!job) throw new Error("No retry");
  expect(job[1].ms).toBe(ms);
  timers.delete(job[0]);
  job[1].callback();
}
