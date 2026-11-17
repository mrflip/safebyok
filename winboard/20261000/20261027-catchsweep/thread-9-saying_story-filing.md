# Thread 9: saying_story, the filing (2026-10-28)

For the orchestrator and whoever audits the catch-up rebase of PR #331: how the two red commits
were folded away and how each rebase conflict went. The thread itself is `thread-9-saying_story.md`.

A fresh worker filed the thread from the reviewed tip `881c1bbe`.

* *The fold.* The two red commits are gone from the history: `3d4dcc8b`'s surface-test line is
  part of the `api:` commit exporting the three functions (now `a17d1588`; its message says the
  surface test lists them), and `f02d2b88`'s thread-file change is part of the later `plan:`
  commit (now `d7d5a6ce`). Done by tagging the tip (`20261028-saying_story-prerebase`, local),
  `reset --hard` to `5078a985`, cherry-picking each pair and `reset --soft` into one commit, then
  cherry-picking the three commits after; `git diff 881c1bbe` against the result was empty.
  Sixteen commits became fourteen, every other one as it was, in order.
* *The catch-up*, `git rebase --no-update-refs origin/main` onto `f84d61bb`. Two conflicts:
  1. STYLE.md's naming paragraph (the `docs:` commit, now `18d51228`), as foreseen, but not quite
     as described: main's #330 had *replaced* the old sentence "A response is named for the
     operation's family, not a moment: `VaultReadResponse`" with the `Stored-` sentence
     (`VaultReadResponse` is `StoredVault` now; no hit on main), while this branch's hunk kept
     that sentence under the clause, having been written on a base that still had it. Resolved
     as main's sentence plus this branch's clause, the `VaultReadResponse` sentence not
     resurrected: that is what "main's sentence verbatim plus the clause" meant. The worked
     example's body merged clean; its lead line conflicted (main "Read and open", this branch
     "Get and open") and took this branch's. The rule line ("Get" here is a storage read) merged
     clean. `git diff origin/main -- STYLE.md` is the thread's three edits and nothing else.
  2. `tests/index.test.ts`'s surface list (the folded `api:` commit): main's #330 added
     `asStorageTrouble` on the line this branch adds `consistent`, `demandConsistent` and
     `verifyConsistent`. Both kept, side by side.
* `.changeset/20261028-where_prefix.md` is still on main (no release has spent it), so this
  branch's "saying" → "story" edit of it applied clean and stands; main brought no new "saying"
  meaning the Story.
* Origin's branch stood at `393cbef6` when filing began, not at the reviewed tip `881c1bbe`: the
  reviewer's three `api:` commits after it were never pushed, so the lease is on `393cbef6`.
