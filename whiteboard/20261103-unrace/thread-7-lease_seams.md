# Thread 7: lease_seams (2026-11-03)

Branch `20261103-lease_seams`, PR #455, stacked on #451. Justify: **red, and never yet run whole**. `src/` typechecks. `tests/models` + `tests/loosened`: 996 pass, 52 fail. 65 type errors, all in tests, and 55 lint errors, 4 of the lint errors in `src/`. Stopped by the handoff's rule: two compactions before first green. The source is done as far as it has been tested; what remains is below.

## What remains, for the agent who finishes this

1. **Failing tests, by file** (each a stale seam unless said):
   * `lease.test.ts` 25, `proving.test.ts` 3: `sealWith(text, stamp)` and `unsealWith(sealed, stamp)` now take one stamp and answer a string. Drop the tests of zeroing a caller's bytes.
   * `vault-unlock.test.ts` 6: rewritten here, new rows mostly pass. Line 24 and 44 still use `roundTrip(vault.demandLease(), …)`, and `T0` needs its import back. `makeBornVault` must take listing opts (`{ onPanic }`). Node has no `reportError`, so `vi.spyOn(globalThis, 'reportError')` fails: use `vi.stubGlobal`.
   * `vault-life.test.ts` 5: `goodbye` at 75, 90 becomes `sweep`; lines 131-164 lose `demandLease`.
   * `vault.test.ts` 3: `tryPutLease` and friends become `tryCache`, `peek`, `tryVacate`.
   * `vault-gate.test.ts` 2: lines 10, 22, 83 lose `demandLease`. `with*` now renews the lease under the new epoch, where the old doc said it stays.
   * `box.test.ts` 2 (line 169), `gate.test.ts` 1 (202-207: `with*` answers `{ gate, proved }`), `halpimonfire.test.ts` 1 (line 47, and reword "until the Coach rules" to the ruling), `tests/loosened/{box,loosened,vault}` 4.
2. **Lint in `src/`**: `listing.ts:105` (`!==` always true: look, it may be a real slip), `storable.ts:288,290` (empty no-op hooks: give them `{ /* … */ }` or report a suppression), `vault.ts:207` (catch parameter must be `err`).
3. **Then** `pnpm justify`, all packages. Nothing outside `tests/models`, `tests/loosened` has been run.
4. **Check against `notes/guarantees.md`** G1 to G9 on the final diff, and send what a security reviewer should see through a `sonnet` subagent into `notes/security.md`. `notes/wontfix.md:46,54` still say `tryDelLease`.
5. **The sprint's test for this thread** is in `vault-unlock.test.ts`, against `MemoryDeviceDB` and `MemoryVaultDB`: it passes for proving, cache, seal and unseal. **Unproven**: the panic rows and the listener-throw row have not yet run to an assertion (they die on `reportError`), so the panic path is untested. Rows of `#renewLease` through a gate change are not yet written: renewed under the new epoch; was locked, nothing; lock crossed, forgotten and no row.
6. Bring the PR's body up to date. PROCESS.md has it out of draft for this report, red as it is: its first line says so.

## The thread

* **Built**:
  * `vault.ts`: `leaseFriend()` memoized per vault, binding `peek`, `tryCache`, `tryVacate` by scope and `vault_tok`; `ensureUnlocked`, `#attachLease`, `#renewLease`, `#vacateLease`, `#vacateUnattached`, `#panic`; `sealStampedString`, `unsealStampedString`; `boxListing`, `sweepContents`, `vacateContents`. `isLocked` is `#lease === null`.
  * `lease.ts`: `attach()`; lease does the decode and fill, box the deserialization.
  * `storable.ts`, `listing.ts`: `lock`, `sweep`, `vacate`, `isDisabled`, `demandEnabled`, `unlist`; listener throws go to `reportToPlatform`.
  * `box-listing.ts`, `vault-listing.ts`, `bank.ts`, `models-shapes.ts`: the world carries the seal verbs and `deviceDB`, `onPanic`.
  * **Removed**: `#isLocked`, `#leaseChores`, `#keptLookup`, `#unlocking`, `demandLease`, `takeUpLease`, `takeUpKeptLease`, `#unlock`, `#unlockAlone`, `#unlockByProof`, `leaseCachedOf`, `#lookUpKept`, `#peekLease`, `#setLease`, `letLeaseGo`, `#leaseChore`, `LeaseDeviceDB`, `BoxLease`, `serializedBytes`. `Phrases` `DamagedLease`, `LeaseNotInForce`, `LeaseOfOtherHolder` reworded.
* **Decisions taken**:
  * The friend's identity check, `lease.friend !== this.leaseFriend()`, settles thread 3's lost check. A lease of another holder is refused and left alone: vacating it would erase that holder's row.
  * `#vacateLease` is one path, held or not: `tryUncacheLease`, evict, null, settle, then await. Set aside: `lease?.tryVacate() ?? …`, two paths to one outcome.
  * A cache refused at attach is bad news and the lease stays held: it costs the next session a proof.
  * `sealWith`, `unsealWith` take one stamp, per the spec; the purposes `box_key_wrapped`, `whisper_ciphered` stay inside the ctx.
  * End-of-method checks are tests here: "held and in force" cannot be written past `#attachLease`'s await, since a `lock()` may rightly follow.
* **Deviations**:
  * **Pulled forward**, so strike them from the later threads: `#renewLease` wiring in `#sendGate` and `GateChange` from thread 11 (`with*` answers `{ gate, proved }`), since TypeScript flags an unused private; `vault.boxListing` and `listing.boxListingOf` from thread 9, needed for discards down the chain, no watch started.
  * A disabled thing refuses `'bad_option'` (`disabledError`, `Phrases.LetGoInstance`), not a new kind, as `tests/errors.test.ts` tables every kind and is old code.
  * `Bank.goodbye` calls `vaultListing.sweep()`, so a `bank.hello` after it refuses until thread 12's fresh listing.
* **Discoveries**:
  * Crossing: a `lock()` during `lease.peek` loses (the row drawn as such).
  * Crossing: a late `listing.fetch` answer for a thing swept alone, its listing alive, builds a new instance: thread 8's slot.
  * Crossing: a held lease displaced during a gate change makes `#renewLease` vacate the row, which costs a proof next session.
  * A `whisper` setter of null on a disabled box is unguarded, and harmless. The `vault.gate` getter refuses on a disabled vault.
  * `MemoryDeviceDB.doPeek` structured-clones, so the test helper reads rows through `_cheat_leaseRows()`.
* **For the Coach**:
  * A `disabled` refusal kind once the old code goes, in place of `'bad_option'`?
