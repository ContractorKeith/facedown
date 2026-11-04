import { expect, test } from "bun:test";

for (const missing of ["daemon", "executable"] as const)
  test(`explicit container opt-in fails without Docker ${missing}`, async () => {
    const child = Bun.spawn(
      [process.execPath, "test", "test/container/handoff.test.ts"],
      {
        env: {
          ...process.env,
          FACEDOWN_CONTAINER: "1",
          DOCKER_HOST: "unix:///facedown-test-missing-docker.sock",
          ...(missing === "executable" ? { PATH: "" } : {}),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).not.toBe(0);
    expect(stdout + stderr).toContain("Docker daemon access required");
  });
