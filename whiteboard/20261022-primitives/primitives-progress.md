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
| 6 | lease_box | built, in review | #254 |
| 7 | bank | planned | |
| 8 | proving_gate | planned | |
| 9 | gating | planned | |
| 10 | react | planned | |
| 11 | docs | planned | |
| 12 | route_meta | filed, beside the line | #252 |

## What the threads found

### From the streamline sprint (threads 1 and 2)

See `whiteboard/20261021-streamline/streamline-progress.md`, *What the threads found*, for
#243 and #244: the names, the shapes, the interim gateless handling thread 7 replaces.

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
