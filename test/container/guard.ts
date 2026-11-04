export function requireDocker(enabled: boolean): void {
  if (!enabled) {
    console.log("container: skipped (opt in with bun run test:container)");
    return;
  }
  let available = false;
  try {
    available =
      Bun.spawnSync(["docker", "info"], {
        stdout: "ignore",
        stderr: "ignore",
      }).exitCode === 0;
  } catch {}
  if (!available)
    throw new Error(
      "container: Docker daemon access required when FACEDOWN_CONTAINER=1",
    );
}
