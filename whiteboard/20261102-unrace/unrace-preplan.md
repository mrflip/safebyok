# Unrace: pre-plan for a `/sprint`

Written 2026-11-03, for the agent running `/sprint`. Sprint name: `unrace`. Mode: normal. Three threads at once. Cut
threads from `origin/main`.

## The sprint goal

> End-to-end demonstration of the core featureset to let the react demo work, using code that exemplifies "clarity
> causes security"

The proof is a test that drives `subscribe` and `getSnapshot` end to end. The Coach: "From there, we can examine any race
conditions." Keep attention here, not on fiddly details such as `autolockMinutes`. The work is in
`packages/safebyok/src/models/`, against an in-memory vaultDB. Wiring it to the demo, to `src/index.ts`, or to a real store
comes after this sprint.

## No concurrency machinery

Every worker and reviewer reads this section. The Coach:

> I cannot stress this enough: do not let code reviewers browbeat you into putting concurrency mechanisms into the the
> code to guard against cloudcuckooland race conditions. We can't treat them casually, but the thing that has happened
> twice is this: one agent decides that a certain race condition needs defense, so they add a counter, stretching out
> the cross section of if-then's to analyze. those then multiply the branching analysis until another one creeps in.

* **The goal: when lock is called, nothing crosses it.** We get there with simple code that can be analyzed in context, not
  by fine-tuning each crossing around a library that can't yet run end to end.
* **Raise a crossing in one sentence,** in the thread file, for `crossings.md`. It doesn't block the thread. If it exposes
  information or keeps a lease that should drop, say so first, and fix it if that adds no machinery. If it's trivially easy,
  demonstrate the behaviour with one passing test in `tests/models/halpimonfire.test.ts`; if not, the sentence is enough.
* **Some things we don't and won't guarantee,** such as the ordering of simultaneous gets, puts and dels of a box, or even
  how many will succeed. A reviewer doesn't ask for them.
* **Add new methods the docs don't name, but not new concurrency machinery "unforseen by the spec or the old code",**
  especially retries or joins. Whatever the specs draw is fine.
* **The tests outside `tests/models/` are no bar for this code.** The Coach: they "are running against a codebase of
  unwarranted complexity leading to more and more tests around less and less impactful edge cases".

## Read first

In `whiteboard/20261102-unrace/`, by section: `rg -n '^#' <file>`, then the sections your thread names. **These three are
authoritative for the interface, governed by common sense and a recognition that they are a design draft.** The Coach:
"Don't drive yourself off a cliff following a typo by me."

* `models-invariants.md`: the seams, as tables. Read its legend and *Preconditions* first.
* `unrace-gating.md`: each operation's steps and their order. Read *Notable Changes* first.
* `vaultdb-invariants.md`: the vaultDB's verbs, refusals and postconditions.

Below them, fall back to the code in `src/models/`. A disagreement you had to settle goes in your thread file. `noted.md`
has the reasons behind the rulings, and `crossings.md` the timings.

## Ground rules

* **The code in `packages/safebyok/src/`, outside `models/`, is radioactive.** The Coach: "browsing it causes agents to
  start writing doc blocks in the slop'iest manner possible. So read what you must, but do not follow its implementation,
  comment style, or raging paranoia."
* **A method that changes state has this shape.** The Coach:
  1. validate args and field preconditions with zod
  2. check your starting invariants with ensureX demandX guards
  3. establish your finishing invariants.
  4. define the smallest critical window reasonable. if the preconditions are not met at both ends (eg a lock came down),
     fail
* **Small primitives, straight code paths, tight invariants.** Event crossings or unmet invariants are solved by throwing.
* **Each update establishes its invariants as it comes in.** The Coach: "as each update comes in, it should transactionally
  establish its invariants. where those invariants are non-commutative, it will require either a higher-level coordinator,
  or resolution by the host, or most likely advice to host about how to make the ordering predictable."
* **The models are independent of the old code,** apart from helpers, checks and the like. The old code stays as it is:
  don't disable it, touch it, or read its tests. Within `models/`, a thread that removes something moves its callers, or
  leaves it for the thread that moves the last one, so `pnpm justify` stays green.
* **Use common sense on fields.** Where a spec needs a field the shapes lack, `gate_epoch` for one, add it.
* **Go light on doc blocks.** The Coach: "They should rarely be longer than a couple lines if your methods are working
  correctly." `vault-db-new` has none. Reviewers: don't raise STYLE.md's *every export has a doc block* in this sprint. If a
  lint rule demands one, report it rather than pad.
* **Remove "anything that seems obsoleted",** and list what went in the PR. The tables only list interesting rows, so a
  missing row alone doesn't make something obsolete. New tests follow the spec's interesting rows.
* **Nothing reaches `src/index.ts`,** so a PR needs only `pnpm changeset --empty`. Before changing `proving.ts`, `lease.ts`
  or `gating.ts`, read *The guarantees* in `notes/guarantees.md`.

## Threads

Levels: review `medium`, and the workers' and reviewers' own model and effort, unless a thread says otherwise. The italic
text is the Coach's.

```text
1 storable_send ── 3 timerless ──┐
2 vault_db_new ──────────────────┴── 5 store_switch ──┐
4 gate_proving ───────────────────────────────────────┴── 6 lease_seams ── 7 vault_slot ──┬── 8 vault_boxes ─────┐
                                                                                          └── 9 gating ── 10 gate_changes ─┴── 11 bank ── 12 shapes_sweep
```

Threads 1, 2 and 4 start together.

### 1. `storable_send`

*"simplify the storable class -- removing the held `staged` variable and combined overlay in favor of only offering a
direct `send({ whisper?, sidecar? }, opts)`"*

*"drop caches for this sprint yes"*

* **Read:** `unrace-gating.md` *`send`*; `models-invariants.md` *Box*.
* **Touches:** `models/storable.ts`, `box.ts`, `vault.ts`, `listing.ts`, `vault-listing.ts`, `box-listing.ts`, their tests,
  `tests/test-helpers/models-world.ts`.
* **Also:** the device cache of vault and box records goes (`Cache`, `cacheOnDevice`). Leases and the device record stay cached.
* **`vault.send` goes, and its tests with it.** `VaultPatch`, `vaultPatch`, `GateStaging` and `Vault.edit` go too, and `send`
  and its patch hooks move down to `Box`, so `Storable` loses `PatchT`. The Coach: tests kept "for something nobody wants,
  constraining design" make this no win. Delete, don't port, `vault.test.ts` *Vault.edit and Vault.send* and the
  `vaultPatch` cases in `models-shapes.test.ts`. `storable.test.ts`'s send tests drive a box, and stay.
* **Look-ahead:** leave the Trigger to thread 3. A vault birth and `#sendGate` keep one protected stopgap over `listing.put`
  until threads 9 and 10 replace them; tests that call `vault.send({})` only to store a birth move to it.
* **Size:** large, mostly deletion. **Depends on:** nothing.

### 2. `vault_db_new`

*"copy src/vault-db to src/storage/vault-db-new, strip its doc blocks, and have it instead offer the interface described in
our -vaultdb file. It should delegate down to generic methods: i.e. although the new vault-db offers addPasskey, the
subclass layer will do putVault, getVault, etc. Only implement the in-memory one."*

* **Read:** `vaultdb-invariants.md`, whole.
* **Touches:** new `src/storage/vault-db-new.ts`, `src/storage/memory-vault-db.ts`, a test. The source is the single file
  `src/vault-db.ts`, read once to copy; leave it and its tests alone.
* **Names:** the spec's lower table's `putWayins`, `putPasskey` and `delPasskey` are the upper table's `replacePassphrase`,
  `addPasskey` and `revokePasskey`, the names to use. Field names for the prior revision differ between the specs: pick one.
* **Params:** a gate verb's are shaped exactly like a vault record holding a gate that holds the wayin (the spec has them).
* **Layers:** the base holds the invariants, and a subclass writes only generic calls, each atomic on `revision_tok`. A gate
  verb in the base is a get, the integrity checks, the wayin laid on, and a `putVault` conditional on the prior revision. Every
  store cascades a vault's boxes transactionally.
* **`ifPresent`:** expect both the store and `Storable` to have a part in deciding it.
* **Watch:** the spec has notification rows and no verb; offer an optional one, as nothing may count on it.
* **Tests:** the rows the end-to-end run depends on, against the in-memory store.
* **Size:** medium. **Depends on:** nothing.

### 3. `timerless`

*"The timer is the wrong mechanism for autolock. A 0-7day js timer for a webpage that will page out every second to hour
is feckless. Storables should lose their timer, handing it instead to listing or bank"*

*"bank.hello calls tidy and that's it. the host can handle crashes and retries and calling tidy if their hello doesn't run
on pageload for some reason."*

* **Read:** `unrace-gating.md` *Notable Changes*; `models-invariants.md` *Vault*, *Lease*.
* **Touches:** `models/storable.ts`, `lease.ts`, `vault.ts`, `bank.ts`, `listing.ts`, `models-shapes.ts`.
* **Items:**
  1. The Storable and the lease lose their `Trigger`s. The refresh timer is deferred, so nothing replaces it for now.
  2. `ensureTimely(maxMillis)`, the `Promptly` constant (2,000 ms for now), and `vault.fetch`'s join.
  3. A lease records `proved_at` and the kind of proving, in place of `autolock_at`. `lease.peek` makes no autolock check.
* **Also:** "pull pester for the time being": its timer and `pesterMinutes` go.
* **Size:** medium. **Depends on:** 1.

### 4. `gate_proving`

*"Implement Bank Gate, Gating, Wayin, Proving in models/* according to the new interface, removing anything that seems
obsoleted."* This thread takes Gate, Wayin and Proving.

*"Lease.grant wants the pojo vaultFriend."*

* **Read:** `unrace-gating.md` *The provings*; `models-invariants.md` *Proving*, *Gate*; G1 to G3, G8 and G9 in
  `notes/guarantees.md`.
* **Touches:** `models/gate.ts`, `wayin.ts`, `proving.ts`, `lease.ts`'s factory, `models-shapes.ts`, their tests,
  `tests/test-helpers/proving-world.ts`.
* **Look-ahead:** this thread sets the lease factory's signature, on the friend and not the vault, and adds `gate_epoch`. The
  friend's real maker is thread 6's, so test with a fake one. The attempt spends a `passkeyClear`, never the statics. Write no
  new `gate.with*`; `gate.ts`'s `withPassphraseReplaced`, `withPasskeyAdded` and `withPasskeyRevoked` stay for `vault.ts`
  until thread 10.
* **Levels:** `high` review, `opus` worker: this is the key handling.
* **Size:** medium. **Depends on:** nothing.

### 5. `store_switch`

*"I had contemplated the vault-db-new as one of the earliest things, switching the storables over to it after the `staged`
stuff was debrided"*

* **Touches:** `models/storable.ts`, `listing.ts`, `vault-listing.ts`, `box-listing.ts`, `models-shapes.ts`,
  `tests/test-helpers/models-world.ts`.
* **Look-ahead:** the storables and listings call `vault-db-new` directly, and `Store` goes, with no adapter between them.
* **Size:** medium. **Depends on:** 2, 3.

### 6. `lease_seams`

*"yes Lease, Vault and Listing too."*

* **Read:** `models-invariants.md` *Vault*, *Lease*; `unrace-gating.md` *The lease*, *The discards*.
* **Touches:** `models/vault.ts`, `lease.ts`, `box.ts`, `box-listing.ts`.
* **Items:** `leaseFriend`, `#attachLease`, `#renewLease`, `#vacateLease`, the seal verbs, and the discards down the chain.
  The vault's seal verbs lock on `damaged_lease`.
* **Unsealing:** *"have lease do the decode and fill; it owns security. box does the deserialization"*. `box.#unseal` decodes
  and fills today.
* **Levels:** `opus` worker. **Size:** medium. **Depends on:** 4, 5.

### 7. `vault_slot`

* **Read:** `models-invariants.md` *Vault listing*.
* **Touches:** `models/vault-listing.ts`, `listing.ts`, a deviceDB.
* **Items:**
  1. The slot: `#deliver`, the tombstone a delete leaves, `ensureVault` replacing the object over gone or void. A newer record
     over a tombstone replaces it. A record of another `vault_tok` over a live vault does as `bank.getBank`'s row does. A
     tombstone over a live vault reaches a local delete's end state.
  2. The deviceDB's `cache`, `peek`, `vacate`, `leasesProvedBefore` and the device record, with an in-memory one.
* **Levels:** `opus` worker. **Size:** medium. **Depends on:** 6.

### 8. `vault_boxes`

*"vault_boxes yes."*

* **Read:** `models-invariants.md` *Box*, *Box listing*, *Public*; `unrace-gating.md` *Notable Changes* for the box birth.
* **Touches:** `models/vault.ts`, `box.ts`, `box-listing.ts`.
* **Items:** `vault.hello` and `boxListing.hello`, run on the first box call, as a host wanting them sooner can run a task
  queue; `getBox`, `putBox`, `delBox`, `extractWhisper`; the box
  birth; the sidecar-only `send`.
* **Postponed:** `useWhisper`, `expose` and the whisper a box holds. Leave their code unless it's in the way.
* **Size:** medium. **Depends on:** 7.

### 9. `gating`

The Gating half of the text in thread 4.

* **Read:** `unrace-gating.md` *`build_vault`*, *`unlock_vault`*; `models-invariants.md` *Gating*.
* **Touches:** `models/gating.ts`, a new `tests/models/gating.test.ts`, `vault-listing.ts`, the verbs that launch one.
* **Items:** `launch`, `attempt`, `build_vault`, `unlock_vault`.
* **`gating.decline` crossing an attempt:** the system is being asked to lock and unlock at the same time, and we have no
  opinion. Select whichever implementation feels the cleanest to reason about, and keep it simple. The doc's choice is only a
  default.
* **Levels:** `opus` worker. **Size:** medium. **Depends on:** 7.

### 10. `gate_changes`

* **Read:** `unrace-gating.md` *Changing the gate* through *`del_vault`*; `models-invariants.md` *The runs*.
* **Touches:** `models/gating.ts`, `vault.ts`, `vault-listing.ts`, `gate.ts`.
* **Items:** `replace_passphrase`, `add_passkey`, `revoke_passkey`, `del_vault`, and `vaultListing`'s verbs for them.
* **Gate:** it ends as a read-only view plus `demandPasskeyAddable`; its `with*` and `#sendGate` go. Params spread the record
  the attempt read, not the live vault. Rewrite `vault-gate.test.ts` to the spec's rows; don't port it.
* **Levels:** `opus` worker. **Size:** medium. **Depends on:** 9.

### 11. `bank`

The Bank half of the text in thread 4.

* **Read:** `unrace-gating.md` *`bank.hello`*; `models-invariants.md` *Bank*, *Public*.
* **Touches:** `models/bank.ts`, a new `tests/models/bank.test.ts`.
* **Items:** `bank.hello`, `tidy`, the discards, `identity_revoked` vacating, and the snapshot fields.
* **The sprint's proof, one end-to-end test driving `subscribe` and `getSnapshot`:** hello, build, seal and unseal a box, lock,
  unlock, delete, rebuild over the tombstone, and a fresh Bank on the same stores picking up the lease. Replacing the
  passphrase, adding and revoking a passkey, and `tidy` locking one past autolock follow it; if one of those sticks, file the
  rest and say so.
* **Levels:** `opus` worker. **Size:** large: this is where the threads first meet. **Depends on:** 8, 10.

### 12. `shapes_sweep`

*"move checkers to the models' shapes files and define types from them. It's good to reuse shapes defined in the src/
directory but don't modify them in a way that would fail their tests, just copy instead."*

Earlier threads do this for what they rewrite, as they go. This thread takes what's left.

* **Touches:** `models/*`.
* **Also:** `unrace-gating.md` *Guarantees to amend* and *Rows for `notes/wontfix.md`*.
* **Levels:** `sonnet`, `low` review, except the guarantees. **Size:** small. **Depends on:** 11.

## For the Coach

Each of these has a default above, so none blocks the sprint: `Promptly`'s value; whether an idempotent `revoked` with no
passkey moves the revision (default no); the refusal name `locked?`.
