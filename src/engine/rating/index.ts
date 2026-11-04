import type { Team } from "../core/types";

export type Rating = { rating: number; rd: number; volatility: number };
export const initial: Readonly<Rating> = {
  rating: 1500,
  rd: 350,
  volatility: 0.06,
};
type Result = { rating: number; rd: number; score: number };
const scale = 173.7178;

// Glickman's Glicko-2, including the Illinois volatility iteration.
export function update(player: Rating, results: Result[]): Rating {
  if (!results.length) return { ...player };
  const mu = (player.rating - 1500) / scale,
    phi = player.rd / scale;
  let precision = 0,
    improvement = 0;
  for (const opponent of results) {
    const g =
      1 / Math.sqrt(1 + (3 * (opponent.rd / scale) ** 2) / Math.PI ** 2);
    const expected =
      1 / (1 + Math.exp(-g * (mu - (opponent.rating - 1500) / scale)));
    precision += g * g * expected * (1 - expected);
    improvement += g * (opponent.score - expected);
  }
  const v = 1 / precision,
    delta = v * improvement;
  const a = Math.log(player.volatility ** 2),
    tau = 0.5;
  const f = (x: number) => {
    const ex = Math.exp(x),
      sum = phi * phi + v + ex;
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * sum * sum) -
      (x - a) / (tau * tau)
    );
  };
  let A = a,
    B: number;
  if (delta * delta > phi * phi + v)
    B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A),
    fB = f(B);
  while (Math.abs(B - A) > 1e-6) {
    const C = A + ((A - B) * fA) / (fB - fA),
      fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const volatility = Math.exp(A / 2);
  const rd = 1 / Math.sqrt(1 / (phi * phi + volatility * volatility) + 1 / v);
  return {
    rating: 1500 + scale * (mu + rd * rd * improvement),
    rd: scale * rd,
    volatility,
  };
}

export function rateTeams(
  players: readonly Rating[],
  winner: Team,
  leavers: readonly boolean[],
): Rating[] {
  if (players.length !== 4 || leavers.length !== 4)
    throw new Error("Four seats required");
  return players.map((player, seat) => {
    const opponents = players.filter((_, i) => i % 2 !== seat % 2);
    return update(player, [
      {
        rating: opponents.reduce((sum, p) => sum + p.rating, 0) / 2,
        rd: opponents.reduce((sum, p) => sum + p.rd, 0) / 2,
        score: !leavers[seat] && seat % 2 === winner ? 1 : 0,
      },
    ]);
  });
}
