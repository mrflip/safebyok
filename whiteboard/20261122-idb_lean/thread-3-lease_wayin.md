# Thread 3: lease_wayin (2026-11-22)

Branch `20261122-lease_wayin`, PR #830, stacked on #828 (caught up onto its second rework, afe713dd8). Proved: the VOCABULARY pass with the root `pnpm lint`; before it, `pnpm justify` green at the tip (14 test runs, 7306 tests; safebyok 29 files, 1389 tests; safebyok-react-lean 16 files, 252 tests).

* **Built**:
  * **Lease** (`src/shapes/shapes-stamps.ts`, `src/models/lease.ts`): the stamp names its bank's stamp `bank_lifeseq`, `bank_born_at`, `bank_lifetok`, each with the check of the bank field it names, and has its own `born_at` (`epochMillis`) before `proved_at`. `Lease.make` checks the lease against `gate.bankStamp` through a private `bankStampOf(lease)`, still as `damaged_lease`. The wrap's ctx is still `cipherCtx([bankStamp, granted], 'bank_key_lease_wrapped')`: the bank stamp is bound beside the whole lease stamp.
  * **Renewal** (`src/models/proving.ts`, `src/models/gate.ts`): `buildLease(gate, cited, renewed = null)`. Given `renewed`, the lease the gate holds, the new lease keeps its `born_at`; given null, `born_at` is `proved_at`. `Gate#unlockByProving` passes `this.#lease`. `gate.leaseEndsAt` is unchanged: `proved_at + leaseMillis`.
  * **Wayin** (`src/shapes/shapes-wayin.ts`, new): `WayinChecks`, ported from big's `GX`/`BX` wayin checks with the same strictness and field checkers from `CX`: each kind's record and header, the two unions on `wayinkind`, and the gate's bag `wayins` (`main`, `passkey0` nullable, as `PerKindChecks` had it). `label` is the literal per kind (`main`, `passkey0`); `registered_at` is `born_at`. Every new-core use of `BX.wayins`, `GX.wayinHeader`, `GX.wayinRecord` and their types now reads these. `core.ts` exports `WayinChecks` and the six types from here, in place of big's types.
  * **Tests**: golden ctx bytes (`tests/models/ctx-bytes.test.ts`); fixtures `MainWayin`, `Passkey0Wayin`, `OtherMainWayin` in `tests/test-helpers/vaultdb-world.ts`, in place of big's `BW` wayins; renewal tests in `proving.test.ts`; a `born_at` tamper case and a gate of another birth (lifetok) in `lease.test.ts`; react-lean's passkey header fixture.
  * **VOCABULARY.md**, by the Coach's ruling of 2026-11-22 ("start planning to adopt the new one, update VOCAB"): the lease and wayin rows, and the rows naming their fields, now describe the new core. Rewritten: **lease** (in memory only, nothing caches it; renewal keeps `born_at`; ends `leaseMillis` after `proved_at`, reported as `leaseEndsAt`; evicted by a lock or sweep), **leaseKey** (fresh per lease, in memory, `lease_key`), **wayin** (adds `Wayin`), **wayin, as stored** (the gate's record; `passkey0` null for none), **visible** (the bank's and gate's stamps by `lifeseq`, `born_at`, `lifetok`; a box's Thing fields), **lease, as cached** → **lease record** (the `LeaseRecord` fields, stored nowhere), **registered_at, written_at** → **born_at, written_at** (every Thing; a wayin's and a lease's `born_at`). Folded: **wayinlabel** removed (the *wayin, as stored* row names `label`, `main`, `passkey0`). Unchanged, since they still hold: **wayinKey**, **bankKeyLeaseWrapped**.
  * **notes/security.md**: one amendment line under the 2026-11-14 lean_gate entry, by a `sonnet` subagent.
* **Decisions made**:
  * **How `buildLease` learns `born_at`**: an optional third argument, the lease renewed (`Pick<LeaseStamp, 'born_at'> | null`), validated with the other arguments. Set aside: the proving reading the gate's lease (the gate keeps it private, and a `LeaseGate` exposing it would widen the duck); the gate patching `born_at` after the build (the stamp is bound into the wrap, so it cannot be changed after).
  * **The bag** stays `passkey0: nullable` (a record has no optional part), where big's bag had it optional.
* **Deviations**:
  * The wayin checks are in a module of their own, `shapes-wayin.ts`, not `shapes-gateish.ts`: `shapes-thing.ts` needs the bag and `shapes-gateish.ts` imports `shapes-thing.ts`, so the checks there would make a runtime import cycle.
  * **Export change**: `safebyok` exports `WayinChecks`, and its `WayinHeader`, `WayinRecord`, `PassphraseWayin*`, `PasskeyWayin*` types are now the new core's (with `label`, `born_at`), no longer big's. `Wayinkind` still comes from big.
* **Discoveries**:
  * safebyok-postgres's SQL names no field inside a wayin (it stores `wayins` whole as jsonb, in big's bank tables); its `registered_at` columns are big's Thing fields. No change there.
  * The demos on the new core (envman, knockknock) read no renamed field. `demos/safebyok-demo-react` reads `registered_at` on wayins, but is on big.
  * The new core caches no lease yet, so no stored lease is left behind by the rename.
  * The catch-up onto #828's second rework conflicted in VOCABULARY.md (the lifetok row and the visible row are adjacent) and in the battery's import list; both were unions of the two sides.
* **For the Coach**:
  * **Decisions in the VOCABULARY pass**: *registered_at, written_at* renamed to *born_at, written_at*, since the new core has no `registered_at` at all (every Thing has `born_at`). *lease, as cached* renamed to *lease record*, since the new core caches no lease and the row's subject is now the `LeaseRecord`. The **lease** row no longer says a lease "lasts" `leaseMillis`: nothing in the new core locks at `leaseEndsAt`, it is only reported.
  * **Rows left for the full adoption**: each still describes safebyok-big alone, or in part. Unchanged.
    * *The stamp* paragraph (under the `_id`/`_tok` paragraph): `BankStamp` as `bank_tok`, `registered_at`; `GateStamp` with `gatelabel`, `gate_tok`; `VaultStamp`; `LeaseStamp` with `gatelabel`, `gate_tok`, `gate_revision_tok`, no `bank_` fields or `born_at`. Now contradicts **lease record**: first to fix.
    * *The `_id`/`_tok` paragraph*: `vault_tok`, `box_tok`, `revision_tok`.
    * **box**: `boxlabel` (the new core has a box's `labelpath`).
    * **whisperCiphered**, **boxKeyWrapped**: `whisper_ciphered`, `box_key_wrapped` (the new core seals a part: `key_wrapped`, `ciphered`, `codectag`, `schematag`).
    * **ctx**: a box's ctx binds its vault's stamp (`VaultStamp`); the new core binds the bank's stamp, then the box's.
    * **vaultTok**, **boxTok**, **bankTok**, **gateTok**: big's life tokens (new: `lifeseq`, `lifepath`, `lifetok`).
    * **revisionTok**: `revision_tok`, `revision_seq` (new: `revtok`, `revseq`).
    * **gateRevisionTok**: `gate_revision_tok` (new: the lease's `gate_revtok`).
    * **deviceTok**: `deviceDB.ensureCachedDevice`, `device.ensureBank()`, `bank.device_tok`, `user_id` (new: the host passes `device_tok` to `Device.make`).
    * **user_id**: "spelled `user_id` everywhere" (new: `userid`).
    * **vaultlabel**, **boxlabel**, **scope** (`VaultScope`): big's scope names (new: `labelpath`, `ThingScope`).
    * **whisper codec, whisper schema version**: `whisper_codec`, `whisper_schema_version` (new: a sealed part's `codectag`, `schematag`).
    * **damaged**: `damaged_row` and `DamagedBox`, a vault's fetch, the bankDB, `vault_tok`.
    * **vault record**: all of it (`fmt` 6003, `bank_tok`, `vault_tok`, `registered_at`, the gate row).
    * **device row**: the deviceDB's row, `ensureCachedDevice`, `forgetDevice`.
    * **bank row**, **gate row**: marked "In safebyok-big"; the new core's bank and gate are Things.
    * **gatelabel**: big's gate label (new: the gate's `labelpath`).
    * **rotation**: the gate row, TODO-big.md.
    * **the bank's listing**: `bank.vaultListing`, `bank.vaultAt`.
    * **get, put, del**: the bankDB's `getVault` ... `delBox`, `bank.delPrompt()`, the deviceDB's `stow`, `peek`, `forget`.
    * **enlist, listed, kept, take down**: big's listings.
    * **land**: "the lease stowed or forgotten".
    * **attach, detach**: "a bank's lease" (new: the gate's).
    * **revoke**: `Lease.revoke`, `Bank.#revokeLease`, a cached lease.
    * **storage, datastore**: `BankDB`, `DeviceDB` (new: `VaultDB`).
    * **Answer**, **bankDB**, **ask**, **parent**, **buildBank, delBank**, **bank_void, bank_gone, bank_reborn**: the bankDB, its ops (`build`, `tidy_gone`) and `bank_tok`.
    * **read, write**: `#writeVaultRow`.
    * **deviceDB**: leases stowed, peeked and listed (`listLeases`).
    * **pantry**: the lease kept in the deviceDB, through IndexedDB.
    * **proved_at**: "a cached lease is past autolock ... never attached again".
    * **autolockMinutes**: `bank.autolock()`, a cached lease past it, `onBadNews`.
    * **fmt**: 3001, 4001, 6003, 5003, 7003 (new: one `fmt` for every Thing and the lease, `ThingFormat`).
    * **scopepath**: `vault^u1^acme^main` (the new core addresses by `labelpath`).
    * **stamp** (Shapes): `VaultStamp`; **scope** (Shapes): `VaultScope`, `Boxscope`.
    * **dated**: a cached lease's `bank_tok` (`LeaseDated`).
    * **unlock, as a noun** (Words safebyok does not use): "A device caches a lease".
    * Not checked line by line, and may be big's in part: **vault**, **bank**, **timely** (`vaultRefreshMinutes`, `fetchBox`), **stage**, **ensure** (`bank.ensureVault`), **draft**, **options, policy**, **act, dbhas**, **camped**, **strengthChecker** (`ensureBank()`), **logger**.
