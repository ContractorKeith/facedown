import { startServer } from "./index";

const app = startServer();
console.log(`facedown listening on ${app.server.port}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    const deadline = setTimeout(() => process.exit(1), 9000);
    deadline.unref();
    await app.stop();
    process.exit(0);
  });
