export function bunWebSocket(
  url: string,
  options: Bun.WebSocketOptions,
): WebSocket {
  return Reflect.construct(WebSocket, [url, options]);
}
