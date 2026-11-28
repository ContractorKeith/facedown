---
name: delete-comment
description: "Audit every code comment in facedown, delete it, and route what it carried: decisions to docs/adr/, hacks to GitHub issues. Then tighten the comment ratchet. Use for /delete-comment, 'comment sweep', 'delete comments', or when `bun run lint` reports the comment baseline is loose."
---

# delete-comment — facedown

facedown bans code comments. `bun run lint` runs `scripts/lint-comments.ts`, which fails when a
file holds more comments than `scripts/comment-baseline.json` allows, and fails when the
baseline is looser than the code. This skill shrinks that baseline.

## 1. Inventory

```bash
git switch -c chore/delete-comments-<date> origin/main
bun scripts/lint-comments.ts --list > .tmp/comments.json   # file, line, endLine, text, ownLines
```

`ownLines` is how many whole lines deleting that comment removes. Sum it for the LOC estimate.

## 2. Categorise each comment

Read the code around it, `docs/PLAN.md`, `CONTEXT.md` and `docs/adr/` before you decide.

| Category | Test | Action |
|---|---|---|
| Tautology | Restates the code, a name, a test title, or something PLAN/AGENTS/an ADR already says | Delete |
| Stale | Names code, milestones, commits or behaviour that no longer match | Delete |
| Excuse | Explains why a cast, suppression, workaround or misplaced code is acceptable | Delete, and file one issue per hack (label `comments`) naming file:line and the fix |
| Decision Record | A non-obvious choice a future change could break (security, determinism, ordering, protocol) and is not already recorded | Move into an ADR, then delete |

Group decision records by subject into a new `docs/adr/NNNN-<slug>.md` (title line plus a
paragraph, like 0001–0007), or append to the ADR that already owns the subject. Update the
ADR list in `AGENTS.md` Pointers.

`biome-ignore` suppressions are comments too, but Biome needs them at the site: fix the code
or `biome.json` so the suppression is unnecessary, then delete it. If that is not done in this
sweep, leave it and make sure an issue exists.

## 3. Delete

Remove each comment; drop the whole line when nothing else is on it. Never leave a blank-line
pair behind. Do not touch strings, regexes or the shebang.

## 4. Ratchet and verify

```bash
bun scripts/lint-comments.ts --update   # lowers counts only; never raises them
bash scripts/accept.sh
```

Never edit the baseline upward. A new comment is a lint failure: put the reason in an ADR or
an issue instead.

## 5. Ship

One PR: the categorisation table (file:line, category, destination), the issues filed, the
ADRs added, and lines removed (`git diff --shortstat`). Commit `chore: delete code comments`.
