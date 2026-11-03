# Sprint unrace: progress

Newer than the plan wherever they disagree. Kept by the orchestrator.

## Planning lesson

*Orchestrator:* a worker in this repo fills its context fast: about 36k on its first turn, then compacting at about 150k
within 6 to 8 minutes. Thread 1 did so three times with nothing committed. Every handoff now says to search and edit by
script, keep test output short, commit at each green, and push a draft PR early.

The shape that works: one worker writes `src/` and stops on the two-compaction rule, and a fresh one moves the tests and proves
it. Threads 1, 6 and 7 all ran so; a thread file is enough to hand over on.

## The Coach's rulings

* `send` hydrates, "because it might be sparse". `noted.md`'s "`send` does not hydrate" is wrong (thread 14 corrects it).
* `errors.ts` may grow: "it's fine for things to expand old code, try not to change them".
* A live row under another `vault_tok` refuses `vault_mismatch`; `vault_empty` is no row of that life.
* `Promptly` is 2,000 ms. An idempotent `revoked` moves nothing ("we can switch if it's an issue").
* The refusal for a locked vault is `vault_locked`, the kind that exists (the orchestrator's call, on the Rec's "clash").

## What the threads built

**Thread 1, `storable_send`.** `listing.put(duck, ante)` requires `ante` (null means over no record). Births go through
`listing.create(dna)` and `tryCreate`, on both listings; `listing.build` takes a record only. `#sendGate` calls `listing.put`
directly, and hydrates first. `BoxPatch` keeps both halves required until thread 9. `hydrateAll` stays for thread 5. A test's
send over a built record needs `held.mw.seedStore(record)` first; a box made by `create` is timely at once, so a test wanting a
fetch ages the clock past the horizon.

**Thread 2, `vault_db_new`.** Abstract `VaultDB` in `src/storage/vault-db-new.ts`: `getBank`, `getVault`, `getBox`, `putVault`,
`putBox`, `replacePassphrase`, `addPasskey`, `revokePasskey`, `delBox`, `delVault`, `tidyGone`, `watch` (optional, a no-op by
default), each with a `try*`. A store writes `doGetBank`, `doGetVault`, `doGetBox`, `doPutVault`, `doPutBox`, `doDelVault`,
`doDelBox`, `doTidyGone`, and may write `doWatch`. `prior` is `{revision_tok, revision_seq}`, sentinel `NeverStored`. Gate verb
params are the vault record the attempt read, with a `gate` holding the wayin. `MemoryVaultDB` has `_cheat_vaultRowsOf` and
`_cheat_boxRowsOf`. Thread 6 reconciles `src/storage/vault-db-shapes.ts` with `models-shapes.ts`, replaces `answer.scope` with
`req_params`, and takes `Storable`'s part in `ifPresent`: the store decides it atomically through `PutTerms.mayReplaceLive`.
`repl` on the public `putVault` goes at thread 10.

**Thread 3, `gate_proving`.** `gate_epoch` is at `stored.gate.gate_epoch`, inside `gateProps`, first `FirstGateEpoch` = 1.
`LeaseFriend` offers `peekLease`, `tryCacheLease`, `tryUncacheLease`, bound to the vault's scope, and `lock`; `peekLease`
answers the raw record or null, and the lease checks it. `Lease.peek(friend, gate_epoch)`. `vault.leaseFriend()` is an interim
maker over `tryGetLease`, `tryPutLease`, `tryDelLease`, for thread 7 to replace. `vault.leaseCachedOf(proving)` is public only
because `vault-listing.ts` calls it, and folds in at thread 7. Threads 10 and 11 call `Proving.checkStrength`,
`PassphraseProving.buildNovel` and `buildStored`, `PasskeyProving.buildNovel` and `buildStored`; the statics leave a
`passkeyClear` unspent, so the caller spends it. `Gate.build`, the three `with*`, and `hearing`, `invokeClosure`, `spendAnswer`
remain in `gate.ts` to remove. `gating.ts` is untouched, so a passphrase through it is checked twice until thread 10. A
device's own cached lease goes stale at a gate change until thread 11. `bank.tidy` reads `proved_at`; lease age is unchecked
until thread 12.

Thread 1 moved `proving.makeLease(...)` from `vault.ts` to `vault-listing.ts`'s `create`, and thread 3 changed it: expect a
small conflict where threads 1 and 3 meet, at the restack before thread 7.

**Thread 4, `device_db`.** `src/storage/device-db-new.ts`, abstract `DeviceDB`: `cache(row)`, `peek(asked)`, `vacate(asked)`, `leasesProvedBefore(cutoff)`, `cacheDeviceRecord(record)`, each with a `try*`; a store writes `do*`. `peek` answers the raw row or null: another `vault_tok` or a row failing its check is null. `vacate` erases only a row under the asked `vault_tok`. `leasesProvedBefore` spans every bank and answers `{applabel, user_id, vaultlabel, vault_tok, proved_at}`, oldest first, never a key. `cacheDeviceRecord` answers `{ act, record }`: `born`, `held` or `rewrote`, the last being the bank's bad news.

**Thread 5, `timerless`.** A Storable's timeliness is the timestamp `#refreshedAt` against a horizon. `vault.ensureTimely(maxMillis?)`, `MSX.Promptly`. Overlapping `fetch` calls join on `#oneFetchAtATime`, as the spec draws (my handoff first said the join goes; it was put back). `Listing.hello` only starts the watch. The gating attempt must still pass `Promptly`.

**Thread 6, `store_switch`.** Listings call `vaultDB.try*` and `watch` directly; `Store` is gone. `tests/test-helpers/models-world.ts` holds `TestableVaultDB extends MemoryVaultDB`, logging calls and taking `will*` scripts; `ModelsWorld` keeps its names. A seeded sparse or `am:'d'` row refuses `damaged_record` at the real verbs. Gate verbs stay over `putVault`/`repl` until thread 11. `damaged_records` entries carry `damagekind`, `format_mismatch` for a newer row.

**Thread 7, `lease_seams`.** `vault.leaseFriend()` over the real deviceDB; `lease.attach()`, `#attachLease`, `#renewLease(proved, gate_epoch, heldLease)`, `#vacateLease`, `#panic`; `sweep`, `vacate` and the `disabled` refusal; `vault.sealStampedString`, `unsealStampedString`; `vault.boxListing` and `listing.boxListingOf`, with no watch started. `with*` answers `{ gate, proved }`. `Bank.goodbye` sweeps, so a `hello` after it refuses until thread 12. `vault.del()` doesn't yet reach the spec's end state.

**Thread 8, `vault_slot`.** `vaultListing.ensureVault(record, prior)` is `putDraft` with `{ ifPresent: 'get' }`. `fateOver` answers `receive`, `lose` or `replace`. A tombstone leaves the vault in its slot. `del(duck)` takes a held vault or a `damaged_records` entry. `vault_gone` is a vault tombstoned in the slot, `absent_vault` nothing held. `delVault`, `delBox` delete a damaged row named as `damaged_records` lists it.

**Thread 9, `vault_boxes`.** `vault.hello`, `getBox`, `fetchBox`, `putBox`, `delBox`, each with a `try` form; `box.extractWhisper`, answering `{ val }`; `box.send({ whisper?, sidecar? })`. Box verbs demand the unlock, so the proof must unlock first. `vault.hello` needs no unlock, and the first box call runs it. `makeVaultWorld` returns `vaultDB`, the memory DB.

**Thread 10, `gating`.** `tests/models/gating.test.ts`. Kinds go in `gatingKindVals`, `ProvingsForGatingkind`, `VaultForGatingkind`, `ProveForGatingkind` and the clears in `models-shapes.ts`. One flag, `#isLastAttempt`. A birth's `run` is `#runBirth` in `VaultListing`; a refused lease leaves the vault stored and held, locked; a rebirth mints a fresh `vault_tok`. `bank.ensureVault(bag)` calls `tryBuildVault(scope)`, and the bank hands on `world.requestCleartext`. Test helpers `buildTyping` and `unlockTyping`.

## Crossings raised

To go into `whiteboard/20261102-unrace/crossings.md`:

* A lock during `listing.put` loses: the put lands anyway (thread 1).
* A `box.del` checks the lock only at entry (thread 1).
* A vaultDB watch stopped in the same tick still hears a queued notice (thread 2).
* A `lock()` landing while `vault.ensureUnlocked` proves ends unlocked, with its lease cached; ruled in `noted.md` (thread 3).
* `uncacheForgotten` deletes by scope outside the lease's chores, so it can land after an unlock's put and cost the next session
  a proof (thread 3's review).
* `ensureTimely(0)` can join a `get` begun before the call and resolve with the older record, which is what the spec's join
  draws (thread 5's review).
* `box.expose` assigns `#exposed` after its await, so a sweep of that box alone leaves a whisper on a swept box; `expose` is
  postponed this sprint (thread 7's review).
* `create`'s put answer that loses to a delete and a new life hands back another vault; thread 10's `#runBirth` ended this.
* A `lock()` during the `ensureTimely` in `delBox`'s no-box-held path lets the tombstone land on a vault now locked (thread 9's review).
* An instance arriving during `putBox`'s `ensureTimely` sends the birth into `demandNotHeld`, refusing `bad_option` (thread 9's review).
* A second `attempt` with the same answer while the first runs zeroes the bytes in use, so the first answers `bad_option` (thread 10's review).
* A tombstone or sparse record landing during `ensureUnlocked`'s lease peek makes `Gating`'s constructor throw `bad_option` (thread 10's review).
