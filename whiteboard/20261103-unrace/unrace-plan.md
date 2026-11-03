# Sprint unrace: plan

* **Date:** 2026-11-03. **Mode:** YOLO (the invocation; the pre-plan's "normal" is overruled).
* **Issued by:** the Coach, from `whiteboard/20261102-unrace/unrace-preplan.md`, "partially written by an agent: use
  independent judgement". Departures from it are marked *Orchestrator:* and listed under *Bent from the pre-plan*.
* **Levels:** review `medium`; worker and reviewer inherit the orchestrator's `claude-opus-5-5`, at their own effort;
  style pass `sonnet` (`style-reviewer`'s pin). **Three threads at once.**
* **Status:** threads 1 to 13, 15 and 17 filed, the proof green; 13, 15 and 17 sit side by side on 12, to be restacked into a line. The Coach: "You can keep going; don't schedule new work around the closer look responses until we triage." 16 is cancelled; 21, 22 and then 14 finish this sprint. The Coach agreed to close after those, so 18, 19 and 20 move to a new sprint, seeded in `unrace-next.md`. The Coach, on permissions: "You and workers may manage your prs and force push with lease using gh or git". Line: main → #449 → #453 → #450 → #454 → #452 → #451 → #455 → #456 → #457 → #458 → #459 → #460.

## The goal

> End-to-end demonstration of the core featureset to let the react demo work, using code that exemplifies "clarity
> causes security"

The proof is a test that drives `subscribe` and `getSnapshot` end to end (thread 13). The Coach: "From there, we can examine
any race conditions." Everything else serves that. A thread that finds itself polishing what the proof does not reach stops
polishing.

**What runs after each thread** (the ladder; each thread's report says how far up it got):

| After | What a test can drive, in-memory, with no old code |
| --- | --- |
| 1, 5 | a box's `send` over a stopgap; no staged state, no cache, no timer |
| 2 | every vaultDB verb, by itself |
| 3 | a Proving's attempt and a lease from it, on a fake friend |
| 4 | the deviceDB's lease and device-record verbs, by themselves |
| 6 | the storables and listings over `vault-db-new` |
| 7 | a vault locking and unlocking on a proving; seal and unseal through the vault |
| 8 | the vault slot: ensure, deliver, tombstone, replace |
| 9 | `getBox`, `putBox`, `delBox`, `extractWhisper` on an unlocked vault |
| 10 | `build_vault`, `lock`, `unlock_vault` through a real gating |
| 11 | `replace_passphrase`, `add_passkey`, `revoke_passkey`, `del_vault` |
| 12 | `bank.hello`, `tidy`, the discards, the snapshot |
| 13 | **the proof** |

## Read first

In `whiteboard/20261102-unrace/`, by section (`rg -n '^#' <file>`). A design draft. The Coach, 2026-11-03: "it was wrong of me to
state that those code paths were "authoritative", they are pseudo code as a design artifact." Common sense and good practice win.

* `models-invariants.md`: the seams, as tables. Its legend and *Preconditions* first.
* `unrace-gating.md`: each operation's steps and their order. *Notable Changes* first.
* `vaultdb-invariants.md`: the vaultDB's verbs, refusals and postconditions.

Below them, the code in `src/models/`. A disagreement you had to settle goes in your thread file. `noted.md` has the reasons
behind the rulings, `crossings.md` the timings.

## Ground rules

Quoted into every handoff.

**No concurrency machinery.** The Coach:

> I cannot stress this enough: do not let code reviewers browbeat you into putting concurrency mechanisms into the the
> code to guard against cloudcuckooland race conditions. We can't treat them casually, but the thing that has happened
> twice is this: one agent decides that a certain race condition needs defense, so they add a counter, stretching out
> the cross section of if-then's to analyze. those then multiply the branching analysis until another one creeps in.

* The goal: when lock is called, nothing crosses it. We get there with simple code analyzed in context.
* Raise a crossing in one sentence, in the thread file, for `crossings.md`. It blocks nothing. If it exposes information or
  keeps a lease that should drop, say so first, and fix it if that adds no machinery. If trivially easy, show the behaviour
  with one passing test in `tests/models/halpimonfire.test.ts`.
* Not guaranteed, and a reviewer does not ask: the ordering of simultaneous gets, puts and dels of a box, or how many succeed.
* New methods the docs don't name are fine. New concurrency machinery "unforseen by the spec or the old code" is not,
  especially retries or joins. What the specs draw is fine.
* Tests outside `tests/models/` are no bar for this code.

**The method shape.** The Coach: (1) validate args and field preconditions with zod; (2) check starting invariants with
ensureX demandX guards; (3) establish finishing invariants; (4) define the smallest critical window reasonable: if the
preconditions are not met at both ends (eg a lock came down), fail. Small primitives, straight code paths, tight invariants.
Event crossings or unmet invariants are solved by throwing.

**The code.**

* `packages/safebyok/src/` outside `models/` is radioactive: read what you must; do not follow its implementation, comment
  style, or raging paranoia. Helpers and checks may be reused. Don't disable, touch, or read the tests of the old code.
* Within `models/`, a thread that removes something moves its callers, or leaves it for the thread that moves the last one,
  so `pnpm justify` stays green. Remove "anything that seems obsoleted" and list it in the PR. The spec's tables list only
  interesting rows: a missing row alone obsoletes nothing, and new tests follow the interesting rows.
* A doc block is one or two 120-character lines giving the purpose. The Coach, 2026-11-03: "listing every refusal possible is
  foolish, wastes tokens and metastasizes". Never a line narrating the parameters or restating the signature. Reviewers don't
  raise STYLE.md's *every export has a doc block*; a lint rule demanding one is reported, not padded.
* `try*` answers an Outcome; the plain verb throws. Throw through small factories, never `new VaultError` inline. No
  catch-and-relabel, except where a host function hears a clear (G8). Key-handling zeroes its bytes in `try/finally`.
  Checkers and the types made from them live in `models-shapes.ts`. New writing says *cached*, never *kept*. A test backdoor
  is `_cheat_<what it returns>`.
* Use common sense on fields: where a spec needs one the shapes lack, add it.
* Nothing reaches `src/index.ts`, so `pnpm changeset --empty`, and no size budget moves: `src/models/` is in no entry. Before
  changing `proving.ts`, `lease.ts` or `gating.ts`, read *The guarantees* in `notes/guarantees.md`.
* Per-commit checks use `git switch --detach`, never `rebase --exec` (GIT_DIR leaks into `tests/scripts/`).

## Threads

```text
1 storable_send ── 5 timerless ──┐
2 vault_db_new ──────────────────┴── 6 store_switch ──┐
3 gate_proving ───────────────────────────────────────┤
4 device_db ──────────────────────────────────────────┴── 7 lease_seams ── 8 vault_slot ──┬── 9 vault_boxes ──────┐
                                                                                          └── 10 gating ── 11 gate_changes ─┴── 12 bank ── 13 proof ── 14 shapes_sweep
```

Threads 1, 2 and 3 start together; 4 takes the first free slot. The merge line, as restacks make it: main → 1 → 5 → 2 → 6 →
4 → 3 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → the sprint PR. Italic text is the Coach's.

### 1. `storable_send` (pre-plan 1)

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
* **Look-ahead:** leave the Trigger to thread 5. A vault birth and `#sendGate` keep one protected stopgap over `listing.put`
  until threads 10 and 11 replace them; tests that call `vault.send({})` only to store a birth move to it.
* **Size:** large, mostly deletion. **Depends on:** nothing.

### 2. `vault_db_new` (pre-plan 2)

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
* *Orchestrator:* stay out of `models-shapes.ts`: it is threads 1 and 3's this round. Keep this thread's checkers beside it in
  `src/storage/`, importing nothing from `models/`; thread 6 reconciles the two. The refusal names are the spec's, so 6 has
  nothing to translate. `gate_epoch` lives where `unrace-gating.md` *Changing the gate* reads it, `stored.gate.gate_epoch`,
  unless the record's shape says better.
* **Size:** medium. **Depends on:** nothing.
* *Review:* fixed at medium, 9 fixes (a live row under another `vault_tok` refuses `vault_mismatch`, by the Coach; a void row
  matches only the whole `NeverStored`; three cases where a store wrote or erased what the base then refused), none significant.
  Left: `repl`'s `vault_tok` swap until thread 10; newer-format rows (a row); names and VOCABULARY.md rows for thread 6 or 14.

### 3. `gate_proving` (pre-plan 4)

*"Implement Bank Gate, Gating, Wayin, Proving in models/* according to the new interface, removing anything that seems
obsoleted."* This thread takes Gate, Wayin and Proving.

*"Lease.grant wants the pojo vaultFriend."*

* **Read:** `unrace-gating.md` *The provings*; `models-invariants.md` *Proving*, *Gate*; G1 to G3, G8 and G9 in
  `notes/guarantees.md`.
* **Touches:** `models/gate.ts`, `wayin.ts`, `proving.ts`, `lease.ts`, `models-shapes.ts`, the lines of `vault.ts` that call the
  lease factory, their tests, `tests/test-helpers/proving-world.ts`.
* **Look-ahead:** this thread sets the lease factory's signature, on the friend and not the vault, and adds `gate_epoch`. The
  friend's real maker is thread 7's, so test with a fake one. The attempt spends a `passkeyClear`, never the statics. Write no
  new `gate.with*`; `gate.ts`'s `withPassphraseReplaced`, `withPasskeyAdded` and `withPasskeyRevoked` stay for `vault.ts`
  until thread 11.
* *Orchestrator:* **pulled in from `timerless`,** as both would rewrite the same lines of `lease.ts` (its constructor, `get`
  and `grant`): the lease loses its `Trigger`; it records `proved_at` and the kind of proving in place of `autolock_at`;
  `lease.peek` makes no autolock check. The friend offers `peekLease`, `tryCacheLease` and `tryUncacheLease` (the names in
  `crossings.md`), bound to the vault's scope; thread 4 builds the deviceDB under them, and until thread 7 the vault adapts
  today's `tryGetLease`, `tryPutLease` and `tryDelLease` to them.
* **Levels:** `high` review: this is the key handling. **Size:** medium, the top of it. **Depends on:** nothing.
* *Review:* fixed at high, G1 to G3, G8, G9 hold, none significant. A tombstone no longer tells bad news at every hello;
  `gate.attemptProof` rejects rather than throws; narrating doc blocks stripped. Left for thread 7: stale phrases,
  `takeUpLease`'s lost identity check, `leaseCachedOf`.

### 4. `device_db` (from pre-plan 7's item 2)

* **Read:** `unrace-gating.md` *Notable Changes*, *Required of the parts not yet drawn*; `models-invariants.md` *Bank*'s
  `#keepDeviceRecord` and `tidy` rows.
* **Touches:** new files in `src/storage/` beside `vault-db-new`, a test; nothing in `models/`.
* **Items:** the deviceDB's `cache`, `peek`, `vacate` by scope and `vault_tok`, `leasesProvedBefore(cutoff)` and the device
  record, with an in-memory one. Each also has its `try*`. Calls land in the order they were made.
* *Orchestrator:* split out of `vault_slot`: it touches no code of that thread's, thread 7 wants it first (the lease caches
  through it), and it is new files. Its lease row is structural here (scope, `vault_tok`, `proved_at`, the rest opaque), so it
  needn't wait on thread 3's shape.
* **Levels:** `sonnet` worker, `low` review. **Size:** small. **Depends on:** nothing.

### 5. `timerless` (pre-plan 3)

*"The timer is the wrong mechanism for autolock. A 0-7day js timer for a webpage that will page out every second to hour
is feckless. Storables should lose their timer, handing it instead to listing or bank"*

*"bank.hello calls tidy and that's it. the host can handle crashes and retries and calling tidy if their hello doesn't run
on pageload for some reason."*

* **Read:** `unrace-gating.md` *Notable Changes*; `models-invariants.md` *Vault*.
* **Touches:** `models/storable.ts`, `vault.ts`, `bank.ts`, `listing.ts`, `models-shapes.ts`.
* **Items:**
  1. The Storable loses its `Trigger`. The refresh timer is deferred, so nothing replaces it for now.
  2. `ensureTimely(maxMillis)`, the `Promptly` constant (2,000 ms for now), and `vault.fetch`'s join.
* **Also:** "pull pester for the time being": its timer and `pesterMinutes` go.
* *Orchestrator:* the lease's half of this thread went to thread 3.
* **Size:** medium. **Depends on:** 1.

### 6. `store_switch` (pre-plan 5)

*"I had contemplated the vault-db-new as one of the earliest things, switching the storables over to it after the `staged`
stuff was debrided"*

* **Touches:** `models/storable.ts`, `listing.ts`, `vault-listing.ts`, `box-listing.ts`, `models-shapes.ts`,
  `tests/test-helpers/models-world.ts`.
* **Look-ahead:** the storables and listings call `vault-db-new` directly, and `Store` goes, with no adapter between them.
* *Orchestrator:* reconciles `vault-db-new`'s checkers with `models-shapes.ts`'s.
* **Size:** medium. **Depends on:** 2, 5.

### 7. `lease_seams` (pre-plan 6)

*"yes Lease, Vault and Listing too."*

* **Read:** `models-invariants.md` *Vault*, *Lease*; `unrace-gating.md` *The lease*, *The discards*.
* **Touches:** `models/vault.ts`, `lease.ts`, `box.ts`, `box-listing.ts`.
* **Items:** `leaseFriend`, `#attachLease`, `#renewLease`, `#vacateLease`, the seal verbs, and the discards down the chain.
  The vault's seal verbs lock on `damaged_lease`.
* **Unsealing:** *"have lease do the decode and fill; it owns security. box does the deserialization"*. `box.#unseal` decodes
  and fills today.
* *Orchestrator:* the friend reaches thread 4's deviceDB. Folds in thread 3's `vault.leaseCachedOf`; settles `takeUpLease`'s
  identity with `#attachLease`; fixes `Phrases.LeaseNotInForce`, `LeaseOfOtherHolder` and `DamagedLease`; and rewords
  `halpimonfire.test.ts`'s "until the Coach rules", as `noted.md` has ruled a `lock()` crossing an unlock: it ends unlocked.
  The refusal for a locked vault is `vault_locked`.
* **Levels:** `high` review, as it touches what `notes/guarantees.md` covers. **Size:** medium. **Depends on:** 3, 4, 6.

### 8. `vault_slot` (pre-plan 7's item 1)

* **Read:** `models-invariants.md` *Vault listing*.
* **Touches:** `models/vault-listing.ts`, `listing.ts`.
* **Items:** the slot: `#deliver`, the tombstone a delete leaves, `ensureVault` replacing the object over gone or void. A newer
  record over a tombstone replaces it. A record of another `vault_tok` over a live vault does as `bank.getBank`'s row does. A
  tombstone over a live vault reaches a local delete's end state.
* **Size:** medium. **Depends on:** 7.

### 9. `vault_boxes` (pre-plan 8)

*"vault_boxes yes."*

* **Read:** `models-invariants.md` *Box*, *Box listing*, *Public*; `unrace-gating.md` *Notable Changes* for the box birth.
* **Touches:** `models/vault.ts`, `box.ts`, `box-listing.ts`.
* **Items:** `vault.hello` and `boxListing.hello`, run on the first box call, as a host wanting them sooner can run a task
  queue; `getBox`, `putBox`, `delBox`, `extractWhisper`; the box birth; the sidecar-only `send`.
* **Postponed:** `useWhisper`, `expose` and the whisper a box holds. Leave their code unless it's in the way.
* **Size:** medium. **Depends on:** 8.

### 10. `gating` (pre-plan 9)

The Gating half of the text in thread 3.

* **Read:** `unrace-gating.md` *`build_vault`*, *`unlock_vault`*; `models-invariants.md` *Gating*.
* **Touches:** `models/gating.ts`, a new `tests/models/gating.test.ts`, `vault-listing.ts`, the verbs that launch one.
* **Items:** `launch`, `attempt`, `build_vault`, `unlock_vault`.
* *Orchestrator:* when `repl` leaves the public `putVault`, say whether a rebirth must carry a fresh `vault_tok`.
* **`gating.decline` crossing an attempt:** the system is being asked to lock and unlock at the same time, and we have no
  opinion. Select whichever implementation feels the cleanest to reason about, and keep it simple. The doc's choice is only a
  default.
* **Levels:** `high` review, as it touches what `notes/guarantees.md` covers. **Size:** medium. **Depends on:** 8.
* *Review:* flagged twice at high. The first's G2 (a foreign-realm answer unspent) and G8 (a getter's throw kept as `cause`) were
  reworked. The second's verdict getter (a G8 regression) goes to thread 11's first commit, and a host's forged `VaultError` is
  the Coach's row. No third review, by the sprint's rule.

### 11. `gate_changes` (pre-plan 10)

* **Read:** `unrace-gating.md` *Changing the gate* through *`del_vault`*; `models-invariants.md` *The runs*.
* **Touches:** `models/gating.ts`, `vault.ts`, `vault-listing.ts`, `gate.ts`.
* **Items:** `replace_passphrase`, `add_passkey`, `revoke_passkey`, `del_vault`, and `vaultListing`'s verbs for them.
* **Gate:** it ends as a read-only view plus `demandPasskeyAddable`; its `with*` and `#sendGate` go. Params spread the record
  the attempt read, not the live vault. Rewrite `vault-gate.test.ts` to the spec's rows; don't port it.
* **Size:** medium. **Depends on:** 10.

*Orchestrator:* raised to a `high` review after thread 10's findings, as it handles the same clears.

*Review:* `fixed` at high. G1, G2, G3 and G8 hold, and the first commit closes thread 10's verdict getter. Fixed: a gate change's
lease read its epoch off the live vault, not the record stored (a crossing, kept as it put a key on the wrong epoch and adds no
state); a test now pins params to the record the attempt read; `addPasskey` and `revokePasskey` refresh within `Promptly` before
their nobody-asked check; `putVault`'s doc block. Left: refused `vault_gone` undelivered (Coach's row); a failure past the commit
in `#landGate` (Coach's row); end-of-method checks exist nowhere (Coach's row, thread 16); the `tryPutRow` cast, `Vault`'s dead
`ensureReadyToDel` and `tryDel(opts)`, `listing.del` beside security.md's wording, `timelyAnte`'s name, `putVaultOpts`' second list,
VOCABULARY lines 19 and 21 (thread 14).

### 12. `bank` (pre-plan 11's first half)

The Bank half of the text in thread 3.

* **Read:** `unrace-gating.md` *`bank.hello`*; `models-invariants.md` *Bank*, *Public*.
* **Touches:** `models/bank.ts`, a new `tests/models/bank.test.ts`.
* **Items:** `bank.hello`, `tidy`, the discards, `identity_revoked` vacating, and the snapshot fields.
* **Look-ahead:** what thread 13 drives is `subscribe` and `getSnapshot` on this. A `hello` that runs on real stores is what
  matters; leave the proof's path clear and don't start it.
* *Orchestrator:* the Coach: "At your convenience make it only tidy that banks leases, and test for that". Keep
  `leasesProvedBefore`'s scan; `tidy` vacates only its own bank's rows.
* **Size:** medium. **Depends on:** 9, 11.

*Review:* `flagged` twice at medium, then low; no third. First fixed `tidy`'s place, a birth left open by `bank.vacate`, and news of
damaged rows; flagged `bank.vacate` staying ready over an emptied listing, so `ensureVault` asked for a new passphrase for a vault
that exists. Reworked: `vacate` leaves the bank not ready, and `tidy` runs in a `finally` after `getBank`, per the Coach. Second found
one narrow door left, a refused erase with no `onPanic` still bringing that prompt: a Coach's row. Left: a late swept `hello` (thread
13's look-ahead); `ensureVault` on a damaged row asks first; `await bank.tidy()` can resolve before an erase; a lease row failing its
check escapes `bank.vacate`; `stage` against VOCABULARY's `lifecycle` (thread 14).

### 13. `proof` (pre-plan 11's second half)

* **The sprint's proof, one end-to-end test driving `subscribe` and `getSnapshot`:** hello, build, seal and unseal a box, lock,
  unlock, delete, rebuild over the tombstone, and a fresh Bank on the same stores picking up the lease. Replacing the
  passphrase, adding and revoking a passkey, and `tidy` locking one past autolock follow it; if one of those sticks, file the
  rest and say so.
* **Touches:** a new `tests/models/proof.test.ts`, and whatever in `models/` it turns up.
* *Orchestrator:* a thread of its own, as this is where the threads first meet: a fresh context for the debugging, on a bank
  already filed and reviewed. What it finds wrong it fixes, with no new machinery, and lists; a crossing is a sentence. Its
  thread file ends with what the demo would need next.
* **Size:** large, unknowable until run. **Depends on:** 12.

*Review:* `fixed` at medium, with mutations: 10 of 12 failed the proof before the fixes, and a whisper in a box's snapshot and `takeWorld` stripping
the gate passed it. Fixed: the proof now fails on any bad news and on a whisper in any snapshot; `mountComponent` takes `subscribe` and
`getSnapshot` detached; `bank.hello` remakes its snapshot where a sweep crossed it. Left, all minor: a box's own snapshot past a vault delete; a
replaced whisper tells nobody; `bank.sweep`'s order; a lock's mixed lists over several boxes; `takeWorld`'s refusal kind; `ensureUnlocked`'s doc
block; dialog casts.

*Orchestrator, 2026-11-03:* the Coach: "the thread to consolidate refusals and typechecks sounds standalone". So this thread is now the sprint's cleanup, on sonnet at a low review: the notes, the spec's corrections, the `wontfix.md` rows, STYLE.md's brief note, and stripping refusal lists from short doc blocks. Moving checkers, types and refusals goes to `unrace-next.md`.

### 14. `cleanup, was shapes_sweep` (pre-plan 12)

*"move checkers to the models' shapes files and define types from them. It's good to reuse shapes defined in the src/
directory but don't modify them in a way that would fail their tests, just copy instead."*

Earlier threads do this for what they rewrite, as they go. This thread takes what's left.

* **Touches:** `models/*`.
* **Also:** `unrace-gating.md` *Guarantees to amend* and *Rows for `notes/wontfix.md`*.
* **The Coach, on Closer Look:** the tree for `ensureUnlocked` says why it asks `ensureTimely` first: *"ensure timely is to make sure
  the vault is recent enough to know if it deserves a lease, the tree would be better off to say so"*.
* **The Coach's rows:** *"Yes strip we can add back"*: blocks under the bound that still name a `Refuses`, and lines pointing at a block
  that no longer says it, go. STYLE.md: *"You are getting very inconsistent guidance right now on comments, I have only recently learned how
  dangerous they are for agents. I will reform that soon, but a brief note would help"*. `wontfix.md`: *"If the host has no on panic they've given
  their opinion, wontfix."*
* **The Coach's row:** refusals go in dedicated files too: one models-refusals file beside the shapes.
* **The Coach's note:** *"relocate the checks and types at the top of models files into the shapes directory or model-shapes ?
  Anything with a good reason can stick around, but it saves token ussage to not have them there, and agents will write better
  ones. Types are best made from checks"*.
* **Levels:** `sonnet` worker, `low` review; an `opus` worker for the guarantees, if they turn out to be more than wording.
  **Size:** small. **Depends on:** 22; it runs last.

### 15. `lease_narrow` (the Coach's ruling, 2026-11-03)

*"Let's fix before end of sprint, important, record to security,md"*, on `vault.leaseFriend()` and `lease.friend` being public,
with `friend.peekLease()` answering the cached row and its lease key handle (G9).

* **Touches:** `models/vault.ts`, `lease.ts`, whoever calls them; `notes/security.md` through its `sonnet` subagent.
* **Levels:** `high` review, as G9 covers it.
* *Orchestrator:* cut from thread 12's tip, beside thread 13; a new thread, so the numbers no longer run in order. **Size:** small.
  **Depends on:** 12.

*Review:* `flagged` at high: `Vault.launchBirth` over a vault present dropped a typed passphrase and answered ok. Reworked to take `(listing, scope)`
and check the slot itself. Second review `clean` at low. Left: `demandBirthSlot`'s name; `_cheat_leaseFriend` and `isMadeFor`, and `world.deviceDB`,
in rows with the Coach; a birth's synchronous claim unpinned (thread 20). #461 stays a draft, as `gh pr ready` was denied.

### 16. `method_ends`: cancelled

The Coach, 2026-11-03: *"Can I pull a reverse card and cancel the post condition adding thread, this sounds like it could get theatrical."*
Stopped mid-build, nothing committed or filed. Its other items moved to thread 21.

### 17. `doc_strip` (the Coach, on Closer Look, 2026-11-03)

*"100% agree with "says more about the method than the docs" listing every refusal possible is foolish, wastes tokens and
metastasizes. Strip every doc block that is longer than one or two 120-character lines and have an agent replace it with a line
that describe the purpose of the function WITHOUT sacrificing readability. A method that can't easily be described thusly is a big
smell. Flag all methods with logorrheic "SLOPDOC" in the replacement"*

* *Orchestrator:* the item the Coach is most worried about. Cut from 12's tip, beside 13 and 15, and restacked over them: 55 of 449
  blocks, doc lines only, in `models/` and the new `storage/` files. Every replacement opens `SLOPDOC:`; a method that won't go in
  a line goes on the thread file's *Smells*. **Levels:** `low` review, `opus` style pass. **Size:** small. **Depends on:** 12.

*Review:* `fixed` at low, by hand: 6 lines corrected, one of them a false claim that no `DeviceDB` verb returns a `lease_key`. Smells now 15. No `/code-review` or
`opus` style pass ran, and the reviewer's own mechanical check was refused. #463 stays a draft, as `gh pr ready` was denied.

### 18. `plain_seam` (the Coach, on Closer Look, 2026-11-03)

*Orchestrator:* held until the Coach has triaged Closer Look.

*"Nothing has been contemplated that involved running zod inside a transaction, I think the "its checks" may have been loose
language."* *"world and dbhas have the full record by design. Refusals should use error factories that determine by selection what
goes into the error and its meta"*

* **Items:** a store's atomic step conditions on fields, never a Zod check (`doPutBox`, `doDelVault`, `isStopped`, the memory store's
  `safeParse` and `isDamagedVaultAt`; `doCacheDeviceRecord`'s closure); refusal factories select what goes on the `VaultError` and its
  `meta`, so `JSON.stringify(err)` holds no wayin or salt, and `world` and `dbhas` travel on the answer. `#call`, `answerOf` and the meta
  route may fall away with that: the cold read says so, and a plain answer frame is the aim.
* **Touches:** `storage/`, `listing.ts`'s `recordOfAnswer` and `recordOfRefusal`. **Levels:** `high` review, G8. **Size:** medium.
  **Depends on:** 13, 15, 17.

### 19. `world_whole` (the Coach, on Closer Look, 2026-11-03)

*Orchestrator:* held until the Coach has triaged Closer Look.

*"this sounds like someone worked around the typechecker by eviscerating the code. fix"*. *"vault hello should not be involved in
populating box listings by anything more than triggering the one code path that does"*. *"box being durable is useful and important
for the non react user. Replacing a vault is epochal in a way that replacing a box is not,. Still, some of that machinery is a little
sus"*

* **Items:** `Vault.takeWorld` takes the whole row, and `if (! this.isFull)`, the sparse refusals and "unlocks a vault held sparse" go;
  one code path populates a box listing, with `fetchListed`, `NothingListed` and `BoxListing.hello(listed?)` falling away as they can; say
  which of `lifeTokPathOf`, `#sameLife`, `OneRevisionTwoLives`, `isBirthday` could go, and take out what plainly can.
* **Touches:** `vault.ts`, `listing.ts`, `box-listing.ts`, `vault-listing.ts`, `storable.ts`. **Levels:** `medium` review. **Size:** medium.
  **Depends on:** 18.

### 20. `test_teeth` (the Coach, on Closer Look, 2026-11-03)

*Orchestrator:* held until the Coach has triaged Closer Look.

*"Fix the weak tests great catch"*: the "a lock() landing during a send" crossings run no real `vault.lock()`; no test has a real Vault hear
a newer row from a box answer; `MemoryVaultDB` tells watchers by microtask, so the other order runs only where a test forces it;
`_cheat_boxRowsOf` is the store's own accessor and creates a row on a read.

* **Levels:** `low` review. **Size:** small. **Depends on:** 19.

### 21. `small_rulings` (the Coach's rows, 2026-11-03)

* A gate verb refused `vault_gone` or `vault_mismatch` delivers its row to the Vault, by a protected `isRefusalOfRow`.
* A gate change rejecting after it stored: *"I can't see at a glance that the ones you named are wontfix, so document them and if it's
  straightforward test in halpimonfire"*; a refused `tryCache` during `replacePassphrase` gets a test.
* `_cheat_leaseFriend`, `lease.isMadeFor` and `leaseOfOtherHolder` go: *"The point is to be unreachable right? Will we still have good
  coverage?"*
* `bank.sweep` nulls `#lastHello` first; `takeWorld`'s `bad_record`.
* **Levels:** `medium` review. **Size:** small. **Depends on:** 17.

### 22. `tidy_host` (the Coach's row, 2026-11-03)

*"tidy is supposed to call lock() on them not fiddle with the devicedb, I have a feeling I misled someone. remove it from hello, we can instruct the host to call it on their own."*

* *The Coach:* "Rename this tidy to bank.autolock". "removing rows that are not in the listing seems like another but different and async task".
* **Touches:** `bank.ts`, its tests, the proof. Supersedes thread 12's `finally`. `bank.vacate` keeps its unconditional erase.
* **Levels:** `low` review. **Size:** small. **Depends on:** 21.

## Bent from the pre-plan

* **Threads renumbered, labels kept,** and two added by splitting: `device_db` and `proof`.
* **The lease's half of `timerless` moved to `gate_proving`,** so the two can run side by side without rewriting the same
  lines. `gate_proving` no longer owes only "the factory": it owns `lease.ts` this round.
* **`device_db` split from `vault_slot` and pulled forward,** so `lease_seams` caches through the real one rather than a
  stand-in, and `vault_slot` is one item.
* **`proof` split from `bank`.** The pre-plan put the first meeting of every thread and its debugging in one context with a
  new Bank, at "large". A fresh worker with its first `justify` already behind the bank is the safer way to reach the goal.
* **`lease_seams` and `gating` take a `high` review** beside `gate_proving`, as the guarantees cover them. Reviewers get the
  no-machinery rule in their handoff.

## For the Coach

Each has a default, so none blocks the sprint: `Promptly`'s value; whether an idempotent `revoked` with no passkey moves the
revision (default no); the refusal name `locked?`. They are rows in the sprint doc's *Open Matters*.
