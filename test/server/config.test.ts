import { expect, test } from "bun:test";
import { openTTL, timing } from "../../src/server/clock";

test("empty timer env vars use defaults; invalid numeric values fail", () => {
  const names = [
    "FACEDOWN_TURN_MS",
    "FACEDOWN_HOLD_MS",
    "FACEDOWN_BOT_MS",
    "FACEDOWN_OPEN_TTL_MS",
  ];
  const original = names.map((name) => process.env[name]);
  try {
    for (const name of names) process.env[name] = "";
    expect(timing()).toEqual({ turn: 30000, hold: 180000, bot: 600 });
    expect(openTTL()).toBe(1800000);
    process.env.FACEDOWN_TURN_MS = "0";
    expect(timing).toThrow("Invalid FACEDOWN_TURN_MS");
  } finally {
    names.forEach((name, i) => {
      const value = original[i];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
  }
});
