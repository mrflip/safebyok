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
* **Status:** thread 1 (renames) building, cut from #241 at origin/20261021-better_paths.

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
3. **The Open Matters already raised** (the sprint doc, rows 1-6) are the orchestrator's to carry
   back. Until ruled, a thread that meets one takes its row's Rec, says so in its PR, and keeps
   the choice easy to undo.
4. **One thread, one PR**, "Stacked on #N" in its body. Every PR's base is `main`.
5. **No format bumps, no back-compat** (the preplan's first paragraph). Each changeset says what a
   host with records written before it will see.
6. **Security decisions** go to `notes/security.md` through a `sonnet` subagent, in the thread
   that makes them.
7. **The Contract** is the *Contract* tab of the design doc
   (https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70). Only thread 10 edits
   it; earlier threads list in their thread file the Contract lines their change makes untrue.
8. **Size budgets**: no measure was taken while planning (it needs a build). Each thread runs
   `pnpm size:budget` after its `pnpm justify` and follows PROCESS.md's rule.

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
PR. `hello`'s read moves to `vaultDB.getVault`. **From Open Matters 1 and 2:** a call whose turn
was queued before a lock is handed its whisper; one still in its precondition when the lock lands
refuses `vault_locked`; the expiry's lock turn is queued at `askPassphraseAt` minus the vault's
default staleness, so `unlocked` means a lease in hand; the snapshot is computed at a settle, as
`#picture()` does now, never at a look. **Depends on:** 2. **Look-ahead:** thread 4 turns
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
and `tests/vault-provider/`; `demos/` and `e2e/` that build a vault. Two features (core bank,
React provider) in one thread, because `pnpm justify` builds the React package against the core:
if the worker's context runs long, it may file the core half with the React package adapted
minimally and report, and the orchestrator cuts the provider as thread 4b. **From Open Matters 4
and 5:** reload is once (a birth read that finds props and listing disagreeing refuses the
entry); the README says a host deleting a user's data signs them out first. **Depends on:** 3.
**Look-ahead:** thread 5 mints the device record at the bank's first need; thread 9's dialogs
read the bank's entry. **Size:** L. Adds a `Bank` line to `.size-limit.json` (or renames
`Vault`'s) and `VaultProvider`'s becomes `BankProvider`'s.

### 5. device_id

> **device_id**: the mark becomes the device id; `rolled_back` and the list under *The device id*
> out; the security note.

*Gloss.* `src/device-db.ts`, `idb.ts`, `vault.ts`'s mark code, `refusals.ts`/`refusal-policy.ts`
(`rolled_back`), `del-damaged-vault.ts` if it touches the mark, the README's *A vault rolled
back*, VOCABULARY's mark rows. The preplan's *The device id* lists every name that goes. **From
Open Matter 6:** the security note says plainly what is no longer caught (a backend serving an
older gate after a reload is accepted) and why that costs no secrecy. **Depends on:** 4.
**Look-ahead:** thread 6's Proving seals ways in carrying the device id. **Size:** M. May lower
`idbDeviceDB`.

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

## Wrap-up

`wrapup.md`'s restack, then the preplan's end pass: one `opus`, `high` reviewer over the whole
line, brief *Trust, checks and races*, grepping for the vestiges threads 3 and 5 name in their
"out" lines, the security notes, and the Contract. Its findings are Open Matters, not fixes.

## For the Coach

* Open Matters 1-6 in the sprint doc: places where the preplan contradicts itself or drops a
  guarantee. Each thread takes the Rec until you rule.
* Open Matter 7: #241 is open; the line stands on it.
