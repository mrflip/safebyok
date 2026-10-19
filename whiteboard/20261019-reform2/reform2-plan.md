# Sprint plan: reform2, the no-brainers

Date: 2026-10-19. Issued by: the Coach (`/sprint reform2`, from the preplan beside this file,
`reform2-preplan.md`). Mode: **YOLO**. Review level: medium. Threads at once: 2.
Sprint branch: `20261019-reform2`. Sprint doc (Open Matters, Progress, Resolved):
https://claude.ai/code/artifact/62febfc3-47ee-4a7c-b99e-ea494b4b169c

**Status:** every thread filed; wrap-up: the line main → #177 → #178 → #179 → #176 → #182 → #183 → #184 is being restacked onto today's main (thread 7 conflicts with #169/#170's wording).

The Coach struck threads 3 (`one_look`), 4 (`no_clear`) and 5 (`newer_lockbox`) after issuing
the preplan. Their text is kept in the preplan; this plan keeps their numbers so the preplan and
the design doc still line up, and no worker builds them.

## Read first

* This plan's *Ground rules* and your own thread's entry. The preplan (`reform2-preplan.md`) is
  the Coach's text; this plan carries it verbatim for each live thread, so read the preplan only
  for its *Deferred* list, when you need to know whether something is out of scope.
* `VOCABULARY.md` and `STYLE.md`, *Naming* and *Tests*.
* `PROCESS.md`, *Threads* and *Changesets*.
* `packages/safebyok/VAULTDB.md`, whole: the storage contract, line by line (threads 1, 2, 6).
* `packages/safebyok/src/vault-db.ts`: the public verbs `updateBox`, `retireBox`, `listBoxes`,
  `checkOutgoing`, `listedOrDamaged`, and the `do*` abstract methods. Grep, then read the lines.
* `packages/safebyok/src/vault.ts`: `storeBox`, `writeOver`, `refuseStaleStoreBox`,
  `refreshOnStale`, `listedRevisionOf`, `retireBox`. Grep, then read the lines.

## Ground rules

The preplan's ground rules hold, verbatim:

* **One write, arbitrated by storage.** Every change here keeps the conditional write exactly as
  it is: the adapter compares `vault_id`, `vault_key_epoch` and the standing `revision_tok` (or
  none) and writes in one atomic step. No thread weakens that compare, and no thread adds a
  second storage call to a verb that has one. A thread that finds it needs one stops and
  raises it.
* **Returned state is data, never a thrown value's property.** What an adapter hands back on
  success is validated on the way in like any read, and folded into the snapshot by the vault.
  No `VaultError` carries a record, a sidecar or a whisper.
* **No stored-shape change.** `RetireExpectation` is not stored; a record's format tag does not
  move. If a thread finds it must change what is written, stop and raise it. (Pre-1.0 the
  change would be allowed; it is simply not in this sprint.)
* **Refusal kinds are a contract.** A new kind changes `VaultErrorKindVals`, `VaultErrorFamilyForKind`,
  every message that names it, the README table, and the react boundary, with a doc block and a
  test for its `@example`.
* **The conformance suite is the contract's test.** `describeVaultDB` (in `packages/safebyok/tests/test-helpers.ts`, published as `safebyok/testing`)
  and `VAULTDB.md` change in the same thread as the verb they describe, and every adapter passes
  before the thread files.
* **The five adapters move together.** A VaultDB verb changes in the base class
  (`packages/safebyok/src/vault-db.ts`, including `localVaultDB`), `safebyok-indexeddb`,
  `safebyok-postgres`, `safebyok-convex` and `safebyok-graphql` in one thread. Half-moved trees
  never file.
* **Size budgets.** No thread runs `--raise`; thread 8 runs `pnpm size:budget --write` and reports.
* Each PR carries a changeset (`minor`, pre-1.0).

*Orchestrator:* added for this sprint:

* **YOLO.** A worker answers two-way-door judgment calls itself, records each in its thread
  file's *Open matters* as a decision taken (so it reaches the Coach's Open Matters tab), and
  keeps going. The stored shape, the public surface beyond what a thread's text names, and
  anything touching `main` or a release are still the Coach's: stop and report `blocked`.
* **Over a size limit.** Should a thread's build go over a `.size-limit.json` line, it does not
  raise it: it reports the entry and the overage as an open matter, and the orchestrator decides.
* **Thread 7 runs beside the line** and touches only its own paragraphs (README's concurrency
  and sidecar paragraphs, VOCABULARY.md, the sidecar paragraph of the `storeBox()` doc block), so
  that the restack at wrap-up has as little to merge as possible. Thread 1 adds its paragraph to
  the same doc block: it leaves the sidecar paragraph alone.

## Order

*Orchestrator:* threads 9 and 10 were added from the Coach's rulings; both stand on 8, and 10
is restacked onto 9 at wrap-up, so the line is 1 → 2 → 6 → 7 → 8 → 9 → 10.

Threads 1, 2 and 6 stack in one line from `origin/main`: 2 on 1, 6 on 2, since each touches
`vault-db.ts` and `tests/test-helpers.ts` where the one before did. Thread 7 is documents only,
starts from `origin/main`, runs beside 1, and joins the line at wrap-up. Thread 8 (the preplan's
7 (c) and (d), split off because they wait for 6) stacks on 6 and is the line's last thread
before the sprint PR.

---

Next thread: 1, `returning`

A successful `updateBox` hands back the record as storage now holds it. Change the base class
verb to `updateBox(scope, lockbox, expected): Promise<Lockbox>`, and the abstract
`doUpdateBox` to resolve the stored record on success and `null` when the expectation failed
(today: `true` / `false`). The base class validates the returned record with the same check a
`readBox` gets, refuses a malformed one as `corrupt_record` (the adapter wrote something it
cannot read back: say so in the message), and still throws `Refusals.staleWrite('lockbox')` for
`null`. Each adapter returns what it wrote from the same atomic step: Postgres `RETURNING` the
row's columns in place of `RETURNING 1 AS landed`, Convex the mutation's return value, IndexedDB
and the in-memory store the record in the same transaction, GraphQL the mutation's payload
(schema and resolver both). `describeVaultDB` gains cases: the returned record equals the one
written, field for field; a refused write returns nothing and throws stale; a returned record
that fails its check is `corrupt_record`. The vault does not yet use the value: `storeBox`
keeps its post-write `refresh()`. Its doc block gains one paragraph saying which errors can
arrive after the write has landed (a failing read in that refresh: `storage_unavailable`,
`identity_revoked`, `rolled_back`, `newer_format`) and that a retry writes the same whisper
over itself, harmlessly. `VAULTDB.md` follows.

Gloss: touches `vault-db.ts` (`updateBox`, `doUpdateBox`, `localVaultDB`), `tests/test-helpers.ts`
(`describeVaultDB`), `VAULTDB.md`, every adapter's `doUpdateBox` and its tests (postgres SQL,
convex component function, graphql schema and resolvers), `vault.ts` doc block only, a
changeset. Depends on nothing: cut from `origin/main`. Size: medium, mechanical. Look-ahead:
thread 2 changes `retireBox` the same way, so shape the base class's "validate what came back"
step so `retireBox`'s outcome can use it beside; thread 6 then makes `checkOutgoing`'s refusal
its own kind, so leave `checkOutgoing` as it is. Model: the default.

*Review:* `fixed` ([#177](https://github.com/mrflip/safebyok/pull/177)). Fixed: VAULTDB.md said a
`false` from `doUpdateBox` is stale (it is `corrupt_record`); two `return await` outside a `try`
(IndexedDB, the demo's outage wrapper). Left: a `corrupt_record` answer skips `storeBox`'s
refresh (to the Coach, Rec: with the deferred fold); Postgres `InsertBoxOutcome` loosely typed
(to the Coach, Rec: next time Postgres is touched); Convex's read-back `&&` (noted only);
`writtenBack` and `damagedAs` near twins (noted only). Filed at `73d665e1`.

---

Next thread: 2, `retire_revision`

A retire names the revision it means. `RetireExpectation` for `retireBox` gains
`revision_tok: string | null`: the revision this device read for the lockbox, or `null` for
one listed with none readable. The adapter still removes whatever stands under the label when
the vault props carry the expected `vault_id` (a retirement within the right vault wins, as
`VAULTDB.md` says today), but reports what it found: `doRetireBox` resolves
`{ outcome: 'retired' | 'retired_other' | 'absent' }` on a standing vault and `null` when the
vault did not match. `retired_other` means a record was removed whose `revision_tok` was not
the expected one, or which had none where one was expected. The base class `retireBox` resolves
that outcome and throws stale for `null`. The vault's `retireBox()` passes the revision from the
snapshot's listing (`listedRevisionOf`), and on `retired_other` warns through the host's logger
that a different revision than the one shown was retired, naming neither; its own result stays
`void`. `retireVault` and `retireDamagedVault` keep their vault-only expectation. The compare
and the delete stay one atomic step in every adapter. `describeVaultDB` gains the three
outcomes and the vault-mismatch refusal. `VAULTDB.md` follows.

Gloss: touches `vault-db.ts` (`RetireExpectation` for boxes, `retireBox`, `doRetireBox`,
`localVaultDB`), `expectations.ts` if a compare lives there, `tests/test-helpers.ts`, `VAULTDB.md`, every
adapter's `doRetireBox` and tests, `vault.ts` (`retireBox`, and `writeOver`'s retire, which
stays now that thread 4 is struck: it passes the revision it read and, on `retired_other`,
warns as `retireBox()` does and goes on to its write, the same honor-and-warn), a changeset. Depends on 1: cut from thread 1's tip once
filed. Size: medium. Model: the default. *Orchestrator:* the honor-and-warn default is a
YOLO decision pending the Coach's word (Open Matters); build it as written.

*Review:* `fixed` ([#178](https://github.com/mrflip/safebyok/pull/178)). Fixed: Postgres and
Convex compared the removed `revision_tok` raw, so a row holding `''` (listed with none) retired
as `retired_other` with a false warning; Postgres now uses `Expectations.retirementOf`, Convex
an inline equivalent; the battery's odd-labels retire now checks its outcome. Left: the outcome
rule lives twice (core helper, Convex inline; noted); VAULTDB.md 3.4 names the helper as the
key-value stores' only (handed to thread 6). Real-Postgres e2e not run locally. Filed at
`3141cc10`.

---

Thread 3, `one_look`: **struck by the Coach** (2026-10-19). Not built.

Thread 4, `no_clear`: **struck by the Coach** (2026-10-19). Not built. `writeOver`'s
retire-then-write stays.

Thread 5, `newer_lockbox`: **struck by the Coach** (2026-10-19). Not built.

---

Next thread: 6, `bad_record`

An outgoing record that fails its own check gets its own refusal. Add kind `bad_record` to
`VaultErrorKindVals` (family: misuse, beside `bad_option`): what `checkOutgoing` throws when a
VaultDB verb is handed a record or expectation that is not one this package builds. Its message
is the one `checkOutgoing` says today, unchanged in substance. `bad_option` keeps every other use.
README's refusals table gains the row; the react boundary treats it as `bad_option` is treated.
Tests: each public verb refuses a malformed record or expectation as `bad_record`, in
`describeVaultDB`.

Gloss: touches `errors.ts`, `vault-db.ts` (`checkOutgoing`), `tests/test-helpers.ts`, README, react
`boundary.tsx`, a changeset. Depends on 2 (was 5; 3 to 5 are struck): cut from thread 2's tip
once filed. Its `describeVaultDB` cases cover thread 2's new `revision_tok` in the retire
expectation. Size: small. Model: `sonnet`. *Orchestrator:* the kind's name is a YOLO decision
pending the Coach's word.

*Review:* `fixed` ([#179](https://github.com/mrflip/safebyok/pull/179)). Fixed: VAULTDB.md 3.4
said Convex compares through `retirementOf` (it compares inline); the README row pointed at
`Vault.make` for building records; two write verbs' doc blocks under-named `bad_record`; the
battery's `bad_record` case retired in a vault holding no lockbox (now stores one first), its
title and a cast. Left: `checkOutgoing`'s "nothing was written" reads oddly for the retire verbs
(to the Coach, with the name); a missing lockbox or a failing applabel is still `bad_label`
(handed to thread 8 as a README clause); GraphQL's client maps BAD_USER_INPUT to `bad_option`
(to the Coach). Filed at `bac8218c`.

---

Next thread: 7, `docs`

The preplan's thread 7, parts (a) and (b); parts (c) and (d) are thread 8.

Documents only. (a) README, concurrency paragraph: an app should not overlap its own `storeBox()`
calls on one lockbox; the second is refused as `stale_write` worded as another device's write,
since storage cannot tell the two apart (from the #160 review). (b) VOCABULARY.md: the sidecar's
trust class. It is *server-readable*: authenticated (bound into the lockbox's encryption, so a
change in storage makes the lockbox refuse to open) but never encrypted, readable by anyone who
can read the database. Not "public", not "plain". Legitimate contents: what an app wants
searchable server-side (a team, a rotation reminder, a usage count). Never secret material.
README's sidecar paragraph and the `storeBox()` doc block say the same in the same words; the
word "public" leaves every sentence about the sidecar.

Gloss: touches README, VOCABULARY.md, the `storeBox()` doc block's sidecar paragraph, and any
other doc block or document whose sentence about the sidecar says "public" (grep `packages/` and
the root's docs). A changeset: `--empty` unless the doc-block wording reaches a published
`.d.ts`, then a `patch`-sized `minor` entry saying the docs changed. Depends on nothing: cut from
`origin/main`, beside thread 1. Size: small. Model: `sonnet`. Note the Coach's TODO speaks of
the sidecar as "server accessible"; the preplan's word, *server-readable*, is the one to build.

*Review:* `fixed` ([#176](https://github.com/mrflip/safebyok/pull/176)). Fixed: the
concurrency paragraph named the *second* call as the refused one (it is whichever lands second);
the overview read as though ciphertext were unreadable by the server. Then, by directive, the
worker brought three leftover sentences (`checkStoreOpts`'s message, `recordOpens`, a `storeBox`
comment) to *server-readable*. Left: the clear-then-write lost write over a damaged box naming
no revision (old code; to the Coach, Rec bring back thread 4); "a usage count" as a sidecar
example (to the Coach); "server-readable" names more than the sidecar (to the Coach, with the
later "public fields" sweep). Filed at `4310fc27`.

---

Next thread: 8, `summary`

The preplan's thread 7, parts (c) and (d):

(c) `pnpm size:budget --write` on the line's tip once threads 1 to 6 are filed, reporting every
line that moved. (d) One changeset summarising the sprint for the release note.

Gloss: touches `.size-limit.json` and one changeset file. Depends on 6 and on 7: cut from the
line's tip once 7 is restacked onto 6. Size: small. Model: `sonnet`.

*Review:* none: no code (a changeset and one README clause). [#182](https://github.com/mrflip/safebyok/pull/182).
`pnpm size:budget --write` moved no line. Filed at `e387f809`.

---

Next thread: 9, `damaged_warning`

*Orchestrator:* from the Coach's ruling (2026-10-19) on the retire-first mismatch: "yes. Once a
record exists there must always be a record (tombstone or valid) while the vault exists.
Clearing a damaged box with an old revision id should still warn, with something in there
making clear it was a damaged record".

Honor-and-warn stands. When a retire the vault makes finds another revision than it showed
(`retired_other`) and the lockbox it showed was listed damaged, the warning says so: the
`retireBox()` warning (today "The lockbox retired was not the revision this device showed...")
says the lockbox this device showed was a damaged one, and both it and `writeOver`'s retire-first
warning (which already says "Storing over a damaged lockbox...") carry `damaged: true` in the
log context beside `call`, so a host can branch on it. Neither names a revision or a boxlabel.
Tests: `retireBox()` over a damaged box meeting `retired_other` warns once with the damaged
wording and `damaged: true`; over a sound box, without either; the #178 lost-write test checks
the flag.

Gloss: touches `vault.ts` (`retireBox`, `writeOver`), `tests/vault.test.ts`, README's
honor-and-warn paragraph at the end of *Damaged lockboxes* if it quotes the warning, a
changeset. Depends on 8 (the line's tip). Size: small. Model: `sonnet`. The invariant itself
(always a record while the vault stands) is the deferred tombstones' work, not this thread's.

*Review:* `fixed` ([#183](https://github.com/mrflip/safebyok/pull/183)). Fixed: "context" became the
logger's "story"; the new test checks no whisper reaches the log; the reviewer's `patch`
changeset went back to the sprint's `minor`. By directive: README's logger list names both
`retired_other` warnings; a test for a damaged box with a readable revision. Left: the
`storeBox()` doc block lacks the warning (added at the restack); the two-messages decision
stands. Filed at `b4fe9cc5`.

---

Next thread: 10, `visible`

*Orchestrator:* from the Coach's rulings (2026-10-19): on the sidecar's word, "how about
\"visible\"?"; on the record-general "public fields" wording, "yeah, visible, in a sweep -- you
can leave intermediate rewordings as is if that's easiesst (i.e. it's ok if it changed and then
is changed back)".

The trust class is *visible*: authenticated (bound into the lockbox's or record's encryption
context, so a change in storage makes it refuse to open) but never encrypted, readable by anyone
who can read the database. VOCABULARY.md gives *visible* an entry of its own, naming the fields
it covers (a lockbox's label, ids, times and sidecar; the like on vault props and wayins), and
the sidecar's entry points to it. Sweep "server-readable" (thread 7's word) and the
record-general "public fields / public face / public shell" in prose, doc blocks, error messages
and the summary changeset to *visible*. Code identifiers stay (GraphQL's `'plain'` class in
`fields.ts` is a separate, unruled matter).

Gloss: touches VOCABULARY.md, the core and adapter READMEs, doc blocks in `vault.ts`, `types.ts`,
`vault-db.ts`, `lockbox.ts`, `checkStoreOpts`'s message, the graphql `vault-schema.ts`
descriptions, thread 8's summary changeset, and a changeset of its own. Grep `packages/` and the
root's docs (`--exclude-dir={whiteboard,winboard,node_modules,dist}`) for `server-readable`,
`public field`, `public face`, `public shell`, and "public" near "sidecar". Depends on 8; runs
beside 9 and is restacked onto it. Size: small. Model: `sonnet`.

*Review:* `fixed` ([#184](https://github.com/mrflip/safebyok/pull/184), still draft: the worker's
`gh pr ready` was refused by the permission check, and is the Coach's). The classing was checked
against `boxCtx`, `wayinCtxOf` and the schemas, and holds. Fixed: VOCABULARY's sidecar example;
the *visible* list missed bound wayin and lockbox fields; the props' own `vault_key_epoch` was
unclassed (it is *unencrypted*); a test title. Left: changeset level (sprint rule: `minor`);
GraphQL's `'plain'` exception (noted in VOCABULARY at the restack); `prior_vault_key` unclassed
and the README overview sentence (to the Coach). Filed at `f782962e`.

---

## For the Coach

Each is a row in the sprint doc's *Open Matters*; in YOLO the sprint builds the Rec meanwhile.

* Ruled 2026-10-19: honor-and-warn ("yes", both places); `bad_record` ("Fine for now").
  The rest live in the sprint doc's *Open Matters*.

## Deferred

The preplan's *Deferred* list, plus threads 3, 4 and 5.

*Orchestrator:* the Coach's invariant for the tombstones work (2026-10-19): once a record exists
there must always be a record, a tombstone or a valid one, while the vault exists. Today's
clear-then-write over a damaged box naming no revision breaks it for the moment between its two
calls.

*Orchestrator:* the Coach's direction for the always-complete result (2026-10-19): once a new
return shape is added, an adapter returns the record in the database at the time it returns --
the old record or the new one -- and an explanation. Until then, only `null` is stale (#177).
Also deferred, ruled "yes": a `corrupt_record` answer to `updateBox` skips `storeBox`'s refresh;
the work that folds a write's answer into the snapshot should refresh or fold before it throws.

*Orchestrator:* TODO entries for a TODO PR of its own at wrap-up: Postgres `InsertBoxOutcome`
loosely typed, its lockbox columns untyped beside the four flags (type them, or return them as
one `row_to_json` column), next time Postgres is touched (Coach: "add as todo", #177 review).
