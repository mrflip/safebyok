# streamline: the sprint plan

* **Date:** 2026-10-21
* **Mode:** normal
* **Review level:** `medium`, reviewer on `sonnet` (the preplan's *Review*), unless a thread names another.
  At the end of the sprint, one `opus`, `high` pass over the whole line (see *Wrap-up*).
* **Threads at once:** 3, but the line is serial (every thread rewrites `vault.ts` or builds on the
  one before), so one runs at a time.
* **Issued by:** the Coach (flip), by `/sprint streamline` with `/turbochat`.
* **Sprint doc:** [Sprint streamline](https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4): Open
  Matters, Progress, Resolved.
* **Status:** threads 1-2 filed (#243, #244); thread 3 (turns) building; thread 5 rewritten as
  vault_epoch, waiting on two rulings; thread 11 (wire_meta) added. Branches cut on or after
  2026-10-22 carry that date (`20261022-get_vault`, `20261022-turns`).

The work is the preplan, `whiteboard/20261021-better_paths/better_paths-plan.md`, on
[#241](https://github.com/mrflip/safebyok/pull/241)'s branch `20261021-better_paths`. Its ten
threads are this sprint's ten threads, in its order, each stacked on the one before, the first on
#241. Where this plan and the preplan disagree, this plan wins, and the progress document
(`streamline-progress.md`) wins over both.

The Coach's charge, at the invocation (verbatim):

> That plan was authored in part by an AI. Use flexible thinking, as we are making big changes to
> the contract. The goal of the sprint is clean confident control flow, and simplified methods.
> Fine-grained tests of the methods will change significantly (and in many many cases I hope move
> or go away as those methods do). However, outward expectations of consistency and correctness
> should not be altered; if we told you to do something that is contradictory, or eliminates a
> safety/consistency guarantee, call it out.

## Read first

Every worker, beyond CLAUDE.md:

* The preplan, whole: `whiteboard/20261021-better_paths/better_paths-plan.md` (460 lines). It is
  the spec. *The rules*, *Trust, checks and races* and your thread's own line bind you; the
  sections on *Birth*, *The states*, *Turns*, *Each call* and *The lifecycle* say what the code
  must do when the sprint is done, not what your thread must build.
* `streamline-progress.md` in this directory: what earlier threads decided and found. Newer than
  the preplan wherever they disagree.
* STYLE.md: *Naming* before naming anything new, *Tests* before writing a test, *Comments and doc
  blocks* before a doc block.
* VOCABULARY.md: look up any cast word you do not know; `notes/old_vocabulary.md` for retired ones.
* PROCESS.md: *Threads*, *Changesets*, *Size budgets*, and *Dependencies* if you add one.
* `packages/safebyok/src/vault.ts` by its banners (`grep -n '// == '`), never whole.

## Ground rules

1. **Outward guarantees hold.** Fine-grained tests of methods that move or vanish go with them;
   tests of what a caller can observe (a whisper read back is the one stored, a lock locks, a
   stale write refuses, a wrong passphrase opens nothing) keep their meaning, rewritten to the new
   surface. Deleting a test is a decision: the PR lists each test file shrunk by more than a third
   and says, per group, whether the behaviour moved (and where its test went) or was retired by
   the preplan (and which line retired it).
2. **Call out, don't route around.** Where the preplan's directive contradicts itself, or would
   remove a safety or consistency guarantee a caller relies on, stop building that part, write
   the case in your thread file and the PR's open questions, and report it as an open matter. If
   the rest of the thread can go on without it, go on.
3. **The Open Matters already raised** are the orchestrator's to carry back. Until ruled, a thread
   that meets one takes its row's Rec, says so in its PR, and keeps the choice easy to undo,
   **except** where the Rec would change the Contract (what a caller is promised): then the
   thread keeps the current contract and lists the question. *Orchestrator (2026-10-22):* the
   Coach, on row 1: "Don't make YOLO calls that alter contract at this level".
4. **One thread, one PR**, "Stacked on #N" in its body. Every PR's base is `main`.
5. **No format bumps, no back-compat** (the preplan's first paragraph). Each changeset says what a
   host with records written before it will see.
6. **Security decisions** go to `notes/security.md` through a `sonnet` subagent, in the thread
   that makes them. *Orchestrator (2026-10-22), the Coach's ruling:* the subagent may bring an
   entry it touches up to today's terms and interfaces, where it is certain of them; it does not
   bulk-rewrite the file. The Coach audits and corrects the file after the sprint; no agent
   modernizes it wholesale.
7. **The Contract** is the *Contract* tab of the design doc
   (https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70). Only thread 10 edits
   it; earlier threads list in their thread file the Contract lines their change makes untrue.
8. **Size budgets**: no measure was taken while planning (it needs a build). Each thread runs
   `pnpm size:budget` after its `pnpm justify` and follows PROCESS.md's rule.
9. **Pull anticipated changes forward.** The Coach (2026-10-22): "Expect a lot of moving
   anticipated changes forward in this sprint." A thread that needs a later thread's change to
   stay simple may make it, declaring it in its PR; the orchestrator strikes it from the later
   thread.

## Threads

### 1. renames

> **renames**: `unlock_epoch` becomes `gate_epoch` and `vault_id` becomes `vault_tok`, in core,
> every adapter (Postgres columns, Convex validators, GraphQL schema, IndexedDB), records, ctx,
> expectations, tests and fixtures, VOCABULARY (the `vaultId` row, and the `_id`/`_tok` rule,
> which lists `vault_id` as an `_id` today), the README, and CLAUDE.md's ground-truth paragraph.
> No format string changes. Rename only, no behaviour.

*Gloss.* Touches every package: 59 files name `unlock_epoch`, 74 `vault_id`/`vaultId` (outside
`whiteboard/`, `winboard/`). Includes the camelCase forms (`unlockEpoch`, `vaultId`) and the
wire names (GraphQL fields, Convex validators and its component schema, Postgres column DDL),
`fixtures/`, and the README's prose. Leaves `whiteboard/`, `winboard/`, CHANGELOGs and
`notes/old_vocabulary.md`'s history alone; adds both old names to `notes/old_vocabulary.md`.
CLAUDE.md's paragraph exists only on #241's branch, which is why the line starts there. Three
commits as the rename_pass did: identifiers, stored and wire names, prose. The changeset says a
record written before reads as damaged (`damaged_vault`) or its lease as absent (locked), and
how a host clears dev data. **Model:** `sonnet`. **Depends on:** #241 (cut from
`origin/20261021-better_paths`). **Look-ahead:** none. **Size:** M (wide, mechanical). Moves no
size line.

*Review:* fixed (sonnet, medium). A reverse-rename check over the whole diff reproduces the base:
rename-only, no format string or ctx byte changed. Fixed: the changeset wrongly said
`delDamagedVault` clears pre-rename props (it cannot: it finds them by `vault_tok`); `@example`
spacing; prose still calling the token an id. Left: pre-rename vaults stuck at `damaged_vault`
(Open Matter), mixed old and new builds (Open Matter), old names in four pending changesets and
`notes/security.md` (Open Matters; thread 2 adds the security note's head line), ragged rows in
`expectations.test.ts` (cosmetic).

### 2. get_vault

> **get_vault**: `VaultDB.getVault(scope)` and `VaultDB.ensureVault(scope, draft)` hand back the
> vault props and the box listing from one transaction (Postgres), one query or mutation (Convex,
> GraphQL), one IndexedDB transaction over both stores, or trivially (local); the props schema
> allows the gateless draft (`gate_epoch` 0, no way in); `getVaultProps`, `ensureVaultProps` and
> `listBoxes` stay for their own callers or go if none remain, and VAULTDB.md and the conformance
> suite say what consistency it promises.

*Gloss.* `src/vault-db.ts` (the base class's checked verbs and `do*` hooks), `local-vault-db.ts`,
each adapter package, `VAULTDB.md`, `tests/test-helpers/vault-db-conformance.ts`. The gateless
draft loosens `VaultProps`' schema (no passphrase wayin while `gate_epoch` is 0): keep the rule
that a gated vault has its passphrase in the schema, so the door still refuses a gated record
without one. **Also, from Open Matter 3:** `putVaultProps`' `stale_write` carries the standing
props in `meta.props_stored`, as `putBox`'s carries `meta.box_stored`, in every adapter and the
conformance suite; thread 4's `gate_made_elsewhere` and the gate change's `stale_write` commit
it rather than read. The vault itself keeps calling the old verbs: switching `hello` over is
thread 3's. **Depends on:** 1. **Look-ahead:** thread 3 reads through `getVault`; thread 4 births
through `ensureVault`. **Size:** L (five adapters and the conformance suite).

*Review:* fixed (sonnet, medium). Fixed: the vault's stripped stale write kept a message pointing
at the field it stripped; two doc blocks opened on a bare `/**`. Left: Postgres and Convex
stores looser than the door (Open Matter); GraphQL error extensions carry the winning props
(Open Matter); `isGated` not exported (thread 4 decides); `jsonSelected`'s doc overclaims exact
bigints (thread 10); the interim gateless handling in `vault.ts`, which thread 4 replaces.

### 3. turns

> **turns**: `p-limit(1)` as the queue; `#read()` as read, judge, commit; `hello` as
> settle-if-timely-else-read; the watch's ring a forced hello; `lock`, `del` and the expiry as
> turns; `ensureLease` with one hello and no read after the answer; every `#refresh()` inside a
> call, `#refreshOnStale`, `#catchUp`, `#refuseCreatedElsewhere`'s re-read and the after-wait
> `#checkUnlocked()`s out; `#greeting`, `#greeted`, `#forgetHello`, `#takeUp`,
> `#createsStandDown`, `oneAtATime` and every `isOvertaken`-shaped predicate out; the lock-timing
> TODO closed with the one-sentence policy; the mark read once, in parallel, and raised after the
> commit. Adds `vault-turns.test.ts`: lock during a read, unlock during a read, a ring during an
> unlock, expiry during a getWhisper, each one deterministic order. `make` and `hello` keep their
> surface until thread 4.

*Gloss.* `src/vault.ts` (its *Reading storage* section and every call path), `one-at-a-time.ts`
(goes, with its test), `tests/vault/*` (most of `vault-races.test.ts` should go or become
`vault-turns.test.ts`), TODO.md's *Lock timing vs. work in flight*. `p-limit` is approved
(preplan, *The rules*): add it with `pnpm --filter safebyok add p-limit`, check that the version
taken has no Node built-in on its browser path (CLAUDE.md, *Runs everywhere*), and note it in the
PR. `hello`'s read moves to `vaultDB.getVault`. **Rulings (2026-10-22):** each call that needs the lease calls the sync
`#checkUnlocked()` inside its own turn, with a TODO.md entry to judge whether it is still needed,
and the Contract's wording on a lock during a call stays as it is (row 1, ruled). The snapshot
says `unlocked` until a lock lands (`lock()`, the expiry at `askPassphraseAt`, or a
`checkUnlocked` that finds the deadline passed); the twilight before `askPassphraseAt` only makes
`ensureLease` prompt (row 2, the Coach's model, awaiting confirmation). The snapshot is computed at
a settle, never at a look. **Depends on:** 2. **Look-ahead:** thread 4 turns
`Vault.make` + first `hello` into a birth; keep the read turn's judgment a function of what one
read returned plus the fields in hand, so the bank's birth can reuse it. Thread 8's `attempt`
is an unlock turn. **Size:** L. Likely lowers the `Vault` and `everything` lines (code out) less
`p-limit`'s ~0.5 kB.

### 4. bank

> **bank**: `Bank` with `make`, `hello`, `ensureVault`, `reopenVault`, `closeVault`,
> `closeVaults`, its snapshot and `subscribe`; the libraries load at `hello`; `Vault.make` and the
> first-hello memo go, a Vault born of one read; `opening`, `UnreadVaultProps`,
> `currentVaultProps`, `close()` and `vault_closed` go (`vault_gone`); a Vault of one `vault_tok`,
> novel when gateless, never absent; `created_elsewhere` becomes `gate_made_elsewhere`; `syncing`
> becomes `freshness`; the stores on the Vault with the bank's defaults; `safebyok-react`'s
> provider becomes `BankProvider`, `useBank`, `useVault(vaultlabel)`, and `openError`/`retryOpen`
> go.

*Gloss.* A new `src/bank.ts` and its tests; `vault.ts` (birth, states, `close`), `vault-opts.ts`
and `options.ts` (what the bank holds versus the vault), `refusals.ts` (`vault_gone`,
`gate_made_elsewhere`, and Open Matter 4's kind), `index.ts`; `safebyok-react/src/vault-provider.tsx`
and `tests/vault-provider/`; `demos/` and `e2e/` that build a vault. **From thread 3, interim code this thread replaces:**
`#raiseAsk` refuses `vault_closed` on a closed vault (becomes `vault_gone`); a first unlock that
loses to another device's create shows `locked` with its listing at the next hello (becomes
`gate_made_elsewhere`); a failed strength-checker load leaves the vault `opening` (the loads move
to `bank.hello()`). The read turn's judgment depends only on the round's results plus
`#held`/`#lease`, for the birth to reuse. **Rulings (2026-10-22):**
no props/listing consistency check in the core: the VaultDB checks server side, in its
transaction, and reports damage (`damaged_vault`); a check an adapter lacks becomes a TODO
(this replaces Open Matter 4's Rec). `putVaultProps` resolves the stored props, the new
contract, made here where the first gate is written. Add the line to
`.changeset/20261021-renames.md` telling hosts to upgrade every client together and clear storage
once. Two features (core bank,
React provider) in one thread, because `pnpm justify` builds the React package against the core:
if the worker's context runs long, it may file the core half with the React package adapted
minimally and report, and the orchestrator cuts the provider as thread 4b. **Depends on:** 3.
**Look-ahead:** thread 5 mints the device record at the bank's first need; thread 9's dialogs
read the bank's entry. **Size:** L. Adds a `Bank` line to `.size-limit.json` (or renames
`Vault`'s) and `VaultProvider`'s becomes `BankProvider`'s.

### 5. vault_epoch (was device_id)

> **device_id**: the mark becomes the device id; `rolled_back` and the list under *The device id*
> out; the security note.

The Coach, ruling on Open Matter "Rollback is no longer caught" (2026-10-22, verbatim): "You're
right, this is a problem. Does the system record a revision counter on the vault itself? If not
add a "vault_epoch" counter updated on write. Tombstone vaults, preserving that counter. if a
system is "in the future" (restored backup) it should not serve. TODO, or as needed: add a
"clearCachedVault" external method to remove a vault". And on "Deleting a vault while another
device is open": "If a vault tombstone is needed add one [...] the paradigm is that the vault
"always is has and will exist, we're only writing it down just now"".

*Gloss (Orchestrator, 2026-10-22).* This reverses part of the preplan: *The device id*'s "holding
no `vault_tok` and no epoch", *The rules*' "no durable record of what was seen", "no tombstones",
and the `rolled_back` removal. What survives of the old line: the mark becomes the device
record (`device_id`, minted at first need, carried by every way in this device seals), and
`heedMark`, `raiseMarkAfter` and the other mark machinery go. New: a `vault_epoch` on the vault
props, bumped by writes; tombstones on `del()`; the device record remembering the highest
`vault_epoch` seen; a read behind it refused; `clearCachedVault`. **Ruled (2026-10-22):** "Writes to vault's core
fields should bump the epoch" (the props, not box writes). The concern that a restored backup of
boxes alone goes unnoticed is entry 1 of `streamlined-toldjaso.md`; bind `vault_epoch` into a
box's ctx only if leaving it is blocking. **Still waits on two Open Matters** (where the device
remembers it and what "not serve" refuses; tombstones, new lives and the way out) and on the
Coach's wording for CLAUDE.md's ground-truth paragraph. From thread 3: a device record's value can
be lowered across tabs (toldjaso entry 9), so "highest seen" must be written so that a lower value
never replaces a higher one, or the loss is accepted and written down; and `del()` over props a
rollback refusal forgot refuses `rolled_back` today, which this thread replaces. Touches every adapter (the counter and the tombstone), `device-db.ts`,
`idb.ts`, `vault.ts`'s read judgment, `refusals.ts`, the README's *A vault rolled back*
(rewritten, not removed), VOCABULARY. **Depends on:** 4. **Look-ahead:** thread 6's Proving
seals ways in carrying the device id. **Size:** L; may split into the counter and tombstone
(adapters) and the device's memory (core).

### 6. proving

> **proving**: `Proof` becomes `Proving`, derived at the door; passkey bytes imported and zeroed
> at parse; `tryOpen` and `seal` move off Wayin; the Proving grants the lease; `VaultKeyPair`
> goes. Wayin is record only.

*Gloss.* `src/proof.ts` (to `proving.ts`), `wayin.ts`, `lease.ts`, `crypto.ts`, `vault.ts`'s
unlock and gate-change paths, their tests. The preplan's *Provings* says the defaults (pour the
leaseKey and wrap, the Lease opens its own vaultKey) and names `gate_changed_during`. Crypto
gravity (preplan, *The rules*) is the test for where each line lands. Security notes: the
wayinKey's lifetime, and where the passkey bytes are zeroed. **Depends on:** 5. **Look-ahead:**
thread 7's `Gate` asks a Proving to open the standing passphrase; thread 8's `attempt` makes
Provings. **Size:** M-L.

### 7. gate

> **gate**: the slots and the policy come off Vault into `Gate`; changes return a new Gate with
> `gate_epoch` bumped.

*Gloss.* A new `src/gate.ts`; `vault.ts`'s slot and policy code (`putWayin`, `delWayin`, the
one-passphrase rules), `wayin.ts`. The gate's fields stay flat in the stored props. Decides the
preplan's open choice for `new_vault` with a passkey only if it falls here; else thread 8 does.
**Depends on:** 6. **Look-ahead:** thread 8's gatingkinds `change_passphrase`, `add_passkey`,
`del_passkey` are gate changes. **Size:** M.

### 8. gating

> **gating**: `Ask` becomes `Gating` with `gatingkind`, `attempt`, `decline`, `lockLanded`;
> `getProof` becomes `requestCleartext`; `lease_ending`, `carry_on` and the renew path go; Ask's
> `#over` and `#landed` controllers go (`attempt` is an unlock turn, and one after the gating
> settled refuses `vault_locked` from the gating's own state; `lockLanded` stays a promise); vault
> calls stop taking cleartext.

*Gloss.* `src/ask.ts` (to `gating.ts`), `vault.ts`'s `ensureLease`, `unlock`, `putWayin`,
`delWayin`, `options.ts` (`getProof` to `requestCleartext`, host and guarded), React's
`passphrase-modal.tsx` and `passkey-unlock-button.tsx` minimally (thread 9 reworks them). Decides
`new_vault` with a passkey (one gating, or `new_vault` then `add_passkey`) and says which. **The
public surface changes most here:** every vault call that took a passphrase or passkey answer
stops. **Depends on:** 7. **Look-ahead:** thread 9 dispatches on `gatingkind`. **Size:** L.

### 9. react

> **react**: the dialogs dispatch on `gatingkind`, one per kind; `passphrase-modal`,
> `passkey-unlock-button`, `attempt-refusals`, `messages` follow.

*Gloss.* `packages/safebyok-react/src/*` and its tests, `demos/`, `e2e/`. **Depends on:** 8.
**Size:** M. Moves the React lines.

### 10. docs

> **docs**: README, VOCABULARY (Bank, Gate, Gating, Proving, gatingkind, gate_epoch, turn, the
> state words made, starting, timely, aged, refused, gone, novel, freshness, requestCleartext, the
> device record), the Contract (`hello`, `ensureLease`, `lock`, the (*) convention, the
> lock-timing sentence), `notes/old_vocabulary.md` (Proof, Ask, AskWhy, ProofAnswer, getProof,
> unlock_epoch, vault_id, lease_ending, carry_on, device mark, rolled back, vault_closed,
> opening), and the hand-roll sweep with its verdicts.

*Gloss.* Gathers the Contract lines earlier threads listed as untrue. The hand-roll sweep covers
the preplan's *Libraries* candidates no earlier thread decided: each gets a verdict (library,
keep, or delete) in the PR, and a dependency added needs the Coach's yes first (CLAUDE.md), so
the sweep proposes and does not add. **Depends on:** 9. **Size:** M-L. May split: docs, then the
sweep.

### 11. wire_meta (side thread, from the Coach's ruling)

The Coach, on "GraphQL error extensions now carry ways in" (2026-10-22, verbatim): "I think we
need to move meta out of the error and into the body, available on success or failure."

*Gloss (Orchestrator).* Read as the wire: over GraphQL (and any HTTP recipe that does the same),
what a write's answer carries (`vault_props_stored`, `box_stored`, the stored record on success)
travels in the mutation's result body, never in error `extensions`; the core's `Result` and
`err.meta` are unchanged. If the Coach meant the core's `Result` too, this thread is bigger: say so
and stop. Also renames the records verbs if the Coach rules on that row (the plural misleads).
Touches `packages/safebyok-graphql/` (schema, resolvers, `graphql-vault-db.ts`, `fields.ts`), the
Postgres route recipe if it carries meta in an error, their tests, a changeset. **Model:**
`sonnet`. **Depends on:** 3 (cut from its tip; runs beside thread 4, joins the line at the
restack). **Size:** S-M.

## Wrap-up

`wrapup.md`'s restack, then the preplan's end pass: one `opus`, `high` reviewer over the whole
line, brief *Trust, checks and races*, grepping for the vestiges threads 3 and 5 name in their
"out" lines, the security notes, and the Contract. Its findings are Open Matters, not fixes. (The Coach audits
`notes/security.md` after the sprint, 2026-10-22: no agent rewrites it.)

## For the Coach

* The sprint doc's Open Matters; ruled ones are in its *Resolved* tab and the progress document.
* #241 merged 2026-10-22; the line restacks onto main at wrap-up.
