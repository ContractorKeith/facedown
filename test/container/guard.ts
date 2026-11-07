// Docker probe: a missing or hung daemon must fail fast, never stall the suite.
export function dockerAvailable(command = "docker"): boolean {
  try {
    return (
      Bun.spawnSync([command, "info"], {
        stdout: "ignore",
        stderr: "ignore",
        timeout: 5000,
      }).exitCode === 0
    );
  } catch {
    return false;
  }
}

export function requireDocker(
  enabled: boolean,
  probe: () => boolean = dockerAvailable,
): void {
  if (!enabled) {
    console.log("container: skipped (opt in with bun run test:container)");
    return;
  }
  if (!probe())
    throw new Error(
      "container: Docker daemon access required when FACEDOWN_CONTAINER=1",
    );
}
