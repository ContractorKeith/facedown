import { startServer } from "./index";

const app = startServer();
console.log(`facedown listening on ${app.server.port}`);
let terminating: Promise<void> | undefined;
function terminate(): Promise<void> {
  if (terminating) return terminating;
  const deadline = setTimeout(() => process.exit(1), 9000);
  deadline.unref();
  terminating = app
    .stop()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Shutdown failed", error);
      process.exit(1);
    });
  return terminating;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void terminate();
  });
