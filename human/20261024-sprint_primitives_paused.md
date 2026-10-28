# Sprint primitives: paused for your rulings, 2026-10-24

*Orchestrator.* You restarted the sprint today. Every thread it planned is now filed, the line is restacked and green, and the sprint waits on your word in *Open Matters*. It doesn't close yet, so the rulings that need work can still become threads on top of the line.

## The line, waiting to merge

Every PR's base is `main`. Merging the top, #250, merges them all. `pnpm justify` and `pnpm size` are green at #267's tip, which holds all of the line's code. CI checks the PRs in between.

| PR | Thread | Review |
|---|---|---|
| [#265](https://github.com/mrflip/safebyok/pull/265) | 10 react (the per-kind dialogs, "Vault unlocker") | fixed, then fixed |
| [#252](https://github.com/mrflip/safebyok/pull/252) | 12 route_meta, restacked onto #265 | fixed |
| [#268](https://github.com/mrflip/safebyok/pull/268) | 15 refresh_rulings (U3, U6) | fixed |
| [#269](https://github.com/mrflip/safebyok/pull/269) | 16 first_gate_kind | fixed |
| [#270](https://github.com/mrflip/safebyok/pull/270) | 17 confirm_passphrase | clean |
| [#266](https://github.com/mrflip/safebyok/pull/266) | 13 bank_clears (no behaviour change; two TODOs) | fixed |
| [#267](https://github.com/mrflip/safebyok/pull/267) | 14 contract_tab (the design doc's Contract) | none (no code) |
| [#250](https://github.com/mrflip/safebyok/pull/250) | the sprint's documents, a draft | |

Merged by you before today: #243 through #264, the whole core line.

No worktree holds unfiled work, and no agent is running.

## What changed in the sprint's history

The sprint branch was rebuilt as one commit on top of the line. Its 42 commits of history are kept in the tag `sprint/20261022-primitives-pre-restack`.

Thread 15 numbered its new toldjaso entry 16, but the sprint's list already had a 16 (the Postgres race). In the merged list, thread 15's entry is **24**. #268's PR and thread file still call it 16.

## Behaviour a host will see

- **`vault_behind` instead of `stale_write`** (#268, your U6 ruling). `del()`, `putWayin` and `delWayin` against rolled-back storage now refuse `vault_behind` and lock. Before, they refused `stale_write`.
- **A lagging read replica** now shows `vault_behind` too, until the next `hello()` after it catches up.
- **`vault.checkPassphrase` is gone** (#265), replaced by `checkStrength` / `tryCheckStrength`.
- **A first passphrase that loses a race** now refuses `gate_made_elsewhere` (#269).
- **New passphrases are typed twice** (#270).

## Waiting on you

The sprint doc's *Open Matters* tab (https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4). The rows marked TOP come first:

- **The sent-deletion bookkeeping (M1),** rewritten with function names.
- **The lint cache:** about 50 s saved per run.
- **The Postgres `vault_epoch` race**, explained:
  - `GREATEST` in `DelVaultSql` fixes the tombstone going backwards;
  - closing the race itself needs a lock or the tombstone in the vault row.
- **The final review's eight TOP rows:**
  - the grant warn;
  - a damaged lease erased on a judgment;
  - hello before the lock check;
  - `lockLanded` unsettled;
  - IndexedDB's device-record discard;
  - the route recipe trusting the server's kinds;
  - the Postgres README log warning;
  - the vacuous renewal test.
- **The strength checker's reason.** Your question there is answered in its row.
- **`notes/security.md` drift:** about 40 contradictions and 80 stale names, listed by line in `whiteboard/20261022-primitives/final-review.md`. It's input to your post-sprint audit; no agent has edited the file beyond appended amendments.
- **Many smaller `drafting` rows with Recs.**

## What comes next

1. Your rulings, as threads on top of the line.
2. The wrap-up (the sprint skill's `wrapup.md`):
   - sweep *Resolved* into `primitives-resolutions.md`;
   - this note's done twin;
   - tag `sprint/20261022-primitives`;
   - take #250 out of draft.
