# Thread 2: vault_unlock (2026-10-31)

Branch `20261031-vault_unlock`, PR #412, stacked on #410. Justify: green (safebyok 4559 passed, 37 skipped; every package green), after the rework below.

* **Built**:
  * `Proving.attempt(stamp, gate, proofClosure, world)` (proving.ts): the proving of the stored wayin the proof opens. The passphrase's if one is handed, else the passkey's (`PassphraseProving.ofWayin`, `PasskeyProving.ofWayin`), then `#demandOpens` unwraps and drops the vaultKey. Refusals: `unknown_key_deriver` (label), `wrong_passkey` (no passkey wayin, other credential, other salt, or a wrap that will not open), `wrong_passphrase`, and `bad_option` for a proof handing neither (`attemptCleartexts`). `Gate.attemptProof(proofClosure, world)` calls it with the gate's stamp and pickle.
  * `makeWayin` refuses a second wayin of any proving (`unexpected_error`) and a source proving of another vault (`bad_option`). A proving of a stored wayin is born holding it.
  * `Gate.build` answers `{ gate, proving }`. `VaultListing.build(dna)` holds the vault, then `vault.takeUpLease(await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis }))`, so a vault is born unlocked.
  * Vault (vault.ts, *Unlocking*): `isUnlocked`; `leaseMillis` (the world's, else `DefaultLeaseMillis`, 14 days); `ensureUnlocked(proofClosure?)`; `demandLease()` (`vault_locked`); `takeUpLease(lease)`; `takeUpKeptLease()`; `letLeaseGo()`; `#unlock`, `#unlockAlone`, `#unlockByProof`, `#lookUpKept`, `#setLease`, `#dropLease`. The listing's `hello` takes up each vault's kept lease; its `goodbye` lets every vault's lease go (see *Rework*).
  * Lease (lease.ts): `#vaultStamp` parsed once in the constructor (ruling 9). `#vaultKey` refuses `vault_locked` past `autolock_at` or once forgotten (ruling 2). A lease that will not open locks its vault, drops its record, erases it, and refuses `damaged_lease`. `Lease.get` answers null for a kept lease past `autolock_at` and erases it (ruling 3).
  * `PasskeyProving.make` parses inside its try/finally (`passkeyAnswer` refuses all-zero, spent bytes); `PassphraseProving.make` parses `passphraseMakeArgs` at entry; `spendAnswer`/`spendPrfBytes` swallow a throw, commented (ruling 4).
  * `Storable.demandedFull()`, used by `vault.gate` and `box.#unseal` (ruling 11). Every refusal sentence of the models comes from phrases.ts (ruling 10).
  * DeviceDB: `keptLeaseRow` in shapes/device.ts, the old `leaseRecord` or a row of `fmt` `ModelsLeaseFormat` (7001); `getLease` parses with it (ruling 7).
  * notes/wontfix.md: the refused erase not retried; no autolock timer past `MaxTimerMillis` (ruling 6).
  * Tests: tests/models/vault-unlock.test.ts (15), tests/test-helpers/vault-world.ts (the world vault.test.ts had inline, now with a deviceDB that keeps one lease, a clock the test moves, `anotherSession()`, and `useVaultWorlds()` saying goodbye to every listing after each test), one pin appended to tests/loosened/loosened.test.ts.

* **Decisions taken** (YOLO, two-way doors):
  * `ensureUnlocked()` with no closure and no kept lease in force refuses `vault_locked` (`NoProofToUnlock`). A world-level prompt can come later.
  * The attempt uses the passphrase if one is handed, else the passkey; no fallthrough from a refused one to the other.
  * One wayin per proving: `makeWayin` refuses any second call, a superset of ruling 5's other-vault refusal.
  * `demandedFull` over `checkedFull`, as `demand*` is the house verb for "or refuse".
  * `takeUpLease` is public: the listing grants at birth and hands the lease over.
  * ~~The kept-lease lookup runs once per Vault object.~~ Replaced in the rework: see *Rework*.
  * The damaged-lease path is inlined in `#vaultKey`, not a `#dropDamaged` method, per the spec's "get rid of dropDamaged and just call this.vault.lock()". It still drops its own record too, for a lease the vault does not hold.
  * The changeset is `minor`: `DeviceDB.getLease`'s answer type and three new exports.

* **Deviations**:
  * Ruling 7 named device.ts alone. `DeviceDB.getLease` had to parse with the wider checker, so device-db.ts changed by one parse and two return types. index.ts exports `keptLeaseRow`, `KeptLeaseRow` and `ModelsLeaseFormat`; tests/index.test.ts lists them. tests/vault/world.ts narrows `getLease` with `leaseRecord.parse`.
  * vault.test.ts's helpers moved to tests/test-helpers/vault-world.ts, so the new test file shares them. Its two `makeLease` tests now `mockClear` `tryPutLease` after the birth grant.

* **Discoveries**:
  * `lock()` queues the lease's forget as a chore, so a Lease a caller took before `lock()` still seals until the chore lands. The vault itself reads locked at once. Pinned in loosened.test.ts against README.md:616. Thread 3's boxes should take `vault.demandLease()` per call and not keep it.
  * The Trigger's timer is real `setTimeout`. Each birth arms a one-hour timer, so test worlds must `goodbye` their listings (`useVaultWorlds`).
  * ~~`#setLease` does not dispose a prior lease it replaces.~~ It lets it go now (*Rework*).

* **Rework** (after the review on PR #412): `DeviceDB`'s put side widened to `KeptLeaseRow`; `Lease.letGo()`; the kept lease looked for whenever none is held; `ensureUnlocked` joins an unlock by proof in flight; a displaced lease let go; `goodbye` lets go rather than locks; `takeUpLease` refuses another vault's lease and one not in force. The why and the approaches set aside are in [thread-2-vault_unlock-rework.md](thread-2-vault_unlock-rework.md): read it before touching `vault.ts`'s *Unlocking*.

* **For the restack of thread 5 (PR #411, `20261031-tests_models`)**: these of its tests change meaning here.
  * gate.test.ts: `Gate.build` now answers `{ gate, proving }`.
  * tests/loosened/lease.test.ts:16, :25 ("still seals past `autolock_at`"/past `MaxTimerMillis`): it now refuses `vault_locked`. Flip or retitle.
  * tests/loosened/lease.test.ts:37 (`Lease.get` hands back a lease past `autolock_at`): it now answers null and erases.
  * tests/loosened/lease.test.ts:54 (a damaged lease keeps its record and stays in force): it is now dropped and erased.
  * tests/loosened/proving.test.ts:16, :22, :30 (`PasskeyProving.make` accepts a spent answer; PRF unzeroed on a refused world or short salt): parsing is inside the try/finally now, and all-zero bytes refuse. Flip.
  * I created no tests/models/{gate,lease,proving}.test.ts, to leave thread 5's files unconflicted.

* **For the Coach**:
  * The `DeviceDB` lease types are public (minor): a host reading `getLease`'s answer as a `LeaseRecord` must narrow it; `putLease` takes any `KeptLeaseRow` and resolves it typed as handed.
  * `takeUpLease` keeps the holder check beside the directed stamp check (the holder check implies the stamp for every Lease the models make): confirm, or drop one.
  * idb.ts's `doPutLease` is still typed `LeaseRecord` (outside this thread's files; compiles by method bivariance): widen it in a later thread.
  * `ensureUnlocked()` without a closure refuses rather than prompting through the world: confirm, or name the world's prompt.
  * The spec edits sit on the 20261030-newvault spec as this branch has it; the base_planning branch has since rewritten its status markers (162c9c52), so the two will need merging by hand.
