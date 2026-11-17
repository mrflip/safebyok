# 2026-10-15: Sprint low_hanging_fruit done -- fourteen threads, nine merged, five open and what each needs

Sprint `low_hanging_fruit` (YOLO, medium review) built the eleven threads of
`winboard/20261014-low_hanging_fruit/20261014-low_hanging_fruit-preplan.md`. Your answers mid-sprint added three more:
the Convex server-side cap (12), every error kind in the core (13), and the store's backoff (14). Plan and progress:
`winboard/20261015-low_hanging_fruit/`. The sprint doc (https://claude.ai/code/artifact/5c68c0cb-3736-4ae7-9973-f69c1cdc5fe9)
stopped at about 04:50 UTC, when the Docs tools disconnected; the repo files are the record.

## Merged

[#31](https://github.com/mrflip/safebyok/pull/31) epoch milliseconds (4),
[#32](https://github.com/mrflip/safebyok/pull/32) provider open rejection (3),
[#33](https://github.com/mrflip/safebyok/pull/33) docs sweep (9),
[#34](https://github.com/mrflip/safebyok/pull/34) vault size cap (1),
[#35](https://github.com/mrflip/safebyok/pull/35) label grammar report (11),
[#36](https://github.com/mrflip/safebyok/pull/36) sandals (10),
[#40](https://github.com/mrflip/safebyok/pull/40) explicit options (2),
[#43](https://github.com/mrflip/safebyok/pull/43) boundary audit (6),
[#44](https://github.com/mrflip/safebyok/pull/44) stale-write retry (7).

## Open, in the order to merge

1. [#42](https://github.com/mrflip/safebyok/pull/42) -- size budgets, checked in CI (8). Merges cleanly. Needs your
   yes to its two dev dependencies (`size-limit`, `@size-limit/preset-small-lib`).
2. [#45](https://github.com/mrflip/safebyok/pull/45) -- `store()` waits 1-2 s, then 2-4 s, before its two retries (14).
   Merges cleanly. Not separately reviewed (your direct follow-up).
3. [#46](https://github.com/mrflip/safebyok/pull/46) -- the Convex component caps every vault at 8,000 lockboxes and
   7 MiB less 1 KiB, with a per-vault tally (12). **Conflicts with main** in four Convex test files, from #36's
   `test-helpers.ts` / `TH` rename: a rebase and force-push.
4. [#50](https://github.com/mrflip/safebyok/pull/50) -- every error kind gets a family, one list in the core (13).
   Stacked on #46; rebases with it.
5. [#37](https://github.com/mrflip/safebyok/pull/37) -- `mask` in `safebyok/utils`, under your new contract (5).
   **Conflicts with main** in `notes/security.md`, the core README, `package.json`, `errors.ts` and
   `tsdown.config.ts`: `safebyok/browser` (#40) and the error-kind comments (#34) landed beside it. Mechanical;
   a rebase and force-push. #50 widens nothing it touches.

Plus this sprint's own PR, [#51](https://github.com/mrflip/safebyok/pull/51) (documents only: plan, progress, this note, and TODO.md's two additions at your word),
any time.

The five rebases are yours, or say the word and the workers do them with `--force-with-lease`.

## Your rulings this sprint

* Apply #36's argument-forwarding fix to the root scripts.
* `mask`'s contract: a best-effort whiff of each end, safe in a log; no segmenter; a too-small `maxLen` gives that
  many stars; strip every invisible and whatever displays oddly; always normalize last.
* `maxVaultBytes` stays abstract; every kind is listed in the core with its family; Convex enforces a cap server-side.
* TODO.md: a pluggable label validator brings a label-tuple stringifier that handles the `:`; `user_id` gets a
  replaceable validation.
* `store()` waits a long random, doubling while before each retry; three attempts in all.

## YOLO decisions (each one sentence to reverse; the plan's *Decisions taken in YOLO* has them all)

* Stacked 1 → 2 → 6 → 7, and 8 on 2, because four threads rewrote the same lines of `vault.ts`.
* The preplan's recommendations taken as stated: `safebyok/browser`, `maxVaultBytes` in bytes, `vault_full`,
  `mask` keeps `maxLen`.
* Thread 1's fit check refuses when `maxLockboxes * (maxWhisperBytes + 1 KiB) > maxVaultBytes / 2`.
* `mask` strips strong right-to-left letters (decision 13), under your "the wrong end of a bidi" directive.
* #45's numbers: 1 s base, doubling, jitter from `crypto.getRandomValues` (the linter forbids `Math.random`).
* Thread 13 documents the families rather than exporting them, so no new public surface.

## Open questions, gathered

From #37: keep `Z.object` (it means `mask` ships zod)? Accept losing combining-mark vowels? Keep stripping
right-to-left letters (those scripts vanish from a mask)?

From #45: are 1 s doubling and three attempts right (a spinner on `store()` sees up to ~6 s)? `p-retry` or
`exponential-backoff` instead of three hand-written lines?

From #46: should a host set a *lower* server-side limit? The client's fit check allows 1 KiB per lockbox, a real
row with a full note weighs ~1.6 KiB (only matters at extreme settings). Not verified: that production Convex
charges reads as `getDocumentSize` does, and that a rollback deploys beside the leftover tally table. The
reviewer's larger alternative, for the record: erase in scheduled batches instead of capping.

From #50: is `unknown_key_deriver` misuse (as now) or a condition (an old cached build meeting a newer deriver)?
I lean condition once a second deriver ships. Should `VaultProvider` hand conditions (`storage_unavailable`,
`not_permitted`) to the context instead of the error boundary?

From merged PRs, still open:
* #40: an upper cap on `forcePassphraseReentryHours`?
* #43: clamp `expires_at` on read? Export `LockboxNote`? Repair vaults already bricked by an over-long note?
* #44: `vault_locked` or `stale_write` when a retry finds the device relocked? A distinct kind for "erased
  elsewhere"?
* #33 / #32: the screen-lock recipe's `lock()` also erases the seven-day remembered unlock; a race in
  `unlock()` against `lock()` (no thread touched it -- a candidate thread of its own).

## Housekeeping

* A mistake of mine, fixed on your yes: thread 13's branch inherited #46's upstream, and its push fast-forwarded
  #46. #46 was reset to `c519073` with a lease; #50 is thread 13 alone.
* Thread 7's file still says "no backoff"; #45's thread file records the reversal.
* Local only: tag `20261015-convex_server_cap-prerebase` (never pushed); the sprint branches' local refs.
