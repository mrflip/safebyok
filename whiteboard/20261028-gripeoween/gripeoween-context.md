# gripeoween: context

Background for the items whose row alone does not carry the question. Each section: what the row
asked, what the Coach answered, what the code does on `main` at `f2af68e4`, and a recommendation.
Line numbers are as of that commit.

## GW-01 The storage-docs fix: `false` or `null`, and `delBox`'s `undefined`

**The rows.** Three `proceed` rows on #302. (a) VAULTDB.md says a stale delete answers `false`; the
base class wants `null`. (b) The README's `whisper_too_large` row says the whisper alone is weighed.
(c) `delBox` takes only `null` as a stale answer; `delVault` also takes `undefined`.

**What the code does.**
* `VaultDB.delBox` (`vault-db.ts:347`): `if (deletion === null) throw Refusals.staleWrite('del')`,
  then `checkAnswer(BoxDeletion, deletion, 'a deletion', 'landed')` (l.348). So `false` and
  `undefined` both fall through to the `BoxDeletion` validator and refuse 'corrupt_record'.
* `VaultDB.delVault` (`vault-db.ts:374`): `if (raw === null || raw === undefined) throw staleWrite`,
  then `checkAnswer(VaultTombstone, …)` (l.375).
* `VAULTDB.md:28` ("turns a `false` from you (from a box deletion, a `null`) into `stale_write`") and
  `VAULTDB.md:46` ("a write whose expectation failed resolves `false` (a box write or deletion, a
  `null`)") both still say `false`; section 5.1 says `null`.
* The whisper weigh (`vault.ts:1518-1524`) adds the sidecar's JSON to the whisper's and refuses
  'whisper_too_large', "That whisper and its box's sidecar are over this vault's limit".

**The Coach's answers.** On (a): "yes make it consistent. is the value validated with a pre-made
well-named zod checker?" Yes: `BoxDeletion` and `VaultTombstone`, both `Validator`-made, named for
the answer, after the null test. On (b): "weigh the two together, make it box_too_large". On (c):
"can we instead have the party most directly responsible for it nullify the response? it's being
zod checked where it should be after crossing the boundary, right?"

**Readings.** (b) can be read two ways: fix the README row to say whisper-plus-sidecar (the Rec), or
rename the kind to 'box_too_large'. The second is a contract change, and the name is already
taken: 'box_too_large' is storage's refusal, which the vault reads as "the truth" over its own
estimate (`vault.ts:101`, `:557`). A host branching on 'box_too_large' would then not know whether
the vault's estimate or storage refused. Rec: fix the README row; if the Coach meant the rename,
it needs a ruling and a changeset, and a way to tell the two refusals apart (meta, or two kinds).
(c) says: do not widen the base's stale test; the adapter returns `null` on a miss, and
`describeVaultDB` holds it to that. So the fix is one `describeVaultDB` test that an adapter
answering `undefined` from `doDelBox` is refused, plus VAULTDB.md saying `null` in both places and
that `undefined` is not a stale answer. Then `delVault`'s `undefined` branch (l.374) is the odd one:
either drop it to match, or say in VAULTDB.md why a vault deletion is looser.

## GW-05 `Box.make` checks its vault

**The row.** The old doc claimed a malformed vault refuses 'bad_option'; `Box.make` and `Box.seal`
never check their `vault`. The Coach: "if it's supposed to get a vault instance, just have a
liveVault instance checker".

**What the code does.** `Box.make(vault, record, madeUnder)` (`box.ts:150`) parses `record` with
`BoxRecord.parse` and `madeUnder` with `MadeUnderShape.parse`; `vault` is typed `VaultOfBox`, a
*type* (`box.ts:18`: `ConsistencyWith<VaultScope & Pick<VaultStamp, 'vault_tok'>>`), never parsed. Its
two callers inside the package (`vault.ts:1592`, `:1709`) pass `this`. `Box.seal` parses its props
(`SealBoxProps.parse`, `box.ts:181`), so the `Box.seal(vault, undefined)` gap the row also named is
closed. There is no `instanceof Vault` anywhere in `src/`, and no validator for "a Vault object": the
closest is `vaultBag` (#301), which takes a Vault object, its snapshot or a BankVault and refuses
only a store.

**The shape of the fix.** A `Validator`-made shape in `src/shapes/` for what `Box` reads of its vault:
the scope fields, `vault_tok`, and the `demandConsistentWith` function `ConsistencyWith` names,
parsed once at `Box.make` and `Box.seal`. "Live" cannot be checked there without a call (a Vault
object's `gone` state is read through its snapshot), so the check is of shape, and the name should
not promise more. `Box` is exported, so the changeset names the new 'bad_option' refusal.

## GW-06 The bank's trouble pipeline

**The row.** `onBadNews` throwing while the bank births a vault: with no Vault object yet, the
throw is logged and reported through the listener, not kept as the vault's trouble. The Coach:
"bank should probably take over the trouble pipeline or have things bubble to it? TODO that and
carry on".

**Today.** Each Vault object keeps its own trouble (`#badOutcome`, which maps, tells the listeners
and keeps the last refusal for the snapshot); the bank has `bank.lifecycle` but no `bank.err`
(the Coach took the Rec not to add one, restyle after-the-close). The catchsweep's thread 7 moves
`#badOutcome`'s work into each throwing form (`#heardRefusal`), which is the moment the pipeline's
shape is in hand.

**The TODO entry** belongs under *Soonish*, with the question: does the bank own one trouble pipeline
(every vault's bad news bubbles to it, and it keeps the trouble of a birth that has no vault yet),
or does each Vault object keep its own and the bank only relays? Beside *A throwing
`requestCleartext` is always `unexpected_error`*, which is the same question asked of the gating.

## GW-16 VaultDB's private workers' names

**The row.** `readVault` and `ensuredVault` (and before #321, `deletedVault`) implement the public
verbs; the doc-block run proposed `getVaultChecked` and the like. The Coach: "again, why Checked? If
there's a raw version, that should get the business: getFoo() { const foo = getRawFoo(...); return
check(foo) }. … But yes please match the name."

**What the code does** (`vault-db.ts:150-232`): `getVault(scope)` is
`outcomeOf(() => this.readVault(scope))`; `getVaultRecords(scope)` is the same line; `ensureVault`
and `ensureVaultRecords` share `ensuredVault`. `readVault` calls the adapter's `doGetVault` through
`adapterAnswer`, checks the answer with `checkAnswer(ReadAnswer, …)`, and freezes the checked
record and listing. So the "raw version" the Coach describes is the adapter's `doGetVault`, and the
"check" is the body of `readVault`.

**After #321** (store_trynames) the public verbs are try pairs: `getVault` throws, `tryGetVault`
wraps it. Once that lands, `readVault`'s body *is* `getVault`'s body, and the private worker exists
only because two public verbs (`getVault` and `getVaultRecords`) share it. The catchsweep's thread 3
(`db_hooks`) rewrites these verbs' insides next. Rec: let thread 3 fold `readVault` into `getVault`
and have `getVaultRecords` call `getVault` (TODO.md already wants the pair folded), which answers
the naming by removing the name. Nothing to do before then.

## GW-17 A full localStorage: `storage_blocked` or `storage_unavailable`?

**The row.** `localVaultDB` reports a `QuotaExceededError` as 'storage_unavailable' (its doc,
`local-vault-db.ts:34-35`); the README's `storage_blocked` row says a vault kept on the device
refuses 'storage_blocked' when there is no room. The Rec was to map it through `isStorageBlocked`.
The Coach: "why wouldn't it be storage_unavailable? how much machinery is going on in there -- with
or without your proposal".

**How much machinery.** Almost none either way:
* `isStorageBlocked(err)` (`refusals.ts:158-169`) already names `QuotaExceededError` beside
  `SecurityError` and `NotSupportedError`, by `err.name`. The device store (`device-db.ts`) uses it:
  a blocked device store refuses 'storage_blocked'.
* `localVaultDB` is a `StringStoreVaultDB`; its hooks throw whatever the DOM store throws, and the
  VaultDB base turns any non-VaultError from a hook into 'storage_unavailable' through
  `adapterAnswer` and `asStorageTrouble` (`vault-db.ts`). No code in `local-vault-db.ts` looks at
  the error.
* With the proposal: one branch in `asStorageTrouble` (`isStorageBlocked(err) ? storageBlocked :
  storageUnavailable`), which would apply to every VaultDB adapter, or one `catch` in
  `StringStoreVaultDB`'s write hooks alone. Without it: one README row reworded.

**Why one might keep `storage_unavailable`.** 'storage_blocked' is defined for the *device* store:
"this browser does not let the app keep anything on this device", a condition the host shows
without a retry. A VaultDB on localStorage is the demo's and a test's store, not a production
backend, and the two kinds already split cleanly by store. The user's action ("free some space") is
the same either way; what differs is whether the host offers a retry.

**Rec.** Keep 'storage_unavailable' for every VaultDB, as the Coach leans, and fix the README's
`storage_blocked` row (`README.md:397-439`) to say it is the device store's kind alone. If the Coach
wants quota to read as blocked for the local store too, the one-line `catch` in `StringStoreVaultDB`
is the place, not the base.

## GW-18 `consistentWith` throws 'bad_option' on misuse; and what `VaultMadeUnder` is

**The row.** STYLE.md's verb table says a yes/no condition never throws; `vault.consistentWith(thing)`
throws 'bad_option' for a thing that is not a vault part. The Coach: "who calls it? safeParse doesn't
throw on anything does it?"

**Who calls it.** Nothing in the repo: no caller in any package's `src/`, `demos/` or `e2e/`
outside its own doc block (`vault.ts:386`'s `@example`). It is a public method of the Vault object,
kept as the non-throwing twin of `demandConsistentWith`.

**What it does** (`vault.ts:388-391`): `checkDemandOpts(opts)` (throws 'bad_option' for an unknown
option), `VaultMadeUnder.parse(thing)` (throws 'bad_option' for a thing missing its `vault_tok` or
scope), then `this.#inconsistencyWith(thing) === null && (! leaseBound || this.#leaseInForce() !== null)`.

**On `safeParse`.** Right: `safeParse` never throws, it answers `{ success, data | error }`. The
question behind the Coach's is whether a malformed `thing` should answer `false` (via `safeParse`)
rather than throw. Two readings: a malformed thing is *inconsistent with the vault*, so `false` is
honest and the verb table's rule holds; or a malformed thing is a bug in the host, which a `false`
would hide until the host wonders why its box never reads consistent. The Rec was the second (keep
the throw, note the exception in the verb table). With no callers, the cheapest consistent answer is
`safeParse` and `false`, and the verb table keeps its rule unqualified.

**`VaultMadeUnder`** (the Coach: "what is VaultMadeUnder?"): the shape of what a vault part was made
under: the scope (`applabel`, `user_id`, `vaultlabel`), `vault_tok`, `vault_epoch` and `gate_epoch`.
VOCABULARY.md calls the set "made under"; a Box, a Lease and a Wayin each carry it, and
`demandConsistentWith` compares it with the vault record in hand. Since #301 it is one `Validator`
in `src/shapes/vault.ts:192-204`, exported from `index.ts`, and its type is `Z.infer` of it.

## GW-19 `checkFoo` returning a value becomes `checkedFoo`

**The row.** STYLE keeps `checkFoo` for functions that return nothing; five returned what they
checked. The Coach: "I think some other thread is working on this. hold for now but I'll have you
check".

**Now.** The other thread was #301 (validator_ducks). It replaced `checkPutBoxProps` with
`PutBoxProps` (a shape, parsed in one line) and `checkSealProps` with `SealBoxProps`. Three remain,
all in `vault.ts:1920-1929`: `checkHelloOpts`, `checkEnsureUnlockedOpts`, `checkDemandOpts`, each
made by `optionsCheck` (`options.ts:28`), which parses the options bag strictly and hands the
candidate back. #317 (where_prefix) turned `optionsCheck`'s inner catch into a `parse` with a saying.

**Rec.** Finish what #301 started rather than rename: each becomes a shape (`HelloOpts`,
`EnsureUnlockedOpts`, `DemandOpts`) in `src/shapes/`, parsed in one line with `where` for the call
name, and `optionsCheck` goes if those were its last three users. That is the norm STYLE.md's
*Validation* now states, and it leaves no `checkFoo` that returns.

## GW-20 `DeviceDB.#readableOf`

**The row.** A name ending in `Of` reads as pure; this one deletes. The run proposed
`#checkedOrDiscarded`. The Coach: "I'd prefer checkOrDiscard. What exactly is being checked? All our
data should be checked. Is that function so meaningfully clearer than
`if (! check(foo)) { discard(foo) }`?"

**What is checked** (`device-db.ts:106-115`): `raw`, the row the store's `doGetLease` or
`doGetDeviceRecord` read, against `LeaseRecord` or `DeviceRecord` (`safeParse`). Null or undefined
answers null. A row that fails is discarded through `doDelUnreadable(scopepath, isReadable)`, the
store's conditional delete, which re-checks the row inside its own transaction so a record written
since the read survives (#298's constraint 2). It is called from two verbs (`getLease` l.48,
`getDeviceRecord` l.76).

**Is a function clearer?** The body is five lines and holds the one subtle point, the re-check
inside the delete. Inlined twice it would be ten lines and the comment twice. So a function earns
its place; the question is only its name. `checkOrDiscard` says what it does in order and keeps
STYLE's `check` prefix honest, since this one returns the record. Rec: `#checkOrDiscard`, as the
Coach prefers, and its doc block's first line says "the record, or null after discarding one that
will not read".

## GW-21 `Vault.#raiseRecordAfter`

**The row.** Rename to `#raiseDeviceRecord`, matching `DeviceDB.raiseDeviceRecord` which it calls.
The Coach: "what does 'raise' mean in this context?"

**What raise means.** The device record is this device's memory of the highest `vault_epoch` it has
seen for a scope, across the vault's lives: the rollback watermark behind 'vault_behind'. *Raise*
is "move the watermark up, never down": `DeviceDB.raiseDeviceRecord(record)` (`device-db.ts:84`)
stores `raisedDeviceRecord(stored, record)` (l.204), the greater of what is stored and what is
handed in, in one read-and-write inside the store (#298's constraint 3), so two tabs raising at once
never lower each other's. `Vault.#raiseRecordAfter(vaultEpoch, call)` (`vault.ts:1071-1081`) calls it
after a read or a write of its own took a new `vault_epoch`, and warns rather than refuses when the
device store fails, since a missed raise only weakens the check until the next read.

**Rec.** The verb is right; the Coach's question suggests the doc block should define it where a
reader meets it first (`DeviceDB.raiseDeviceRecord`), and VOCABULARY.md could carry *raise* beside
*behind*. Then `#raiseDeviceRecord` for the Vault's worker, as proposed, with "after" in its doc
block rather than its name.

## GW-24 security.md l.570: a damaged vault's tombstone can carry a low counter

**The entry** (2026-10-19 (returning), amended 2026-10-22): `delDamagedVault` over props that fail
validation passes `gate_epoch: null` and counts a `vault_epoch` it cannot read from zero, so the
tombstone it leaves can carry a `vault_epoch` lower than devices have seen. "Left as an open matter
for the Coach." Nothing since has ruled on it.

**Today** (`del-damaged-vault.ts`): after the deletion the device's record is raised to the
tombstone's `vault_epoch` (l.25, l.61), so *this* device's watermark follows the tombstone. Another
device holding a higher watermark will read the tombstone's successor (a vault made anew in the
scope, starting its `vault_epoch` from the tombstone's) as 'vault_behind' until the new vault's
epoch climbs past: a refusal, safe, and confusing.

**Where it belongs.** It is one of the cases *What "rollback" means* (TODO.md, the Coach 2026-10-26)
must name: the watermark, the device-record format rule, `vault_epoch` and `stale_write` each guard
a different "going backwards". Rec: carry it into that TODO entry as its worked example, and let the
one definition settle it, rather than a fix of its own.
