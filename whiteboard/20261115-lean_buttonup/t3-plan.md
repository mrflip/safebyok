# T3 `bank_box_errors`: the plan

Step 4 of `complete.md`'s *Sprint Notes*, with the *Features* bullets it serves ("Bank's box verbs answer by kind",
"`CoreBox` is the box's record-level class", "The bank's box verbs take and give records"). Drafted 2026-11-17 from a
survey of the base checkout with #713's code. Nothing here is ruled beyond complete.md's bullets: the questions at the
end await the Coach. Snippets are to search on; line numbers drift.

## Two threads

Four items across storage types, the bank's verbs, the sealer and lease, and the provings' stamps: about 750 lines over
about 25 files. That is two threads by the sizing rule (`notes/supervising.md`).

1. **T3a `core_box`** (items 2 and 4): the sealer and the stamp pair. They share the crypto files and one read of
   `notes/guarantees-big.md`. Apart from four lines of `bank.ts`, it is disjoint from the classifier tidy, so it can
   start now, cut from #713's tip.
2. **T3b `bank_box_answers`** (items 1 and 3): answers by kind, then the record verbs. It shares `bank.ts`,
   `adapter-vault-db.ts` and the ask builders with the classifier tidy, so it is stacked on T3a and cut after the tidy
   merges.

Nothing outside `packages/safebyok` imports the new core, and the package is private: every caller is in
`packages/safebyok/{src,tests}`. Each thread needs an empty changeset naming what a host of `safebyok` will see.

## T3a `core_box`

### Item 2: `CoreBox`, the box's sealer

**Today.** `sealers.ts` has `sealerkindVals = ['BoxWhisper', 'BoxTombstone']`, a `Sealer<PriorT, NextT, RecordT,
CleartextsT>` whose first member is `nextRevisionOf(prior)`, and two frozen sealers, `BoxWhisper` and `BoxTombstone`
(`{ ...BoxWhisper, nextRevisionOf: boxTombstoneOf }`). The lease looks a sealer up by kind string (`sealerOf`, under
an `eslint-disable import-x/namespace`): `lease.seal('BoxWhisper', prior, cleartexts)`, and so on. The bank calls it four
times: in `#tryBirth`, `sealBox`, `tombstoneBox` and `unsealBox` (`(parsed.am === 'a') ? await lease.unseal('BoxWhisper',
parsed) : await lease.unseal('BoxTombstone', parsed)`).

**After.**
* `CoreBox`, a class of statics in a new `src/models/core-box.ts`: `nextRevisionOf` (today's `boxWhisperOf`), `tombstoneOf`
  (`boxTombstoneOf`), and the Sealer's members `tags`, `purposes`, `stampsOf`, `encode`, `decode`, `sealedOf`,
  `recordOf`, moved verbatim. `CoreBox satisfies Sealer`.
* `Sealer` loses `PriorT` and `nextRevisionOf`. `sealers.ts` keeps the Sealer and record types (`BoxRecord`, the
  `BoxTombstone` *type*, `BoxCleartexts`, `SealedOf`, `UnsealedOf`).
* The lease takes the sealer itself: `seal(sealer, nextRevision, cleartexts)` and `unseal(sealer, record)`. The bank
  calls `lease.seal(CoreBox, CoreBox.nextRevisionOf(prior), cleartexts)`, `lease.seal(CoreBox, CoreBox.tombstoneOf(prior),
  { whisper: {} })`, and one `lease.unseal(CoreBox, parsed)`. `sealBox`, `tombstoneBox` and `unsealBox` stay on the
  bank, which holds the lease.
* Deleted: `sealerkindVals`, `Sealerkind`, `SealerKinds`, the sealers `BoxWhisper` and `BoxTombstone`, `sealerOf` and
  its safety hatch, `PriorOf`, `NextOf`, `RecordOf`, `CleartextsOf`, and `Checks.sealerkind`; their exports from
  `core.ts`, and `'sealerkindVals'` from `index.test.ts`'s exclusion list.

**Contract.** No change in the working case, if the members move verbatim. A kind string handed to the lease no longer
means anything, so the lease checks the sealer it is handed (ruling 2).

**Guarantees** (`notes/guarantees-big.md`, *The guarantees*). This touches G5 (the boxKey a local in the lease), G6 (the
whisper's bytes zeroed), G7 (the whisper's JSON text only in locals), G8 (`decode` refuses quoting nothing), G9 (only
Proving and Lease touch keys) and G10 (purpose separation; the ctx binds the box's sparse fields). All are kept, in
substance, so long as `#sealText` and `#openSealed` are unchanged and the members move verbatim. The proofs must pass
with only identifiers changed: `ctx-bytes.test.ts`'s byte literals, lease.test's "zeroes the whisper's bytes", and
sealers.test's "quoting none of it". One nuance, which ruling 2's check answers: today the
lease runs only sealers its own module exports; after this, it runs whatever sealer it is handed, `decode` included.

**Tests.** `sealers.test.ts` (its `sealerkindVals` and "share all but their next revision" describes go or become
CoreBox's), `lease.test.ts` (about 25 calls with kind strings; `SealerkindCases`), `ctx-bytes.test.ts`, `proving.test.ts`.

### Item 4: the bank and gate stamp pair, spelled one way

**Today,** four spellings of one pair:
* `{ bankStamp, stamp }`: the `Gate` getters and `stampedGate` (a Gate ducks as a `StampedGate`);
* `{ bankStamp, gateStamp }`: `Bank.mintStamps` and the `Proving` getters;
* `{ bank, gate }`: `ProvingParts`, `buildNovel(device, bank, gate, cleartext)`, the `*NovelArgs` checkers,
  `wayinCtxOf(bank, gate, header)`;
* `bankstamp` and `cited`: `buildLease`'s locals.

**After** (open: confirm): `bankStamp` / `gateStamp` wherever a third party names the pair; `stamp` stays for a thing's own stamp,
so `StampedGate` keeps `{ bankStamp, stamp, wayins }`. The lease stamp's flat fields (`gatelabelpath`, `gate_lifeseq`,
`gate_revtok`) are not renamed.

**Guarantees.** `cipherCtx` encodes the stamps' contents, never the names that carry them, so renaming carriers moves no
ctx bytes. This touches G3, G9 and G10, and keeps them; no drift entry. `ctx-bytes.test.ts` is the proof.

## T3b `bank_box_answers`

### Item 1: answers by kind

**Today.** `GetThingAnswer` and `WriteThingAnswer` are not generic (`ListThingsAnswer<RecordT>` already is), so the bank
casts and double-checks:
* `Bank.put`: `return answer.val as BankThing`;
* `tryGetBox`: `if (answer.val.fmt !== BoxThingFormat) { return { ...answer, ok: false, act: 'unclassified_storing', … err:
  otherThanBox(answer) } }`. It cannot fire under `AdapterVaultDB`: the classifier checks every row by its labelpath's
  kind, and the ask's `isModelkindOwn` ties the kind to the labelpath. Only a `VaultDB` that breaks its contract
  reaches it;
* the ended-bank check, `const { endCause } = this.#device` then `if (endCause !== null) { return …disabledAnswerOf(…) }`,
  five times: `#tryBirth`, `tryListBoxes` (adding `parent: null, damaged_rows: []`), `tryGetBox`, `tryPutBox`,
  `tryDelBox`.

**After.**
* `GetAnswer<RecordT extends Thing = Thing>` and `WriteAnswer<RecordT>`, with `GetAsk<RecordT>` and `ListAsk<RecordT>` (ruling 1); the `VaultDB` verbs typed by kind, with one
  `as` left in the adapter's `answerOf`, commented with the by-kind check.
* `otherThanBox`, `Phrases.GotOtherThanBox`, the `as BankThing` cast and `tryGetBox`'s `return { ...answer, val:
  answer.val }` go.
* The ended check is one private helper, called first in each of the five. It keeps its answer exactly: the
  device's `endCause`, `act: 'unclassified_storing'`, `world: null`, `dbhas: null`, and the vaultDB never called.

**Contract.** No change in the working case. The broken case changes how it is reported, not what a working call
answers: a `VaultDB` answering a gate to a box get is typed as a box, and `unsealBox`'s `#demandBox` refuses it
`bad_option`, where today `tryGetBox` refuses `storage_issue`. bank-flows' "tryGetBox refuses a row the vaultDB answers
that is not a box, as a storage issue" goes; its comment states today's promise ("its row reaches the refusal's rows,
never its message or meta").

**Tests first.** Nothing pins `tryDelBox` on a disabled device, or `tryListBoxes`'s disabled shape. Before folding the
checks, add one table test over every try verb: the whole refused answer, and the vaultDB not called. Keep bank.test's
"Bank.birth … throws the device's refusal on a swept device, building no lease and writing nothing", which pins the
check before `buildLease`.

**Docs.** gallant.md's `#pass-it-whole` shows `otherThanBox(answer)` as a Gallant: mark it removed in T3b.

### Item 3: the bank's record verbs

**Today.** `tryListBoxes()`, `tryGetBox(ask: GetBoxAskDraft)` (overloaded for `ifAbsent: 'shell'`), `tryPutBox(ask:
PutAskDraft<BoxThing>)`, `tryDelBox(ask: DelAskDraft<BoxThing>)`; only bank-flows calls them. The get ducks already
(`getAskOf` destructures). The put and del do not: `putAskOf`'s doc says "A field the put does not accept goes through,
for the verb's strict check to refuse."

**After.** `getBoxRecord`, `putBoxRecord`, `delBoxRecord` and `listBoxRecords` throw and give the record (`BoxThing |
BoxShell | null`, the `BoxThing` written, the tombstone, `Sparse<BoxThing>[]`); their `try` twins replace the four `try*Box`
verbs, with no aliases. Each throwing form is its twin and `if (! answer.ok) { throw answer.err }`, so the ended
check lives in the twins alone. Put and del keep today's strictness on extra draft keys: their builders are the
classifier tidy's (ruling 5).

**Tests.** bank-flows' four flows and seven refusals renamed; each throwing form gives `val` or throws `err`.

## Collisions

* **The classifier tidy** (separate session): `Bank.queryCacheOpts`'s removal, "the vaultDB has one source", the
  `classify*` pass-throughs beside `answerOf`, and the drafts becoming `Z.input` of a defaulted twin all touch what T3b
  rewrites. Hence T3b after the tidy.
* **The birth redesign** (`world_function.md`) later rewrites `#tryBirth` and may remove `Bank.put`. T3's edits to them
  are a line or two each, and nothing conflicts if T3 lands first.
* Sibling PRs changing the same lines stop base-sync: stack T3b on T3a.

## Rulings, 2026-11-17

The Coach's answers, in close to the Coach's words, beside each question.

1. **How the verbs become typed by kind:** `FooAsk<RecordT>` feels right (`GetAsk<RecordT>`, `ListAsk<RecordT>`,
   mirroring `WriteAsk<RecordT>`). It should let the verbs overload by `op` and by `modelkind`, and the answers by
   those and by `act`. Advise once it comes together.
2. **Does the lease check the sealer it is handed:** yes, a duck check for the functions it expects, refusing
   `bad_option`; or brand the class. Never `=== CoreBox`.
3. **Where `CoreBox` lives:** `src/models/core-box.ts`, exported from `safebyok/core` only.
4. **The lease's typing once `nextRevisionOf` goes:** `Sealer<NextT, RecordT, CleartextsT>` and `seal<NextT>(sealer,
   nextRevision: NextT, cleartexts): Promise<NextT & SealedOf<…>>`, so `sealBox` and `tombstoneBox` keep `BoxRecord` and
   `BoxTombstone` with no cast: lgtm.
5. **"Accepts a duck record" for put and del:** the ask builders (`putAskOf`, `makePutAsk`) are in the chain the
   classifier tidy reworks, so T3b leaves them as they are: an extra draft key still refuses. Raise it if something
   blocks.
* **The stamp pair's spelling,** as under item 4: `bankStamp` / `gateStamp` wherever a third party names the pair,
  `stamp` for a thing's own. The Coach: lgtm (2026-11-17).
* **The Sealer's signature, simplified** (the Coach, 2026-11-17, revisiting ruling 4). The Sealer is typed by the record
  and its cleartexts alone; both directions are derived from them. For a box, `seal` takes the record less its
  `${keyof CleartextsT}_sealed` fields (`Sparse<BoxRecord> & { sidecar? }`) and gives `BoxRecord`; `unseal` takes
  `BoxRecord` and gives the record with each `foo_sealed` replaced by `foo` (`UnsealedOf`), not the bare cleartexts.
  Two ways to spell it: a lookup table by modelkind (`CleartextsOf<RecordT>`, `{ box: BoxCleartexts }`), so the Sealer is
  generic in the record alone; or hardcode the box's types, since the box is the only thing sealed today.
  * Claude agrees on deriving both sides and on `unseal` giving the unsealed record (firm): `SealedOf` and `UnsealedOf`
    already exist, and the spread `unsealBox` does today moves into the lease. On the spelling, Claude recommends
    `Sealer<RecordT, CleartextsT>` with neither table nor hardcoding (mild): a table whose one row is the box is
    machinery before its second use, and is a few lines to add then; hardcoding would have the lease import box shapes,
    where its doc block promises it knows nothing of boxes. `seal<NextT>` keeps ruling 4's no-cast typing.
  * **Ruled** (the Coach, 2026-11-17): `Sealer<RecordT, CleartextsT>`. "There's no possible reason to ever have it
    sealing something that lacked a modelkind. By the time it reaches here it has been validated to hellenback."
  * The Coach, 2026-11-17: "If sealer wants nextRevisionOf why would we take it away? Of course you can have that on
    the thing." The rulings above came from a session whose context had grown muddy: treat each as possibly the
    Coach's, possibly that session's invention, and check it.

### The seal path, bulletproof in and out (agreed 2026-11-17, replaces item 3)

The Coach: "Looking at this method, I want to understand well what is going in to the machine. The point here is to
say 'don't bother, kids: this method is bulletproof on the way in and the way out'." Hence generous on the way in,
which reverses the usual rule for an internal function.

* `lease.seal(sealer, donorProps, publicProps, secretProps)`; overloaded: `publicProps` `{ am: 'x' }` and no secrets
  gives the tombstone, else the live next revision. `Bank.sealBox` mirrors it without the sealer; `tombstoneBox(donor)`
  calls it. The Sealer keeps `nextRevisionOf(donor, publicProps)` and `tombstoneOf(donor)`; the lease calls them, picking
  by `am`. Claude moved: picking by `am` removes the two-sealer problem that was the only reason to drop them.
* The donor may be a whole record, sealed or unsealed, a tombstone or the shell. It passes an approvelist and then a
  banlist: `sealer.donorPropsOf` parses it (stripping, not strict) to its Thing fields and body; the lease then runs
  `withoutSecrets` on that parsed result, with a banlist the lease owns, never taken from the sealer: the cleartext
  names, and every `*_sealed` key (confirmed: the lease owns it). The name `withoutSecrets` (the Coach), since it strips
  ciphertexts too.
* `sealer.publicPropsOf` slices the body, `am` and `written_at` from `publicProps`; `sealer.secretPropsOf` the
  cleartexts from `secretProps` (confirmed). A tombstone seals the sealer's own empty cleartexts.
* `written_at` may be given in `publicProps`, never required (the Coach): a batch of writes may share one. Absent, the
  clock gives it. It is part of the stamp, so it is signed; a by-the-clock time a host wants is the database's to add,
  unsigned. A new life's `born_at` follows the `written_at` used, as today.
* The sidecar may come on the donor or in `publicProps` (which wins), and is required on exit, never defaulted. The
  birth passes `{ sidecar: {} }`: the shell is a tombstone, which is strict and has no sidecar.
* `stampOf(record)` gives one bag (not an array): the lease binds `[bank.stamp, sealer.stampOf(record)]`, so no stamp a
  sealer gives can stand beside the bank's. It parses a new `boxStamp` in `stamps.ts`, today's `boxSparse` fields
  (no ctx byte moves), refusing the shell. `Lease.#bankKey` binds `bankStamp.parse(this.#bank.stamp)`: binding is the
  time to over-validate.
* `recordOf` checks the record strictly on the way out. `unseal` gives the record unsealed (`UnsealedOf`).
* `BoxSparse` retires: the donor is the one place that admits all three (live, tombstone, shell); listings use
  `Sparse<BoxThing>`, the ctx `boxStamp`, the bank's root `BoxShell | BoxRecord`.
* `Bank.sealBox` checks the donor is this bank's (scope and root) before any crypto, with no checker handed in
  (the checker audit's finding 2).
* A checker that picks fields is a good use: it names intent (`bankScope.parse(stamp)` says "the scope"). The audit's
  findings 1 and 3 are withdrawn; the literal `{ userid, banklabel }` a line above `bankScope.parse` in `bank.ts` becomes the checker too.
  As written this would drop the user check: `device.scope` is big's `{ user_id, banklabel }`, and `checkedConsistent`
  compares only shared fields. The Coach (2026-11-17): "user_id is wrong, it should be userid there. We have control
  over the interface: the exercise here is to simplify and untangle." So the new core speaks `userid` throughout
  (Device, Gating, `Bank.mintStamps`, the strength checker's call), and then the line is `bankScope.parse(parsed)`.


## Decided in the plan, no ruling needed

* **The ended check** is one private helper, called first in each of the five verbs, `#tryBirth` included.
* **The `as` in the adapter's `answerOf`** is a safety hatch, reported, with the by-kind promise stated on the `VaultDB`
  interface's doc.
* **The old verbs** (`tryGetBox`, `tryPutBox`, `tryDelBox`, `tryListBoxes`) are removed with no aliases: before 1.0
  there are no shims (CLAUDE.md). `listBoxRecords` keeps its name though it gives sparse records; its doc block says so.
* **`GetBoxAnswer` stays,** because a get with `ifAbsent: 'shell'` gives the shell in a `gotvoid` answer, which a plain
  `GetAnswer` types as null.

### The lease's gate fields (the Coach, 2026-11-17; rides T3a with item 1)

* The lease stamp's `gatelabelpath` becomes `gate_labelpath`, beside `gate_lifeseq` and `gate_revtok`. This replaces the
  earlier line "the lease stamp's flat fields are not renamed". `cipherCtx` stable-JSONs its stamps, keys included, so
  this moves the `bank_key_lease_wrapped` ctx bytes: `ctx-bytes.test.ts`'s lease literal changes, as directed, and a
  lease wrapped before the change refuses `damaged_lease` (fails safe; a host's user proves again). The changeset says so.
* `citedGate` becomes `gateCited`, built from `gateStamp`, with a doc block that points to it ("@see gateStamp").
  It cannot be an alias of `gateStamp`: a gate's stamp is fixed for its life and has no `revtok`, and the lease pins one
  gate revision. `buildLease` reads its gate fields from `gateCited.parse(gate)`.

### Routed to T3b (the Coach: "anywhere convenient", 2026-11-17)

* One bank scope: `bankScope` (`models/stamps.ts`) and `thingWatchScope` (`storage/shapes-thing.ts`) have the same
  fields. One checker, in storage, which the models use.
* `watchArgs` moves beside `AdapterVaultDB.watch`, its only user, built from that bank scope.
* T3b already rewrites `bank.ts` and `adapter-vault-db.ts` after the classifier tidy, so neither collides there.

### T3a review round (the Coach, 2026-11-17)

* `tombstoneOf(donor, publicProps)`: a tombstone takes a given `written_at`, for batches ("makes lots of sense, yes").
* `gateCited` is the cited record of a gate write ask (`shapes-thing.ts`'s). The lease's gate revision is
  `gateRevisionedStamp`, a module-local checker (its type exported where a signature names it).
* `BoxDonor` becomes `Sealable<BoxRecord>`.
* `Bank.rootBox` is a plain object, so it is typed by records: `BoxRecord`, or the shell before the birth; not
  `Sparse<BoxThing>`.
* `unseal`'s answer is built from the parsed record, not the caller's.
* **The general overload stays**, on `Lease.seal` and `Bank.sealBox` both (the Coach): one `sealBox` taking either kind,
  `am` deciding, is the convenient form, and a list of mixed writes ("this is a tombstone, this isn't, use this over a
  list") has the union type, which only the general overload takes. Claude moved for that reason. Once `tombstoneOf`
  takes `publicProps`, nothing is dropped; `sealBox(donor, {})` compiles and refuses at runtime, which is acceptable.
  `tombstoneBox(donor, publicProps?)` stays as sugar over `sealBox`.
* `withoutSecrets` stays exported, unvalidated: "This feels like a very handy thing. We can't ban stupid. Export it"
  (the Coach). A deliberate exception to validating every export.
* The documentarian may be spawned on a named target without a Coach's request (agent description and PROCESS.md
  amended in the base checkout).
* STYLE.md, *Control flow and refusals*: "When two refusals apply, throw the easier one, unless the other is both more
  likely and more dangerous."
