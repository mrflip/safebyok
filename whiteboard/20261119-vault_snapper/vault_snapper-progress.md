# vault_snapper: progress

What the threads have taught, newer than the plan wherever they disagree. Workers look things up here; the
orchestrator writes it.

## Where things stand (2026-11-19)

* origin/main is at #761 (`95f1a0425`); the minder's Part 1 (#753, #756 to #759, #765, #766) is merged.
* The Coach's last message before the sprint changed `vault-pieces.md` in several places; the plan's thread texts
  quote it. In particular: no `putBox` (only `putBoxOnce` and `delBoxOnce`); the Bank keeps writing its own record and
  the main gate itself (thread 4 tests that the minder still hears of them first); drafts are out (box instances, the
  next sprint); gatings only on a born bank; verbs stay where they are.
* es-toolkit (a dependency already) has `deepFreeze` and `isEqual`.

## Thread 1, car_agerank (#769) (*Orchestrator:*)

* `ThingCar.agerank` is a stored field made in `carOf`; compare two cars with `<`; on a tie they carry the same
  revisions and liveness, so keep the prior. A bare car's last field is `'----------'`. A sparse and a whole tombstone
  of one Thing share an agerank. `Revseq.padded` is exported beside `Lifeseq`.
* The liveness `behind` is `bhnd` everywhere, VOCABULARY.md included.
* Records are deep-frozen in place as they land (the vaultDB's own answer objects).
* `#minding` holds a symbol per hello-to-goodbye stretch; a get resuming in another stretch refuses `disabled`.
  `list` and `tryWrite` lack the check; thread 2 adds it.

## Thread 4, vault_writes (#770) (*Orchestrator:*)

* `Vault.make(bank)` (`models/vault.ts`) makes its minder from `bank.vaultDB` (a new getter) and `bank.queryCacheOpts`;
  `make` does not call `hello`. Exported from `safebyok` only. Tests: `TH.buildBornVault()` in
  `tests/test-helpers/models-world.ts` returns `{ device, bank, record, proving, vault, minder }`, minder said hello.
* `sealBox`/`tombstoneBox` resolve a `SealedBoxAsk` (`{ ...ask, record }`) citing the donor sparse.
* `putBoxOnce`/`delBoxOnce` resolve the record as stored and throw a refusal. By labelpath over a car left `bhnd` or
  `bare` by a list, a patch with no sidecar refuses `sidecar_missing` (open matter: get the whole first).
* Try-it-first holds for every adapter built on `AdapterVaultDB` (memory, Postgres): it tells every watcher of a
  write's tracked bank and gate records (`notifyTrackedRecords`, `adapter-vault-db.ts`) before the write returns. A good
  write's own record is not notified: the caller lands it. `vault.test.ts`'s comment crediting MemoryVaultDB's
  microtask is wrong; thread 7 corrects it (the Coach, 2026-11-20).

## Thread 2, minder_feed (#771) (*Orchestrator:*)

* Branch `20261120-minder_feed` (not `20261119-`), stacked on #769.
* `MinderEvent`: TanStack's event spread: `type`, `action.type`, frozen `queryKey`, frozen shallow `state`, plus
  `userid`, `banklabel`, `labelpath`, `modelkind`, `carkind`; a thing event adds `agerank` and newest's `revtok`,
  `revseq`, `am`, `lifeseq`, `lifepath` (undefined with no car). A removal carries no data. `InvalidationEvent` is
  gone: a listing event with `action.type` `'invalidate'` and `state.isInvalidated`. `MinderEventOf<DataT>` exported.
* `listen(listener, ThingFormat)`; any other version refuses `bad_record`. Key head `'sok'`.
* Thread 8: copy `event.state.data` under `event.queryKey`, compare `event.agerank`, no key parsing. `react-giver.ts`
  host keys still spell `'safebyok'` (thread 8's).
* `list`/`tryWrite` answered after goodbye then hello cache nothing; each still answers.

## Thread 5, bank_gatings (#772) (*Orchestrator:*)

* Branch `20261120-bank_gatings`, stacked on #770. Commit 27b16b2a9 is a pure move (each prompt's helper a private
  method, one launch helper); behaviour is a66cc7fe4.
* An unlock prompt joins an open gating of any kind; a gate-change prompt joins only its own kind, else refuses
  `already_asking`. `ensureUnlocked()` resolves at once when unlocked, else prompts.
* `attemptUnlock`, `attemptReplacePassphrase`, `attemptAddPasskey`, `attemptRevokePasskey` resolve an `Outcome`: to the
  open gating of their kind, or once through `attemptWithoutGating` (`gating.ts`), which refuses a disabled bank first
  and zeroes a passkey answer's bytes on every outcome.
* `device.lock()` locks the device's bank, learned through `device.cheatHoldBank` (each Bank's constructor; last made
  wins): the sprint's one cheat. `device.openGating` exposes `gatingkind`, `isOpen`; `#isAttempting` is private; no
  last refusal is kept (thread 6 adds it). `gatingseq` deferred to thread 6. Reviewed at 76edb6866; filed.
* Ruled (the Coach, 2026-11-20): an unlock prompt finding another kind open waits for it to end, whatever its
  outcome, then checks unlocked again before starting; thread 7 builds it.

## Thread 6, snapshots (#773) (*Orchestrator:*)

* `bank.getSnapshot()`/`subscribe()`: `{ stage, isLocked, isEnded, endCause, leaseEndsAt, lastErr }`; `BankStage` holds all
  of S1, only `locked`/`unlocked`/`swept` reached; `leaseEndsAt` = `proved_at + leaseMillis`; `lastErr` null for now.
* `device.getSnapshot()`/`subscribe()`: `{ bank, gating }`, `bank` the held bank's own snapshot object; `gating` is
  `{ gatingkind, gatingseq, isAttempting, lastRefusal }` or null; `gatingseq` odd while a gating is open, on the Device
  only. `lastRefusal` is `{ refusalkind, family, message }`, kept until the next refusal. Both `getSnapshot` and
  `subscribe` are getters returning arrows: safe to hand out unbound (thread 8).
* `device.sweep()` now sweeps its held bank (through the cheat). `isWatching`, `heardAt` left out entirely.

## Thread 7, with_whisper (#774) (*Orchestrator:*)

* `vault.withWhisper(labelpath, fn)`: checks its arguments (`bad_record`), `bank.ensureUnlocked()`, `minder.get`, refuses
  `absent_box` (big's `boxAbsent`, re-exported) for a box never stored or deleted, else `fn(await bank.unsealBox(newest))`,
  resolving what `fn` resolves and rethrowing its throw as is. `fn` may be sync or async.
* An unlock prompt finding another kind of gating open awaits its `whenConcluded` (never rejects), then `demandEnabled()`
  and resolves if unlocked, else launches or joins an unlock gating; `#launchOrJoin` joins only its own kind.
* Rulings in rework (the Coach, 2026-11-20): no `lastRefusal` until v1; `BankSnapshot.endCause` is the VaultError or null.

## Thread 8, giver_feed (#775) (*Orchestrator:*)

* The Coach's hand edits applied first (`Labelpathed` exported; `childrenQueryKey`). Core statics
  `ThingMinder.queryKeyOf` and `bankQueryKeyOf` give keys without a minder; the giver's keys are the minder's (`'sok'`).
* The bridge copies each event's car under `event.queryKey`, `dataUpdatedAt` the minder's; refetches when `dbHasNewer`,
  and refetches a `bare` car; a removal leaves the host's entry. At start it refetches entries already showing a car.
* Defaults (overridable): `networkMode: 'always'`, `staleTime` 0 while the vaultDB holds newer, `structuralSharing` by
  agerank, `select` → `fullest`. Hooks: `useGating()`, `forBank(label).useBankSnapshot()`, `useBoxRecord(labelpath)`.
  The giver makes no QueryClient and no longer follows sign-in. Shapes in `giver/shapes-giver.ts`.

## The line (*Orchestrator:*)

* Restacked 2026-11-20: main -> #768 -> #769 -> #771 -> #770 -> #772 -> #773, every base `main`. Two mechanical fixes
  at the restack: the feed-version test table now uses strings (`ThingFormat` is one), on #771; the vault's
  sparse-newest test expects `bhnd`, on #770. Rollback tags `*-prerestack-20261120004904` in the main repo.

## The sprint doc (*Orchestrator:*)

* https://claude.ai/artifact/HHcmx1GE3oZyh6rQMWjgv3 — doc `83e42a7e-4892-49d9-b45e-585ca636e9a0`; State enum `b9b89cb1-c517`.
* Tabs (tab id / body id): Open Matters `1a05d4a3-494c` / `cb45b78b-f909` (matters table `m6pymgdn7tc.85`, bookmark rev 717);
  Cleanup `6077489e-8954` / `14b54849-af59`; Progress `51ab4975-ceed` / `26336557-6583`; Resolved `a912f3b9-5db8` / `c14689aa-a452`.
