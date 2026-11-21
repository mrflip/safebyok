# Thread 1: soon_item, rework 5 (2026-11-20)

Branch `20261120-soon_item`, PR #790, stacked on #767 (the queue line main -> #783 -> #791 -> #792 -> #767). Agreed
with the Coach, 2026-11-20: a squash, a rebase onto #767, then the withWhisper redesign under the orchestration policy.

## Part 1: the squash

The 38 commits of `origin/20261120-logical_gating..1d8025e0d` became five, by concern, the tree unchanged
(tagged locally `20261120-soon_item-presquash` and `-squashed`): `minder:` (safebyok's src and tests but the vault's),
`vault:` (models/vault.ts and its test), `client:` (safebyok-react; PROCESS.md's prefix for the giver, where the build
wrote `giver:`), `docs:` (VOCABULARY, STYLE, notes, TODO, the changeset), `plan:` (whiteboard, human).

## Part 2: the rebase onto #767 (checkpoint `dd419d9e8`)

`git rebase --onto origin/20261119-vault_snapper origin/20261120-logical_gating`. Every conflict composed; none took a
design decision:

* **tests/models/vault.test.ts**: #791 replaced the passphrase prompt with the form verb `bank.replacePassphrase`;
  #790 renamed `carsOnAnswer` to `itemsOnAnswer`. Took both.
* **minder-bank.ts**: #791 added `giverBankOfVault` (the form verbs) over `giverBankOfMinder`, a `Pick` of the box
  reads; #790 made those reads record-based (`getBoxRecord`, `isBoxRecordBehind`, `listenBoxRecords`). The Pick now
  names the three record reads, and both return `GiverBank<BoxRecord | Tombstone<BoxRecord>>`.
* **shapes-giver.ts**: `GiverBank<RecordT>` has #790's three record reads and #791's form verbs; `GiverDevice<RecordT>`
  keeps #791's `judgeStrength`; `carLivenessVals` is no longer imported.
* **react-giver.ts**: #791's form mutations and `useStrengthVerdict` beside #790's record defaults; `makeBankGiver`
  takes #790's `isBoxRecordBehind` and keeps #791's `bankHead`; #791 dropped `ServerSnapshot` and the gating
  snapshot, so #790's copy of them went too; `type Query` went with `carStaleTimeOf`.
* **react-giver.test.tsx, fake-giver-world.ts, knock-knock-world.ts, minder-giver-world.ts**: #791's form verbs,
  strength checker and `giverBankOfVault` with #790's record types, soons and behind set; the gating snapshot is gone.
* **Base broke mechanically**: #792's sweep test asserted the car's `liveness: 'void'`; it now asserts the shell
  (`am: 'x'`, `lifeseq: Shell.VoidLifeseq`), folded into the `vault:` commit.

Proved at the checkpoint: safebyok 1307 tests, safebyok-react 352, both typecheck and lint clean. Pushed under a lease
on `1d8025e0d`; the PR body says "Stacked on #767".

## Part 3: withWhisper, a read, under the orchestration policy

Commits `669d901d0` (minder), `0a3068c7c` (vault), `67df9c778` (docs).

* **Built**
  * **`isStaleAt` agrees with `get`** (the Coach's item 7). Both read the staleTime from `#staleTimeOf`: `opts.staleTime`
    where given, else 0 for an item behind, else the minder's own. `isStaleAt` answers TanStack's
    `isStaleByTime` of the item's query under it, so an invalidated item is stale whatever the staleTime, and a missing
    one is stale. `#tsqQueryOptions` now always passes a staleTime (the minder's own where it passed none), which removes
    the "undefined key spreads TanStack's 0" comment. `tryAt` is unchanged. Test in thing-minder-listen: inside a
    listener on a soon's `success`, `[isStaleAt(staleTime: Infinity), isStaleAt()]` is `[false, true]` (it was
    `[true, true]`).
  * **`vault.forceTimelyUnlocked(labelpath, opts)`**: `Promise.all` of `bank.ensureUnlocked()` and `minder.tryGet(scope,
    opts)` (a tryGet, so a refused get rejects nothing), then `#demandReadableThing`. It checks `opts` with
    `MinderChecks.minderGetOpts` up front, as tryGet would swallow a misuse.
  * **`#demandReadableThing(scope)`**: `at` and `soonAt` in one step; `stale_read` for no item or a soon of a newer life
    (`isOfNewerLife`: another lifepath and `Thing.cmp` newer); `absent_box` by `BaseBox.isTombstone` (tombstone or
    shell); `needUnlocked()` (`bank_locked`) where `bank.isLocked`; else the item.
  * **`withWhisper`**: validates, `await forceTimelyUnlocked(labelpath)`, then `#demandReadableThing` again at that last
    moment, unseals the item, calls `fn`. The `backgroundRefresh` before the unlock is gone: the parallel get does it.
  * **New thrower** `boxNewestUnread(labelpath)`, `stale_read`, phrase `BoxNewestUnread`, meta `labelpaths`: the
    minder's `staleRead` takes a GetAsk and its phrase speaks of an answer older than one cached, which fits neither case.
  * **Tests** (vault.test.ts): list then `withWhisper` on a second vault unseals; a same-life soon with storage lagging
    unseals the item's revision and leaves the soon; a tombstone with a newer life's soon refuses `stale_read`; the
    existing tombstone and shell tests keep `absent_box`. `forceTimelyUnlocked`: `staleTime: 0` fetches a timely box, no
    staleTime leaves it, a dismissed unlock rejects `dismissed`, a refused get on a bare box refuses `stale_read`, bad
    args refuse `bad_record` wanting no unlock.
  * **Notes**: wontfix loses withWhisper's refused sparse unseal and its newer-life entry says withWhisper refuses
    `stale_read`; TODO's fine-grained-invalidation entry says isStaleAt now counts invalidation; TODO takes
    `editBoxRecord` with `#demandPuttableThing`; the changeset says all three; a sonnet subagent amended
    notes/security.md's with_whisper entry (one line: `fn` may get a revision behind one heard of in the same life).
* **Decisions made**: `bank_locked` where the bank is locked at the demand, even if it ended (its `endCause` would be
  the truer refusal; `ensureUnlocked` already refuses an ended bank before, so only a crossing reaches it). A minder not
  yet minding refuses its get, so `forceTimelyUnlocked` answers `stale_read` there; the vault names no lifecycle.
* **Deviations**: none in behaviour asked. `Vault.make`'s doc ("does nothing until its hello") and `sweep` (calls
  `goodbye`) still name the minder's lifecycle; item 4 read as the read path, and those two are the vault's own
  lifecycle, not withWhisper's.
