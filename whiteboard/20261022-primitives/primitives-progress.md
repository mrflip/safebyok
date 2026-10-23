# primitives: progress

What the sprint's threads have taught, newest wins. Workers look things up here; the orchestrator
keeps it. Newer than the plan and the spec wherever they disagree.

## Rulings in force

* **The spec is `primitives.md`** (2026-10-22): the demand model, the four mutexes, the primitives
  and the chains. It supersedes the streamline sprint's rulings except tombstones and
  `vault_epoch`, which stand.
* **Try pairs** (2026-10-22): every public method is `x` and `tryX`; doc block on the throwing one;
  implement the easier half and derive the other.
* **`vault.checkStrength(passphrase)` is public** (2026-10-22), today's `checkPassphrase`; a chain
  calls it through its copy of the vault.
* **Deleting a vault is proven** (2026-10-22): `del()` raises `del_vault`.
* **Whisper-omitted `putBox` reads first** (2026-10-22): the listing stays summaries; ergonomics
  reconsidered after the sprint.
* **A late read of this tab's own gate write is ignored** (2026-10-22): "ship what we have, tell
  people to report what is wrong and we'll fix from both ends".
* **`cipheredWith` / `decipherWith`** for like-for-like, `extractWhisper` where one thing becomes
  another (2026-10-22).
* **The dialog is the only door** (2026-10-22): the app invokes the call, the gating is raised,
  the dialog's output becomes provings, and the attempt makes the change. The app never holds a
  proving.
* **No refresh bookkeeping** (2026-10-22): a refresh does not note a box this tab wrote while it
  ran; the next write refuses `stale_write` and a hello cures it.
* **A sidecar-only change is `getBox` then `putBox`** (2026-10-22); ergonomics after the sprint.
* From the streamline sprint, still in force: `putVaultProps` resolves the stored props;
  `ensureVault(draft)`; tombstones on `del()` and `delDamagedVault`; `vault_epoch` moves on the
  vault's core fields only; no back-compat for pre-rename vaults; security notes through a
  `sonnet` subagent, the Coach audits the file after the sprint; wire meta in the body.

* *Orchestrator:* carried from the streamline doc's rows (2026-10-22): `renewMinutes` at least
  the lease's length refuses `bad_option` (thread 9); the `getVault`/`getVaultRecords` pairs stay,
  with a loud TODO that the VaultDB nearest the database owns validation and consistency
  (thread 4); one main `meta` on every wire answer, wrapped and encrypted fields stripped from an
  error's (thread 12); the server is the trusted party (the GraphQL client's kinds stay as they
  are).
* *Orchestrator:* the Coach's charge at the invocation (the plan, under the first charge): keep
  the primitives simple and layer synchronization on later; where a primitive as written would let
  a caller's guarantee fall, keep the guarantee by the smallest means outside the primitive, raise
  it loudly, and carry on.

* **Epochs** (the Coach, 2026-10-22): `gate_epoch` by equality, and the lease goes when the gate
  changes; `vault_epoch` by ≤, bumped by the store on writes and deletion, never on a read;
  rollback protection drives no large revision (`guarantees-audit.md`, the ruling at its head).
* *Orchestrator:* **`guarantees-audit.md` binds threads 4 to 9** (2026-10-22): nine places the
  spec as written lets a guarantee fall, each fix by thread (*By thread*), each an Open Matters
  row. It wins over `primitives.md` until ruled.
* **Ruled from Open Matters** (the Coach, 2026-10-22): risk 1, step 7 checks both the proving and
  the stored record; risk 3, the take-up predicate as recommended; risk 7, a full `putBox` adopts
  the listing, and unlisted is a create the store accepts over nothing or a tombstone (all in
  `guarantees-audit.md`). From #251: `delDamagedVault` stays as built ("if at any point the vault is
  fundamentally damaged in storage it should go"); garbled rows are the loud TODO's; a first unlock's
  two writes (gateless, then the gate) are accepted, and the bank births through `ensureVault`.

* **Ruled, second batch** (the Coach, 2026-10-22): a guarantee may loosen for a while, and more
  refusals are expected (the plan, ground rules 16, 17); same scope with another `vault_tok` is a
  new life, so reload (18); audit 4 took A; a repeated delete refuses `stale_write`; capacity is
  not the vault's own prop and stays in #252's main meta; the README-drift TODO is thread 11's.

* **Design notes, not yet to build** (the Coach, 2026-10-22): `demandConsistent` may grow to take
  several things, every prop present in any of them matching the others where present ("Add only
  once desired"); no cross-tab coordination additions this sprint ("note your concern and carry
  on").

Otherwise, until the Coach rules on an Open Matter, threads take its Rec (the plan, *Ground
rules* 3).

## Threads

| # | Label | Status | PR |
|---|---|---|---|
| 1 | renames | merged | #243 |
| 2 | get_vault | merged | #244 |
| 3 | wire_meta | merged | #246 |
| 4 | store_verbs | merged | #251 |
| 5 | demand | filed, on main | #253 |
| 6 | lease_box | filed, stacked on #253 | #254 |
| 6b | box_seal | filed, stacked on #254 | #256 |
| 7 | bank | filed, stacked on #256 | #258 |
| 7b | bank_provider | filed, stacked on #258 | #259 |
| 8 | proving_gate | filed, stacked on #259 | #260 |
| 9 | gating | filed, stacked on #260 | #261 |
| 9b | gating_followups | filed, stacked on #261 | #262 |
| 9c | core_cleanups | building, on #262 | |
| 11 | docs (core half) | building, on #262 | |
| 10 | react | planned | |
| 12 | route_meta | filed, beside the line | #252 |

## What the threads found

### From the streamline sprint (threads 1 and 2)

See `whiteboard/20261021-streamline/streamline-progress.md`, *What the threads found*, for
#243 and #244: the names, the shapes, the interim gateless handling thread 7 replaces.

### Thread 9, gating (#261)

*Orchestrator:*
- **Built.** `Ask` is gone, and a gating replaces it: a union on `gatingkind`, handed to the host through `requestCleartext`. Its attempt holds the dialog's slot and runs its kind's chain.
- **Public surface.**
  - `unlock()` and `getProof` are gone, and `ensureLease` is `ensureUnlocked`.
  - `putWayin(slotlabel)`, `delWayin(slotlabel)` and `del()` raise gatings, and no vault call takes cleartext.
  - New kinds: `attempt_in_flight`, `passphrase_required`, `same_passphrase`.
- **Ordering.**
  - The pantry consult is the gating's first step, and each chain opens with a hello at 0 through the join.
  - A change kind checks the current passphrase before sealing the new one; only `initialize_gate` seals side by side.
  - A sent deletion is past a lock's reach: once `delVault` is sent, a lock, decline or let-go marks the gating landed and the chain settles it.
  - `getBox`, `getWhisper` and `useWhisper` demand the lease again after storage answers (the Coach's ruling on #254).
  - The refresh tells a read begun before the lease in hand by counting leases (`#leasesHeld`), not by the millisecond.
  - A decline is no lock: one that lands during `putLease` leaves the proven lease in the device store.
- **React (minimal).**
  - `BankProvider`'s own dialog answers only `unlock_vault` and `initialize_gate`, and declines the rest; thread 10 closes this loosening.
  - `PassphraseModal` and `PasskeyUnlockButton` take a `gating`; `allowStartOver` does nothing.
  - `attemptRefusalFlavor` has `in_flight`, which the dialogs ignore.
- **Test helpers.**
  - Core: `TH.scriptedRequestCleartext` (the default in `memoryVaultOpts`, `makeWorld` and `settledVault`), `TH.answering`, `TH.unlock`, `TH.putWayin`, `TH.delWayin` and `TH.del`, with their try forms, plus `TH.heldDialog` and `TH.asKind`.
  - React: `gatingOf`, `stubGating`, `gatedBy`.
- **Coach's rulings (2026-10-23).**
  - Joins: "whatever is safe; given safe, whatever is simplest; given both, whatever is most ergonomic; as a tiebreaker go with the plan".
  - Correctable kinds: yes, "but not if it means a retry".
  - Start over: a TODO; clear the local copy only, never the vaultDB.
  - No lease of zero: a TODO for the policy.
  - The 9b entry in the plan carries what these change.

### Thread 8, proving_gate (#260)

* `src/proving.ts`: `Proving` (abstract), `PassphraseProving` / `PasskeyProving` with `static seal(vault,
  header, cleartext, { gating })`; a proving holds its wayinKey privately, its stamp non-enumerable;
  `checkWayin`, `sealWayins(passkeyProving?)`, `resealWayinFor(newProving)`, `grantLease()` (demands on
  the proving and the stored record's stamp before `putLease`), `wrappedWith` (a `Ciphered`).
  `checkedPasskeyAnswer` refuses an all-zero answer; an answer is zeroed once used.
* `src/gate.ts`: `Gate.make`, `Gate.of`, `Gate.isHeldBy`; `#putGate` private in vault.ts, demanding on
  the gate before and after `putVaultProps`; `#gateWriteRefusal` makes the Vault gone on another life.
* Wayin is record only; `src/proof.ts` gone; `vault.checkStrength` (beside `checkPassphrase`, kept for
  React until thread 10). New kind `gating_landed`.
* Placeholders for thread 9: `ProvingGating { landed }` (an ask's attempt, the Ask's `#over`) and
  `StandingGating` (never lands) for `unlock()`, `putWayin()`, `delWayin()`.

### Thread 7b, bank_provider (#259)

* `BankProvider` (one bank per signed-in user, made in an effect, `bank.closeVaults()` on change
  or unmount), `useBank(): Bank | null`, `useVault(vaultlabel)` (the bank's entry; asks only
  while the bank holds none), `useVaultSnapshot(vaultlabel)`; `PassphraseModal`'s `onStartedOver`.
  Thread 10's dialogs read the entry through `useVault` and reach the bank through `useBank`.
* Core: the bank holds a birth before any publish and begins it a microtask on (a birth let go in
  the same task reads nothing); `bank.delDamagedVault` / `tryDelDamagedVault` (lets the entry go on
  success or `stale_write`); `clearCachedVault` erases, then lets the entry go.

### Thread 7, bank (#258)

*Orchestrator,* from the reports and review. Thread file `thread-7-bank.md`; every test moved is in
`thread-7-bank-tests.md` (long, a reviewer's appendix).

* **The Bank** (`src/bank.ts`): `make`, `hello` (loads the strength checker), `ensureVault` (one
  Vault object per scope; joins a birth under way), `reopenVault`, `closeVault`, `closeVaults`,
  `clearCachedVault` (erases the device record and the lease), `entryOf`, a snapshot and `subscribe`.
  `applabel` lives on the Bank; the draft holds `userId`, `vaultlabel`, optional per-vault stores.
* **Birth:** `deviceDB.getDeviceRecord` first, then `vaultDB.ensureVault` beside `deviceDB.getLease`;
  `vault_behind` below the record; the record raised; the take-up by `#fitsTakeUp`; a lease of
  another life left where it lies; a birth refused `identity_revoked` or `vault_behind` erases the
  lease. A failed raise refuses a birth (it needs the `device_id`) but only warns after a read.
* **The device record:** `getDeviceRecord`, `raiseDeviceRecord` (a store-side max that keeps the
  first `device_id`), `delDeviceRecord`; every answer checked by `deviceRecordFor(scope, answer)`.
* **Gone:** a refresh finding `getVault` null or another `vault_tok` makes the Vault object gone
  (`vault_gone` / `vault_remade`) for good; so do `bank.closeVault`, `del()` and a box read refused
  `vault_mismatch`. Calls waiting on the prompt then refuse `vault_gone`; a `lock()` refuses them
  `vault_locked`. `close()`, `vault_closed`, `opening`, `absent`, the device mark, `rolled_back` are gone;
  `novel`, `freshness`, `gate_made_elsewhere` came in.
* **React:** `VaultProvider` builds a Bank inside, keeps its props, and re-ensures when its vault
  goes gone; no way past `vault_behind` (7b).

### Thread 6b, box_seal (#256)

* The box ctx already binds every immutable field (`#boxCtxOf`, `cipherCtx`; `ctx-bytes.test.ts`
  pins it): "we sign all immutable fields" holds. Thread 8's wayin ctx is the same `cipherCtx`.
* A Box's stamp is non-enumerable (`decorate` before the freeze); `{ ...box }` and JSON show the
  record. The Lease is private: read inside the package with `heldLeaseOf(vault)` from
  `src/held-lease.ts`; the Vault object exposes `askPassphraseAt` and `leaseMillis`.
* `getBox` of a missing box resolves `null`; `getWhisper` refuses `absent_box`.

### Thread 6, lease_box (#254)

*Orchestrator,* from the report and two reviews. Thread file `thread-6-lease_box.md`, details
`thread-6-lease_box-details.md`, on the thread's branch.

* **Lease:** `sealLeaseRecord(vault, standing, vaultKey)` replaced `Lease.grant`; `#grantLease`
  writes the record and calls `Lease.make(vault, stored)`, a pure constructor. No public `record`
  getter: the package reaches it through `leaseRecordOf(lease)`, exported from no entry. A test
  walks the Vault object's whole reachable surface for any key. `vault.lease` is public (Open
  Matter: Rec private again, 6b). The Lease's stamp is scope, `vault_tok`, `gate_epoch`.
* **Box calls** demand after each await, refusals included (`#demandAfterWait(settled, thing,
  opts)`, there for threads 7 to 9's gate flows). A remake during `getBox`, `putBox` or `delBox`
  refuses `vault_remade`.
* **Store:** every adapter's `getBox` expects the `vault_tok` (`vault_mismatch` → `vault_gone`,
  `#readAt = FarPast`). `getBox` and `getWhisper` of a missing box resolve `null`; `useWhisper`
  and `delBox` refuse `absent_box`. `delBox` returns `DeletedBox { boxlabel, vault_tok, outcome }`.
* **The triplet:** `vault.consistentWith(thing, opts?)` (query), `demandConsistentWith` (throws);
  no `ensureConsistent` yet. `#ensureUnlocked(renewMillis, shouldAsk?)` resolves a boolean.
* **For later:** the wayin's unused `sessionKey` unwrap is thread 8's; `TH` is published as
  `safebyok/testing`, so nothing key-bearing goes in it; `delBox`'s tombstone discussion is in
  thread 4's file.

### Thread 5, demand (#253)

*Orchestrator,* from the report and review. Thread file `thread-5-demand.md`, details
`thread-5-demand-details.md` (*Races flagged*, *Contract lines this thread makes untrue*,
*Refusals where today coped*), on the thread's branch.

* **The demand** is `#demand(thing, { leaseBound, call })`, public as `demandConsistentWith` /
  `tryDemandConsistentWith`. It reads a partial `Stamped` (fields a thing carries): Box carries only
  `vault_tok`, Lease the scope and `gate_epoch`. Full stamps are thread 6's. New kinds `vault_gone`,
  `vault_remade`, `gate_moved`; `box_moved` not added (Open Matter).
* **Box calls** demand the lease, read, demand the box, then `#takeStoredBox` / `#takeBoxDeletion`
  put what storage stored into the listing.
* **The refresh** is `#takeStorage` + `#takePicture`, a pure judgment of one read plus the fields in
  hand: older than the picture → ignore, before the mark's rollback check and again after its wait;
  a revoked lease dropped from memory, never erased; nothing taken up. `oneAtATime` joins the read
  in flight, and the ring goes through it (a ring mid-read loses its change: Open Matter).
* **`#leaseSince`**: a pantry read begun before this tab's lease was taken cannot revoke it (Open
  Matter, Rec keep).
* **Kept for later threads:** the first-hello memo `#birth` / `#born` and the device mark (thread 7);
  `#grantLease` checks the Ask's `overtaken` beside the demand (thread 8's proving replaces it);
  `#takeUp`'s AbortController (thread 9); the public name `ensureLease` (thread 9).
* **Test helpers:** `TH.holdNextAnswer`, `TH.readAfresh`; `world.holdNextLease` holds the lease write's
  answer, since a hold at the device store's door misorders its writes.
* **Priority** (the Coach, audit 9): "Ergonomics around a deleted vault are of very little concern,
  safety is of course at max concern".

### Thread 4, store_verbs (#251)

*Orchestrator*, from its thread file and review; the full account is
`thread-4-store_verbs.md` on its branch.

* **Every write resolves what now stands.** `putVaultProps` resolves the props with the store's
  new `vault_epoch` and `gate_epoch`; `putBox` the record stored; `delVault(scope, { vault_tok,
  gate_epoch })` the tombstone `{ format: 'safebyok-tombstone-v1', ...scope, vault_epoch }`
  (exported `Tombstone`); `delBox` still today's `BoxDeletion` (thread 5 shapes what
  `vault.delBox` returns). `DeviceDB.putLease` resolves the record; one scope's calls land in order.
* **`vault_epoch`** is set by the store: standing + 1 on every `putVaultProps` and `delVault`,
  whatever the writer sends; a draft claims 0. Box writes do not move it.
* **`getVault` over a tombstone is `null`**: a refresh cannot tell deleted from never made; the
  counter reaches a new life only through `ensureVault(draft)`. Rec (Open Matter): a refresh that
  finds null where it held a vault says `vault_gone`.
* **Gone:** `getVaultProps`, `ensureVaultProps`, `listBoxes`, `listBoxRecords`, their `do*`
  hooks, `Expectations.vaultTokMeets`. `Expectations` gains `isTombstone`, `vaultPropsPutOf`,
  `newLifeOf`, `tombstoneOf`.
* **Try pairs at the store:** adapters return `Outcome`; `heed` in `refusal-policy.ts` is the
  throwing half. No `x`/`tryX` doubling was added on `VaultDB`.
* **`vault.ts` interim:** reads through `getVault`; the first unlock is `ensureVault` of a gateless
  draft, then the first gate expecting `gate_epoch` 0; `del()` passes the gate it read; the
  interim `created_elsewhere` for gateless props is gone, but `created_elsewhere` itself stands
  (thread 7 renames it). The device mark still checks `gate_epoch` (thread 7 replaces it).
* **VaultDB private helpers are `private`, not `#`**: a Proxy-wrapped VaultDB breaks on `#`.
* `delDamagedVault` expects `gate_epoch: null` (the `vault_tok` alone) and resolves
  `Tombstone | null`.
