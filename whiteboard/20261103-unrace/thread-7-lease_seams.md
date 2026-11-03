# Thread 7: lease_seams (2026-11-03)

Branch `20261103-lease_seams`, PR #455, stacked on #451. Justify: **green**. Root scripts 302; safebyok 4660 | 37 skipped; indexeddb 167 | 11; postgres 322 | 15; fastkey 49; react 326; demo-react 230 | 17; convex 375 | 9; graphql 345 | 15; e2e 107 | 116 skipped. Size budgets unmoved. No `eslint-disable`, no `ts-expect-error`.

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
  * A disabled thing refuses the new kind `'disabled'` (misuse family), as the spec's *Preconditions* has it, by the orchestrator's directive; its row is in `tests/errors.test.ts`, and the README's misuse table says it. The changeset is `minor`.
  * `listing.ts`'s `unlist`: lint's `!==` was not a slip. The identity comparison is right, and lint only saw a generic `ThingT` against `Thing<...>`; the fix widens the local's type and changes no behaviour.
  * `onPanic` lives on the world, so `makeBornVault` takes world overrides, where the handoff said listing opts.
  * `reportToPlatform` checks `typeof reportError`, so a platform with none (Node) still vacates. Tests stub it with `vi.stubGlobal`; `vi.spyOn(globalThis, 'reportError')` fails where the global is absent.
  * `tests/loosened/box.test.ts` and loosened's "a lease handed out before lock()" section went with the seam: the README's promise now holds, covered by vault-unlock's crossed row.
  * The world's deviceDB in tests: spies (`peek`, `tryCache`, `tryVacate`) stand beside `memoryDB` with `cachedNow`, `layCached`. Set aside: `Object.assign` of spies onto the store, as lint's unbound-method refuses a method read off it.
  * The row of a lock crossing `#renewLease` as the put lands spies on `vaultDB.tryPutVault`. Set aside: `vi.spyOn(listing, 'put')`, as a listing is frozen.
  * `vault-life`'s "first session locked" row uses `vault.lock()`, as a sweep now disables.
  * End-of-method checks are tests here: "held and in force" cannot be written past `#attachLease`'s await, since a `lock()` may rightly follow.
* **Deviations**:
  * **Pulled forward**, so strike them from the later threads: `#renewLease` wiring in `#sendGate` and `GateChange` from thread 11 (`with*` answers `{ gate, proved }`), since TypeScript flags an unused private; `vault.boxListing` and `listing.boxListingOf` from thread 9, needed for discards down the chain, no watch started.
  * `Bank.goodbye` calls `vaultListing.sweep()`, so a `bank.hello` after it refuses until thread 12's fresh listing.
* **Discoveries**:
  * Crossing: a `lock()` during `lease.peek` loses (the row drawn as such).
  * Crossing: a late `listing.fetch` answer for a thing swept alone, its listing alive, builds a new instance: thread 8's slot.
  * Crossing: a held lease displaced during a gate change makes `#renewLease` vacate the row, which costs a proof next session.
  * A `whisper` setter of null on a disabled box is unguarded, and harmless. The `vault.gate` getter refuses on a disabled vault.
  * Crossing: a `lock()` during `#renewLease`'s proof or put wins: the new lease is vacated and no row stands, the spec's `lock crossed`.
  * `notes/wontfix.md`'s autolock entry (`MaxTimerMillis`) is stale for the slim models, and left as is; its two refused-erase entries are brought over to `tryUncacheLease` and `vacate()`.
  * `MemoryDeviceDB.doPeek` structured-clones, so the test helper reads rows through `_cheat_leaseRows()`.
* **For the Coach**:
  * **G6, G7: a whisper crosses `Box` to `Lease` as a string**, per the spec's seal verbs, and a string cannot be zeroed. Only the bytes the lease encodes or deciphers are zeroed. G7 says a new form of a secret amends the note first, and this thread has not: recommend accepting per the spec and amending G6 and G7 in `notes/guarantees.md`. Security entry written.
  * **G9: `vault.leaseFriend()` and `lease.friend` are public**, and `friend.peekLease()` answers the cached row with its leaseKey handle. Models are not yet exported: recommend narrowing before they are. Security entry written.
  * **A refused erase at `lock()` with a host `onPanic`** leaves the row while the vault reads locked and enabled, and the next `ensureUnlocked` takes it up with no proof: recommend the host's call, documented. Security entry written.
  * **`Bank.goodbye` sweeps**, so `bank.hello` after it refuses until thread 12's fresh listing: recommend leaving it to thread 12.
