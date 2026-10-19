# Thread 2: retire_revision (2026-10-19)

Branch `20261019-retire_revision`, PR [#178](https://github.com/mrflip/safebyok/pull/178), stacked on [#177](https://github.com/mrflip/safebyok/pull/177). Justify: green (core 2224 passed, 35 skipped; indexeddb 142; postgres 256; convex 266; graphql 250; react 227; fastkey 49; demo 196; e2e 86; scripts 258). No size line over its limit.

* **Built**:
  * Core (`packages/safebyok/src/vault-db.ts`): `LockboxRetireExpectation`, `{ vault_id,
    revision_tok: string | null }`, for `retireBox`; `RetireExpectation` stays vault-only for
    `retireVault` and `retireDamagedVault`. `LockboxRetirement`, `{ outcome: 'retired' |
    'retired_other' | 'absent' }`, is what `retireBox` now resolves. Abstract `doRetireBox`
    resolves that outcome, or `null` for a vault mismatch (`Promise<unknown>`, as `doUpdateBox`).
    The base class throws stale for `null` only. It checks anything else through thread 1's
    `writtenBack` with a new `checkAnswer` (corrupt_record, quoting nothing). `writtenBack`'s
    message is reworded so it reads for an answer as well as a record ("answered with what this
    package cannot read back").
  * `Expectations.retirementOf(standingBox, expected)` (`src/expectations.ts`, exported): the
    outcome a key-value store reports. For a null `revision_tok`, a row whose revision does not
    read as one (not a non-empty string) counts as `retired`, compared the way the listing reads a
    damaged record. `localVaultDB` and IndexedDB use it.
  * Adapters, each in its one atomic step:
    * `localVaultDB` reads the row in the same synchronous turn, as JSON or as raw text.
    * IndexedDB reads it in the delete's transaction.
    * Postgres: `RetireBoxSql`'s DELETE `RETURNING revision_tok`, and the outer SELECT answers
      `retired_tok`. The adapter maps it to an outcome.
    * The Convex component's `retireBox` (and the host wrapper in `server.ts`) takes
      `LockboxRetireExpectation` and returns `v.nullable(LockboxRetirement)`. New validators.
    * GraphQL: `SafebyokLockboxRetireExpectationInput`, enum `SafebyokRetireOutcome`, and type
      `SafebyokLockboxRetirement`. `safebyokRetireBox` answers that type (`!`). The resolver passes
      the outcome on, and reads a left-out `revision_tok` as null.
    * The demo's outage wrapper and the Postgres route recipe (README and its test copy) pass the
      outcome on.
  * Vault (`src/vault.ts`):
    * `retireBox()` passes `listedRevisionOf(label)`. On `retired_other` it warns (`call:
      'retireBox'`), naming neither revision nor the boxlabel. Its result is still `void`, and its
      doc block says so.
    * `writeOver`'s retire-first passes `expected.revision_tok`, which is always null there. On
      `retired_other` it warns (`call: 'storeBox'`) and goes on to its write.
    * Lines thread 7 touched are left alone.
  * `describeVaultDB` (`tests/test-helpers.ts`):
    * 3.4 is retitled "... and says what it removed".
    * It gains cases for each outcome: retired then absent, retired_other over a revision written
      since, retired_other where null was named, and absent for a box never written.
    * The vault-mismatch refusal now names the standing revision and null.
    * The retire-vs-replace race checks the outcome against who won.
    * New `TH.retiring(revisionTok)`. Every battery call site names a revision.
  * Base-class tests: "on the way back from a lockbox retirement" covers the outcome resolved, the
    example, null as stale, `__typename` stripped, and six malformed answers as corrupt_record. New
    `RefusedWrites` cases cover a missing or empty `revision_tok` (thread 6 will want these).
    `localVaultDB` retires damaged rows, JSON and not. IndexedDB retires a damaged row and rings
    only when something was removed. There are Convex component and GraphQL resolver cases.
  * Vault tests (versioned updates):
    * The retire names the listed revision, and does not warn when it got that revision.
    * A retire over a write made meanwhile warns, naming nothing.
    * **The #176 lost-write sequence** (A and B both see damaged/null; B's retire waits while A
      retires and writes; B retires A's write, warns, and writes): exactly one `storeBox` warning,
      and B's whisper stands.
  * Docs:
    * `VAULTDB.md`: *Who does what*, the "Nothing is retried" paragraph, 3.4 rewritten (with a
      paragraph on how adapters report, and that the corrupt answer and the damaged `retired` are
      proven by base-class tests), and 5.1.
    * Core README: the `corrupt_record` row, and a paragraph at the end of *Damaged lockboxes*.
    * Postgres README: the authoring bullets and the recipe.
    * Convex README: the table and the late-writes bullet.
    * VOCABULARY's **retire** row.
  * `notes/security.md` has an entry (via a sonnet subagent). There is a `minor` changeset.
* **Decisions taken** (YOLO; each also an open matter below):
  * **Two expectation types.** `RetireExpectation` stays as it is, and `retireBox` takes a new
    `LockboxRetireExpectation`. The other choice was to grow `RetireExpectation` and add a
    `VaultRetireExpectation`. This way `retireVault` and every `doRetireVault` stay untouched,
    and VOCABULARY's existing line stays true. The cost is two new exported type names
    (`LockboxRetireExpectation`, `LockboxRetirement`) and one new function
    (`Expectations.retirementOf`).
  * `doRetireBox` returns `Promise<unknown>`, not a typed outcome, like `doUpdateBox`: the answer
    is untrusted storage input either way.
  * The outcome check strips unknown fields (urql may add `__typename`) and does not refuse them.
  * IndexedDB rings for `retired` and `retired_other`, not for `absent`: nothing changed. Before
    this thread it rang for any retire in the right vault.
  * Postgres maps `retired_tok` to an outcome in JS. The SQL returns what it deleted, and the
    vault_id compare stays in the statement's WHERE.
  * The README paragraph about honor-and-warn sits in *Damaged lockboxes*, not *Two devices
    storing at once*, because thread 7 appended to the latter (restack).
* **For thread 6**: `checkOutgoing(LockboxRetireExpectation, ...)` already checks `revision_tok`
  (nullable, non-empty). It is still `bad_option`; vault-db.test.ts' `RefusedWrites` has the two
  new rows.
* **Discoveries**: `vault.retireBox()` reads storage for the box (`checkStandingBoxlabel`) but
  names the listing's revision, as the handoff says. A box present in storage but not yet listed
  is retired with `null`, and so warns `retired_other`. That is correct, since it was not shown.

## Open matters

* **Honor-and-warn on retired_other** (decision taken, per plan): the result is void, and the
  vault logs a warning. Rec: keep it until the bad-news handler exists.
* **writeOver's retire honors and warns** (decision taken, per plan): the lost-write sequence is
  now logged, and a test proves it. It is not closed: that is thread 4's, if the Coach brings it
  back.
* **New names `LockboxRetireExpectation`, `LockboxRetirement`, `Expectations.retirementOf`**
  (decision taken): `RetireExpectation` is kept for vaults. Rec: keep.
* **IndexedDB rings nothing for an absent retire** (decision taken). Rec: keep.
* **GraphQL outcome as an enum** (`SafebyokRetireOutcome`) rather than `String` (decision
  taken). Rec: keep. It is stricter on the wire, and the base class validates anyway.
