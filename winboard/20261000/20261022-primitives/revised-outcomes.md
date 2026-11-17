<!-- Exported 2026-10-22 from the sprint doc, tab Revised Outcomes (https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4#cf2d69bb-100e). Where it and primitives.md differ, primitives.md wins. -->

# Revised Outcomes

How the vault's calls relate to each other, and the names and shapes that follow from it. Written as the result, for the plan to carry when the sprint resumes. Where this tab and *Resolved* differ, this tab wins; tombstones and `vault_epoch` stand. A second model reviewed this design adversarially on 2026-10-22 against main's `vault.ts`, thread 3's build and the sprint's rulings; what it changed is folded in, and the last section lists what it asks the Coach to rule.

## Gates, not a queue

A vault has no queue, no turn, no `p-limit`. Its calls are ordered by two joins, each per vault, by the store's expectations, and by nothing else.

- **The read join** is `oneAtATime`, today's module, kept. One read of storage is in flight at a time: props, listing and lease fetched in one parallel round, judged synchronously against what is in hand, committed synchronously. `hello` is a synchronous staleness check and then that read: within the window it resolves at once; past it, it starts the read or joins the one in flight, and resolves when that lands, the window advanced. The ring is a hello at staleness zero. A hello at any staleness that arrives during a refresh is satisfied by that refresh when it lands; nothing starts a second.
- **The gating join.** One gating per vault, so one dialog. `ensureUnlocked()` is hello and then: resolve at once when unlocked; otherwise join the gating that is up or raise one, and resolve when it settles. A gating's first step consults the pantry, so a lease another tab granted is taken up without a prompt; only then does it call `requestCleartext`. Every waiter resolves together, in no promised order, and what each does next is its own. The gating holds the vault's slot until its last attempt ends; a decline releases its waiters and does not stand an attempt down.
- **At most one unlocking process.** Cleartext becomes a proving in `gating.attempt`, and the gate is opened or made there, by the state in hand at the attempt's first step, not by the gatingkind: a vault that moved from novel to locked under a `new_vault` gating opens the gate the other device made, and a passphrase that will not open it is told so. It is one at a time because the gating is.
- **Box calls run free.** Each is `await this.ensureUnlocked()`, a synchronous `demandUnlocked()`, then its step against storage. Many gets and puts are in flight together, under the lease in hand, and the store's expectation on `revision_tok` is the only arbiter. The library promises no order among them: not across boxes, not between a get and a put, not for two calls on the same label. A client that wants order awaits its own calls. Two calls on one label from one tab are ordinary, so a stale write's message says "another call, here or on another device", not "another device".
- **The vault's own records** get no-lost-update, not order: a gate write carries the standing `gate_epoch` and a stale one refuses, a `del` carries the `vault_tok`, and the pantry holds one lease per scope, the last put standing.

### A transactional step

A step is: a synchronous check, what the step needs taken into locals, then one awaited I/O. JavaScript runs a continuation's synchronous code without interleaving, so the check and the take are one atom; the fields move only in a commit, which is itself synchronous and lands between steps, never inside one. `ensureUnlocked(): Promise<this>` hands back the same object, consistent at the moment the continuation runs; the `demandUnlocked()` right after it is what that promise means. `demandUnlocked()` reads the clock: a deadline found passed drops the lease and refuses, as the ruling on when a lease stops counting says.

An attempt's steps are the same shape, and its check is `demandGating()`: the gating stands, neither landed by a lock nor gone. It opens the derive, the `putLease`, and the attach. The attach is the one place in the core where a check follows an await by design, and it is named here so that no worker omits it or hides it: without it, a lock during an attempt leaves the vault unlocked, in memory and in the pantry, across reloads.

### What a read takes up

- **A lease is taken up at birth only.** `bank.ensureVault`'s read takes up the pantry's lease when it matches the props and opens. After birth, the lease in hand is this Vault's own: the read's judgment can drop it, on a revocation or on gone, and never takes one up. Another tab's unlock reaches this tab at its next `ensureUnlocked()`, through the gating's pantry consult. So the read's judgment is synchronous, and a read in flight across a lock cannot re-attach what the lock dropped.
- **A read older than what is in hand is ignored.** Props of the same `vault_tok` at a lower `gate_epoch` or `vault_epoch` than in hand, or a pantry lease at an epoch above the props, are this device's own write landing after a read that was served before it. The read is ignored, the picture marked aged, nothing dropped and nothing erased. Data cannot tell that from a restored backup, so *behind* is judged at birth only, against the device record's highest `vault_epoch` for the scope across its lives, raised by a store-side max. The preplan's row that made a lower epoch *gone* is withdrawn.
- **A revocation drops and does not erase.** Props at a `gate_epoch` above the one in hand drop the lease in memory and replace the listing; the pantry record is left for the next grant to overwrite, since an unconditional erase can take another tab's fresh lease with it. A lease is erased by `lock()`, and discarded at birth when it does not match. Erasing on a judgment needs a conditional delete the DeviceDB does not have; flagged, not built.

A call that seems to need more than this is written up as the scenario and what the user would see, and nothing is built. Flagged and left: a read's commit of an older listing landing over a box write's commit, corrected at the next read; a `vault_full` refusal judged on a listing a read in flight is about to replace; the conditional delete above.

## Lock

Two operations, not one. `#dropLease()` is the memory-only drop: `this.#lease = null`, the expiry disarmed, `replaceSnapshot()`. It serves the expiry at `askPassphraseAt`, `close()` and `bank.closeVault` (the lease stays in the pantry), `demandUnlocked()` finding the deadline passed, and the read's revocation. A timer is no lock: the expiry neither erases, since another tab may hold a renewed lease under the same scope, nor lands on the gating, so an attempt made in the twilight completes.

`lock()` does not get in line, and awaits nothing before it acts. In order: `this.#lease = null`; the expiry disarmed; the gating landed on, so its attempt discards at its next step and its waiters refuse `vault_locked`; the erase of the pantry's lease issued, not yet awaited; `replaceSnapshot()`, whose listeners run synchronously and may call back in; then the erase awaited, refused as the device store said when it fails, since that record would otherwise be taken up at the next birth. Gone lands on the gating the same way, so the old dialog closes and the old attempt cannot write a lease under the new object's scope.

**Work under way when a lock lands** completes or throws by its own contract, which is not uniform and is not changed by this sprint: `putBox` refuses `vault_locked` when the lock lands before the seal, by its check after the read, and lands when the lock comes during the seal or the write; `delBox` lands; `getBox`, `getWhisper`, `decryptWhisper` and `useWhisper` refuse `vault_locked` after their read or open; `del` locks first. A call that has not yet passed `ensureUnlocked()` does not commence: it prompts. `putWayin` and `delWayin` today attach their regranted lease after a lock; under `demandGating()` they discard it, a change that needs the ruling below.

A lease counts until a lock lands, or `demandUnlocked()` finds its deadline passed. Its twilight only makes `ensureUnlocked()` prompt. Cancelling a gating declines that prompt; it is not a lock.

## Names on the vault

- `get unlocked: boolean`, `demandUnlocked(): true`, `ensureUnlocked(): Promise<this>`: the state, its demand, its ensure. `hello(): Promise<this>` likewise.
- `replaceSnapshot()`: synchronous; rebuilds the immutable snapshot from the fields and, if it changed, swaps it and calls the listeners. The `useSyncExternalStore` half of every state change.
- `grantLease(proving): Promise<Lease>`: the proving opens the gate for the vaultKey, the lease is wrapped under the device key, written to the pantry and attached, each step opened by `demandGating()`. Whether the write is `lease.put()` or `vault.putLease(lease)` is decided by the code: the latter if the write and the attach must be one step.
- `gateOf(proving): Gate` and `putGate(gate): Promise<this>` for a novel vault: the way in sealed, the props written at `gate_epoch` 1 expecting 0, a stale write `gate_made_elsewhere`. Then `grantLease(proving)`. `putVaultProps` resolving the stored props is a prerequisite, so `vault_epoch` is in hand after the write.
- `gating.attempt(cleartext)` is the one door for cleartext and the one place that branches, by the state in hand. No vault method takes cleartext, and there is no `unlock()`. A naked client answers the `requestCleartext` it registered with the bank; tests get a helper that does.
- A proving is the noun. Nothing is called a proof.

## Tests

`vault-turns.test.ts` pins contracts, not an order: two hellos sharing one refresh, and a ring during a refresh satisfied by it; two `ensureUnlocked()` sharing one gating and both resolving; several puts in flight resolving in storage's order; each box call's own outcome when a lock lands mid-call; a lock during an attempt, which discards; a cancel that declines and does not lock; the expiry during a twilight attempt, which completes; a read served before this tab's own gate write and delivered after it, ignored. The helpers exist in `tests/test-helpers/timing.ts` and `tests/vault/world.ts`, with one gap: holding a call's answer after storage served it lives only as local helpers in `vault-hello.test.ts`, and is promoted to `TH.holdNextAnswer`. Waiters' outcomes are asserted as a set, never in order.

## Transactional primitives

The primitives, the gate-level boundary, the external interface and the composition rule live in the contract doc's *Primitives* tab: https://claude.ai/artifact/J8ooBpFq7tyAAPFrxb3qRq#64b6b619-ee17 . The sections above this one still read in the earlier terms (`demandUnlocked`, `demandGating`, a late refresh ignored) and are rewritten in the primitives' terms once point 1 and the after-write refusal are ruled.

## Rulings this text assumes

1. **One named check after an await:** `demandGating()` at the attach. The alternative is a lock that an unlock in flight overrides, durably.
2. **A late read of one's own write is ignored, not gone and not behind.** This withdraws the preplan's lower-epoch row and narrows the ruling that inconsistency means reload: props of another `vault_tok`, or none, still mean gone. *Behind* is judged at birth.
3. **A lease is taken up at birth only.** Another tab's unlock shows in this tab at its next `ensureUnlocked()`, not at its next read.
4. **The expiry drops and does not erase or land on the gating.** `putWayin` and `delWayin` under a lock discard their regranted lease: a contract change.
5. **No erase on a judgment** until the DeviceDB has a conditional delete; flagged.

## For the tradeoffs section, later

A client that needs ordered box calls needs a queue of its own. The tradeoffs section should say so, and either give the prompt for the semantics an agent should implement, or supply a basic one that is simple and unsatisfactory the other way: every get and put serialized.
