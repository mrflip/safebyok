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

## Open

* **The stamp pair's spelling,** as under item 4: `bankStamp` / `gateStamp` wherever a third party names the pair,
  `stamp` for a thing's own. The hunt's own text for item 14 was in a session transcript and is lost: confirm this is
  what it meant.

## Decided in the plan, no ruling needed

* **The ended check** is one private helper, called first in each of the five verbs, `#tryBirth` included.
* **The `as` in the adapter's `answerOf`** is a safety hatch, reported, with the by-kind promise stated on the `VaultDB`
  interface's doc.
* **The old verbs** (`tryGetBox`, `tryPutBox`, `tryDelBox`, `tryListBoxes`) are removed with no aliases: before 1.0
  there are no shims (CLAUDE.md). `listBoxRecords` keeps its name though it gives sparse records; its doc block says so.
* **`GetBoxAnswer` stays,** because a get with `ifAbsent: 'shell'` gives the shell in a `gotvoid` answer, which a plain
  `GetAnswer` types as null.
