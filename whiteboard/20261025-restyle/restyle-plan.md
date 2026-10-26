# restyle: the sprint plan

* **Date:** 2026-10-26
* **Mode:** YOLO (the Coach, at the invocation, 2026-10-26).
* **Status:** planned; threads 1 and 2 under way.
* **Review level:** `medium`. **Threads at once:** 3 by the cap, 2 in practice: thread 1 runs
  beside the line, and the line (threads 2 to 13) is serial, each rewriting files the one before
  touched.
* **Issued by:** the Coach (flip), by `/sprint restyle` with `/turbochat`.
* **Sprint PR:** the `20261026-restyle` branch (`plan:`), a draft; it joins the line last.
* **Base:** the primitives line's top, [#267](https://github.com/mrflip/safebyok/pull/267)
  (`20261024-contract_tab`, 68dabab1), in the line main → #265 → #252 → #268 → #269 → #270 → #266
  → #267. Those seven PRs rewrite `vault.ts`, `vault-db.ts`, `wayin.ts`, `gating.ts`, `proving.ts`,
  the React package and the README, every file this sprint touches; cut from `main`, each restyle
  thread would conflict with all seven. Every restyle PR says "Stacked on". If the primitives line
  merges first, the wrap-up restacks onto `main`.

The design is in this directory: `NEWSTYLE.md` (the principles, cited §n), `shapes-preplan.md`
(the changes to `src/`, cited *Preplan*, by phase), `unsettled.md` (all 45 items ruled), and
`good/` (the worked example: `checks/validator.ts`, `checks/primitives.ts`,
`checks/core-checks.ts`, `scopepath.ts`, `utils/phrases.ts`, `utils/consts.ts`). Where this plan
and the preplan disagree, this plan wins on which thread builds what; the progress document
(`restyle-progress.md`) wins over both.

The Coach's charge at the invocation (verbatim):

> Read the preplan. It was written in collaboration with an agent. Think flexibly, honor the
> plan's intent but evolve its suggestions as you leaern

*Orchestrator:* the preplan's intent is fewer, duck-typed shapes built from one record's
validator; checks declared once in Zod; frozen objects whose spread is harmless; one name for
one thing. Its specifics (a type's exact field list, which getter goes in which phase) are
suggestions: a thread that finds a better cut, or a suggestion that fights the code, takes the
better path and says so in its thread file and PR. What does not move: the preplan's rule that
**no phase removes a check today's code makes** (a moved check is named, with where it went),
CLAUDE.md's contracts (until 1.0.0 no reading of older stored shapes; an old record reads as
damaged, and the changeset says so), and NEWSTYLE §2's rule that no refusal quotes its input.

## Read first

* CLAUDE.md, then `NEWSTYLE.md` whole (it is the newer word where it and STYLE.md disagree,
  until thread 1 folds it in).
* `shapes-preplan.md`: *The outcome* for every thread; the thread's own phase.
* `good/checks/validator.ts` and `good/checks/core-checks.ts`, for any thread writing a validator.
* STYLE.md by section, as CLAUDE.md says: *Naming*, *Validation*, *Tests*, *Comments and doc
  blocks*.
* `restyle-progress.md`: what earlier threads learned.

## Ground rules

* **Paths.** The sprint directory is `/workspace/byok-restyle/whiteboard/20261025-restyle/`,
  read from the sprint worktree; a thread's worktree, cut from #267's line, does not hold it.
  Each worker writes its own `whiteboard/20261025-restyle/thread-<N>-<label>.md` on its own
  branch.
* **Every phase is green** under `pnpm justify`, with doc blocks, tests and a changeset.
* **Stored shapes change freely** (pre-1.0): no shim, no migration; the changeset says an old
  vault reads as damaged, and what a host sees.
* **Public surface changes** are the point of this sprint, and each is named in the changeset.
  A change beyond what the preplan names (a new export, a renamed method the preplan does not
  mention) is a YOLO decision: make it if it is a two-way door, and list it under *Open matters*.
* **Thread order follows the code.** A thread may pull a later thread's small piece forward when
  its own lines are already open, declaring it in its report; it never pushes its own piece back
  without saying so.
* **Size budgets.** Classic Zod raises every core line (the preplan guesses 15 to 20 kB on `Bank`
  and `everything`). Each thread runs `pnpm size:budget` before filing and `--write`s only when
  the rule moves a line, saying which and why in its PR.
* **Tests** are written against the `Validator` factory from thread 2 on; a test of a removed
  shape or getter goes with it, and its outward expectation (what a caller is promised) moves to
  a test of the new surface.
* The main checkout holds two uncommitted edits of the Coach's that bear on this sprint, quoted
  in threads 5 and 7 below. Don't read or touch the main checkout; the quotes are what you need.

## Threads

### 1. Guidance (Preplan Phase 0) -- `guidance`

> 0. **Guidance.** Fold `NEWSTYLE.md` into STYLE.md, CLAUDE.md and VOCABULARY.md (§11); the core's
>    eslint ignore patterns become `^_[a-zA-Z0-9]`. A documents-only PR.

*Gloss:* STYLE.md (*Validation*, *Naming*, *Comments*), CLAUDE.md (*Non-Negotiables*,
*Conventions At A Glance*), VOCABULARY.md (`ckey`, stamp, sparse, dna, the shape names; "vault
props" retired into `notes/old_vocabulary.md` is thread 8's, when the name goes from code); the
core's `eslint.config.mjs` and the configs cut from it. NEWSTYLE describes the code as it will be:
the guidance says what to write from now on, and does not claim `src/` already reads that way.
The lint change may flag a bare `_` in today's code: rename each to a named ignore, which makes
the PR not quite documents-only; say so. Weigh CLAUDE.md lines by context cost (they are paid on
every turn): a principle goes in STYLE.md, and CLAUDE.md gains a line only for what a writer gets
wrong unless told. **Depends on:** nothing; cut from #267's tip, runs beside the line.
**Look-ahead:** every later thread reads STYLE.md; until this files, they read NEWSTYLE.md.
**Size:** medium.

### 2. The Validator factory and scope checks (Preplan Phase 1, first half) -- `validator`

> 1. **Checks, and the `Validator` factory.** `src/checks/` after
>    `whiteboard/20261025-restyle/good/checks/core-checks.ts`, in classic Zod 4.6.7, a peer dependency
>    at `^4.6.7` in the core and safebyok-indexeddb (the two that import it; both ask `^4.0.0` today), with `utils/phrases.ts` and
>    `utils/consts.ts`. Every validator is made inside a `Validator` call, the Coach's form, with
>    the call's one kind before the builder; a slice is its own named validator, made beside the
>    record it slices: [...]
>
> (the rest of Phase 1 in `shapes-preplan.md`, verbatim there; this thread takes the factory, the
> primitives, the scopes, `bad_scope`, the `validators` option's removal and the README paragraph)

*Gloss:* `src/checks/validator.ts`, `checks/primitives.ts`, `checks/core-checks.ts` (scopes and
scopepath tuples), `utils/phrases.ts`, `utils/consts.ts`, from `good/`; classic `zod` `^4.6.7` as
the peer in `packages/safebyok` and `safebyok-indexeddb` (the version bump and the move from
`zod/mini` imports is a dependency decision the preplan records as the Coach's; PROCESS.md
*Dependencies* still applies to the lockfile and the changeset). `bad_scope` replaces
`bad_label` (errors.ts's kinds, the README's error table, every test naming it). `names.ts`'s
`checkScope` and `ScopeShape` give way to the scope validators, `.readonly()`. The host's
`validators` option goes with `VaultValidators`, `DefaultValidators`, `AnyTextValidators` and
`src/validators.ts`; the README's *Names, and your own checks* becomes the paragraph the preplan
gives. The existing `zod/mini` schemas elsewhere stay for thread 3, so both flavours bundle for
one thread: an interim cost, named in the PR. The eslint `no-restricted-imports` rule that holds
`src/` to `zod/mini` loosens here to allow classic. **Depends on:** nothing unmerged beyond the
base; cut from #267's tip. **Look-ahead:** thread 8 builds `vaultRecord` with a nested
`gateRecord` and slices (`pick`, `omit`, `extend`, `.strict()`, `.readonly()`) from it through
this factory, with `sources` modules spread into the kit: build and test that path now (a pick
of a wrapped schema still refuses with the call's kind, or doesn't, and says so in its doc
block). Thread 5 builds `Scopepath` on the scopepath tuples made here. **Size:** large. Moves
every core line up (`Bank`, `everything` and the entries importing a check).

### 3. Every schema in classic Zod (Preplan Phase 1, second half) -- `zod_classic`

> (Phase 1, continued:) Every validator is made inside a `Validator` call [...]. The few helpers
> that read a record back from storage (`checkVaultProps`, `checkStoredBox` and their kin) catch
> its `bad_record` and re-throw it as `damaged_*`. [...] Whether a record read back is parsed
> strict or stripped is the orchestrator's choice, strict both ways suggested.

*Gloss:* every remaining `zod/mini` schema in `src/` of every package (core: `types.ts`,
`vault-opts.ts`, `vault-db.ts`, `box.ts`, `lease.ts`, `options.ts`, `key-deriver-spec.ts`,
`mask.ts`, `crypto.ts`, `idb-opts.ts`, `names.ts`, `logger.ts`, `passphrase-strength.ts`,
`proving.ts`, and the rest a grep finds; `safebyok-indexeddb`'s `idb-opts.ts`) becomes a
`Validator` call, by concern, each with its one kind; read-back helpers re-throw `damaged_*`.
*Orchestrator's choice:* stored records parse **strict** (an unknown field reads as damage or a
newer `format`), as suggested. `zod/mini` leaves `src/`, and the eslint rule that held it goes
the other way (classic only). Keep each schema's shape as today: thread 8 restructures the vault
record, so don't polish `vaultProps` beyond the conversion. **Depends on:** thread 2.
**Look-ahead:** threads 4 and 8 brand and slice these. **Size:** large, mostly mechanical; it
may run long: if it does, split by package or concern and report. Moves the core lines (down,
once mini is gone).

### 4. Type aliases and brands (Preplan Phase 1a) -- `brands`

> 1a. **Type aliases and brands.** Survey `src/` for the most common primitives (labels,
>    `user_id`, tokens, times) and the most important (a passphrase's cleartext, the two salts,
>    ciphertext, each wrapped key by role), and give each a name in `src/types/type-aliases.ts`:
>    a plain alias where a host writes the value by hand, a brand from its validator's `.brand()`
>    where it does not. An alias for each outcome a reader must tell apart even when its type
>    overlaps another (`DamagedVaultRecord`); the facets `Lifecycled`, `Refused` and
>    `ConsistencyWith`. `types.ts` moves into the folder as `types/types.ts`; as more types become
>    `Z.infer` of their validators they move out of it to the concern that checks them, as each is
>    touched, not in a sweep.

*Gloss:* `src/types/`, the validators thread 3 wrote (each brand comes from its validator), the
salts' brands (shape in the record, length where each wayin is judged: *Preplan*, *Wayins*).
`DamagedVaultRecord` and `ConsistencyWith` may have no user until threads 8 and 11: define them
where a doc block can say what each is for, or leave each to its first user and say so.
**Depends on:** thread 3. **Look-ahead:** thread 11 writes the collaborators as
`ConsistencyWith<...>`; thread 13 the bank's `Lifecycled`/`Refused`. **Size:** medium.

### 5. Scopepath replaces Ckeys (Preplan Phase 2) -- `scopepath`

> 2. **Scopepath replaces Ckeys.** `Scopepath` goes public (`Scopepath.Delimiter`). It gains
>    what Ckeys' callers use beyond the makers: the within-vault prefix as text, for an IndexedDB
>    key range (`safebyok-indexeddb/src/ckeys.ts`), and kind tests for a device shelf
>    (`isLease`, `isDeviceRecord` today). Callers: bank.ts, device-db.ts, idb.ts,
>    local-vault-db.ts (`isBoxIn` at 123, 146, 172), validators.ts, vault-opts.ts, and the
>    IndexedDB adapter. The strings are unchanged (`vault^…`, `box^…`, `lease^…`, `device^…`), so
>    nothing stored moves. `ckey` returns to meaning any map key.

The Coach's TODO entry, uncommitted in the main checkout (verbatim), which this thread takes:

> * **Read-back refusals after the restyle's Scopepath swap.** From the 2026-10 restyle review (the
>   Coach: "mark it in the TODO and move on"): once `Scopepath` replaces `Ckeys`
>   (`whiteboard/20261025-restyle/shapes-preplan.md`, Phase 2), its inverses throw `bad_scope`.
>   An adapter listing stored rows should keep skipping a malformed row key, as
>   `Ckeys.boxlabelOf`'s null lets it today (`idb-vault-db.ts`, `local-vault-db.ts`,
>   `vault-db.ts` `isNameable`), rather than fail the whole read; and each read-back site (the
>   lease, the device record, `box_stored`, `vault_props_stored`, capacity, an adapter's answer)
>   should re-throw a failed parse as its `damaged_*` kind, not the misuse kind its validator
>   carries.

*Gloss:* `src/scopepath.ts` after `good/scopepath.ts` (NEWSTYLE §1 and §7: mirror-image makers
and inverses, `withinVaultScopepathPred`, no hand-written `.startsWith`), `ckeys.ts` gone, the
callers above (validators.ts is already gone in thread 2), `safebyok-indexeddb/src/ckeys.ts`.
Exported from `index.ts`. The skip-a-malformed-row behaviour stays (a `safeParse` at the listing
site), and each read-back site's re-throw is named in the PR; the TODO entry is settled by this
PR (the Coach's own TODO.md edit is theirs to drop). **Depends on:** thread 4. **Look-ahead:**
thread 13's `bank.vaultOf` keys a map by scopepath. **Size:** medium.

### 6. One name for one thing (Preplan Phase 3, names) -- `names`

> 3. **Names and the bank.** Everything under *Names* above; [...] The adapters' wire arguments
>    flatten with the rest, `{ applabel, user_id, vaultlabel, boxlabel, expected }` in place of
>    `{ scope, boxlabel, expected }` (Convex's validators, GraphQL's inputs), in the same sweep, so
>    no nested scope is left to find later. Each server's authorization moves with the field it
>    reads: Convex's `mustBe(ctx, args.scope.user_id)` (safebyok-convex/src/server.ts:102-166)
>    becomes `mustBe(ctx, args.user_id)`, on every function that has it today.

*Gloss:* *Preplan*, *Names*: `user_id` everywhere (React's `BankProvider` prop, Postgres's
options, every `'userId'`), `credential_id`, `ask_passphrase_at` on the snapshot,
`maxBoxes`/`maxWhisperBytes`/`maxVaultBytes` for the resolved limits, "stamp" in doc blocks for
"bound"/"authentics"/"binding", `lifecycle`/`ready` where a status is named (the bank's own
rework is thread 7's and 13's: rename here only what does not change shape there). The wire
flattening: Convex validators and `mustBe` on every function that has it (a security-relevant
move: each one checked by a test that a call naming another user is refused), GraphQL inputs,
Postgres. `VaultProps` → `VaultRecord` is thread 8's, with the record. **Depends on:** thread 5.
**Look-ahead:** thread 7 builds the per-user bank on the flattened calls. **Size:** large but
mechanical; the authorization moves are the part to review hard.

### 7. A bank per signed-in user (Preplan Phase 3, the bank) -- `bank_per_user`

> 3. (continued) the bank per signed-in user, its calls naming a `vaultlabel`, the `load()` hooks;
>    safebyok-react's `BankProvider` making a bank per `user_id`.

The Coach's FIXMEs, uncommitted in the main checkout's `packages/safebyok/src/bank.ts`, above
`#ensureLoaded` (verbatim), which this thread takes as direction for the load path:

> ```
> // FIXME: this doesn't return a value; it compares a promise to null, only showing that it tried, once
> //   it double tracks state (existence of a shared-by-all err, existence of the promise, its state variable)
> //   better: bag of outcomes `progress: { libs: { ok, status: loading | loaded | refused }, err: VaultError | null }, vaults: { ... }, ... }
> //     and accessors get ok(): boolean { return _.all(this.progress, 'ok') }
> // name: libsLoaded (look at the doc block!) Doc bloc is a lie: does not return the libraries; should return a status
> // overachieving: calls publish!!! that modifies state outside its ambit. A method initialize ('runs all startup tasks then publishes') more obviously woul
> ```
> and, above `this.#err = null`:
> ```
> // FIXME - explain: why is it ok to clear the error state just because this is working? And why only when it's unloaded (doesn't clear if previously loaded)
> ```

*Gloss:* *Preplan*, *The bank: one per signed-in user*: `Bank.make({ applabel, user_id, ... })`,
`BankScope`, `bank.ensureVault(bag, opts?)` and siblings with `vaultlabel` required and
`bank.demandConsistentWith(bag)` refusing `bad_scope`, `BankVaultOpts` for `VaultDraft`,
`VaultChoice` gone; the strength checker's and key deriver's optional memoized `load()`, made
once before any bank. The load path follows the Coach's FIXMEs: one status the bank publishes
from one place, a name and doc block that say what it returns, and the clearing of a failed
load's error explained or removed. React's `BankProvider` makes a bank per `user_id` and drops it
when the `user_id` changes or goes. The bank's snapshot keeps its shape here; thread 13 lists it.
**Depends on:** thread 6. **Look-ahead:** thread 13 reshapes the snapshot as `Lifecycled<BankScope>
| Refused<BankScope>` and adds `vaultOf`; leave the status as one field that maps onto that.
**Size:** large.

### 8. The vault record and its shapes (Preplan Phase 4, the record; Phase 9 where it meets it) -- `vault_record`

> 4. **The vault record and its ctx.** One object schema with the gate nested, and `gate_epoch` on
>    the vault record beside it; the shapes built from it. The PR reports whether `gate_epoch` is
>    better also in the gate, with the code in hand to judge by; it stays on the vault either way.
>    [...] Adapters: Postgres keeps `gate_epoch` a column and its SQL check, and the gate's two
>    wayins jsonb; Convex's validators and GraphQL's schema take the nested gate.
>
> 9. **Records from parsed parts (§4).** `draftOf` (bank.ts:532) and each `raiseDeviceRecord`
>    (vault.ts:1111, bank.ts:454, del-damaged-vault.ts:57) build from a parsed scope, never a
>    spread; every DeviceDB call is handed a parsed scope.

*Gloss:* `vaultRecord`, `gateRecord` and the wayin records, with `VaultSparse`, `VaultStamp`,
`VaultScope`, `VaultTombstone`, `GateSparse`, the wayins' sparse shapes, and the write
expectations (`VaultRecordExpectation`, `VaultDelExpectation`) sliced from it; *Preplan*, *The
vault types that remain*: `VaultProps`, `GatedVaultProps`, `GatelessVaultProps` and `Stamp` fold
in; VOCABULARY retires "vault props" into `notes/old_vocabulary.md`. The box's, lease's and
device record's stamps (*Preplan*, *The box, the lease...*). Adapters: Postgres, Convex, GraphQL,
IndexedDB, local. Phase 9's lines (`draftOf`, each `raiseDeviceRecord`) are rewritten here if
this thread opens them; otherwise thread 13 takes them. The `gate_epoch` report goes in the PR
and the thread file, and becomes an Open Matter. **Depends on:** thread 7. **Look-ahead:** thread
9 binds `VaultStamp`, `BoxStamp` and `LeaseStamp` into each ctx; thread 10's reads answer
`VaultRecord`; thread 11's Vault object `implements VaultStamp`. **Size:** large; if the adapters
run long, they are a thread of their own (8b), the core's change first.

### 9. Each ctx binds its stamps (Preplan Phase 4, the ctx) -- `cipher_ctx`

> 4. (continued) `cipherCtx(stamp, purpose, header)` at wayin.ts:39, lease.ts:47 and lease.ts:256.
>    [...] A note for `notes/security.md` through a `sonnet` subagent: what each ctx binds, the
>    vault's stamp added to a box's and a lease's.

*Gloss:* *Preplan*, *Ctx*: `cipherCtx(stamp, purpose, header)`, a list of stamps where two are
bound (`[vaultStamp, boxStamp]`), the vault's stamp without its `format` in a box's and a lease's,
`registered_at` bound (crypto.ts:65's example made true), the encoding kept (`stableJsonify`,
undefined or null refused). Every existing vault becomes unreadable: the changeset says so plainly
(pre-1.0). The `notes/security.md` entry through a `sonnet` subagent, as CLAUDE.md says. This is
cryptographic construction: follow what is in `src/` and the preplan, add no new primitive, and
stop and report if the preplan's ctx seems to need one. **Depends on:** thread 8. **Look-ahead:**
the box's own fields in thread 11 are what its stamp binds. **Size:** medium; review at `high`.

### 10. Reads (Preplan Phase 5) -- `reads`

> 5. **Reads.** The responses above; `vaultProps` becomes `vault` in the adapters' half, typed as
>    what belongs there; damaged boxes split from the listing, on the snapshot and in
>    README *Damaged boxes*; GraphQL's schema as above, both kinds of box typed.

*Gloss:* *Preplan*, *Reads*: `VaultReadResponse` `{ vault, boxes: BoxSparse[], damagedBoxes:
BoxDamaged[] }`, `splitStoredBoxes(rows: StoredBox[])` exported for adapters, every adapter
answering that shape, the base class checking a server's sound boxes again and parsing its word
on the damaged ones; `BoxSparse`/`BoxDamaged` merging the box summary types (*Preplan*, *Box*);
`damagedBoxes` on today's snapshot beside `boxes` (thread 12 reshapes the rest). GraphQL's
`__typename` dropped before a strict parse. **Depends on:** thread 9. **Look-ahead:** thread 12's
snapshot takes `boxes` and `damagedBoxes` as slices. **Size:** large.

### 11. The Vault object (Preplan Phase 6) -- `vault_object`

> 6. **The Vault object.** `implements` its shapes, as the Box and Lease objects do theirs; own
>    frozen stamp fields; `Object.freeze(this)`; the per-field getters and the `keyDeriver` getter
>    gone. Internal readers of the removed getters (bank.ts, box.ts, errors.ts, gating.ts,
>    proving.ts, vault.ts) read the snapshot or are handed what they need.

*Gloss:* *Preplan*, *The Vault object* and *Its collaborators*: `class Vault implements
VaultStamp`, `getSnapshot`/`subscribe` as prototype getters returning private arrows (also on
`Bank`), the five collaborator slices written out as `VaultStamp` / `ConsistencyWith<...>` with
`keyDeriver`, `logger`, `leaseMillis` and `now` handed in at make; `class Box implements
Boxscope, BoxSparse` and `class Lease implements LeaseSparse`, own frozen fields, the Box's two
epochs its own fields. Tests that spied on a Vault spy on a collaborator. **Depends on:** thread
10. **Look-ahead:** thread 12 removes what the per-field getters fed. **Size:** large.

### 12. The snapshot (Preplan Phase 7) -- `snapshot`

> 7. **The snapshot.** The shape above; each slice reused while unchanged (today vault.ts:972
>    rebuilds `boxes` and `capacity` on every snapshot); `state` gone, `freshness` kept. safebyok-react:
>    the passphrase modal and the passkey button read `gate` and `ask_passphrase_at`, and
>    `askPasskey` takes `snapshot.gate`. README sections on the snapshot.

*Gloss:* *Preplan*, *The snapshot a React host renders*; the demo app (`demos/`) follows, as it
reads the snapshot. **Depends on:** thread 11. **Look-ahead:** thread 13's bank listing mirrors
`snapshot.boxes`'s sorted frozen form. **Size:** medium to large.

### 13. The bank's listing (Preplan Phase 8; what is left of Phase 9) -- `bank_listing`

> 8. **The bank's listing.** `bank.snapshot.vaults` as a sorted listing; `bank.vaultOf`;
>    `VaultParts` flattened and frozen; `BankProvider` reads the listing and calls `vaultOf`.

*Gloss:* *Preplan*, *The bank* and *Bank* (under *The box, the lease...*): the snapshot as
`(Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>) & { vaults: readonly
BankVault[] }`, `VaultEntry` → `BankVault`, `BankStatus`/`EntryStatus` → `lifecycle` unions;
`vaultOf(scope)` from a map keyed by scopepath; `VaultParts` with the scope's names as own fields,
frozen; Phase 9's lines not taken by thread 8. **Depends on:** thread 12. **Size:** medium.

## Not in this sprint

The preplan's own list (a lease's lifetime, capacity as the store's count, `Outcome`'s `meta`),
left as they are.

## For the Coach

* **The base.** The restyle stacks on the primitives line (#267's tip), which is paused for your
  rulings. A ruling there that becomes a thread on top of #267 means a restack of the restyle
  line; the wrap-up does it.
* **Untracked copies.** This sprint commits `whiteboard/20261025-restyle/` (NEWSTYLE, the
  preplan, `good/`) to its own branch. The main checkout holds the same files untracked, so a
  `git pull` that brings the sprint in will refuse to overwrite them: delete the main checkout's
  copy first (after checking you have no newer edits there).
* **Your uncommitted edits** in the main checkout (TODO.md's read-back entry, bank.ts's FIXMEs
  on `#ensureLoaded`) are quoted into threads 5 and 7; the edits themselves stay yours.
