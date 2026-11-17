# Sprint preplan: reform 2, the no-brainers

Date: 2026-10-19. Issued by: the Coach (drafted by the agent from the design discussion at
https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70, tabs "Modifications",
"Thunks" and "Bad news"). Mode: normal. Review level: medium. Threads at once: 2 (threads 1
through 6 stack; thread 7 is documents only and runs beside them).

This sprint lands the parts of the store-path redesign that were ruled straightforward: a
successful write hands back what storage now holds, a retire names the revision it means, the
store reads its inputs once, the store stops clearing damaged boxes, a lockbox from a newer
safebyok is told apart from a damaged one, and an outgoing record that fails its own check gets
its own refusal. It does **not** define the always-complete result union, the bad-news handler,
`retireIfIncoherent`, tombstones, the four subscriptions, the proof callback in `unlock()`, or
the sidecar's storage type (see *Deferred*).

## Ground rules

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
* **Size budgets.** No thread runs `--raise`; thread 7 runs `pnpm size:budget --write` and reports.
* Each PR carries a changeset (`minor`, pre-1.0).

## Read first

* `whiteboard/20261019-reform2/reform2-preplan.md` (this file). It is self-contained: the design
  doc is background the Coach has read, not a spec a worker needs. Where this preplan and the code
  differ, the preplan wins; where it is silent, today's code wins.
* `VOCABULARY.md` and `STYLE.md`, *Naming* and *Tests*.
* `PROCESS.md`, *Threads* and *Changesets*.
* `packages/safebyok/VAULTDB.md`, whole: the storage contract, line by line.
* `packages/safebyok/src/vault-db.ts`: the public verbs `updateBox`, `retireBox`, `listBoxes`,
  `checkOutgoing`, `listedOrDamaged`, and the `do*` abstract methods.
* `packages/safebyok/src/vault.ts`: `storeBox` (near line 1820), `writeOver`,
  `refuseStaleStoreBox`, `refreshOnStale`, `catchUp`, `listedRevisionOf`, `isListedDamaged`,
  `readBoxOrDamaged`, `ensureRoomFor`, `takeStorage`. Grep, then read the lines.

## Order

Threads 1 through 6 stack in one line from `origin/main`: 2 on 1, 3 on 2, and so on, since
each touches `vault-db.ts` or `vault.ts` where the one before did. Thread 7 is documents only,
starts from `origin/main`, and joins the line wherever it is filed.

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
changeset. Depends on nothing. Size: medium, mechanical. Look-ahead: thread 2 changes
`retireBox` the same way. Model: the default.

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
adapter's `doRetireBox` and tests, `vault.ts` (`retireBox`, `writeOver`'s retire while it
exists), a changeset. Depends on 1. Size: medium. Look-ahead: thread 4 deletes the retire
inside `writeOver`. Model: the default.

---

Next thread: 3, `one_look`

`storeBox()` reads the snapshot once. Right after `ensureUnlocked()`, capture `vaultProps` and
`boxes` into locals, and derive everything the write names from that capture: the listed
revision and damaged flag (`listedRevisionOf`, `isListedDamaged` take the captured list), the
expectation's `vault_id` and `vault_key_epoch`, and `ensureRoomFor`'s count. Nothing in the
call reads the module's `boxes` or `vaultProps` after the capture; `keyInHand()` still checks
the key. A refresh that lands mid-call (the adapter's bell, or `ensureRoomFor`'s own) can no
longer change what the write names: storage arbitrates, and a stale capture costs a refusal,
never a record. Add a test with `localVaultDB`: a second device stores a sound lockbox over a
damaged one and the bell rings between this device's `readBox` and its write; this device's
store is refused as `stale_write`, and the other device's sidecar and `registered_at` stand.
(Today it lands and carries nothing forward: that is the bug this thread fixes.) Have a `sonnet`
subagent note in `notes/security.md` that a store now names only what it read at one instant.

Gloss: touches `vault.ts` (`storeBox`, `ensureRoomFor`, `listedRevisionOf`, `isListedDamaged`),
`tests/vault.test.ts`, `notes/security.md`, a changeset. Depends on 2. Size: small. Model: the
default.

---

Next thread: 4, `no_clear`

`storeBox()` stops clearing damaged boxes. Delete `clearsFirst` and the retire inside
`writeOver`: a store is one `updateBox`, always. A lockbox listed damaged that names a revision
is still written over in that one write, carrying nothing forward, as today. A lockbox listed
damaged that names no revision is refused with kind `damaged_lockbox`, its message saying the
lockbox is damaged beyond naming, that nothing was written, and to `retireBox()` it first (which
thread 2's retire does, naming `null`). Rewrite the `storeBox()` doc block's damaged paragraph
and the README's; delete the tests for the two-step and the "cleared but not stored" wording,
and add one for the refusal and one proving that a store over a damaged box naming a revision is
a single write (count the adapter's calls). Have a `sonnet` subagent note in
`notes/security.md` that the two-call clear is gone and why (the gap between its calls let a
refusal say "nothing written" after a record was removed).

Gloss: touches `vault.ts` (`storeBox`, `writeOver`, `refuseStaleStoreBox`), README,
`tests/vault.test.ts`, `notes/security.md`, a changeset. Depends on 3. Size: small. Model: the
default.

---

Next thread: 5, `newer_lockbox`

A lockbox a newer safebyok wrote is told apart from a damaged one, as vault props already are
(`mayBeNewer`, `newerVaultProps` in `vault-db.ts`). In `listedOrDamaged`, a record whose
`format` reads as text, starts with `safebyok-lockbox-v`, and names a version above this
package's is listed as `{ boxlabel, damaged: true, revision_tok, newer: true }`: add the
optional `newer` flag to `DamagedLockbox`, absent on every other damaged row, so the snapshot's
shape grows one field and no consumer breaks. `readBox` on such a record refuses `newer_format`
rather than `corrupt_record`, and the vault's `readBox()`/`useBox()` pass that kind through
rather than `damaged_lockbox`. `storeBox()` refuses to write over one with kind `newer_format`,
message saying a newer version of the app wrote it and to open the vault there; `retireBox()`
still removes it. Tests for each path with a fixture record under `safebyok-lockbox-v99`.
README's refusals table: the `newer_format` row gains the lockbox case.

Gloss: touches `vault-db.ts` (`listedOrDamaged`, `readBox`), `types.ts` (`DamagedLockbox`),
`vault.ts` (`storeBox`, `openBox`), `tests/`, `fixtures/`, README, a changeset. Depends on 4.
Size: small. Model: the default.

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
`boundary.tsx`, a changeset. Depends on 5. Size: small. Model: `sonnet`.

---

Next thread: 7, `docs`

Documents only. (a) README, concurrency paragraph: an app should not overlap its own `storeBox()`
calls on one lockbox; the second is refused as `stale_write` worded as another device's write,
since storage cannot tell the two apart (from the #160 review). (b) VOCABULARY.md: the sidecar's
trust class. It is *server-readable*: authenticated (bound into the lockbox's encryption, so a
change in storage makes the lockbox refuse to open) but never encrypted, readable by anyone who
can read the database. Not "public", not "plain". Legitimate contents: what an app wants
searchable server-side (a team, a rotation reminder, a usage count). Never secret material.
README's sidecar paragraph and the `storeBox()` doc block say the same in the same words; the
word "public" leaves every sentence about the sidecar. (c) `pnpm size:budget --write` on the
line's tip once threads 1 to 6 are filed, reporting every line that moved. (d) One changeset
summarising the sprint for the release note.

Gloss: touches README, VOCABULARY.md, the `storeBox()` doc block's sidecar paragraph,
`.size-limit.json`. Depends on nothing for (a) and (b); (c) and (d) wait for thread 6. Size:
small. Model: `sonnet`.

---

## For the Coach

* Thread 4 changes documented behaviour (a store over a damaged box naming no revision now
  refuses). Ruled in discussion as "the policy engine is not good"; confirm before it starts.
* Thread 2's default on a revision mismatch is honor-and-warn through the logger, until the
  bad-news mechanism exists to raise it as a condition. Confirm, or make it strict (refuse as
  stale) for now.
* Thread 6's kind name: `bad_record`. Say if another fits the family better.
* Thread 5 adds `newer: true` to `DamagedLockbox` rather than a `reason` field. The reason field
  is the handler's, and comes with it; say if you would rather it start here.

## Deferred (talked about, not in this sprint)

* **The always-complete result.** Every VaultDB and DeviceDB verb resolves a tagged union
  (`written`, `stale_write` with the standing record, `invalid`, fault with cause), validated so
  the fields each case forbids are absent; errors are thrown only at the vault's surface. Thread 1
  is the first step: success returns state. The refusal side and the audit that every DB call
  completes are the next sprint's.
* **The bad-news handler** and its reason field; `retireIfIncoherent` on the vaultDB, callable
  locked; the defaults per kind (retire for incoherent props and will-not-open; notify for a
  foreign key epoch and a newer format); whether the handler fires once per sighting.
* **Tombstones**, keeping the retired record's `revision_tok` so repeat retires are idempotent,
  hidden from the listing, visible to a per-lockbox subscriber; who collects them.
* **Four subscriptions**: the vault (with capacity, total and available), the wayins, the listing
  (no sidecar), one lockbox by label holding the full record, fed by a per-box read.
* **`unlock()` with the proof callback**: ensures vault, wayins and listing present and valid;
  asks for proof near the lease end through a customer callback; the decline, the one-prompt
  rule, passkeys needing a gesture, the create branch, the poll period on backends without push.
* **The store path as proposed** (validate, unlock, core props from the listing, serialize,
  best-effort capacity, seal, write returning state with policy handlers): lands once the above
  do. Thread 3 is its "core props from the listing" step in today's shape.
* **The sidecar's storage type**: drop `sidecar_json` as text in adapters that can index (jsonb);
  the base class keeps the stable text for the AEAD binding. Its own byte cap and a host-supplied
  validator ride with it. Needs a format-tag decision, so not a no-brainer.
* **Sameness of a lost write**: the handle keeps the revision tokens it minted and recognises its
  own write as the winner; answers the double-click without a sameness check.
* **Rows filed below the name floor**: unlisted, unreachable, counted; a synthetic listing or an
  adapter sweep.
* **Local splice** of a landed write into the snapshot in place of the post-write refresh;
  moot once operations return state and the vault folds it in.
* The Shelf DB base class over get/set/delete/list, keeping one conditional write.
* Every item in the previous sprint's *Deferred* list not named above.
