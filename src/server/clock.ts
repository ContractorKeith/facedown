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
    const value = Number(process.env[name] ?? fallback);
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
