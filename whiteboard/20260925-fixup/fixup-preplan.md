# fixup preplan

The changes the questions in `fixup-changes.md` point to, and what an audit for more of the same
found (items 5 and 8). Line numbers are as of `da294a43`.

* **Ready to build:** items 1–5 and 8. The Coach accepted every proposal here, and item 4 was
  ruled in on 2026-10-27.
* **Its own PRs:** items 6 and 7 edit STYLE.md and the lint config. Item 7 touches nearly every
  file, so it runs after the restyle sprint lands.

Items 5 and 8 touch the same methods as the `retire_standing` thread
(`whiteboard/20261025-restyle/unstanding.md`). Whichever lands second rebases onto the first.

## 1. `outcomeOf` defaults to `unexpectedError`, and `answering` goes

`outcomeOf(thunk, otherwise = Refusals.storageUnavailable)` (`src/outcome.ts`) has the wrong
default:

* Every `outcomeOf` call in `src/` passes its own `otherwise`. Sixteen pass `unexpectedError`;
  `lease.ts` passes `damagedBox` and `device-db.ts` passes `deviceTrouble`. No `src/` caller uses
  the default.
* `storage_unavailable` tells a caller that retrying may help. A throw nobody anticipated is a bug,
  and retrying won't fix it. The default should be the refusal that doesn't invite a retry.
* `answering` (`vault-db.ts:850`) is `outcomeOf(body, unexpectedError)`, nothing more. It exists
  only because of the default.

**Change:**
* Make `unexpectedError` the default.
* Delete `answering`. Its eleven callers in vault-db.ts call `outcomeOf` directly.
* Drop the `, unexpectedError` argument from the sixteen callers.
* Rewrite the doc block. Its `fetchBackup` example now passes `Refusals.storageUnavailable`, as
  any call out to storage should.

**Contract:** `outcomeOf` is exported, so this needs a changeset. A host that wraps its own
storage calls in `outcomeOf` gets `unexpected_error` for a plain throw, where it used to get
`storage_unavailable`. It should pass `Refusals.storageUnavailable` to keep the old behaviour.
VaultDB adapters are unaffected: their throws reach `asStorageTrouble` through `adapterAnswer`.

## 2. `adapterAnswer` stops checking whether an answer is an Outcome, and loses `hookname`

This is the Coach's directive: guessing an answer's type is not `adapterAnswer`'s job. Its job is
to pass a hook's throw on as storage trouble.

* `vault-db.ts:856` becomes the try/catch alone. `asStorageTrouble` stays: `startedWatch` (711)
  is its synchronous caller, and `adapterAnswer` its async one.
* **`hookname` was used only in the removed message.** Drop it from the signature and from the
  eleven calls.
* Delete the test at `tests/vault-db.test.ts:980`.
* **Consequence**, for the PR body: an adapter whose hook resolves `{ ok, val }` will no longer
  get a `bad_option` that tells it to use `valOf`. It meets `corrupt_record` from `checkAnswer` on
  most verbs. On `getBox` it meets `damaged_box`, whose message tells the user to remove the box.
  `describeVaultDB` fails such an adapter on its first test, so the message only reaches
  production through an adapter that never ran the conformance suite.

## 3. outcome.ts keeps only the Outcome

Once 1 and 2 land, outcome.ts holds the `Outcome` types, `good`, `bad`, `outcomeOf` and `valOf`.
All four pull their weight:
* `good` and `bad` are the constructors of an exported type, used 34 times in `src/`.
* `valOf` and `outcomeOf` are the two converters between the two styles of failure, throwing and
  returning.

Item 7's conversion gives each its own lines.

* **`unexpectedError` moves to `refusals.ts`**, beside `storageUnavailable`. It is a refusal
  builder like the others there. `index.ts` re-exports it from the new place under the same
  name, so its public name doesn't change.
* **`isOutcomeShaped` goes.** After item 2, its one remaining caller is `guarded` in
  `device-db.ts:196`, and item 4 removes `guarded`. If item 4 lands after this item, the interim
  replacement is a zod/mini schema beside `guarded`, not a hand-written check.

## 4. DeviceDB becomes a base class, as VaultDB is (ruled in)

The Coach ruled this in, on condition that it causes no new problems. The checks below find none
that block it. They do find three constraints the builder must keep, and one probable bug that
the change fixes.

**What's asymmetric today:**
* The two stores extend differently. `VaultDB` is an abstract base class. The base does the
  validation, limits and refusals, and an adapter writes `do*` hooks that return raw answers or
  throw.
* `DeviceDB` is an interface (`device-db.ts:28`). `memoryDeviceDB`, `idbDeviceDB` and the
  README's custom example are plain objects. Each of them:
  * wraps every verb in `deviceOutcomeOf` itself;
  * parses its own `LeaseRecord` and `DeviceRecord`, and discards the ones that fail. The code is
    the same in memory and idb.
* The core then wraps the host's object again in `deviceTroubleAsConditions`, and sniffs each
  answer to check it is an Outcome.

**With a base class like VaultDB's:**
* An implementer writes `doGetLease`, `doPutLease` and so on, returning raw rows or throwing.
* The base:
  * makes the Outcome;
  * maps throws through `deviceTrouble`;
  * parses every record and discards bad ones, once, for every store.
* What disappears: `deviceTroubleAsConditions`, `guarded` and the last `isOutcomeShaped`. The two
  stores then extend the same way, which an integrating customer would expect.
* What stays with each store: the promise that "calls land in the order they were made". A base
  class can't keep it without a queue, and a queue isn't proposed.

**Constraints the base must keep:**

1. **Each verb calls its `do*` hook synchronously, before any `await`.** Today the store sees
   calls in the order the vault made them. A base that awaits anything before calling the hook
   could reorder them. Checking the caller's input before the hook is synchronous, so it is fine.
2. **A row that won't read is discarded in one atomic step by the store, and only while it still
   won't read.** Today idb's `discardedIfUnreadable` (`idb.ts:154`) re-reads the lease row inside
   the transaction that deletes it, so a lease a later `putLease` wrote survives. The base
   decides that a row is unreadable, but it can't do the discard itself: by then a later call may
   have landed. So give the store a hook that does the conditional delete atomically, for example
   `doDiscardUnless(scopepath, isReadable)`. The base passes the record schema's check as
   `isReadable`. The memory store does it synchronously.
3. **`raiseDeviceRecord` stays one atomic read-modify-write in the store.** Two tabs raising at
   once must never lower each other's record. The base can own the rule (`raisedDeviceRecord`)
   and pass the store an updater, but the read and write stay in one store transaction.

idb's change bell and its sweep of stray rows stay in idb's own hooks.

**A probable bug this fixes** (not tested; for the PR body):
* idb's `getDeviceRecord` (`idb.ts:113`) deletes an unreadable record without any condition, in a
  transaction that only starts once the read has resolved.
* Suppose a `raiseDeviceRecord` is made after that read but lands before the delete. The delete
  then erases the record the raise just wrote, including its `highest_vault_epoch`.
* With constraint 2 applied to both kinds of record, that can't happen.

**Option checks:** `parseDeviceDB` (`vault-opts.ts:266`) checks a DeviceDB's shape today. It
becomes an `instanceof DeviceDB` check plus that shape check, the way `vaultDB` is checked at
`vault-opts.ts:259`. The trade-off of `instanceof` when two copies of the package are installed
is the one VaultDB has already accepted.

**What changes with it:**
* `deviceTroubleAsConditions` goes, along with its three uses: `bank.ts:309` and `:495`,
  `vault.ts:814`, `del-damaged-vault.ts:53`.
* `memoryDeviceDB` and `idbDeviceDB` become subclasses, made by the same factory functions.
* The object-literal DeviceDBs in the test worlds become subclasses: `tests/vault/world.ts`,
  `safebyok-react/tests/bank-provider/world.tsx`, and `tests/del-damaged-vault.test.ts`.
* `describeDeviceDB` runs against both stores as it does today. It gains a test for the race
  above.
* The README's custom-DeviceDB section becomes a subclass example, believable as production code.

**Contract:** `DeviceDB` becomes a class, and `deviceOutcomeOf` leaves the exports (or stays
only inside the package). A host with its own DeviceDB rewrites it as a subclass. This is allowed
before 1.0. The changeset says what to change, and that the stores now discard unreadable
records the same way.

## 5. Parameters every caller fills from the object's own state

### a. `vaultTok`, through the box read and write path (`vault.ts`)

This chain of four methods carries a value that always equals `this.vault_tok`:

| Method | Callers pass |
|---|---|
| `#readBox(boxlabel, vaultTok, call)` | `lease.vault_tok`, from `#getBoxUnlocked` and `#storedBase` |
| `#storedBase(boxlabel, vaultTok, …)` | `lease.vault_tok`, from `#sealAndPutBox` |
| `#updateBoxListingOf(stored, vaultTok)` | `box.vault_tok`, from `#sealAndPutBox` |
| `#boxUnder(record, vaultTok)` | the `vaultTok` it was handed |

Why the value can be nothing else:
* A Vault object's `vault_tok` is frozen at birth (`vault.ts:810`).
* A record with another `vault_tok` makes the object gone; it never replaces the vault record
  in hand.
* `lease.vault_tok` comes from a lease that `#demandLease` has just checked against the vault
  record (`fitsLease`).
* `box.vault_tok` comes from a box sealed by this vault.

**Change:**
* Drop the parameter from all four methods.
* Where an expectation is built for storage, write `{ vault_tok: this.vault_tok }`.
* At `delBox` (`vault.ts:710-725`), `lease.vault_tok` becomes `this.vault_tok` the same way.
* Leave alone the expectations that pair a `vault_tok` with an epoch from the same object, in
  `#delVault` and `#putGate`. The pair reads as one unit there.

### b. The demands right after `#boxUnder`

`#readBox` (1624) and `#updateBoxListingOf` (1749) each call `#demand(box)` right after making
the box, with no wait between. That demand compares a box made from the vault record in hand
against that same record, so it can never fail. Delete both.

* The `#demandLease` that follows in `#readBox` stays: it catches a lock that landed during the
  read.
* **Kept, by the Coach's ruling (2026-10-27): where there is a question, the check stays.**
  `#storedBase` (1698) calls `#demandAfterWait(read, { vault_tok })` right after `#readBox`, which
  already made the same demand after its own wait. The only gap between the two is the microtask
  on which `#readBox` resolves, and whether that counts as a junction is an open question. So the
  check stays. The two demands above go because nothing at all runs between each box being made
  and its demand, so there is no question.

### c. `#unwrap(wrapped, visible, usage)` (`proving.ts:260`)

All three callers (174, 189, 213) pass `this.#currentWrap()` and `this.header`.

* **Change:** `#unwrap(usage)` reads both itself, as its first step.
* The order of operations doesn't change: the wrap is read at the same moment, before the wait.

### d. `#gatedOf(held)` (`gating.ts:433`)

All six callers write `this.#gatedOf(await this.#inside.freshen(this))`.

* **Change:** fold this into one worker, `async #freshGatedRecord(): Promise<GatedVaultRecord>`,
  which freshens and then checks.
* The six steps then read `const held = await this.#freshGatedRecord()`.

### e. `vaultPartsOf(this.#parts, this.#vaultScopeOf(bag), opts)` (`bank.ts`)

Four call sites (235, 250, 308, 344) repeat this whole expression.

* **Change:** add a Bank method `#vaultPartsFor(bag, opts)` that calls it.
* The function in vault-opts.ts stays as it is: it's the pure parser the new method calls.

### f. Considered and kept

* `#armExpiry(until, now)`: all three callers pass `this.#clockNow()`. After 8c, `#holdLease` is
  its only caller, and a timer worker that takes its two times is clear as it stands.
* `readJson(this.store, …)` in local-vault-db.ts, 11 calls: it's the reference adapter, kept
  plain for hosts to copy.
* `inOneTransaction(this.shelf, …)` (idb) and `isOlderPicture(this.#vaultRecord, …)`: these are
  shared module functions, and each takes what it compares.

## 6. STYLE: `type` over `interface` (own PR)

* Today `src/` has 52 object `type`s and 2 `interface`s (`DeviceDB`, `MaskOpts`), and the lint
  rule is off (`@typescript-eslint/consistent-type-definitions`).
* Most shapes are inferred from Zod schemas, and those are types already. An interface also
  allows declaration merging, which no exported shape here should allow.
* **Change:** turn the rule on as `['error', 'type']` and convert `MaskOpts`. Item 4 makes
  `DeviceDB` a class.

## 7. STYLE: `function` declarations outside React (own PR, after the restyle sprint)

The Coach's preference, and it holds up on the merits:

* **Hoisting.** STYLE.md has helpers below their callers. A function declaration can be called
  from anywhere in its module. A const arrow called before its line has run throws, for example
  from a top-level initializer or a static block.
* **Overloads.** These need declarations already (`headerOf`).
* **Scanning.** `function` marks a function at a glance, where `const` could be any value.
* **Layout.** Each body gets its own lines.
* **Cost:** the code has one arrow typed by a function alias (`DefaultStrengthChecker: StrengthChecker`),
  which keeps its arrow. And 185 one-line bodies grow to three lines each.

**Change:**
* In STYLE.md *Variables and functions*: named functions are declarations, arrows are for inline
  lambdas, and React code keeps its arrows.
* Set `func-style` to `['error', 'declaration']`, dropping `allowArrowFunctions`, with an override
  that keeps today's setting for `packages/safebyok-react` and the React demo.
* The conversion covers about 420 sites, so it's done by a codemod, not by hand. Look for an
  existing one first. Failing that, write a short ts-morph script, run it once through
  `pnpm dlx`, and don't commit it. Commit the result as one mechanical commit.

## 8. Functions that don't pull their weight, and logic that should be one function

The bar: sugar that names a useful step stays. So does a worker that does one thing for an
orchestrator. What goes is a wrapper that hides a plain call, or a step written out more than
once.

### a. `#boxUnder` is inlined

After 5a it's `Box.make(this, record, vaultSparseOf(this.#vaultRecord))`, called from two
workers. `#sealAndPutBox` already writes the same "made under the vault record in hand" form
inline, at `Box.trySeal(…, { madeUnder: vaultSparseOf(this.#vaultRecord) })`. The name
`#boxUnder` hides a plain constructor call, so the call goes inline at both sites.

### b. One worker for "the lease, while it is in force"

This check is written four ways in `vault.ts`:
* `consistentWith`, inline: `this.#lease !== null && ! this.#lease.endsBy(this.#clockNow())` (390)
* `#unlockStands(now)` (894), whose caller then needs `this.#lease?.ask_passphrase_at ?? null`,
  because a boolean doesn't narrow
* `#leaseRefusal` (1151)
* `#ensureUnlocked`'s drop of an ended lease (1202)

**Change:**
* `#leaseInForce(now = this.#clockNow()): Lease | null` returns the lease while one is held and
  not ended. It's a query and drops nothing.
* `#picture` reads `this.#leaseInForce(now)?.ask_passphrase_at ?? null`.
* `consistentWith` reads `this.#leaseInForce() !== null`.
* `#leaseRefusal` uses it, then drops an ended lease as it does today.
* `#unlockStands` goes.
* `#leaseLastsPast(renewMillis)` (today `#leaseStandsPast`) stays, since it adds `fitsLease`.

### c. One worker for holding a lease

`#holdLease`, `#takeUpFromPantry` and `#takeUpAtBirth` (1457-1517) each end with the same four
lines: set `#lease`, increment `#leasesHeld`, arm the expiry, and replace the snapshot.

**Change:**
* `#holdLease(lease: Lease)` does those four lines and nothing else.
* The grant path, through the inside bag at `vault.ts:839`, calls
  `this.#holdLease(Lease.make(this, stored))`.
* The two take-ups call it once their lease fits.
* Their shared "make, warn when the record can't be read, check it fits" step could also become
  one worker, `#fittingLeaseOf(record, renewMillis, call)`. It's a worker the two take-ups would
  call, but their warning messages differ, so this one is the builder's call.

### d. `#damagedBase` builds on `#listedBase`

`#damagedBase(boxlabel)` (1721) is `#listedBase(boxlabel)` without `registered_at`. Both look up
the box's entry in the listing, and both refuse a damaged entry that names no revision
(`damagedBeyondNaming`). So that rule is written twice.

* **Change:** `#damagedBase` returns `#listedBase(boxlabel)` projected to `{ revision_tok }`.
  Behaviour is unchanged.
* `#listedRevisionOf` and `#isListedDamaged` keep their other caller, `delBox`.

### e. Text helpers get a module of their own

* `codePointsOf` (`mask.ts:57`) and `codePointCount` (`zxcvbn-strength-checker.ts:71`) both
  compute `text.match(/./gsu) ?? []`.
* `byCodeUnit`, a string comparator, is exported from vault-db.ts. Its only other user is
  vault.ts, and it has nothing to do with storage.

**Change:**
* Put one `codePointsOf`, written `[...text]`, and `byCodeUnit` in a new internal module,
  `src/text.ts`. The string iterator yields code points, as `/./su` matches them.
* `zxcvbn-strength-checker.ts` takes `.length` of `codePointsOf`.
* `src/text.ts` must be internal, not `utils.ts`: `utils.ts` is the `safebyok/utils` entry point,
  so anything in it is exported.
* `jsonBytes` stays in vault-db.ts: it's how a record is weighed against storage's limits, which
  is part of the VaultDB contract.

### f. Considered and kept

* **Refusal builders** (`renewPastLease`, `damagedLease`, `gateMovedPast` and the rest): each
  keeps a long message out of the code around its call.
* **One-line predicates with a name a reader needs** (`isFarFuture`, `isSharedMemory`,
  `liveRecordOf`, `isUnbound`).
* **Workers named for what they do,** each called by one orchestrator: `#watchStorage`,
  `#freshness`, `#armExpiry`.
* **The graphql `*ExpectationIn` readers:** each says which null a client may leave out.
* **The listing queries** (`#listedOf`, `#isListed`, `#listedRevisionOf`, `#isListedDamaged`):
  each names a question a box call asks.
* **`vaultRecordHeldBy`** (`proving.ts:89`) is exported from `src/` only for a test builder. It's
  harmless, and moving it is a question for the test helpers, not this plan.
