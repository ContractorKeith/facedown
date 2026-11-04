import { commitment } from "../../engine/core/random";
import type { GameType } from "../../engine/core/types";
import { registry } from "../../engine/registry";
import { randomHex, randomId, type Session } from "../http/sessions";
import type { Lifecycle } from "./lifecycle";
import type { Retention } from "./retention";
import { Fault, type Table } from "./types";

export class Creation {
  constructor(
    private tables: Map<string, Table>,
    private lifecycle: Lifecycle,
    private retention: Retention,
  ) {}
  async fromJSON(host: Session, read: () => Promise<unknown>): Promise<Table> {
    this.retention.attempt(host);
    const body = await read();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Fault("bad_request");
    const b = body as Record<string, unknown>;
    if (
      (b.type !== "spades" && b.type !== "dominoes") ||
      Object.keys(b).some((k) => !["type", "casual"].includes(k)) ||
      (b.casual !== undefined && typeof b.casual !== "boolean")
    )
      throw new Fault("bad_request");
    return this.allocate(b.type, host, b.casual === true);
  }
  create(type: GameType, host: Session, casual = false): Table {
    this.retention.attempt(host);
    return this.allocate(type, host, casual);
  }
  private allocate(type: GameType, host: Session, casual: boolean): Table {
    if (this.lifecycle.closed) throw new Fault("unavailable");
    const game = registry.get(type);
    if (!game) throw new Fault("bad_request");
    this.retention.checkOpen(host);
    let id: string;
    do {
      id = randomId(10);
    } while (this.tables.has(id) || this.lifecycle.store.gameStatus(id));
    const seed = randomHex();
    const table: Table = {
      id,
      type,
      host: host.id,
      casual,
      overSent: new Set(),
      game,
      seed,
      commitment: commitment(seed),
      state: game.init(seed, game.ruleset),
      seq: 0,
      status: "open",
      deadline: null,
      viewers: new Map(),
      seats: [
        {
          session: host.id,
          name: host.name,
          accountId: host.accountId,
          bot: false,
          sockets: new Set(),
        },
        null,
        null,
        null,
      ],
    };
    this.tables.set(id, table);
    this.retention.changed(table);
    return table;
  }
}
