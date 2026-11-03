# Unrace: pre-plan for a `/sprint`

Written 2026-11-03, for the agent running `/sprint`. Sprint name: `unrace`. Mode: normal. Three threads at once. Cut
threads from `origin/main`.

## The sprint goal

> End-to-end demonstration of the core featureset to let the react demo work, using code that exemplifies "clarity
> causes security"

The Coach: "From there, we can examine any race conditions." Keep attention here, not on fiddly details such as
`autolockMinutes`. The work is in `packages/safebyok/src/models/`, against an in-memory vaultDB. Wiring it to the demo, to
`src/index.ts`, or to a real store comes after this sprint.

## No concurrency machinery

Every worker and reviewer reads this section. The Coach:

> I cannot stress this enough: do not let code reviewers browbeat you into putting concurrency mechanisms into the the
> code to guard against cloudcuckooland race conditions. We can't treat them casually, but the thing that has happened
> twice is this: one agent decides that a certain race condition needs defense, so they add a counter, stretching out
> the cross section of if-then's to analyze. those then multiply the branching analysis until another one creeps in.

* **A race is a bug to fix if it exposes information or keeps a lease that should drop.** Any other race goes in the thread
  file as a row: the crossing, what the user sees, how likely by `crossings.md`. It doesn't block the thread. The Coach
  reads these rows after the end-to-end demonstration.
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
1 storable_send ── 2 timerless ──┐
4 gate_proving ──────────────────┴── 5 vault_seams ── 6 gating ──┐
3 vault_db_new ──────────────────────────────────────────────────┴── 7 bank ── 8 shapes_sweep
```

Threads 1, 3 and 4 start together.

### 1. `storable_send`

*"simplify the storable class -- removing the held `staged` variable and combined overlay in favor of only offering a
direct `send({ whisper?, sidecar? }, opts)`"*

* **Read:** `unrace-gating.md` *`send`*; `models-invariants.md` *Box*.
* **Touches:** `models/storable.ts`, `box.ts`, `vault.ts`, `listing.ts`, their tests, `tests/test-helpers/models-world.ts`.
* **Look-ahead:** `Vault` keeps a `send(patch)`; only Box's patch is `{ whisper?, sidecar? }`, so keep the Storable generic.
  Leave the Trigger to thread 2.
* **Size:** large, mostly deletion. **Depends on:** nothing.

### 2. `timerless`

*"The timer is the wrong mechanism for autolock. A 0-7day js timer for a webpage that will page out every second to hour
is feckless. Storables should lose their timer, handing it instead to listing or bank"*

*"bank.hello calls tidy and that's it. the host can handle crashes and retries and calling tidy if their hello doesn't run
on pageload for some reason."*

* **Read:** `unrace-gating.md` *Notable Changes*; `models-invariants.md` *Vault*, *Lease*.
* **Touches:** `models/storable.ts`, `lease.ts`, `listing.ts`, `vault-listing.ts`, `box-listing.ts`, `models-shapes.ts`.
* **Items:**
  1. The Storable and the lease lose their `Trigger`s; the refresh timer moves to the listing.
  2. `ensureTimely(maxMillis)`, the `Promptly` constant (2,000 ms for now), and `vault.fetch`'s join.
  3. A lease records when it was proved, by kind of proving, in place of `autolock_at`. `lease.peek` makes no autolock check.
* **Also:** "pull pester for the time being": its timer and `pesterMinutes` go.
* **Look-ahead:** the deviceDB's range scan is thread 5's; `bank.tidy` is thread 7's.
* **Size:** medium. **Depends on:** 1.

### 3. `vault_db_new`

*"copy src/vault-db to src/storage/vault-db-new, strip its doc blocks, and have it instead offer the interface described in
our -vaultdb file. It should delegate down to generic methods: i.e. although the new vault-db offers addPasskey, the
subclass layer will do putVault, getVault, etc. Only implement the in-memory one."*

* **Read:** `vaultdb-invariants.md`, whole.
* **Touches:** new `src/storage/vault-db-new.ts`, `src/storage/memory-vault-db.ts`, a test. The source is the single file
  `src/vault-db.ts`; leave it and its tests alone.
* **Names:** the spec's lower table's `putWayins`, `putPasskey` and `delPasskey` are the upper table's `replacePassphrase`,
  `addPasskey` and `revokePasskey`, the names to use. Its own note asks to correct `prior_revision_*`; `unrace-gating.md`
  *Required* says `prior_rev_tok` and `prior_rev_seq`.
* **Layers:** the base holds the invariants, and a subclass writes only generic calls, each atomic on `revision_tok`. A gate
  verb in the base is a get, the integrity checks, the wayin laid on, and a put conditional on the prior revision.
* **`ifPresent`:** expect both the store and `Storable` to have a part in deciding it.
* **Tests:** the rows the end-to-end run depends on, against the in-memory store.
* **Look-ahead:** thread 7 adapts this to the models' `Store`, so don't change `Store` here.
* **Size:** medium. **Depends on:** nothing.

### 4. `gate_proving`

*"Implement Bank Gate, Gating, Wayin, Proving in models/* according to the new interface, removing anything that seems
obsoleted."* This thread takes Gate, Wayin and Proving.

* **Read:** `unrace-gating.md` *The provings*; `models-invariants.md` *Proving*, *Gate*; G1 to G3, G8 and G9 in
  `notes/guarantees.md`.
* **Touches:** `models/gate.ts`, `wayin.ts`, `proving.ts`, their tests, `tests/test-helpers/proving-world.ts`.
* **Look-ahead:** `buildLease` records the kind of proving; agree the field with thread 2 in the progress document. A proving
  hears the vault only through `leaseFriend`, which thread 5 builds, so test with a fake friend.
* **Levels:** `high` review, `opus` worker: this is the key handling.
* **Size:** medium. **Depends on:** nothing.

### 5. `vault_seams`

*"yes Lease, Vault and Listing too."*

* **Read:** `models-invariants.md` *Vault*, *Vault listing*, *Lease*; `unrace-gating.md` *The lease*, *The discards*.
* **Touches:** `models/vault.ts`, `lease.ts`, `vault-listing.ts`, `listing.ts`, `box.ts`.
* **Items:**
  1. The lease seams: `leaseFriend`, `#attachLease`, `#renewLease`, `#vacateLease`, and the seal verbs.
  2. The discards, down the chain.
  3. The slot: `#deliver`, the tombstone a delete leaves, `ensureVault` replacing the object over gone or void. A newer record
     over a tombstone replaces it. A record of another `vault_tok` over a live vault does as `bank.getBank`'s row does.
  4. The deviceDB's `cache`, `peek`, `vacate` and `leasesProvedBefore`, with an in-memory one for thread 7.
* **Levels:** `opus` worker. **Size:** large. If it runs long, split off item 3. **Depends on:** 2, 4.

### 6. `gating`

The Gating half of the text in thread 4.

* **Read:** `unrace-gating.md` from *`build_vault`* through *`del_vault`*; `models-invariants.md` *Gating*.
* **Touches:** `models/gating.ts`, a new `tests/models/gating.test.ts`, each vault verb that launches one.
* **`gating.decline` crossing an attempt:** the system is being asked to lock and unlock at the same time, and we have no
  opinion. Select whichever implementation feels the cleanest to reason about, and keep it simple. The doc's choice is only a
  default.
* **Levels:** `opus` worker. **Size:** large. **Depends on:** 5.

### 7. `bank`

The Bank half of the text in thread 4.

* **Read:** `unrace-gating.md` *`bank.hello`*; `models-invariants.md` *Bank*, *Public*.
* **Touches:** `models/bank.ts`, a new `tests/models/bank.test.ts`, an adapter from `vault-db-new` to `Store`.
* **The sprint's proof, one end-to-end test:** hello, build, seal and unseal a box, lock, unlock, delete, rebuild over the
  tombstone, and a fresh Bank on the same stores picking up the lease. Replacing the passphrase, adding and revoking a
  passkey, and `tidy` locking one past autolock follow it; if one of those sticks, file the rest and say so.
* **Size:** medium. **Depends on:** 3, 6.

### 8. `shapes_sweep`

*"move checkers to the models' shapes files and define types from them. It's good to reuse shapes defined in the src/
directory but don't modify them in a way that would fail their tests, just copy instead."*

Earlier threads do this for what they rewrite, as they go. This thread takes what's left.

* **Touches:** `models/*`.
* **Also:** `unrace-gating.md` *Guarantees to amend* and *Rows for `notes/wontfix.md`*.
* **Levels:** `sonnet`, `low` review, except the guarantees. **Size:** small. **Depends on:** 7.

## For the Coach

Each has a default above, so nothing blocks the sprint: `Promptly`'s value; whether an idempotent `revoked` with no passkey
moves the revision (default no); the real name of `gate.adoptWayins`; the refusal name `locked?`.
