# restyle: the sprint plan

* **Date:** 2026-10-26
* **Mode:** YOLO (the Coach, at the invocation, 2026-10-26).
* **Status:** **resumed 2026-10-27.** Threads 2 to 12 merged ([#273](https://github.com/mrflip/safebyok/pull/273) to [#283](https://github.com/mrflip/safebyok/pull/283)) with the primitives line; [#272](https://github.com/mrflip/safebyok/pull/272) (thread 1) open, reworked onto main beside thread 13; threads 13 to 15 cut from `origin/main`, serial. Workers may run `gh pr` commands but never merge or close a PR (the Coach, 2026-10-27).
* **Review level:** `medium`. **Threads at once:** 3 by the cap, 2 in practice: thread 1 runs
  beside the line, and the line (threads 2 to 13) is serial, each rewriting files the one before
  touched.
* **Issued by:** the Coach (flip), by `/sprint restyle` with `/turbochat`.
* **Sprint PR:** [#271](https://github.com/mrflip/safebyok/pull/271), the `20261026-restyle` branch (`plan:`), a draft; it joins the line last.
* **Sprint doc:** [Sprint restyle](https://claude.ai/artifact/4Hx2VL1fu4qUMQV9z6rJFz): Open Matters, Cleanup (your calls and the finally block), Progress, Resolved.
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

*Review:* none: its only code is eleven test bindings renamed to named ignores (an Open Matter). Filed
as [#272](https://github.com/mrflip/safebyok/pull/272), still a draft based on #267's branch: the worker's
`gh pr edit --base main` and `gh pr ready` were denied by the permission classifier (an Open Matter).
It handed thread 2 the eslint tree-shaking comment (NEWSTYLE §11) and thread 9 VOCABULARY's `ctx`,
**visible** and **unencrypted** rows.

*Orchestrator, 2026-10-27: the rework.* The line merged without #272, and main has since trimmed
CLAUDE.md from 204 to 126 lines (#285, the Coach's), moving reviewer-fixable conventions to
STYLE.md. A worker rebases `20261026-guidance` onto `origin/main`, resolving every conflict in
#285's favour (its trim is the Coach's newer intent: a line #272 added to a section #285 removed
goes where #285 sent that section's lines, or to STYLE.md), sets #272's base to `main` and takes
it out of draft. Then, on top, the guidance the line left for it (`restyle-progress.md`, *From
thread 8* to *From thread 12*, each section's guidance items): VOCABULARY's and STYLE.md's edits
threads 8, 9, 11 and 12 asked for; STYLE.md drops the camelCase-everywhere rule and its
`askPassphraseAt` example, as NEWSTYLE's one-name rule says; VOCABULARY's `registeredAt` and
`writtenAt` rows become `registered_at` and `written_at`; strike every "src/ is only partly
converted" sentence and pointer to `good/` (the line has merged). The Coach's rulings: **keep** the
"never spread a thing to take a part of it" line in CLAUDE.md, placed where #285's structure
puts such a line; **add** one line saying validators are made in a `Validator` call, never plain
Zod; **drop** `zod` from the Validator kit's list in NEWSTYLE and STYLE.md (the kit adds `lazy`
and `custom` instead); NEWSTYLE's redundant-alias example stands (thread 15 turns that lint rule
off), and its `{ ...vault }` example becomes "a getter hands out a frozen shallow copy" without a
name, which thread 15 picks. Weigh every CLAUDE.md line by context cost.

*Review (rework):* medium, `fixed`. Fixed STYLE.md's plain-Zod example (`vaultRecord.pick`, which
does not exist and cannot pick from a refined schema, became `VaultSparse.pick`) and a hole left in
convex's `server.test.ts`. Checked: every cited name exists; the convex conflict kept main's lines;
nothing #285 removed returned; the narrowed camelCase rule is NEWSTYLE §3 and §11's. Left, as
Open Matters: CLAUDE.md's "never in plain Zod" against STYLE.md; shape validators named for their
type; `ckey` in public names; `no-unused-vars` only warns. To thread 15: a hole in graphql's
`vault-resolvers.test.ts:264` (`_rootField`).

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
base; cut from #267's tip. *Orchestrator, from thread 1:* restate the eslint `safebyok/tree-shaking` comment and message (core,
fastkey, graphql, postgres, indexeddb) as STYLE.md *Tree-shaking* says it; `src/utils.ts` sits
beside the planned `src/utils/`, so pick names that do not resolve two ways. **Look-ahead:** thread 8 builds `vaultRecord` with a nested
`gateRecord` and slices (`pick`, `omit`, `extend`, `.strict()`, `.readonly()`) from it through
this factory, with `sources` modules spread into the kit: build and test that path now (a pick
of a wrapped schema still refuses with the call's kind, or doesn't, and says so in its doc
block). Thread 5 builds `Scopepath` on the scopepath tuples made here. **Size:** large. Moves
every core line up (`Bank`, `everything` and the entries importing a check).

*Review:* medium, `fixed`. Fixed VAULTDB.md's *Who does what* (it still named the name floor and
the host's validators). Left, each with its disposition: `SayableName` admits key-shaped unknown
fields (thread 3 narrows it: an Open Matter); an empty `user_id` gets two sentences (thread 3
aborts on the min); classic Zod sets the global locale (thread 3's changeset); `heldName` and
`maxNameBytes` near vestigial (left); `ScopepathDelimiter` duplicates `Ckeys.Delimiter` (thread 5);
Postgres and GraphQL READMEs' 640-byte lead and Convex's stale `component/validators.ts` doc block
(thread 3). PR body and draft state wait on the Coach (denied to the worker).

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
record, so don't polish `vaultProps` beyond the conversion. *Orchestrator, from thread 2:* the kit and its limits are in the progress document, *From thread
2*; `bankApplabel` and `sealBoxlabel` are interim, for thread 7. From #273's review (YOLO, each an
Open Matter): narrow `SayableName` before the strict records land, so an unknown key is repeated
only when shaped as one of our field names (lowercase underbar or camelCase, short), or never;
`abort: true` on `user_id`'s `min(1)`; the changeset says classic Zod sets the global locale;
reword Convex's `component/validators.ts` doc block and the Postgres and GraphQL READMEs' name
lines. **Depends on:** thread 2.
**Look-ahead:** threads 4 and 8 brand and slice these. **Size:** large, mostly mechanical; it
may run long: if it does, split by package or concern and report. Moves the core lines (down,
once mini is gone).

*Review:* medium, `fixed`. Fixed: two check messages in single quotes; tests for `sayable`'s two
`@example`s. Left: the format guard cannot see strictness (thread 8 renders with `io: 'input'`);
a strict device record drops its watermark on an unknown field (keep strict; thread 8 states the
format rule); lowercase snake_case keys of 32 characters or fewer are still repeated (accepted,
in notes/security.md); `VaultProps`' union names no field (thread 8); STYLE.md still says mini
(#272); `Wayin.make`'s raw ZodError cause (thread 8). Filed as [#274](https://github.com/mrflip/safebyok/pull/274), still a draft.

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
*Orchestrator, from thread 3:* `EpochMillis` is still plain Zod in types.ts, outside the kit: move
it with the aliases. Tree-shaking is per module, not per `Validator` call, so the folder split is
where finer granularity comes, if a module boundary earns it; say what moved each size line.

*Review:* medium, `fixed`. Fixed: fakeCiphered's doc block opening; a test for its second
`@example`; the cleartext test now checks the refusal quotes nothing. Left: the passphrase
refusal gained a `meta` and `safebyok/testing` gained `FakeCiphered`, neither in the changeset
(wrap-up adds a clause each); `StampShape` and the `vault-db.ts` expectations still check
`vault_tok` with `str.min(1)` (thread 8). Noticed and outside the thread: the `FarFuture` test
covers only an exact deadline where its doc block says within a minute; `EpochMillisCases`' columns
are out of line (wrap-up, or a TODO). Filed as [#275](https://github.com/mrflip/safebyok/pull/275).

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

*Review:* medium, `fixed`. Fixed: `withinVaultScopepathPred`'s `@example` (and the README's line)
now tests each row with `isBox` before `boxscope`; `localVaultDB` names a row `scopepath` until
`isBox` passes it. Checked and holding: stored strings unchanged; the prefix ends in `^`; the
device-shelf sweep can delete only rows no accepted scope could file. Left: capacity counts a row
the listing skips (an Open Matter); double parses per row (legibility wins); `isU1Box` and two
test locals named `isBox` for the prefix test; VOCABULARY's `ckey` row (#272); a blank line in
`box-range.test.ts`. Filed as [#276](https://github.com/mrflip/safebyok/pull/276).

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

*Review:* medium, `fixed`. Checked by hand: each of the nine Convex functions `mustBe`s the very
`user_id` its component scopes by; GraphQL and the Postgres route recipe leave the check to the
per-request VaultDB, unchanged; no tautology survived the rename. Fixed: three Convex
"another user's vault is left as it was" tests used expectations that would not have landed even
for the owner (now they land for the owner, and each call's test fails without its `mustBe`);
columns realigned after the renames; the changeset's version-skew kinds. Left: `ask_passphrase_at`
overruns the snapshot's column (thread 11 or 12); `postgresVaultDB({ userId })` from JS reads as
signed out and fails safe; STYLE.md's `askPassphraseAt` example and camelCase rule (check against
#272 at the restack); the missing-field refusal is `storage_unavailable`, as `answerOf`'s;
`scopeOut` repeats the scope's names. Filed as [#277](https://github.com/mrflip/safebyok/pull/277).

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

*Review:* medium, `fixed`. Fixed: `BankProvider` handed the last user's bank down for one render
after `user_id` changed or went (now only while `held.bank.user_id === user_id`; a test records
every render). Checked and holding: every bag-taking call checks the bag against `bank.scope`
before storage, parses it once, and hands storage a scope rebuilt from `bank.scope` and the
`vaultlabel`; each of the Coach's FIXMEs is met; no retry or refresh added. Follow-ups the worker
made before filing (YOLO): four adapter `@example`s brought to `Bank.make({ ..., user_id })`; any
first-bag key named like a store (ending `db`, any case) refuses `bad_option`. Left: a misspelt
`userId` in the first bag is dropped (safe: it falls back to the bank's own user); `loadKeyDeriver`
repeats `loadStrengthChecker`'s wrapper. Filed as [#278](https://github.com/mrflip/safebyok/pull/278).

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
and the thread file, and becomes an Open Matter. *Orchestrator, from thread 3's review:* the
single record replaces `VaultProps`' union of two strict objects (whose refusal names no field);
render the stored-record format snapshots with `io: 'input'`, so strictness shows in the guard;
write where the stored shapes are described that any new device-record field bumps `format` (a
strict device record with an unknown field is discarded with its rollback watermark); move
`Wayin.make`'s `damaged_wayin` cause from a raw ZodError to a re-thrown `bad_record`. Every `vault_tok` check uses
the `vault_tok` validator (`StampShape` in box.ts and the expectations in vault-db.ts still use
`str.min(1)`; #275's review).
**Depends on:** thread 7. **Look-ahead:** thread
9 binds `VaultStamp`, `BoxStamp` and `LeaseStamp` into each ctx; thread 10's reads answer
`VaultRecord`; thread 11's Vault object `implements VaultStamp`. **Size:** large; if the adapters
run long, they are a thread of their own (8b), the core's change first.

*Review:* medium, `fixed`. Checked and holding: every ctx's bytes unchanged (`ctx-bytes.test.ts`
pins them); `gate_epoch` 0 ⇔ `gate` null on every write path; the sparse shapes keep wrapped keys
and salts from a host (the old `stale_write` `meta.vault_props_stored` carries a whole record, by
design, replaced before a host sees it); Postgres's columns and SQL check unchanged, a mismatched
row reads as damaged; Convex's two `mustBe`s unchanged, and clearing the tables before a deploy is
necessary (told in the README's *Upgrading* and the changeset); no check removed; an old flat v6
record, gated or novel, reads as damaged. Fixed: a loose `== null` in `delWayin`; blank lines; two
test cases lost in the move, plus a flat novel v6 record. Left: a demand on an empty `vault_tok`
now refuses `bad_option` (changeset clause, thread 9); `raisedDeviceRecord` can now throw
`bad_record` inside a host's transaction (thread 9 documents it); hand-written
`VaultRecord & { gate: ... }` and `Stamped` types, `stampOf` listing fields by hand, `MadeUnder`,
`LeaseSparse` beside `LeaseStamp` (thread 11). Filed as [#279](https://github.com/mrflip/safebyok/pull/279).

### 9. Each ctx binds its stamps (Preplan Phase 4, the ctx) -- `cipher_ctx`

> 4. (continued) `cipherCtx(stamp, purpose, header)` at wayin.ts:39, lease.ts:47 and lease.ts:256.
>    [...] A note for `notes/security.md` through a `sonnet` subagent: what each ctx binds, the
>    vault's stamp added to a box's and a lease's.

*Gloss:* *Preplan*, *Ctx*: `cipherCtx(stamp, purpose, header)`, a list of stamps where two are
bound (`[vaultStamp, boxStamp]`), the vault's stamp without its `format` in a box's and a lease's,
`registered_at` bound (crypto.ts:65's example made true), the encoding kept (`stableJsonify`,
undefined or null refused). VOCABULARY's `ctx`, **visible** and **unencrypted** rows are
reworded in terms of stamps (*Orchestrator, from thread 1*). The "stamp" wording in doc blocks for
"bound", "authentics" and "binding" (*Preplan*, *Names*) is this thread's too, once today's
`Stamp` type (which holds the epochs) is gone (*Orchestrator, from thread 6*). Every existing vault becomes unreadable: the changeset says so plainly
(pre-1.0). The `notes/security.md` entry through a `sonnet` subagent, as CLAUDE.md says. This is
cryptographic construction: follow what is in `src/` and the preplan, add no new primitive, and
stop and report if the preplan's ctx seems to need one. **Depends on:** thread 8. **Look-ahead:**
the box's own fields in thread 11 are what its stamp binds. **Size:** medium; review at `high`.

*Review:* high, `fixed`. Checked and holding: the encoding is today's construction (one string,
the purpose, between stamp records and the header, so the bytes decode to one input); the field
lists match the preplan; no counting epoch bound into a wayin or a box; no write rewrites a bound
field; wayins take their stamp from the standing record, never a snapshot getter; no secret in a
ctx, error or log. Fixed: `cipherCtx` bound a null record field its doc block said it refused
(now refused, no accepted ctx changes); stale lease.ts doc blocks; the changeset's account of a
lease left on a device; the binding-test helper took any throw as "does not open" (now only
AES-GCM's `OperationError`, or `bad_record` for the three literal fields); tests for
`boxCtxOf`'s and `leaseCtxOf`'s examples. Left: `registered_at` drift (a backend changing it
under the same `vault_tok` bricks the vault with misleading kinds; left unbound on 2026-10-21 in
`132df4d3` for that resilience, the preplan reverses it; an Open Matter); the stamp pickers'
home (thread 11); a parse per cipher. Filed as [#280](https://github.com/mrflip/safebyok/pull/280).

### 10. Reads (Preplan Phase 5) -- `reads`

> 5. **Reads.** The responses above; `vaultProps` becomes `vault` in the adapters' half, typed as
>    what belongs there; damaged boxes split from the listing, on the snapshot and in
>    README *Damaged boxes*; GraphQL's schema as above, both kinds of box typed.

*Gloss:* *Preplan*, *Reads*: `VaultReadResponse` `{ vault, boxes: BoxSparse[], damagedBoxes:
BoxDamaged[] }`, `splitStoredBoxes(rows: StoredBox[])` exported for adapters (*Orchestrator, from
thread 8:* rename the remaining "props" verbs and wire names, `putVaultProps`, `vault_props_stored`,
`staleVaultProps`, `Expectations.vaultProps*`, the Convex and GraphQL `vaultProps` argument, and
sweep "vault props" from VAULTDB.md, READMEs and test titles; slice from `VaultSparse`, since
`VaultRecord`'s refine refuses `pick`), every adapter
answering that shape, the base class checking a server's sound boxes again and parsing its word
on the damaged ones; `BoxSparse`/`BoxDamaged` merging the box summary types (*Preplan*, *Box*);
`damagedBoxes` on today's snapshot beside `boxes` (thread 12 reshapes the rest). GraphQL's
`__typename` dropped before a strict parse. **Depends on:** thread 9. **Look-ahead:** thread 12's
snapshot takes `boxes` and `damagedBoxes` as slices. **Size:** large.

*Review:* medium, `fixed`. Checked and holding: a server's sound boxes are re-judged and stripped
to `BoxSparse`, its damaged entries strictly parsed, a foreign-scope record still refused, nothing
ciphered reaches the snapshot; Convex keeps `mustBe` on the record's own `user_id`; every old
listing check found its new home. Fixed: `delDamagedVault` skipped the `ReadAnswer` check (a
non-object answer threw a TypeError; now `corrupt_record`, deleting nothing); VOCABULARY's
*damaged* entry; ~45 grammar slips the props→record sweep left; column alignment; two exported
renames missing from the changeset. Left: "vault props" strays outside the diff (thread 11); the
demo's key slot offers to replace a `newer_format` box, and the dashboard lists damaged rows first
(thread 12); `StoredBox.box`'s union type makes adapters cast (an Open Matter); `ReadAnswer`
accepts an answer with no `vault` key (left before 1.0); the GraphQL changeset's persisted
operations (thread 11). Filed as [#281](https://github.com/mrflip/safebyok/pull/281).

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
epochs its own fields. Tests that spied on a Vault spy on a collaborator. *Orchestrator, from thread 8:* `vault.stamp`
returns a `VaultSparse` (rename or drop it); `Lease implements Omit<LeaseSparse, 'format'>`
(keep the format private, or say why not); `demandConsistentWith`'s parameter becomes
`Partial<Omit<VaultSparse, 'format'>>`; thread 6's `vault.ask_passphrase_at` getter goes with the
others. From #279's review: name what is written out at many sites (`GatedVaultRecord`, an
exported `VaultDraft`, the `Stamped` parameter) if that reads better; derive `stampOf` by leaving
out `gate` (`const { gate: _gate, ...sparse } = record`), not by listing fields; `MadeUnder` in
box.ts as `Z.infer<typeof StampShape>`; settle `LeaseSparse` beside `LeaseStamp`. From #280: move `VaultStampPicked` (wayin.ts),
`VaultStampButFormat` and `LeaseStampPicked` (lease.ts) into vault-record.ts beside the other
shapes; rename the old-sense "stamp" (what a thing was made
under: scope, `vault_tok`, epochs) in Box's getters, `vault.stamp`, provings' `stamp` parameter,
`StampedShape`, `checkedStamp`; VOCABULARY calls that set "made under". From #281's review: finish the "vault
props" sweep (package.json descriptions of safebyok-convex, -indexeddb, -postgres;
`vault-tables.sql`/`.ts`; `idb-vault-db.ts`; `scopepath.ts`; `del-damaged-vault.ts`; `vault.ts`;
test titles in `expectations.test.ts`, `bank.test.ts`, `vault-hello.test.ts`, React's
`bank-provider-refusals.test.tsx`; the local `propsOf` in `proving.test.ts`, `wayin.test.ts`); add
to #281's changeset (`.changeset/20261026-reads.md`) that GraphQL persisted operations
(`VaultOperations.safebyokPutVaultRecord`) change with the schema. **Depends on:** thread
10. **Look-ahead:** thread 12 removes what the per-field getters fed. **Size:** large.

*Review:* medium, `fixed`. Checked and holding: `ProvingInside` was already a module-level
`WeakMap` keyed by the Vault object, written once by its constructor; one vault's proving cannot
reach another's, nothing outlives the vault, and no entry exports the registry or
`vaultRecordHeldBy`; own fields of Vault, Box and Lease hold nothing sensitive, each frozen;
`getSnapshot`/`subscribe` keep one identity on both; `demandConsistentWith` behaves as before.
Fixed: a README line and #281's changeset named removed getters; a `TH.vaultSliceOf` example that
did not typecheck; `madeUnderShape` renamed `vaultMadeUnderShape`; a Bank identity test. Left:
`Box.seal` takes `madeUnder` unchecked against `vault` (fails safe); provings' `vault` typed
`VaultStamp` though a registered Vault object is needed; the kit handed twice (`ProvingInside`
and `GatingInside`); `checkedMade` repeats `checkedMadeUnder`; stale `TH.shownOf`/`TH.jsonOf`
examples. Filed as [#282](https://github.com/mrflip/safebyok/pull/282).

### 12. The snapshot (Preplan Phase 7) -- `snapshot`

> 7. **The snapshot.** The shape above; each slice reused while unchanged (today vault.ts:972
>    rebuilds `boxes` and `capacity` on every snapshot); `state` gone, `freshness` kept. safebyok-react:
>    the passphrase modal and the passkey button read `gate` and `ask_passphrase_at`, and
>    `askPasskey` takes `snapshot.gate`. README sections on the snapshot.

*Gloss:* *Preplan*, *The snapshot a React host renders*; the demo app (`demos/`) follows, as it
reads the snapshot. *Orchestrator, from #281's review:* the demo's key slot (`ApiKeySlot`) offers to
replace or remove a `newer_format` box: show "update the app" there, as the dashboard does; the
dashboard lists every damaged row before every sound row: restore boxlabel order. *From #282:*
readers in tests, React and GraphQL read `vault.snapshot.<field>` today, `gate_epoch` among them:
move them as the snapshot loses fields; `Box.seal(vault, props, whisper, { madeUnder, now })`
takes scope and `vault_tok` from `madeUnder` unchecked: take them from `vault` and narrow
`madeUnder` to the epochs (YOLO, an Open Matter); type provings' `vault` as the Vault object
(`import type { Vault }`), not `VaultStamp`; fix `TH.shownOf`'s and `TH.jsonOf`'s examples in
`tests/test-helpers/logging.ts` (`box.toJSON()` is gone). Thread 10 left
`#boxes`/`#damagedBoxes` as frozen arrays replaced only when a box changes, so those slices hold
identity already. **Depends on:** thread 11. **Look-ahead:** thread 13's bank listing mirrors
`snapshot.boxes`'s sorted frozen form. **Size:** medium to large.

*Review:* medium, `fixed`. Checked and holding: the snapshot carries no epoch, vault
`registered_at`, salt, key deriver label, wrap or ciphertext; `keptIfSame` compares by
`stableJsonify`, so a new `revision_tok`, `written_at` or `damage` is a change; the two-field
screen choice matches the old `state` in every case; `askPasskey` refuses `absent_wayin` without a
gate or passkey; `Box.seal` takes scope and `vault_tok` from the vault. Fixed: `askPasskey`'s doc
block opening; a test for `TH.stateOf`'s example; a test that a rewritten box of the same size
replaces `boxes` and keeps `capacity`. Left: `demandConsistentWith(snapshot)` no longer catches a
change to the ways in (`gate_moved`), since the snapshot has no epochs (an Open Matter; thread 13
adds a sentence to #283's changeset and the README); `Box.seal`'s epochs are still the caller's
(a later change); repeated serializing; a check written three times in React; the demo's own
comparator. Filed as [#283](https://github.com/mrflip/safebyok/pull/283).

### 13. The bank's listing (Preplan Phase 8; what is left of Phase 9) -- `bank_listing`

> 8. **The bank's listing.** `bank.snapshot.vaults` as a sorted listing; `bank.vaultOf`;
>    `VaultParts` flattened and frozen; `BankProvider` reads the listing and calls `vaultOf`.

*Gloss:* *Preplan*, *The bank* and *Bank* (under *The box, the lease...*): the snapshot as
`(Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>) & { vaults: readonly
BankVault[] }`, `VaultEntry` → `BankVault`, `BankStatus`/`EntryStatus` → `lifecycle` unions;
`vaultOf(scope)` from a map keyed by scopepath; `VaultParts` with the scope's names as own fields,
frozen. Phase 9 was finished by thread 8. *Orchestrator, from #283's review:* add to #283's
changeset (`.changeset/20261026-snapshot.md`) and the core README's *The snapshot* one sentence:
`demandConsistentWith(snapshot)` checks the scope, the `vault_tok` and whether the Vault object
is gone, and no longer catches a change to the ways in. Reuse `keptIfSame` (vault.ts) for
`bank.snapshot.vaults`. `Bank`'s `getSnapshot`/`subscribe` are prototype getters already (thread
11); the bank's status is `#libs.status` (`made | starting | timely | refused`, thread 7). **Depends on:** thread 12, merged: cut from `origin/main`. **Size:** medium.

### 14. Refusals say less; validators go public -- `rulings`

*Orchestrator:* no Coach text of its own. The Coach's rulings in the sprint doc on 2026-10-26
and 2026-10-27, quoted, and the error-handler audit (`error-handlers-audit.md` in this
directory; read it whole). The Coach's model: a catch-and-rethrow block, or anything turning a
failed parse into a refusal, only aligns the kind and attaches context, never throws, and never
sifts broken input to explain it.

* **Cut the key sifting.** "Is someone sifting through all the keys to find out why a strict
  mode error was thrown? If so ... remove that. Beware complicated logic in a handler." And: "If
  there's code sifting through extra keys to mind-read them, remove it. Validate options in strict
  mode. Getting the store wrong is a hard-to-miss error." Per the audit: delete `isSayable`, its
  two regexes and `MaxSayableChars` (checks/validator.ts); a refusal for unknown fields says how
  many and lists the names the bag takes, never the names it was given; `refusalOf` joins the
  first issues' messages; drop `checkMakeBankOpts`'s pre-scan and `RenamedMakeBankOpts` and let
  `.strict()` speak; delete `checkNoStoresIn` and the store-named-key check in the vault bag
  (the vault bag still keeps only its scope, ignoring other fields, as ruled; every options bag
  is strict); `parseKeyDeriverSpec` gives one fixed sentence (drop `SpecLimitForField`); drop
  `optionsCheck`'s `isPlainBag` hint. The six catch blocks stay. Add a test that no refusal
  repeats a value or key from its input.
* **Nothing fine-grained on broken data.** "Do not make fine grained decisions on broken data,
  especially in an exception handler." `Wayin.make`'s failure is our `bad_record`, nothing
  compared or re-parsed.
* **Validators go public.** "No, public: we need pr's" (of `Validator`), and "Any validator
  touching an external interface should be exported. My guess is that will be close enough to
  most that you should export the lot." Export `Validator` and every validator from the main
  entry (a namespace, if the entry would otherwise grow by dozens of names: say which); the
  IndexedDB package makes its option checks with `Validator`. A public-surface change: the
  changeset says so.
* **Convex imports the core.** "Why would it not import most of what it does from core?
  Validators, the checks you mentioned -- having a separation sounds like a terrible plan.
  Explain and/or fix." Make the component import the core's validators and checks; if Convex's
  component bundling forbids it, report the constraint instead, in the PR and the thread file.
* **Adapters' box rows unbranded.** What an adapter hands `splitStoredBoxes` is the unbranded
  input type, so no adapter casts.

**Depends on:** thread 13. **Size:** medium to large; if the Convex import runs long, file what
is done and say so: it becomes its own thread.

### 15. Names and small rulings -- `tidy`

*Orchestrator:* the rest of the Coach's rulings of 2026-10-26 and 2026-10-27, and the leftovers
on the sprint doc's Cleanup tab.

* **The redundant-alias lint rule goes.** "Reject the first rule, it's stupid. Make a getter
  .props returning a shallow copy or whatever the best equivalent of spreading it is." Turn off
  `redundant-type-aliases`; give the Vault object a getter handing out a frozen shallow copy of
  its fields, named per VOCABULARY ("props" is retired: look up the name first), and put that
  name in NEWSTYLE's and STYLE.md's example. `no-misused-spread` stays.
* **A test helper for the epochs.** "cheatGetVaultEpoch(vault) says everything I need to know."
  Tests read epochs through `TH.cheatGetVaultEpoch(vault)`, not `vaultRecordHeldBy`.
* **"Listed" becomes "sparse".** "converge names saying 'listed' to say 'sparse' if they're the
  same thing." Where a name or doc says "listed" for what VOCABULARY calls the sparse shape,
  rename it; where it means something else, leave it and say which in the thread file.
* **`Gate.of(vault, vaultProps)`.** "Explain why this makes sense (vault but also vaultProps???),
  or fix." *Orchestrator:* on main it is `Gate.of(vault, vaultRecord, kit)`; the first
  argument only repeats three names the record holds, so two sources could disagree. Make it
  `Gate.of(vaultRecord, kit)` (4 call sites in gating.ts and vault.ts, gate.test.ts, the doc
  examples). `Gate.make` keeps its vault argument.
* **"Standing", if the Coach rules it** (a matter on the sprint doc, 2026-10-27): stored for the
  record as it is in storage now, open for the gating open on a vault, live for a Vault object
  not gone or a lease in force (`#checkStanding` → `#checkLive`), `StandInGating`, current for
  "the standing passphrase". About 240 lines; one commit. Skip it unless the ruling has come.
* **Small leftovers:** `safebyok-graphql/tests/vault-resolvers.test.ts:264` skips a slot with a hole (`_rootField`, as line 254 names it); `src/scopepath.ts:26` still says "The scopepath of a vault's props"; the format snapshot test's comment ("never rewrite a standing format's
  snapshot") reworded for pre-1.0, where a layout may change under the same format; restore the
  passphrase refusal's full stop (#275); one sentence in VAULTDB.md that an adapter enforcing
  `maxBoxes` from capacity counts rows the listing skips; `.claude/agents/documentarian.md`'s
  example names `bad_label`, now `bad_scope`; a TODO.md entry, "allow async passphrase checking",
  unless a host's passphrase checker may already be async (check first; say which).

**Depends on:** thread 14. **Size:** medium.

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
