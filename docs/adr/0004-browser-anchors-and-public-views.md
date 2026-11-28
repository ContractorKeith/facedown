# What the browser trusts, and what crosses a Deal boundary

ADR 0002 distinguishes "Verified" from "Consistent". Only a hash chain the browser held in memory while the game was live can establish continuity; anchors saved to storage can only detect that a stored game changed afterwards. Live validation and the saved replay anchor are therefore written together, in one place. Storage may be disabled or full; that browser simply gets "Consistent" and nothing fails. The replay viewer folds every move before it shows any frame, so an invalid log is never presented as a partially valid replay.

Across Deals the engine scores first and only then replaces the hands, and carries only public numbers into the next Deal, so nothing private leaks forward. `lastMove` in a view is the exact public action, but at a Deal boundary the piece it names may already sit in a newly shuffled private Hand, so view checks treat `lastMove` separately from piece locations.
