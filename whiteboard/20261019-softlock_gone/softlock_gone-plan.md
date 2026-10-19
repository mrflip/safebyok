# Thread: softlock_gone -- take out the soft lock and the rotation schema

Date: 2026-10-19. Issued by: the Coach (drafted by the agent from the design discussion at
https://claude.ai/code/artifact/8ac26722-33ee-4082-a76f-f4c9b6722b70, tabs "Thunks" and
"Contract", where "rotation and soft locks are out" is a ruling). Mode: **a session, not a
sprint**: the Coach drives it interactively, one branch, one PR. Branch `20261019-softlock_gone`,
cut from `origin/main` at `f979f16b` (the merge of reform2, #175), or later: it runs after
`split_jumbos` (#188, #189) has merged, and cuts from the line that has them.

**The Coach, 2026-10-19:** the vault still auto-locks. A lease ending at `askPassphraseAt` still
locks the vault, as it does today; what goes is the soft-lock / hard-lock distinction. After this
thread there is one kind of lock, and it means now. The "prompt early, carry on" case is the
Contract's `lease_ending` ask, not this thread's.

## Finding things after split_jumbos

Every line number below is as of `f979f16b`, before `split_jumbos` moved code. Find a site by the
symbol or the test title beside its number (`grep -n`); the files are:

* **`tests/vault.test.ts` is `tests/vault/`**: *vault-make* (old lines 92-652, 4242-4490, 5075-5292),
  *vault-lease* (653-1088, 4584-4854, 5293-5351), *vault-lockboxes* (1089-2167), *vault-retire*
  (2168-2602 less the `retireDamagedVault` block, 2791-2834; that block is
  `tests/retire-damaged-vault.test.ts`), *vault-wayins* (2835-3502, 4491-4583), *vault-races*
  (3503-3916, 4855-5074, 5352-5909), *vault-locksoon* (3917-4241: the whole file goes),
  *vault-storage* (2603-2790, 5910-6692). Helpers two files share are in `tests/vault/world.ts`.
* **`tests/test-helpers.ts` is a front door over `tests/test-helpers/`**: `builders.ts` (old 35-379:
  `rotatedVaultPropsOf` and the other fixtures), `timing.ts`, `racing.ts`, `logging.ts`,
  `vault-db-conformance.ts` (the VaultDB suite and its lockbox-epoch cases), `device-db-conformance.ts`
  (`describeDeviceDB`: the generation cases), `refusals.ts`. A new or removed helper is named in
  the door as well.
* **`src/vault.ts` lost about 500 lines**: `MakeVaultOpts` and the options' parsing, bounding and
  clock (`parseLeaseHours`, `parseClock`, the declared limits) are in `src/vault-opts.ts`;
  `retireDamagedVault` is in `src/retire-damaged-vault.ts`. Everything this plan names in `vault.ts`
  (the `make` closure, `lockSoon`, `shutAt`, `armExpiry`, `parseGraceSeconds`, `isUnderHeldKey`,
  `UnlockStart`, `VaultCall`) is still there, some 125 to 500 lines earlier.

## Why this comes before the store reform

The store reform (results not throws, `getProof` through `ensureLease()`, functions that stop
handling refusals) rewrites the paths that `lockSoon()` complicates most. The soft lock is the
one reason the vault keeps three lock counters instead of one, the one reason a lock can leave
the key held while the snapshot says `locked`, and the subject of the unsettled TODO entry *Lock
NOW vs soft lock*. Its use case, "prompt early, let the user carry on", is the `lease_ending` ask
in the Contract. Rotation is a stored schema (`prior_vault_key`, a two-epoch tolerance) with no
verb behind it: `rotateVaultKey` was never built. Both would otherwise sit in every agent's
reading of `vault.ts` and `vault.test.ts` during the reform. Clearing them first makes the
reform's diffs smaller and its reviews honest.

## What goes

### A. The soft lock

Public surface (a `minor` changeset; pre-1.0, no shim):

* `Vault.lockSoon(graceSeconds?)` and its doc block, `packages/safebyok/src/vault.ts` 345-366.
  Every doc block and comment that names it: the state list at line 30, `hello()`'s "every
  other call but" at 241 and 636, `unlock()`'s at 304, `lock()`'s "not hard locks" paragraph at
  337-342, the lease paragraph at 399, the counter comments at 713 and 719, `shut`'s and
  `revokeLease`'s at 1171 and 1197, `grantLease`'s at 1341, and `openBox`'s "a soft lock, which
  waits for work in hand" sentence.
* The implementation: the `lockSoon` method (1726-1750), `shutAt` (1256; `lockSoon` is its only
  caller), `readClockOrNull` (1302), `parseGraceSeconds` with `graceSeconds`, `graceSecondsGiven`
  and `secondsToMillis` (2544-2555), the constants `LockSoonGraceSeconds` and
  `MaxLockSoonGraceSeconds` (2539-2541), and `'lockSoon'` in the `VaultCall` union (2238).
* **The lock counters go** (the Coach's ruling 3, below). All three in-handle counters,
  `shutsSoFar` (707), `hardLocksSoFar` (711) and `revokesSoFar` (717), exist to decide who wins
  when a lock lands while something is in flight: an unlock's derivation (`noteStart`, `outrun`,
  `grantLease`'s `started`), a read's fetch (`openBox`'s compare after the fetch), or a hello
  after a lock whose erase failed (`fetchLease`'s gate). They go, with `UnlockStart`'s
  `shutsThen`. What stays of each site is not a counter: `outrun` keeps `closed` and the compare
  of the standing vault props against the ones the proof was made against (id and epoch), which
  is correctness, not timing; `openBox` deciphers with the key in hand when the fetch returns, or
  refuses `vault_locked` when there is none; `fetchLease` takes up any lease that fits.
* **The minute past `askPassphraseAt` goes** (ruling 2): `ExpiryGraceMillis`, `isShutDue`,
  `dropKeyIfDue`, and `armExpiry`'s second stage. One timer, at `askPassphraseAt`, drops the key
  and bumps. `MaxLeaseHours`' "minute to spare" and its test (857) may stay as a bound on what
  one `setTimeout` holds, reworded to say only that.
* **`lock_generation` goes** (ruling 4). The cross-tab twin of the counters: the device mark's `lock_generation`, `DeviceDB.writeLease`'s `expected`
  (`LeaseExpectation`), `lockGenerationOf`, `keepingLocks` and `lockedMeanwhile` in
  `device-db.ts`, the compare in `idb.ts` 118 and the memory adapter, `noteStart`'s read of the
  mark, `blankMark`'s generation, `revokeLease`'s raise, and `retire()`'s "keeps the generation".
  The mark's format moves on (`safebyok-mark-v3` to `-v4`, holding `seen` alone). VOCABULARY's
  *lock generation* entry goes, and *device mark* shrinks to the seen vault. Host-written
  DeviceDBs lose a parameter: pre-1.0, the changeset says so.
* The `logger.warn` for a clock that fails inside `lockSoon()`. The clock-failure warning in
  `armExpiry`'s deadline timer (`{ call: 'expiry' }`) stays: it is the expiry's, not the soft
  lock's.

Outside the core:

* `packages/safebyok/README.md`: the `lockSoon` bullet and the sign-out advice (391-402, 437,
  458-459), the `catch` example around `vault.lockSoon()` (426-437: the visibilitychange example
  becomes a `lock()`, or goes), the logger list (531, 539), and "every call but `lock()`,
  `lockSoon()` and `close()`" (763).
* `VOCABULARY.md`: the *lock generation* entry's "but not `lockSoon()`" clause (117), and any
  other mention of the soft lock or a grace (grep `lockSoon`, `soft lock`, `grace`).
* `packages/safebyok-react/tests/vault-provider.test.tsx` 752 and 774: two tests use
  `vault.lockSoon()` only as a convenient source of a logger `warn` to check the provider's
  logger plumbing. Rewrite them over another warning the provider forwards; do not delete them.
* `notes/security.md`: a dated entry through a `sonnet` subagent (the file's header says how):
  the soft lock is gone; the entries of 2026-10-16 (*locks_and_expiry*, *refusals_and_catchup*,
  "two locks, hard and soft") describe a mechanism that no longer exists, and every lock is now
  hard. The subagent folds the new fact into those entries rather than rewriting them.
* `TODO.md`, *Lock NOW vs soft lock* (101-118): strike the soft-lock half. What remains, whether
  `lock()` claws back a store already in flight, is the Contract's to answer; narrow the entry to
  that sentence. (TODO edits may be split into their own PR at the end if the Coach prefers.)

### B. The rotation schema

* `prior_vault_key` on the vault props (`src/types.ts` 355-396): the `PriorVaultKey` object, the
  field, and the `priorFits` refinement. The vault props' format moves on,
  `safebyok-vault-v3` to `safebyok-vault-v4` (STYLE: any change to what a record may hold moves
  its format). Sites of the literal: `types.ts` 378, `vault.ts` 1020 (where the props are made),
  `wayin.ts` 52 (`VaultPropsFormat`, the ctx's first part), the `@example`s in `crypto.ts` 68
  and 127, `safebyok-convex/src/component/validators.ts` 39, the tests' fixtures
  (`tests/test-helpers.ts` 201, `tests/ctx-bytes.test.ts` 40 and 51, `tests/wayin.test.ts`
  529-538, and the hand-written rows in `tests/vault.test.ts` and `tests/vault-db.test.ts`).
* `isUnderHeldKey` (`vault.ts` 2221): drop the prior-epoch clause. A lockbox is under the held
  key when its `vault_key_epoch` is the vault props'.
* Each adapter's schema for the field, in one PR with the core (the five adapters move
  together): Postgres `vault-tables.sql` 19 and `src/vault-tables.ts` 31 (the column and its
  comment) and `src/columns.ts` 40; GraphQL `src/vault-schema.ts` 64 and 78 (`SafebyokPriorVaultKey`
  and both its uses) and `src/fields.ts` 46; Convex `validators.ts` 101-114. Their tests follow
  (`columns.test.ts`, `fields.test.ts`, `convex-vault-db.test.ts`, `postgres-vault-db.test.ts`).
* `tests/test-helpers.ts` 214-223, `rotatedVaultPropsOf`: **keep the fixture**, minus the prior
  key. It stands for "vault props at a vaultKey epoch other than 1", which the conformance suite
  still needs (see *What stays*). Rename it if "rotated" misleads once rotation is gone
  (`vaultPropsAtEpochOf(userId, 2)`, say); `secondKeyVaultPropsWith` in `wayin.test.ts` likewise.
* `VOCABULARY.md`: the *prior vaultKey* entry (65) goes; the *rotation* entry (119) and the
  *vaultKey* entry's "only a rotation" clause (34) say that rotation is a future thing and that
  `vault_key_epoch` is reserved for it (if the Coach keeps the field, below). `VAULTDB.md` 130's
  example names `prior_vault_key`; `README.md` 597 already says "there is no key rotation yet".
* `TODO.md`, *Which ways in a rotation keeps* (73-87): keep, as the design record for a
  post-1.0 feature; add one line saying the schema was removed in this PR and what it was.
* The changeset says what a host sees: a vault written under `safebyok-vault-v3` fails today's
  validation and reads as the agent verifies it does (absent or `damaged_vault`: check, and
  name which); a Postgres host recreates its tables from the new `vault-tables.sql` (no
  migration before 1.0); a GraphQL host regenerates its schema; a Convex host redeploys the
  component.

## What stays, and why

Everything in this table serves something other than the soft lock or rotation. A test of any of
it that fails after the removal means the removal is wrong.

| Mechanism | Where | What it does | Verdict |
|---|---|---|---|
| `unlock_epoch` | vault props, lease, mark's `seen` | Bumps on every wayin change (`vault.ts` ~1084). The optimistic-concurrency compare of `updateVaultProps` (`Expectations.vaultPropsMeets`). Bound into the lease's wrap ctx (`leaseCtx`), so another device's lease dies when the wayins change. A refresh that sees it move drops the key (`takeStorage`'s `outlived`). Rollback detection (`heedMark`). | Untouched |
| `seen` | device mark | The highest epochs this device has seen the vault props at; `rolled_back` when storage hands back less. | Untouched in substance: once `lock_generation` goes, the mark is the seen vault and nothing else (format `safebyok-mark-v4`). The agent may flatten `seen` into the mark or keep the nesting; keep whichever reads better in `heedMark`, and say which. |
| `outrun`'s props compare, the `closed` flag | `vault.ts` 1319 | A key proved against vault props since retired or replaced is not taken up; a closed handle takes nothing up. | Stay: comparisons, not counters. |
| `armExpiry`, `pendingShut`, `isFarFuture`, `unrefTimeout` | `vault.ts` 1275-1300, 2524-2531 | The auto-lock: the timer that locks the vault when the lease ends at `askPassphraseAt`. `isFarFuture` (a deadline within a minute of `FarFuture` is "never") keeps a forever-lease from arming a timer JavaScript cannot hold. | Stay, untouched. |
| `vault_key_epoch` | props, every wayin's HKDF info, every lockbox, the lease ctx, the mark, every adapter's `updateBox` compare, the Postgres triggers | Which vaultKey a record was sealed under. Always 1 today. | Stays, reserved at 1 (the Coach's ruling). One sentence in its doc block and VOCABULARY says so. |
| `Expectations.lockboxMeets`'s epoch clause, and the conformance cases "refuses a write sealed under a vaultKey since replaced / the vault does not stand for yet" (`test-helpers.ts` ~1615-1645) | core, every adapter | The adapter refuses a lockbox whose epoch is not the standing props'. With rotation gone this guards a record built wrong rather than one sealed under an old key. | Stay; retitle the cases ("under another vaultKey epoch than the vault props'"). |
| device mark, change bell | `device-db.ts`, `change-bell.ts`, `string-store.ts` | The mark holds the lock generation and the seen vault; the bell tells other tabs to refresh after a local write. | Out of scope. See the last section. |

## Rulings (the Coach, 2026-10-19)

1. **`vault_key_epoch` stays, reserved at 1.** One sentence in its doc block (`types.ts`
   143-146) and in VOCABULARY's *vaultKey* and *rotation* entries says it is reserved for a
   rotation that does not exist yet, and that every record carries 1.
2. **The minute past `askPassphraseAt` goes.** `isFarFuture` is a different thing and stays
   untouched (a deadline within a minute of `FarFuture` means "never", so a forever-lease arms
   no timer), as does `MaxLeaseHours`' bound on what one `setTimeout` can hold.
3. **No lock counters.** The Coach: "why do we need any counters? ... put up big blaring todos
   that at the end of the refactor we make sure there's a consistent defensible policy around
   lock timing vs operational success of any kind, and for now let those things be user
   annoyances." The three in-handle counters go, as inventory A says. Until the policy exists,
   a lock that lands while something is in flight is last-writer-wins, and the TODO entry below
   says so scenario by scenario.
4. **`lock_generation` goes.** The Coach: "yes kill the lock generation". It answered the
   counters' question across tabs; the one case with apparent teeth (a straggling unlock in
   another tab writing a lease after a sign-out on a shared machine) has none, because a lease
   is scoped by user id. `DeviceDB.writeLease(lease)` takes no expectation; `eraseMark`'s doc
   block, which says `retire()` keeps the generation, is reworded; the memory and idb adapters
   lose their compare-and-write step (`idb.ts` 118) and keep the lease write a plain put.
   `describeDeviceDB` in `tests/test-helpers.ts` (2493-2604) loses its generation cases. The
   changeset tells a host with a DeviceDB of its own that the parameter is gone and that a
   `safebyok-mark-v3` record reads as no mark (the safe failure: the device checks the vault from
   what storage holds now).

**The TODO entry** (replaces *Lock NOW vs soft lock*; written in step 3, blaring):

> ### Lock timing vs. work in flight: a policy is owed before 1.0
>
> `softlock_gone` (2026-10-19) removed the soft lock, the minute past `askPassphraseAt`, the
> in-handle lock counters and the device mark's lock generation. Each decided who wins when a
> lock lands while something is in flight. Today nothing decides: the last writer wins, and the
> user may be surprised. The Coach's ruling: let these be annoyances until the store reform is
> done, then write one defensible policy and tests to it, rather than re-deriving a mechanism
> per case now. The scenarios, each with today's outcome:
>
> 1. `lock()` lands during an unlock's derivation, same handle: the unlock finishes; the vault
>    is unlocked and a lease written.
> 2. The same, the lock in another tab on this device: as 1; the lease write is no longer
>    refused.
> 3. A read's fetch straddles a lock: refused `vault_locked` if the key is gone when the fetch
>    returns; handed back if another unlock has put a key in hand meanwhile.
> 4. A store sealed before a lock lands after it: it lands (it needs no key after sealing).
> 5. The lease ends at `askPassphraseAt` mid-operation: as 3 and 4, with no grace.
> 6. The device store throws when a lock erases the lease: the lease survives; the next hello
>    takes it up.
> 7. A sign-out with an unlock in flight in another tab: as 2; harmless, since a lease is
>    scoped by user id.
>
> The policy session decides, for each, what the vault promises, and writes the test first.

## The test rule

Of the test titles naming `lockSoon`, a grace or the prior vaultKey, only the
`describe("lockSoon")` block, all of `tests/vault/vault-locksoon.test.ts`, has the soft lock as its subject.
The rest pair it with something that stays. For the agent:

* **Delete** a test only when `lockSoon()`, its grace, or `prior_vault_key` is the subject of its
  title. The `describe("lockSoon")` block goes whole. So do `types.test.ts`'s prior-key rows
  (97-102) and the rotation cases in `expectations.test.ts` 68-69 and 86-92 that need a prior
  key to mean anything.
* **Trim the arm, keep the test** when the soft lock is one of several arms. The ones found
  (line numbers in `vault.test.ts` as of `f979f16b`): 376 "after a lock, a lockSoon or a stale
  write" keeps its lock and stale-write arms; 467 (lockSoon over a lease being read) has a `lock()`
  twin beside it, so check whether it is a pure arm before deleting; 588 "lock(), and lockSoon()
  at once, without a grace" keeps the `lock()` half; 857 (MaxLeaseHours "with a minute's grace to
  spare") is reworded to the timer bound, or goes if the bound no longer needs the minute; 3680 (lockSoon landing while storage is read) becomes
  the `lock()` case if none exists, else goes; 4689 and 4726 (lockSoon on a key past its deadline
  or shut time) go, and so do their expiry twins that test the minute; 4923 "rises with lock() and lockSoon(), and not with
  close()" becomes "rises with lock(), not close()"; 5735 (lockSoon landing with a stale refusal)
  goes if the `lock()` form is already tested, else converts; 5967 (warns on a bad clock in
  lockSoon) goes, the `expiry` warning's test stays.
* **Update, never delete,** the format-pinning test for the vault props in `types.test.ts`: it
  is the test that proves `safebyok-vault-v4`. Likewise the fixtures that hand-write a
  `safebyok-vault-v3` record (`vault.test.ts` 2747, 5217, 5880, 6132; `vault-db.test.ts` 350,
  395): they become v4, and one of them should keep a v3 row to show it reads as the changeset
  says.
* **The race blocks go where they assert that the lock wins.** *a lock that lands while an
  unlock is under way* (3503), *a read in flight when a lock lands* (3664), *a lock in another
  handle on this device* (4855) and *the device mark's lock generation* (4935) test the counters
  and the generation; delete the tests that assert the lock wins. Keep, moved or in place, the
  tests in those blocks that assert a comparison, not a counter: *a first unlock that loses the
  race to create the vault* (3784) and *a vault that moves elsewhere while an unlock is under
  way* (3842) stay whole; a `close()` during an unlock taking nothing up stays. Do not write
  tests that pin the annoyances: the TODO names them, and the policy session writes the tests.
* **Untouched:** every `rolled_back`, `unlock_epoch`, `seen` and `stale_write` test
  (`stale_write` from storage, not `lockedMeanwhile`'s). `vault.test.ts` 6579-6662 writes vault props at `vault_key_epoch: 2`
  with a prior key to test the mark's `seen` and the epoch-only damaged listing: keep the tests,
  drop the `prior_vault_key` from the rows.
* The react tests at 752 and 774: rewrite, as above.

## Order of work

Each step ends with `pnpm justify` green and a commit; the Coach is in the loop between them.

1. `scripts/cut-thread softlock_gone` from `origin/main`. Read this file and, in `vault.ts`, the
   sites named above by `grep -n`, not the file through.
2. **Soft lock, core.** Remove the method, its helpers, constants and `VaultCall` member; the
   three counters and `UnlockStart.shutsThen`; the minute and its second timer;
   `lock_generation` through the vault, `device-db.ts`, `idb.ts` and `describeDeviceDB`, with
   the mark's format bump. Reword the doc blocks and comments named in A, and the `lock()` doc block's "the
   other hard locks" paragraph, which now just lists what locks. Apply the
   test rule to `vault.test.ts`. Justify. Commit.
3. **Soft lock, around the core.** README, VOCABULARY, the react tests, the security note
   (subagent: the soft lock, the minute, the counters and the lock generation are gone, and the
   2026-10-16 lock entries describe a mechanism that no longer exists), the blaring TODO entry
   above. Justify. Commit.
4. **Rotation schema, core and adapters.** `types.ts`, `isUnderHeldKey`, the format bump at
   every site, the fixture, then the three adapters' schemas and tests, then the conformance
   suite's titles. Run every adapter's tests (`pnpm test` at the root; the Postgres suite runs
   against its container if one is up, else say so). Justify. Commit.
5. **Rotation, around the core.** VOCABULARY, VAULTDB.md, README 597 if it needs a word, the
   TODO line, the security note (same subagent entry or a second). Commit.
6. `pnpm size:budget --write` at the tip: every line should only fall; report any that rose.
   The changeset (`minor`, one file, both removals, what a host sees). Open the PR: title, the
   rulings and how they were applied, the test rule's deletions listed by title.

## Acceptance

* `grep -rn "lockSoon\|graceSeconds\|prior_vault_key\|PriorVaultKey\|priorFits\|revokesSoFar" packages e2e demos --include=*.ts --include=*.tsx --include=*.sql --include=*.md --exclude-dir={node_modules,dist}`
  finds nothing but CHANGELOG history and the TODO's design record.
* `grep -rn "soft lock\|hard lock\|grace\|revokesSoFar\|hardLocksSoFar\|shutsSoFar\|shutsThen\|ExpiryGraceMillis\|isShutDue" packages/safebyok/src`
  finds nothing, and neither does `grep -rn "lock_generation\|lockGeneration\|LeaseExpectation\|keepingLocks\|lockedMeanwhile\|safebyok-mark-v3" packages --include=*.ts --exclude-dir={node_modules,dist}`
  outside CHANGELOG history.
* TODO.md carries the *Lock timing vs. work in flight* entry with its seven scenarios, and the
  old *Lock NOW vs soft lock* entry is gone.
* Every test under *Untouched* above still passes, unedited.
* The vault props' format test pins `safebyok-vault-v4`, and a v3 row in a test reads as the
  changeset says.
* `pnpm justify` green in every package; size budgets not raised.

## Out of scope, noted while surveying

* **The device mark and the change bell** both earn their keep: the mark is the lock generation
  (the cross-tab lock race) and the seen vault (rollback detection) in one record; the bell is
  the BroadcastChannel wrapper that has other tabs refresh after a local write, with a second,
  in-tab bell inside `string-store.ts`. They come up too often in conversation for two reasons:
  the names are novel and "change bell" has no VOCABULARY entry, and the mark bundles two
  unrelated jobs, so a discussion of either drags in the other. Cheap fix, if the Coach wants it
  in step 3: a VOCABULARY line for *change bell*, and a habit of saying "the lock generation" or
  "the seen vault" in prose, keeping "mark" for the stored record. Splitting `DeviceMark` into two
  records is defensible and is not this thread.
* **Whether `lock()` claws back a store already in flight** is scenario 4 of the TODO entry.
  The policy session answers it.
* The comment above `fetchLease` was reworded to "revokes" by reform2 while the counter's doc at
  line 713 still speaks of soft revocation; step 2 settles both.
