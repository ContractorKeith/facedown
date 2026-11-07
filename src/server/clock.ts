export interface Clock {
  now(): number;
  after(ms: number, callback: () => void): () => void;
}
export const clock: Clock = {
  now: () => Date.now(),
  after(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
export type Timing = { turn: number; hold: number; bot: number };
export function timing(): Timing {
  const read = (name: string, fallback: number, minimum: number) => {
    const value = Number(process.env[name]?.trim() || fallback);
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new Error(`Invalid ${name}`);
    return value;
  };
  return {
    turn: read("FACEDOWN_TURN_MS", 30000, 1),
    hold: read("FACEDOWN_HOLD_MS", 180000, 0),
    bot: read("FACEDOWN_BOT_MS", 600, 0),
  };
}

export const openTTL = () => {
  const value = Number(process.env.FACEDOWN_OPEN_TTL_MS?.trim() || 1800000);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Invalid FACEDOWN_OPEN_TTL_MS");
  return value;
};

export function timer(name: string, fallback: number): number {
  const value = Number(process.env[name]?.trim() || fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`Invalid ${name}`);
  return value;
}
export const openHold = () => timer("FACEDOWN_OPEN_HOLD_MS", 600000);
export const pingMS = () => timer("FACEDOWN_PING_MS", 20000);
