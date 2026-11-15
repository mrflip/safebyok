# 2026-11-15: Documentarian run on packages/safebyok/src -- doc blocks reworded, eight things for you

Branch `20261115-docblocks_lean`, worktree `/workspace/byok-docblocks_lean`, cut from `20261113-crypt_plan`.
Not pushed, no PR, no changeset: the Coach reads the diff first.

## Done

All 22 files read; every file with doc blocks touched except `index.ts` and `core.ts` (no doc blocks, only `//`
comments) and `storage.ts` (same). About 230 blocks were rewritten, in four commits by folder (storage, minding,
models, phrases). The pass was a rewording more than a cut: most blocks were already one line, so the total
fell only from 679 to 674 doc-block lines. The longest blocks lost a clause or a sentence.

* All 50-odd "What the noun verbs" headlines now open on the verb or the plain noun ("The options of
  {@link Bank.make}, beside its record", "A store's report of one atomic step", "The cached record for a scope the
  vaultDB reported empty").
* "held / holds / in hand" are gone from every doc block (cached, stored, current, "this Bank object").
* Gone: "as stored", "amounts to", "comes to", "the one ...", "once an attempt lands", "heard", "laid in", and most
  clauses hung on "as", "so" and "where".
* Option lists became lists (`MinderAskOpts`, `tryAt`, `GetBoxArgs` kept as a sentence).
* Two exports had no block and got one: `Gatingkind`, `Sealerkind`.

### Doc-block lines per file, before and after

| File | Before | After |
| --- | --- | --- |
| `src/core.ts` | 0 | 0 |
| `src/index.ts` | 0 | 0 |
| `src/minding/shapes-minder.ts` | 13 | 17 |
| `src/minding/thing-minder.ts` | 48 | 45 |
| `src/models/bank.ts` | 64 | 59 |
| `src/models/base-thing.ts` | 14 | 14 |
| `src/models/device.ts` | 36 | 36 |
| `src/models/gate.ts` | 19 | 19 |
| `src/models/gating.ts` | 57 | 55 |
| `src/models/lease.ts` | 38 | 38 |
| `src/models/proving.ts` | 55 | 55 |
| `src/models/sealers.ts` | 30 | 31 |
| `src/models/stamps.ts` | 17 | 17 |
| `src/models/wayin.ts` | 15 | 13 |
| `src/phrases.ts` | 35 | 35 |
| `src/storage.ts` | 0 | 0 |
| `src/storage/adapter-vault-db.ts` | 35 | 35 |
| `src/storage/memory-vault-db.ts` | 9 | 9 |
| `src/storage/policies.ts` | 9 | 9 |
| `src/storage/shapes-thing.ts` | 105 | 105 |
| `src/storage/thing-classifier.ts` | 48 | 47 |
| `src/storage/vault-db.ts` | 32 | 35 |
| **total** | **679** | **674** |

### Members changed, by file

* `src/minding/shapes-minder.ts` (7): `gcTime`, `networkMode`, `retry`, `DefaultQueryCacheOpts`, `MinderAskOpts`, `MinderBank`, `ThingPins`
* `src/minding/thing-minder.ts` (27): `VoidSentinel`, `DeliverableThing`, `GotAnswer`, `TSQAnswer`, `make`, `hello`, `#startVaultDBWatch`, `at`, `tryAt`, `async get(ask: GetThingAsk & {`, `#backgroundRefresh`, `isStaleAt`, `#deliver`, `#doDeliverSeed`, `#doDeliverRecord`, `#tsqGetAskOf`, `#tsqListAskOf`, `pins`, `#isWholeRecord`, `#demandOwnAsk`, `#demandEnabled`, `#demandReady`, `#answerOfTSQ`, `isVoidSentinel`, `gotAnswerOf`, `betterRecordOf`, `cmpRecords`
* `src/models/bank.ts` (28): `BankDna`, `GetBoxArgs`, `GetBoxAnswer`, `BankOpts`, `device`, `queryCacheOpts?`, `BirthOpts extends BankOpts`, `Bank extends BaseThing`, `#lease`, `device_tok`, `make`, `async birth`, `mintStamps`, `makeRecord`, `put`, `#tryBirth`, `unlockByProving`, `sealBox`, `tombstoneBox`, `unsealBox`, `tryListBoxes`, `tryGetBox`, `tryPutBox`, `tryDelBox`, `#demandBox`, `#demandLease`, `BoxCheck`, `disabledAnswerOf`
* `src/models/base-thing.ts` (8): `BaseThing`, `userid`, `lifeseq`, `revtok`, `revseq`, `written_at`, `scope`, `stamp`
* `src/models/device.ts` (15): `DefaultLeaseMillis`, `DeviceRecord`, `DeviceOpts`, `keyDeriver`, `logger?`, `autolockMinutes?`, `Device`, `device_tok`, `#endCause`, `make`, `birthBankPrompt`, `detachGating`, `endCause`, `guardRequestCleartext`, `millisOf`
* `src/models/gate.ts` (6): `GateDna`, `GateBank`, `GateOpts`, `make`, `makeRecord`, `demandPasskeyAddable`
* `src/models/gating.ts` (15): `Gatingkind`, `CleartextsForGatingkind`, `AskUser`, `GatingOpts`, `attempt`, `GatingRecord`, `Gating`, `gatingTok`, `passkeyHeader`, `make`, `launch`, `attempt`, `dismiss`, `birthBank`, `checkedCleartexts`
* `src/models/lease.ts` (13): `LeaseBank`, `PriorOf`, `RecordOf`, `CleartextsOf`, `LeaseOpts`, `Lease implements LeaseStamp`, `#record`, `make`, `seal`, `unseal`, `#sealText`, `demandEnabled`, `sealerOf`
* `src/models/proving.ts` (12): `ProvingParts`, `stored`, `ProvingOpts`, `async judgeStrength`, `buildLease`, `make`, `async buildNovel`, `async buildStored`, `make`, `async buildNovel`, `async buildStored`, `guardKeyDeriver`
* `src/models/sealers.ts` (9): `Sealerkind`, `Sealer`, `stampsOf`, `recordOf`, `BoxRecord`, `BoxTombstone`, `BoxCleartexts`, `BoxWhisper`, `BoxTombstone`
* `src/models/stamps.ts` (7): ``, `export const { bankScope, bank`, `CitedGate`, `StampedGate`, `LeaseFormat`, `LeaseStamp`, `LeaseRecord`
* `src/models/wayin.ts` (2): `wayinCtxOf`, `make`
* `src/phrases.ts` (6): `TombstoneOfLiveOnly`, `LifepathNotKept`, `BornAtNotNow`, `BornAtNotStored`, `MainGateDeleted`, `GcTimeShape`
* `src/storage/adapter-vault-db.ts` (6): ``, `answerOf`, `AdapterVaultDB implements VaultDB`, `tryBirthBank`, `watch`, `answerForThrown`
* `src/storage/memory-vault-db.ts` (1): `Listener`
* `src/storage/policies.ts` (4): `GateCited`, `GatePolicies`, `demandPolicies`, `PoliciedMeta`
* `src/storage/shapes-thing.ts` (32): ``, `ShellLifeseq`, `lifeseqOf`, `BankThingFormat`, `GateThingFormat`, `BoxThingFormat`, `MaxLabelsUnder`, `isLabelpathOfKind`, `isLabelLast`, `isMainGateLive`, `exactPartialOf`, `export const { thingScope, thi`, `ThingCited`, `Sparse`, `sparseOf`, `ShellCited`, `childShellCited`, `kindChecksOf`, `export const { thingWatchScope`, `CitedOf`, `WriteThingAsk`, `BirthPuts`, `ThingWatchScope`, `checkedGetThingAsk`, `checkedListThingsAsk`, `checkedWriteThingAsk`, `withRecordsChecked`, `checkedBirthBankAsk`, `birthPutsOf`, `checkWriteInvariants`, `loggableAsk`, `loggableAskOf`
* `src/storage/thing-classifier.ts` (13): `WriteCmpAsk`, `Presence`, `revtokCmpOf`, `revseqCmpOf`, `isLifeOff`, `writtenRootsOf`, `watchedThingOf`, `classifyWriteThing`, `demandReplaceable`, `ThingsFetched`, `classifyListThings`, `BankRootsFetched`, `classifyBirthBank`
* `src/storage/vault-db.ts` (17): `BadAct`, `BadAnswer`, `GetThingAnswer`, `WriteThingAnswer`, `DamagedThing`, `ListedBeside`, `ListThingsAnswer`, `BirthBankAnswer`, `ThingNotice`, `Actual`, `ListThingsActual`, `BirthBankActual`, `VaultDB`, `tryWriteThing`, `tryBirthBank`, `watch`, `VaultDBMembernames`

`git diff fa2f4cf34..HEAD -- packages/safebyok/src` is the member-by-member truth.

## Facts dropped that STYLE.md does not plainly cut

* `ListThingsAnswer`: why `dbhas` is `[]` under `void`/`gone` ("the parent has no live life for a child to hang off").
* `BankThingFormat`, `GateThingFormat`, `BoxThingFormat`: the reason for the distinct `fmt` ("so it is never read as big's row") became "distinct from big's row (3001)".
* `Device.birthBankPrompt`: "The layer above asks only where no bank is stored" (a caller) became an instruction: call it only where no bank is stored, else `gate_made_elsewhere`.
* `Bank.#tryBirth`: the `passed` answer for a stored bank, and the evicted lease, are no longer in its block.
* `Bank.sealBox`: "over a live box it is the next revision"; "a stored box spread with a new sidecar will do" (now "only `prior`'s Thing fields and sidecar are read").
* `Bank.tombstoneBox`: "wrapped under the bankKey" for the fresh boxKey.
* `Bank.#demandBox`, `#demandLease`, `ThingMinder.#demandEnabled`, `#demandReady`, `Lease.demandEnabled`: the refusal kinds (`record_conflict`, `bank_locked`, `disabled`, the device's refusal) are dropped for the predicate.
* `Lease.seal`: "under a fresh key" and "sealed or refused" (the zeroing of the cleartext bytes is still said).
* `Gating`: "to birth, unlock, change or delete a bank" (only `birth_bank` exists); `attempt`: `gating_unlaunched` became "call `launch` first".
* `QueryCacheOpts.gcTime`: "before it is removed".
* `classifyBirthBank`: "which the store writes in one step and then reports as written".
* `StampedGate`: "as a stored wayin's proving accepts it" (now "what a proving of a stored wayin takes").
* `LeaseRecord`: "as a device caches it". No code in the new core has a device cache a lease.
* `wayinCtxOf`: "serialized name/value pairs ... as cryptographic context" (the Gallant text from `notes/gallant-docblocks.md`), now said in the block's own words.

## Proposed renames

* `DeliverableThing` -> `CachedThing`: the block is now "A cached record", and "deliverable" is the minder's own figure.
* `thingPins`, `ThingPins`, `ThingMinder.pins`: "pins" is a private figure. `minderScope` says what it is (user, bank, modelkind).
* `isLifeOff` (thing-classifier) -> `isLifeMismatch`: "off" is a figure.
* `Presence` (thing-classifier) could be `Liveness`, which is the word its block now uses.

## Open questions and other errors found (not fixed)

1. `VaultDB`'s doc said each verb "never throws", but `AdapterVaultDB.watch` throws on bad arguments: search `watchArgs.parse({ scope, onNotice, onBadNews })`. I wrote the block to say only the `try` verbs resolve an answer. Is the throwing `watch` intended?
2. Old `Gating` block said "to birth, unlock, change or delete a bank", while `gatingkindVals = ['birth_bank']`. I wrote "for the change `gatingkind` names".
3. Old `Gating.passkeyHeader` block said "at launch"; the constructor sets it (`Helpers.adorn(this, 'passkeyHeader', ...)`). The block now says "when the gating was made".
4. `proving.ts`, `gating.ts` cite guarantees by number (`(G2)`, `(G3)`, `guarantees.md, G1 and G8`), but `notes/guarantees.md` describes safebyok-big alone (CLAUDE.md). They are in `//` comments and in three doc blocks (`spendCleartexts`, `Proving` #wayinKey, `checkUnwraps`). Rewrite the guarantees for the new core, or drop the citations?
5. `ThingMinder.isStaleAt` is public, used only by tests (`thing-minder.test.ts`), sits in the `[TSQ Direct Cache Calls]` section without a blank line before `#vacateTSQ`, and is missing from that banner's key list.
6. `ThingMinder.#tsqListAskOf` is unused (`// @ts-expect-error -- unread until tryList`): dead code until `tryList` exists.
7. `src/index.ts`'s header comment says "the front door" (a named slop trope in `notes/gallant-docblocks.md`), and its line wrapping is broken mid-sentence ("`safebyok/storage` the vaultDB. What a host needs that / safebyok-big defines ..."). It is a `//` comment, so I left it.
8. The base checkout `/workspace/byok` has an uncommitted change to `packages/safebyok/src/minding/thing-minder.ts`. The worktree was cut from the commit and does not have it, so my doc edits to that file may conflict with it.

## After the rebase onto #707 (2026-11-15)

Rebased onto PR #707, which rewrote much of `storage/`. Where #707 changed a member, its own doc block was kept: `Listener`
(now `Watcher`), `demandPolicies` (now `policyRefusalOf`), `demandReplaceable` (removed), `BankRootsFetched` (moved),
`MaxLabelsUnder` (a box has at most one label). A later commit (f0ba10b92) restored the pass's rewrites there, merged with #707's
new facts, and brought #707's own new blocks into the same register.
