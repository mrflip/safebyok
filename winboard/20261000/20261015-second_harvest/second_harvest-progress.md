# Sprint second_harvest -- progress

**Status**: done -- threads 1-7 filed, all in the merge stack (top: the sprint's own PR, on #65).

| # | Thread | Branch | Base | Status |
|---|--------|--------|------|--------|
| 1 | zod_mini | `20261015-zod_mini` | main `23e38a2` | filed [#62](https://github.com/mrflip/safebyok/pull/62), the new top of the merge stack (on #51) |
| 2 | provider_conditions | `20261015-provider_conditions` | main `23e38a2` | filed [#61](https://github.com/mrflip/safebyok/pull/61) |
| 3 | remembered_deadline | `20261015-remembered_deadline` | #53 `544088d` | reviewed twice (fixed, 0a28f27); filed [#58](https://github.com/mrflip/safebyok/pull/58), stacked on #57 |
| 4 | lock_race | `20261015-lock_race` | #53 `544088d` | filed [#55](https://github.com/mrflip/safebyok/pull/55) |
| 5 | screen_lock_recipe | `20261015-screen_lock_recipe` | #55 | filed [#60](https://github.com/mrflip/safebyok/pull/60) |
| 6 | clean_times | `20261015-clean_times` | #52 `2ca104f` | filed [#64](https://github.com/mrflip/safebyok/pull/64), the stack's new top |
| 7 | pluggable_logger | `20261015-pluggable_logger` | #64 `c186978` | filed [#65](https://github.com/mrflip/safebyok/pull/65), on #64 |

## What the threads have taught

*Orchestrator:* thread 3 settles a remembered deadline once, in `openVault` (a handle already open keeps its own), and `rememberedUnlock` cannot race a `lock()`: it runs before the handle exists. #37 was squashed to four commits plus a note, tree unchanged, and force-pushed with a lease.

*Orchestrator:* **#50 never reached main.** Its base was #46's branch, so its merge went there, and #46 was then
reset to `93da826`. Re-filed unchanged as [#54](https://github.com/mrflip/safebyok/pull/54), stacked on #46.
Read "#50" in thread files as #54.

*Orchestrator:* thread 1 (zod_mini) found what the plan expected: zod's share of each validating entry fell from
about 22 kB to 7.5 kB brotlied, and `stableJsonify` alone from 25.2 kB to 2.3 kB, which needed the core built
unbundled as well as `zod/mini`. Its new lint rule refuses classic `zod` in the core's `src/`, so #37's `mask`
must move to `zod/mini` in whichever of the two lands second.

*Orchestrator:* thread 2 pulled forward the never-filed `open_vault_unsubscribe` fix: a failed `openVault` closes
its storage watch. It exports `VaultErrorFamilyVals`, `VaultErrorFamilyForKind` and `isVaultCondition`, and
conflicts with #54 (both add `tests/errors.test.ts`; both rewrite the React README's *When opening fails*).

*Orchestrator:* thread 4 (lock_race): one `shut()` moves a counter of locks; `takeUpUnlock()` is the one place a
vaultKey is taken up, checking the counter before and after writing the device record. A lost `unlock()` rejects
`vault_locked`; a `changePassphrase()` that loses keeps the new passphrase and drops only the unlock. **For thread
5**: send the shut timer through `shut()`; cancel a pending shut from `takeUpUnlock()` (the counter counts locks,
so it cannot tell an unlock happened). The lock wins within one handle only; across tabs see the security note.

*Review (thread 2):* fixed -- a failed open's close is guarded, so a throwing unsubscribe can't mask the original
error. Left: deviceDB failures at open are unwrapped and reach the boundary (a follow-up: wrap as
`storage_unavailable`); `corrupt_record` in place gets a security-note line and no useless Retry in the demo; the
core's bump goes to patch.

*Review (thread 1):* fixed -- the lint rule now refuses `zod/v4` and `zod/v3` as well as `zod`; the changeset names
the second break (an exported schema's own `.parse` error is zod's core `$ZodError`); the security note says
zod's messages can reach a host only through its own `safeParse` of an exported schema. Left: convex's zod dev
dependency is not tied to the core's; the unbundled dist has no source maps.

*Orchestrator:* thread 1 is held unfiled: its lint rule refuses classic zod, which #37's `mask` and #53's new
epoch-millisecond schema both use. When those merge, it rebases onto main (unpushed, so no force-push) and moves
both to zod/mini before filing. Filing first instead would mean rebasing #37 and #53.

*Review (thread 4):* fixed -- `takeUpUnlock` also refuses (`vault_locked`) when the bundle moved under the unlock
(destroyed, remade or re-keyed elsewhere), which had sealed boxes into a new vault under the old key. Left:
`close()` does not move the shut counter (**for thread 5**, which looks at every shut path); a lock during a
wrong-passphrase check surfaces `wrong_passphrase`; `PassphraseModal` rethrows other kinds unhandled (older).

*Review 2 (thread 3):* fixed -- the `Infinity`-refusal test opens with `Infinity` again, so it still proves the
schema refuses it. Left: after #53's bounds, the security note's "a deadline past `FarFuture` is read as
`FarFuture`" becomes false and the clamp redundant; a backward clock step erases a fresh remembered unlock; tabs
opening with different settings erase each other's records.

*Orchestrator:* `open_vault_unsubscribe` (never filed): its core fix is in thread 2; its Convex end-to-end test,
the fake deployment's `watching()` and its README line are being carried into thread 2, after which the worktree
and its local branch are removed. #53's bounds follow-up (`FarFuture` 2255, `FarPast` 1981, `EpochMillis`) is in
review at `5f8dcec`, unpushed.

*Orchestrator:* **#53 merged at `544088d`, without the bounds follow-up** (still in review, unpushed). The bounds
commits will be rebased onto main and filed as their own PR; thread 3 then stacks on that PR, and thread 1 waits on
it and #37. #46 was rebased onto main (`4294390`, every commit unchanged by range-diff, justify green) and
force-pushed with a lease at the Coach's word; #54 rebases onto main after #46 merges. Thread 5 started from #55's
tip. `open_vault_unsubscribe` is removed (worktree and local branch); thread 2 carries all of it.

*Orchestrator:* the bounds filed as [#57](https://github.com/mrflip/safebyok/pull/57) (two reviews, fixed). The Coach
ruled: **no backward compatibility until 1.0.0**; validate the host clock (a real number in bounds is fine); coerce
`Infinity` to `FarFuture` at the first opportunity and refuse it after; `created_at`/`updated_at` and `expires_at`
were meant to be gone (roadmap 3's time fields). That is thread 6.

*Orchestrator:* #46 and #54 merged. #45 and #37 conflicted with main after them; the orchestrator rebased both
(an import line in `vault.test.ts`; `errors.ts`'s `vault_full`/`bad_option` comments), justify green, and
force-pushed with leases (#45 `5f9a11a`, #37 `95032ee`). The Coach's pre-1.0 exception is in CLAUDE.md as
[#59](https://github.com/mrflip/safebyok/pull/59). *Review (thread 5):* fixed -- `lockSoon` clears `askPassphraseAt`
(a backward clock step reopened the gate), docs corrected, README snippet compiles in spirit. Left: natural
expiry's `ensureUnlocked()` can take a key from a store in hand (roadmap 5); `lockSoon` on an already-expired held
key gives a full grace.

*Orchestrator:* **The merge stack** (at the Coach's request, so one merge lands everything): #45 → #37 → #55 → #60 →
#57 → #58 → #59 → #61 → #51, each branch rebased onto the one below, every PR's base still `main`. Merging #51
with a merge commit marks the rest merged. #51's fifty plan commits are squashed into one. Justify green at the top
(core 626, convex 259, react 27, demo 61, root 105); force-pushed atomically with leases. New threads stack on the
top: thread 1 next, then thread 6 on thread 1.

*Orchestrator:* thread 1 filed as [#62](https://github.com/mrflip/safebyok/pull/62) on #51: the stack's new schemas
(`mask`'s options, `EpochMillis`, `lockSoon`'s grace) are in zod/mini, size limits lowered (everything 36.7 → 22.1 kB,
`openVault` 30.2 → 15.1 kB, `mask` 18.4 → 5.8 kB). Left open: `/* @__PURE__ */` on each schema would save `idbDeviceDB`
about 0.5 kB. Thread 6 cut from #62's tip; its CLAUDE.md bullet is already #59. #38, #49 and #52 are another
session's, which will stack them on the top.

*Orchestrator:* at the Coach's request, [#52](https://github.com/mrflip/safebyok/pull/52) (test helpers as `TH`) is
restacked onto #62 (`2ca104f`, justify green at each commit) and is the stack's new top. [#38](https://github.com/mrflip/safebyok/pull/38)
is wholly in main already (patch-identical through #36, released in 0.2.0), so nothing was folded; recommended closed.
Thread 6 rebases onto #52 before filing.

*Review (thread 6):* fixed -- an adapter's `Infinity` byte limits become `UnlimitedBytes` at openVault; the changeset's
no-migration text is one sentence. The Coach then ruled (directly): `lockSoon()` on a bad clock warns through
`console.warn` and locks without throwing, until thread 7's logger replaces it; with no logger, the console is the
fallback. Applied after review: a bad clock fails closed (the vaultKey dropped), a throwing `now()` is `bad_option`,
stored times are whole ms (a fraction fails as corrupt), the demo says "changed". Left: a clock going bad mid-`store`
lands the write and then throws. Filed as [#64](https://github.com/mrflip/safebyok/pull/64) on #52.

*Review (thread 7):* fixed -- any thenable a logger returns is settled (a cross-realm promise went unhandled); the
forgotten-unlock warning follows the erase; the docs say the vault adds no secret but a host's own error goes as the
host made it. Applied after review: `loggedText` survives cause cycles and circular properties; the secret sweep
carries a `cause`. Filed as [#65](https://github.com/mrflip/safebyok/pull/65) on #64. The console is touched only in
`src/console-logger.ts`, the fallback the Coach approved.
