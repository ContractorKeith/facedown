# Single-writer lease, fencing and shutdown order

One process owns the tables, gated by the `leases` row (PLAN §5.2). Each holder takes a fresh unique token, so a process that was suspended past its heartbeat and then resumes is fenced out by token, not by timing. Rebuilding tables from the log never runs inside the lease transaction; only its writes are fenced. Small logs replay synchronously, large ones yield so the heartbeat and `/healthz` keep running during a long rebuild. A terminal move and its outcome (including leaver flags) commit in one transaction, and every scheduled table callback isolates its own failure so one bad table cannot stop the others.

On confirmed lease loss the server demotes through a queued microtask, which also covers failures during initialization because the HTTP server and socket hub exist by the time it runs; it closes sockets with 1012, waits about 100 ms so those frames flush, then exits 1. On SIGTERM it drains pending writes, closes sockets, stops tables and the server, and then stops tables again, because closing sockets fires disconnect handlers that schedule new holds.

The runtime image is `FROM scratch` with only the Bun binary and the libraries `ldd` lists: no shell or OS package manager to exploit or keep patched.
