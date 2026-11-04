# facedown

A server for four-handed turn-based card and domino games where the server is the only party that sees hidden information.

## Language

**Game**:
One complete contest at a table, from first deal until a team reaches the target score.
_Avoid_: Match, session

**Deal**:
One shuffle through scoring: cards or tiles dealt, played out, and scored.
_Avoid_: Hand (for this meaning), round

**Hand**:
The cards or tiles one seat currently holds.
_Avoid_: Holding, rack

**Seat**:
One of the four fixed positions at a table; partners sit across from each other.
_Avoid_: Player slot, position

**Move**:
One input to the engine from a seat or the server, such as a bid, a play, a draw, or a timeout.
_Avoid_: Action, command, event

**Move log**:
The ordered list of moves in a game; together with the seed it is the canonical record.
_Avoid_: History, event stream

**Seed**:
The secret random value the server picks for a game; every deal's shuffle derives from it.

**Seed commitment**:
The sha256 of the seed, published when the game starts and checkable once the seed is revealed at game end.
_Avoid_: Proof, hash

**Viewer**:
Who a view is for: one seat or a spectator.

**View**:
What one viewer is allowed to see of the game state, produced by the engine.
_Avoid_: Projection, client state, redacted state

**Team**:
The two seats sitting across from each other, who score together.
_Avoid_: Partnership, side

**Boneyard**:
The face-down dominoes left after the deal, drawn from when a seat cannot play.
_Avoid_: Stock, draw pile

**Ruleset**:
The fixed configuration object for one game type, such as target score and whether nil is allowed.
_Avoid_: Variant, options, settings

**Spectator**:
A viewer with no seat, who sees only public information while the game is live.
_Avoid_: Observer, watcher

**Bot**:
A rule-based player that decides only from its own seat's view.
_Avoid_: AI, CPU, computer

**Reclaim**:
A disconnected player taking their seat back from the bot that replaced them before the game ends.
_Avoid_: Rejoin (for a seat already taken by a bot)

**Leaver**:
An account whose seat is held by a bot when the game ends; the result counts as a loss for them.
_Avoid_: Quitter, abandoner

**Rated game**:
A game with four signed-in humans seated at the start, whose result updates their ratings in that game's pool.
_Avoid_: Ranked game, competitive game

**Casual game**:
Any game that is not rated, including any with guests or bots at the start.
_Avoid_: Unranked, friendly

**Rating pool**:
The set of ratings for one game type; a player has a separate rating in each pool.
_Avoid_: Ladder, league

**Guest**:
A player without an account, using a throwaway name, who can only play casual games.
_Avoid_: Anonymous user

**Replay**:
A finished game's seed and move log, viewable with every hand shown and its seed checked against the commitment.
_Avoid_: Recording, game file

**Reaction**:
One of a fixed set of preset messages a seat can send to the table.
_Avoid_: Chat, emote
