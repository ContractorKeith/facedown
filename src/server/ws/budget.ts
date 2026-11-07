export class Budget {
  private messages: number[] = [];
  private moves: number[] = [];
  private floodSince?: number;
  private lastFlood?: number;
  private charge(now: number, move: boolean): "ok" | "limited" | "close" {
    this.messages = this.messages.filter((t) => now - t < 1000);
    this.moves = this.moves.filter((t) => now - t < 1000);
    if (
      (!move && this.messages.length >= 20) ||
      (move && this.moves.length >= 10)
    ) {
      if (this.lastFlood === undefined || now - this.lastFlood > 1000)
        this.floodSince = now;
      this.lastFlood = now;
      return now - (this.floodSince ?? now) >= 3000 ? "close" : "limited";
    }
    if (!move) this.messages.push(now);
    if (move) this.moves.push(now);
    return "ok";
  }
  accept(now: number) {
    return this.charge(now, false);
  }
  acceptMove(now: number) {
    return this.charge(now, true);
  }
}
