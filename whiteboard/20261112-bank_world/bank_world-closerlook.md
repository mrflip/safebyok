# bank_world: the Closer Looks

Two cold Closer Looks of the sprint's line, run 2026-11-12 and 2026-11-13. They are exported from the sprint doc's tabs, and the Coach's replies run on after each item, in the item's own text. The export drops the tabs' highlights (14 in the first). The Coach's answers that became work are in bank_world-resolutions.md and the plan's *Closer Look triage* section.

## Closer Look 1

## Closer Look: bank\_world at 43f699a1e

A cold read by one opus agent of everything sprint bank\_world changed in `packages/*/src` since it began (e4844d4fd), judged against design.md, threads.md's ground rules, rulings.md, the progress doc's *Decisions standing*, today's rulings, and your standing rules. It did not read thread files, PR text, this doc, commit messages, notes/security.md or the contract notes. Out of scope: thread 17, the documentarian PRs (#683 and the core's), and #680 (tooling). Flavours: **guidance gap**, **guidance wrong**, **solution off**, **redesign?**, or **can't tell**. Reply by typing beside an item; nothing is scheduled until triage.

**Headlines.** E1: `bank.ensureUnlocked()` fetches the whole bank whenever 2 s have passed, even when unlocked (probed: 5 calls, 5 fetches). E2: autolock reads only the cached lease row, never the live lease (probed: a refused cache means the bank never autolocks; a younger row from another page keeps an older page unlocked). E3: the stub listings carry the build, delete and gate verbs, and the Device rebuilds the BankListing per life of the bank; your `Listable` fallback would remove that machinery.

### What the reader read, and what it did not

**Read.** Whole, at 43f699a1e: `packages/safebyok/src/models/{bank,device,lease,gate,bank-listing,gate-listing,vault-listing,vault,gating}.ts`. By section: `listing.ts` (props, delivering, watch, the abstract members) and `storable.ts` (the lock and guard members). Diffs only: `box.ts`, `box-listing.ts`. Storage: `bank-classifier.ts` whole; the bank and gate verbs of `adapter-bank-db.ts`; the lease verbs of `device-db.ts`. React: `bank-provider.tsx`, the diffs of `hooks.ts` and `provider-hooks.ts`. Adapters by section: the Convex cascades and budgets, the IndexedDB watch and tidy code, the Postgres `bank-functions.ts` header. Whiteboard: design.md whole; threads.md *Ground rules*; rulings.md *Rulings asked for*; progress *Decisions standing*, the do\* list, the lessons.

**Not read.** Thread files, PR text, the sprint doc, commit messages, `notes/security.md`, anything named `secret`, `notes/*contract*.md`; the GraphQL adapter and the Postgres TypeScript beyond their banners; the tests, except samples of `bank-ending` and `bank-gate-listings`.

**Did.** Ran two throwaway vitest files on a scratch copy of the package with its own `makeBankWorld` (MemoryBankDB, MemoryDeviceDB, a clock the test moves); results under each item. A sonnet subagent extracted the new names.

### 1. Eyebrows, ranked

#### E1. `bank.ensureUnlocked()` fetches the whole bank whenever 2 s have passed, even when the bank is already unlocked\
For the bank timeliness, with notify on, several hours or never would be the likely default. without it, tens of minutes to never.

- **Where:** `models/bank.ts:159`, `const gate = await this.maingate.ensureTimely(VX.Promptly); this.demandPromptable()`, which runs before `if (this.isUnlocked) { return this }`. `Promptly = 2000` (`shapes/shapes-vaultish.ts:71`).
- **What happens:** a gate refresh is `GateListing.doTryGet` (`gate-listing.ts:147`), which calls the full `tryEnsureBank` (bank row, gate row, every vault row), then discards the vault rows (`val: answer.val?.gates.main ?? null`).
- **Why it matters:** the package's own example calls `ensureUnlocked` before each expose (`safebyok-react/src/components/box-whisper-field.tsx:12`, `await bank.ensureUnlocked(); await box.expose()`).
- **Probe P3:** on an unlocked bank, 5 calls 3 s apart made **5** `tryEnsureBank` calls.
- **Origin:** new. At e4844d4fd, `vault.ensureUnlocked()` called `this.ensureTimely()`: the 5-minute default horizon, and one `getVault`.
- **Cost:** a box-frequency guard now costs the heaviest read, above a gate verb's. The same refresh in `unlock`, `delPrompt` and the three gate prompts is gate-frequency, and fine there.
- **Flavour:** solution off. The gate has no fetch of its own (E3), and the prompts' horizon was applied to `ensureUnlocked` too.
- **Settle:** does an unlocked bank need a fresh gate at all? A fix in a clause: check `isUnlocked` first.

#### E2. Autolock reads only the cached row, never the live lease\


\> . I'd fix it by having the lease the bank holds answer its own expiry.

That's my preference too.&#32;

- **Where:** `models/bank.ts:211`, `const expiring = await Lease.tryExpiresAt(this.#leaseFriendOf())`; behind it `models/lease.ts:114`, `static async expiresAt(friend: LeaseFriend)`, peeks the deviceDB row. `this.#lease` is never asked.
- **Probe P1:** the deviceDB refuses to stow (a quota, a private window). The bank unlocks; `storage_unavailable` is told once. The clock passes autolock, and `autolock()` leaves the bank **unlocked**, with no news. It will never autolock this page.
- **Probe P2:** page 1 unlocks. At 50 min page 2 on the same device locks, proves again and caches a younger row. At 70 min (autolock 60), page 1's `autolock()` leaves page 1 **unlocked**.
- **Origin:** carried (the old `Bank.autolock` read the cached rows too). The ruled method was built as a static read of the cache. Your ruling on #678: "\[the ground truth is\] the live lease held by the bank, not what's in the cache".
- **Cost:** one path, but the only autolock. A security reviewer would assume a bound on exposure that P1 shows is absent.
- **Flavour:** guidance gap: the ruling's intent and the method it names diverge.
- **Settle:** must autolock bound the live lease? If so, the lease needs an instance method answering its own expiry.

#### E3. The stub listings carry real work, and Bank's one-object-per-life fights Listing's through-lives model, so the Device rebuilds the listing

Rebuilding listing discards the bank and so on down the line?

Any code that already exists or has a clear parallel to code written for Vault/VaultListing (new or old) and Box/BoxListing is acceptable, and if new code has been written to avoid touching the BankListing or GateListing, migrate it. I put that guidance to avoid the class too stridently

However: what you're describing below sounds totally unnecessary. Is all of this just to make sure the bank and its listing are disabled?\


- **Where, BankListing:** `models/bank-listing.ts:69`, `async build(record: BankRecord, gate: GateRecord, expected: BankSparse)`, and `:82`, `async delBank(ante: BankSparse)`, with `stampsOfBirth` and `recordOfBirth`.
- **Where, GateListing:** the three gate verbs with their try forms and `#gateMoveOf`, about 60 lines.
- **Where, both stubs:** `doTryList` and `doTryGet` are `tryEnsureBank` reshaped (`... as const`). Put, del and tombstone throw `writtenByOwnVerbs()`. `isOwnRow` duck-types rows by which keys they have.
- **Where, Device and Bank:** `models/device.ts:191`, `#bankListingInHand(): BankListing`, makes a new BankListing once the Bank listed there is disabled. `bank.ts:348`, `override get isEnabled(): boolean { return super.isEnabled && this.#isLiveOfLife }`, is the only Storable whose enabled flag checks its own life.
- **What happens:** Listing delivers a newer record of another life into the same instance (R6). Bank wants one object per life. So a Bank that receives a tombstone, or a parent row of a rebuilt bank, stays listed but disables itself, and the Device discards the whole listing.
- **Origin:** the stubs are drawn ("Nothing in the design contemplates extending either"); ground rule 8 says real work in a stub is worth a line. The verbs living in the stubs, and the listing rebuilt per life, are new. "Bank's remake left as it is" is ruled.
- **Cost:** three inputs to a Bank's `isEnabled`; four places reshape the same `ensureBank` answer (`BankListing`, `GateListing`, `VaultListing.#listingOfEnsured`, `Device.#fetchBank`); the gate can only be refreshed through `ensureBank`, which is E1.
- **Flavour:** redesign? Your fallback (`Listable` for Vault and Box; Bank and Gate plain Storables, or not Storables at all) removes the reshaping, the throwing stubs, `#bankListingInHand` and the `isEnabled` override.
- **Settle:** do build and delete belong on Device or Bank rather than a listing? Each stub overrides about 15 of Listing's members, about 6 of them throws or no-ops.

#### E4. `bank.lock()` is two methods behind one name, picked by `isEnabled`

- **Where:** `models/bank.ts:196`, `if (this.isEnabled) { void this.#revokeLease('lock'); return this }`; otherwise it evicts the keys, ends the watch with `#vaultListing.goodbye()`, and aligns. `Device.#disable` (`device.ts:218`) must set `#endCause` before calling it, so that it takes the discard branch.
- **Behaviour:** a host's `lock()` forgets the cached row and keeps the watches; during a sweep or vacate it keeps the row and ends the watches; a tombstone bypasses it and calls `#revokeLease('tombstone')`.
- **Probe P4:** lease rows went from 1 to 0, and `device.bank` stayed the same object.
- **Origin:** new in shape. "`bank.lock()` is the one lock" is ruled today.
- **Cost:** two paths; the discard path is right only because of an ordering rule, stated in a comment at `device.ts:216`.
- **Flavour:** can't tell.
- **Settle:** should a host's `lock()` ever end watches? If not, the discard becomes a private step.

#### E5. Because a Vault stands through its lives, its box watch ends at each new life, and React re-begins it from a module-level registry

- **Where:** `models/vault.ts:190`, in `adopt`, `if (isOtherLife) { this.#letBoxesGo() }`. React: `safebyok-react/src/hooks/hooks.ts:44`, `const watchedLives = new WeakMap<Vault, string>()`, drives `vault.tryBeginWatch()` whenever `vault_tok` changes.
- **What happens:** a vault deleted and put again keeps its object but silently stops watching its boxes; no host hears of it.
- **Origin:** R6 is drawn. The lost watch, and the registry (replacing the provider-held `helloedVaults`), are new.
- **Cost:** every host must detect a new life itself; the registry is global to the module, not per provider.
- **Flavour:** guidance gap: the design says the box listing is made again, not whether its watch survives.
- **Settle:** should a Vault that was watching re-begin its own watch at a new life?

#### E6. A snapshot comparison decides whether the bank aligns

- **Where:** `models/bank.ts:120`, `this.#vaultListing.subscribe(() => { if (this.snapshot.isLocked === this.isLocked) { this.align() } })`.
- **What it buys:** one tell per lock (#667).
- **Origin:** new.
- **Cost:** a reader must know `#alignAll`'s order (vaults first, the bank last, `bank.ts:244`) to see why this is safe.
- **Flavour:** solution off, mildly.
- **Settle:** a test showing the double tell without it; otherwise it reads as defensive.

#### E7. The bank's watch starts inside `device.ensureBank()`; there is no `bank.beginWatch()`, and no way to restart it

- **Where:** `models/device.ts:168`, `await bank.vaultListing.hello()`, inside `#bringUp`. design.md draws `bank.beginWatch()` and uses it in *What a host writes*. `ensureBank` returns early once `this.bank !== null` (`device.ts:147`).
- **What happens:** if the watch dies (a LISTEN dropped, say), nothing begins it again short of sweeping and making a new Device.
- **Origin:** new; diverges from the draft.
- **Flavour:** the draft is wrong given the code, or the code falls short of the draft: can't tell.
- **Settle:** is a dead watch something a host recovers from? Correct design.md either way.

#### E8. Two `ensureBank()` calls at once with no bank stored: the second refuses, though the comment says they share

- **Where:** `device.ts:158`, `// Two calls under way share the one bank, its listing's, and each brings it up.`
- **Probe P5:** the first call builds; the second rejects `already_asking`, and a refused `helloed` is announced. **P6:** with a bank stored, both calls get the same Bank.
- **Origin:** a new comment over an old race shape.
- **Cost:** one race, which the ground rules say to report.
- **Flavour:** solution off, in the comment only.
- **Settle:** correct the comment, or record the race under Open matters.

#### E9. Refusals that name the wrong thing

- **Where:** `gate-listing.ts:134`, `protected nothingStoredError(): VaultError { return mainGateMissing(this.bank.sparse) }`, which is the bankDB's `damaged_row` (`throwers.ts:305`). `bank-listing.ts:114` and `:122` return `actRefused('vault', 'bank_void')` for nothing stored and for a damaged row alike. `actRefused` takes `rowkind: 'box' | 'vault'`, and every bank and gate refusal passes `'vault'`, in `adapter-bank-db.ts` too.
- **Test:** `bank-gate-listings.test.ts`, "refuses a gate demanded of a bank the bankDB no longer has", expects the damage message.
- **Origin:** new.
- **Cost:** a host or reviewer matching on `refusalkind` is told "damaged" when nothing is damaged.
- **Flavour:** solution off.
- **Settle:** one refusal for "no live bank", and a bank row kind for `actRefused`.

#### E10. "One plain function per verb" holds in the models but not in the adapter base

- **Where:** in `gate-listing.ts`, three near-identical 9-line `try*` methods plus `#gateMoveOf(ante: GateRecord, move: (wayins: Wayins) => Wayins)`, which takes a lambda; `adapter-bank-db.ts:172`, `async #tryPutGate(gateVerb: GateVerb, ask: GateVerbAsk)`; each adapter's single `doPutGate`, branching on `ask.gateVerb`.
- **Origin:** the classifier's per-verb table is carried; `#tryPutGate`, `doPutGate` and `#gateMoveOf` are new.
- **Cost:** small.
- **Flavour:** guidance gap: does the debug test bind adapter internals?
- **Settle:** one sentence in the guidance.

#### E11. Evidence for the watched `life_tok`

- **Where:** `storage/bank-classifier.ts:76`, `return box_tok ?? gate_tok ?? vault_tok ?? bank_tok` (base: `box_tok ?? vault_tok`); the joined strings from `lifeTokPathOf`: Gate's `${bank_tok}/${gate_tok}` (`gate.ts:164`) and `BX.vaultLifeOf`.
- **Origin:** new.
- **Cost:** correct only because each row carries the toks of the rows above it and no others; a new kind of row must slot into the precedence.
- **Flavour:** evidence, not a fault. It argues for `life_tok`; the comparisons of the row-above tok argue against it, as the draft predicted.
- **Settle:** your end-of-sprint decision.

#### E12. Things that exist twice

- `stopNoWatch`, identical in `bank-listing.ts:155` and `gate-listing.ts:171`, and as `noUnwatching` in `adapter-bank-db.ts`.
- `Bank.demandPromptable()` and `demandAttachable()` have identical bodies (`bank.ts:374`, `:377`).
- The four reshapes of `ensureBank` (E3).
- New; trivial; settled by merging, or by naming the difference.

#### E13. Tests that assert less than their titles

- `tests/models/bank-ending.test.ts:26`, "...which forgets its lease, leaving a younger one": no younger lease exists or is checked.
- `tests/models/bank-gate-listings.test.ts:22`, "...calling no bankDB verb": it spies only `tryDelBank`, not the put path.
- New; settled by fixing the titles or adding the assertions.

#### E14. Weight in Convex's tidyGone

- **Where:** `safebyok-convex/src/component/banks.ts:363`, `function endedBoxQueries(...)`, building 2N+1 index ranges by vaultlabel, plus 4 per live life. The budgeted cascade beside it (`deleteBank`, `:335`) is ruled (#670).
- **Origin:** new.
- **Cost:** about 25 lines of hand-checked range arithmetic, for housekeeping.
- **Flavour:** can't tell; Convex's read limits may force it.
- **Settle:** a convex-reviewer pass.

### 2. Undergrowth

**Control primitives.** The core models add no timer, abort controller, retry, queue or lock (the added lines were searched).

| Primitive | Where (snippet) | Origin | Note |
| --- | --- | --- | --- |
| promise in a field | `device.ts:61` `#vacating: Promise<void> \| null` | carried |  |
| flag gating a path | `device.ts:63` `#isReady = false` | carried |  |
| nullable until bring-up | `device.ts:56` `#deviceTok: string \| null = null` | new, drawn |  |
| field rebuilt per life | `device.ts:54` `#bankListing` | new | E3 |
| field rebuilt per life | `vault.ts:34` `#boxListing` | new, R6 | E5 |
| memo keyed by identity | `gate.ts:67` `if (this.#inHand?.received !== wayins)` | new | small |
| memo | `bank.ts:260` `this.#leaseFriend ??=` | carried |  |
| state comparison gating a path | `bank.ts:120` | new | E6 |
| join map | `listing.ts` `#joinedGetOf` | carried |  |
| gating flags | `gating.ts` `#isAttempting`, `#isLastAttempt`, `#concluded` | carried |  |
| module-level registry | React `watchedLives` WeakMap | new | E5 |
| budget counter | Convex `tallies.ts` `Budget`, `spend` | new | ruled |
| BroadcastChannel watch | IndexedDB `#ring` | carried |  |
| reading the row above without a lock | Postgres `bank-functions.ts` header ("This is on purpose") | new | ruled; a lock declined |

**New mechanisms the design does not contemplate.** Verbs in the stub listings (E3). `demandOfWorld`: a new abstract hook on Listing, overridden four times, a no-op in BankListing (`bank-listing.ts:104`); it replaces `vaultTokOfWorld` and `isOneLifePerInstance`, and revives the retired word `world`. `receiveParent` on Bank, Vault and the Listing abstract: plain. `deliverEnsured` and `#listingOfEnsured` (`vault-listing.ts:71`): drawn, but extra reshaping. `writtenByOwnVerbs`. Convex `endedBoxQueries`. The rest (Device, BankListing, GateListing, the bank-classifier, the AdapterBankDB, the memory adapter, the adapters' `bank-*` files) is drawn by the design.

**Non-standard JavaScript.** Function values passed for later calling: `static readonly #unlockBankByProving` (`bank.ts:253`, carried, G9) and the `ActOnBank` table (carried). A lambda per verb into `#gateMoveOf` (`gate-listing.ts:62`, `:78`, `:94`): new. `#tryPutGate(gateVerb, ask)`: new. Answers spread-and-overridden with `as const` in the stubs' `doTryList`: new (E3). `#makeLeaseFriend`'s bag of six closures: carried in shape. `stored.gate!` non-null assertions in `adapter-bank-db.ts`. Little of this reads like code golf; the heaviest is E3's reshaping.

### 3. New names outside the draft

**262** names are absent from base src and from design.md, rulings.md and progress; another **96** are mechanical renames, counted only. Some locals and string literals are included. Names drawn by the progress notes (`receiveParent`, `writtenByOwnVerbs`, `rowOfOtherWorld`, `mainGateMissing`, `alignLock`) are excluded. Large volume, so names only.

- **safebyok/helpers/consts.ts**: PackageVersion, DeviceRowDBVersion, gate\_listing
- **safebyok/helpers/phrases.ts**: DeviceTokShape, DeviceExpected, ProvingOfOtherGate, LeaseOfOtherGate, DeviceLetGo, GatesShape, ExpectedOfOtherVaultLife, BankTokNotNew, GateOfOtherBank, GateNotBorn
- **safebyok/models/bank-listing.ts**: stampsOfBirth, demandOfWorld, #doTryEnsure, stopNoWatch
- **safebyok/models/bank.ts**: #deviceTok, tryDelPrompt, expiring, #alignAll, #leaseFriendOf, #makeLeaseFriend, #isLiveOfLife
- **safebyok/models/box-listing.ts**: #queryOf
- **safebyok/models/box.ts**: #doUnexpose, alignLock
- **safebyok/models/device.ts**: #vaultRefreshMillis, Device.make, #makeBankListing, #bankListingInHand, #forgetOwnDevice, Device.onBadNews, Device.onLifecycle
- **safebyok/models/gate.ts**: recordOfBirthArgs, #inHand, #wayinsInHand, WayinsInHand
- **safebyok/models/gating.ts**: timelyGate
- **safebyok/models/lease.ts**: expiresAt, tryExpiresAt, expiryOf
- **safebyok/models/listing.ts**: isListed, #takeDown, deliverNotice
- **safebyok/models/proving.ts**: checkedBank, checkedGate
- **safebyok/models/vault-listing.ts**: deliverEnsured
- **safebyok/models/vault.ts**: #letBoxesGo, #stampsOf, tryBeginWatch, demandWatchable, isOtherLife
- **safebyok/refusals/throwers.ts**: deviceDisabled, bankGateIssue
- **safebyok/shapes/shapes-bank-answers.ts**: gateActs, bankEnsured, noticedAbove, ensureBankAnswer, buildBankAnswer
- **safebyok/shapes/shapes-bankdb.ts**: GateFormat, BankTop, emptyBag, storedGateRow, noticeParentOf, isGateOfBank, isGateBorn, bankEnsure, BankEnsureAsk, bankBuild, gatePut, gateExpected, vaultCited, BankBuildAsk, GatePutAsk, GateVerbAsk, noticedRow, noticedParent
- **safebyok/shapes/shapes-enums.ts**: parentBankActVals, ParentBankAct
- **safebyok/shapes/shapes-gateish.ts**: citedGate, CitedGate
- **safebyok/shapes/shapes-storage.ts**: package\_version
- **safebyok/shapes/shapes-vaultish.ts**: storableBase, BankListingOpts, bankListingOpts, listedUnder, bankArgs, deviceOpts, DeviceOpts, DeviceEvent, DeviceStage, DeviceSnapshot
- **safebyok/storage/adapter-bank-db.ts**: BankBuildStored, ListBoxesAnswer, #tryPutGate
- **safebyok/storage/bank-classifier.ts**: PutAsk, gateRowOf, gateRaw, mainGateOf, parentBankActOf, BuildPolicies, GatePolicies, BankEnsureFetched, GateFetched, BankEnsureStored, GateStored, BankDelStored, parentAct
- **safebyok/storage/bank-db.ts**: BankEnsured, EnsureBankAnswer, GateAnswer, DelBankAnswer, TidyGoneAnswer
- **safebyok/storage/device-db.ts**: tryEnsureCachedDevice, tryForgetDevice, tryListRawDevices, doEnsureCachedDevice, doForgetDevice, doListDevices
- **safebyok/storage/idb-device-db.ts**: DeviceRowScopepath, deviceRowScopepathOf, deviceRowShelfOf, #deviceRowShelf
- **safebyok/storage/idb-shelf.ts**: dbprefixOfArgs, dbprefixOf
- **safebyok/storage/memory-bank-db.ts**: gaterows, \_cheat\_shelfOf, boxLife, #boxRowsOf, #writeGateRow, liveBank
- **safebyok/storage/memory-device-db.ts**: deviceRowCkeyOf, #devicerows, \_cheat\_deviceRows
- **convex/component/banks.ts**: gateDoc, roomless, budget, damagedlabels, endedVaultDocs, endedBoxQueryList, liveCkeys, endedTallyDocs, gateDocs, askFor, storedOrNull, isWrite, deleteBank, deleteWithin, endedBoxQueries, sparedlabels, begs, byCodeUnits, aa, bb, ckeyOfLife, liveBankTokOf, getGateDoc, writeGateDoc, listGateDocsQuery, listGateDocs, listVaultDocsQuery, listBoxDocsQuery, listTallyDocsQuery, GateDoc
- **convex/component/tallies.ts**: Budget, cascadeBudget, isSpent, countBoxes
- **convex/component/validators.ts**: askArgs, rowOfGate, bankEnsureFetched, vaultFetched, gateWritten, bankWritten, vaultWritten, boxWritten, boxPutWritten
- **convex/convex-bank-db.ts**: storedAsWritten, seenGates, isBankwide, gatesHeard, heardOf, SafebyokBankFnnames, isSafebyokBankApi
- **convex/phrases.ts**: api.safebyokBank, SafebyokBankComponentAdvice, SafebyokBankApiAdvice, StoredOutOfStep
- **convex/server.ts**: SafebyokBankComponent, SafebyokBankComponent.api, SafebyokBankApi, scopeUser
- **graphql/bank-operations.ts**: bankFields, vaultFields, gateAnswer, SafebyokGateAnswerFields, askedFragments, gateFragments, gateAnswerFragments, SafebyokEnsureBank, safebyokEnsureBank, SafebyokBuildBank, SafebyokBankBuildAskInput, safebyokBuildBank, SafebyokGateVerbAskInput
- **graphql/bank-schema.ts**: gateFields, SafebyokWayins, SafebyokBankGates, SafebyokBankEnsured, SafebyokEnsureBankAnswer, SafebyokBuildBankAnswer, SafebyokGateAnswer, SafebyokDelBankAnswer, SafebyokWayinsInput, SafebyokBankRowInput, SafebyokGateRecordInput, SafebyokVaultRowInput, SafebyokGateExpectedInput
- **graphql/graphql-bank-db.ts**: network-only, \_gateVerb, wayinsOf, \_passkey0, ensuredOf, ensuredAnswerOf
- **indexeddb/bank-shelf.ts**: dbprefix, GateScopepath, gateScopepathOf, gatesRangeOf, boxesRangeOf
- **postgres/bank-queries.ts**: EnsureBankSql, GetGateWithBankSql, PutGateSql, safebyok\_put\_gate, GetVaultWithBankSql, DeleteEndedVaultsSql, DeleteEndedBoxesSql, CountBoxesSql
- **postgres/postgres-bank-db.ts**: Verdict, GateAnswered, parentVaultRow, #firstRow, #fetchGate
- **react/components/bank-controls.tsx**: bank-lock-control, create-vault-button
- **react/hooks/hooks.ts**: useDeviceSnapshotFor, BanklessLifecycle, AbsentLifecycle, watchedLives, vaultTok
- **react/modals/del-vault-modal.tsx**: onDone, cancelTakesFocus
- **react/modals/modal-kit.tsx**: ModalDialog
- **react/provider/bank-provider.tsx**: useProviderDevice, setDevice, lastDevice, madekey
- **react/shapes.ts**: ProviderDeviceOpts, CreateVaultButtonProps

**Stale names that could mislead.** `world` survives in two names new this sprint, `demandOfWorld` and `rowOfOtherWorld`, and in carried ones: `ensureTimelyWorld`, `maxWorldMillis` (16 uses) and `ProvingWorld`, which now wraps the Device. `Device.ensureBank` announces `{ kind: 'helloed', ..., vault: null }` (`device.ts:151`): a vault field on a device event.

## Closer Look 2

## Closer Look 2: bank\_world at 089907992

A cold read by one opus agent, scoped past the first Closer Look (which read at 43f699a1e). It read the whole diff `43f699a1e..089907992 -- packages`: the two doc-block passes (checked mechanically to change no code beyond reformatting two type literals), and threads 18 and 19 in full, code and tests. Also: `listing.ts`, `storable.ts`, `bank.ts`, `device.ts`, `vault.ts` and the verbs of the box and vault listings; safebyok-react's `hooks.ts`, `bank-provider.tsx`, `boundary.tsx`, `gating-modal.tsx`; GraphQL's `graphql-bank-db.ts` whole, `bank-resolvers.ts`, and the header of `bank-schema.ts`; every test diff since the first look, spot reads of four test files, and an assertion-count sweep over every `packages/*/tests` file; the contract notes searched for old shapes. It did not read notes/security.md, thread files, PR text, this doc, or in depth the Convex, IndexedDB and Postgres adapters, React's modals and components, the classifier, or the bankDB batteries. Out of scope: 17 and 17r (building or filed after this SHA), #680. It was told not to re-report the first look's items or the rulings since; section 4 says what changed in those. Flavours: **guidance gap**, **guidance wrong**, **solution off**, **redesign?**, or **can't tell**. Reply by typing beside an item; nothing is scheduled until triage.

**In short.** Threads 18 and 19 shrank the model: core `src/` went +167/−204, and gone are `alignLock` ×3, `#letBoxesGo`, `#alignAll`, `Vault.adopt`, `subscribeOwn`, five copies of `demandEnabled`, `BankListing.delBank`, and the Bank's two listing subscriptions. One `align()` walks the tree. Weight moved into the Device, which can no longer see a bank of another life through a label-only snapshot and so is poked from `Bank.adopt`, before the align, breaking the order the align promises (1.1, probed); and into React, where each vault hook composes three stores (1.6). Two concrete gaps: ending watches now lives only in `Listing.align`, untested (works when probed, 1.2); and the "never throws" claims on `align`, `lock` and `sweep` fail when a bankDB's unwatch throws, leaving stale snapshots (probed, 1.3).

### 1. Eyebrows, ranked

#### 1.1 The device is told of a bank's end before the bank and its boxes align

- **Where:** `device.ts:302-307`, `dismissGatingAtDiscard(bank: Bank): void { ... this.#remakeSnapshot() }`, called from `bank.ts:390-395` (`void this.#revokeLease('tombstone')` / `this.device.dismissGatingAtDiscard(this)`).
- **What it does:** `Storable.receiveRecord` (`storable.ts:193-197`) runs `adopt` then `align`, and says "The listings below first, this thing's snapshot last: a listener hears of a change once everything below shows it." A bank listing's snapshot is now labels, so it does not change when a bank of another life replaces the listed one; thread 19 therefore added a device remake inside a method named for dismissing a gating, and that method runs inside `adopt`, before `align`.
- **Probe:** an unlocked bank with an exposed box, then a bank of another life delivered. The device listener ran first and saw `bank.isLocked: true` but `bank.snapshot.isLocked: false`, and `box.isShowing: false` but `box.getSnapshot().isExposed: true`; the box and bank listeners ran after it. A tombstone shows the same order. No whisper leaks (the getters already refuse); only the snapshots are out of order.
- **Origin:** new since the first look (thread 19). Before 19 the device remade only from the bank listing's listener, after `receiveRecord`.
- **Cost:** four triggers now remake the device snapshot for a bank change (the listing listener, `dismissGatingAtDiscard`, `ensureBank`, `#disable`), one of them out of order; the method's name and doc block ("Dismiss the open gating if it is for `bank`") no longer say what it does.
- **Flavour:** redesign? (small): the poke exists only because a label snapshot cannot express a life change.
- **Settle:** the Device subscribes to its bank's own snapshot, with liveness on it, or the remake moves after the align; either way, a test that reads the snapshots inside a device listener.

#### 1.2 Ending watches now lives only in `Listing.align`, and nothing tests it

- **Where:** `listing.ts:135-142`, `if (! this.isEnabled) { this.goodbye() }`, reached through `children` (`vault.ts:186-188`, `this.#boxListing === null ? [] : [this.#boxListing]`; `bank.ts:398`).
- **What it does:** thread 18 removed every explicit `goodbye()`, from `Bank.lock`, `Bank.adopt` and `#letBoxesGo`.
- **Probe:** live watches went 2 → 1 after `vault.del` → 1 after `bank.lock()` → 0 after `device.sweep()`. Correct.
- **Tests:** in `packages/safebyok/tests` only `listing.test.ts` asserts an unwatch, and only for a direct `goodbye()`. The new `vault-boxes.test.ts:122-146` ("the boxes of a vault deleted") checks the whispers dropped, not the watch. `notes/design-models.md:119` states the guarantee.
- **Origin:** new since the first look (thread 18).
- **Cost:** three events (a disabled lock, a tombstone or another life, a sweep or vacate) depend on one `if` inside a traversal.
- **Flavour:** guidance gap: the guarantee moved and its test did not follow.
- **Settle:** a test counting live `bankDB.watch` handles across those three events.

#### 1.3 `align`, `lock` and `sweep` promise never to throw, but leave stale state when an unwatch throws

- **Where:** "Never throws." at `listing.ts:136-137`, `storable.ts:227-228` and `device.ts:215` (`sweep`); `goodbye()` (`listing.ts:130-133`) calls `this.#unwatch?.()` unguarded, mid-traversal.
- **Probe:** a `bankDB.watch` whose unwatch throws, then `device.sweep()`. `sweep` threw "unwatch failed"; the device was disabled but `device.snapshot.stage` was still `'ready'`, `bank.snapshot.isLocked` false, `box.getSnapshot().isExposed` true, and the open-gating dismiss never ran: a liminal state, against "slam shut first".
- **Origin:** the path is carried (before 18, `Bank.lock` called `#vaultListing.goodbye()` before `#alignAll()`, with the same exposure); the "Never throws" doc blocks are new since the first look.
- **Cost:** every lifecycle path runs through an adapter callback that can leave the snapshots half-aligned.
- **Flavour:** guidance gap. *The host is not our threat model* rules on validating parameters, not on callback failures.
- **Settle:** a ruling on whether the `BankDB.watch` contract forbids a throwing unwatch. If it does, say so in `bank-db.ts`; if not, report the failure and carry on, as listener failures already are through `reportToPlatform`.

#### 1.4 `bank.lock()`'s doc block says vault snapshots show the lock, but they have no lock field

- **Where:** `bank.ts:192-195`, "The snapshots of the bank, its vaults and their boxes show the lock before this returns."
- **What the code does:** `VaultSnapshot` and `Vault.makeSnapshot` (`vault.ts:196-206`) have no `isLocked`; the README (`:183-184`) says a vault's snapshot has no lock of its own; `proof.test.ts` asserts the vault component is not told at a lock.
- **Origin:** new since the first look (the core doc-block pass, `977697386`).
- **Flavour:** solution off.
- **Settle:** drop "its vaults".

#### 1.5 `vault.boxListing` is a getter that makes a listing, even for a deleted vault, and that listing will open a watch

- **Where:** `vault.ts:53-56`, `if (this.#boxListing?.vault_tok !== this.vault_tok) { this.#boxListing = this.listing.boxListingOf(this) }`; `BoxListing.isEnabled` is `this.vault.isEnabled && (this.vault.vault_tok === this.vault_tok)`; React calls the getter in render and inside a `getSnapshot` (`hooks.ts:104-112`, `presentBox`).
- **What it does:** a tombstone carries a fresh `vault_tok`, and a tombstoned vault stays listed and enabled, so the getter makes an enabled listing for the tombstone's "life".
- **Probe:** after `vault.del(vault)`: the vault reported `present: false, vaultEnabled: true`, its listing `listingEnabled: true`; `listing.hello()` resolved and opened a `bankDB.watch`; `tryList()` refused `absent_vault`. `vault.beginWatch()` guards this with `demandWatchable`; the public `boxListing.hello()` does not.
- **Tests:** `vault-boxes.test.ts:132-133` asserts `vault.boxListing.vault_tok === vault.vault_tok` after the delete, pinning the tombstone-life listing as the intended shape.
- **Origin:** the getter form is new since the first look (thread 18); the behaviour after a delete is carried (`#letBoxesGo` nulled the field, then `??=` made the same listing).
- **Cost:** a getter with a side effect, called in render; a "life" that includes a tombstone; a watch opened on a dead scope.
- **Flavour:** guidance gap (is a tombstone a life for the listing below?), or solution off.
- **Settle:** whether `BoxListing.isEnabled` should require `vault.isPresent`.

#### 1.6 Weight moved from the Bank into the Device and React, not only out

- **Where:** `hooks.ts:63-83`. `useVaultFor` composes three stores (the device snapshot, the vault listing's labels, and the vault's own snapshot, used only for `vault_tok`, `hooks.ts:77`), with the `watchedLives` effect on top; `useBox` and `useBoxes` each call it, so a box component subscribes to four stores. `dev-box-inspector.tsx:38-47` builds a vault-label store by hand (`NoLabels`, `getNoLabels`, a raw `useSyncExternalStore`), since there is no `useVaults` beside `useBoxes`, and imports `subscribeToNothing`, newly exported from `hooks.ts`.
- **Origin:** new since the first look (thread 19). The React rework is ruled a TODO, so this is weight moved, not a defect.
- **Cost:** the core shrank by 37 lines; React grew by 12, and its vault lifecycle is now derived from three snapshots plus an effect.
- **Flavour:** can't tell. It argues for the rework's shape: a `useVaults`, and the vault's life on the listing or the hook.
- **Settle:** the rework's design.

#### 1.7 The bank's delete guard sits on the thing, and the listing verb is a second public door

- **Where:** `bank.ts:381` and `gate.ts:142`, `override del(): Promise<this> { return Promise.reject(writtenByOwnVerbs()) }`; `bank-listing.ts:115-124`, `doTryPut(): never { throw ... }` while `tombstoneOver` and `doTryDel` now work; `bank-gate.test.ts:488`, "the vault listing's own del deletes in a locked bank".
- **What it does:** `bank.listing.del(bank.sparse)` deletes a bank with no proving and no unlock. That second door is not new (`delBank` was public too). New in 18: the bank listing refuses put in the listing but del in the thing. `Gate.del` refuses twice, also in `GateListing.tombstoneOver`.
- **Origin:** new since the first look (thread 18), inside the rulings.
- **Cost:** three places to read to know whether a bank or a gate can be deleted.
- **Flavour:** can't tell; within the ruling, listed for the asymmetry.
- **Settle:** confirm that write policy lives on the thing; then drop either `GateListing`'s throwers or `Gate.del`.

#### 1.8 GraphQL: a third hand-kept copy of the row shapes, written as combinators

- **Where:** `graphql-bank-db.ts:370-419`: `type Drop`, `dropTypename(bag, nested: Record<string, Drop>)`, `answerDrop(valDrop): Drop`, and per-shape drop maps.
- **What it does:** urql's `cacheExchange` adds `__typename` to every selection and the core's shapes are `.strict()`, so each nested object gets a hand-listed strip. With the 518-line SDL and the zod shapes, that is a third description of every row's nesting. The SDL has a drift test (`bank-schema.test.ts`); the drops have two cases (`graphql-bank-db.test.ts:28,39`).
- **Origin:** new in the sprint, before the first look (the old `graphql-vault-db.ts` had none).
- **Cost:** a new nested row field means editing three places, one untested.
- **Flavour:** redesign? Crossing rows as the existing `SafebyokJson` scalar would dissolve both the typed row SDL and the drops, at the cost of the typed schema the file header defends for host logs and allowlists.
- **Settle:** your view on typed versus JSON rows on the wire; failing that, a drift test that runs the drops over every row shape.

#### 1.9 GraphQL server: hand-built async iterators over a ReadableStream

- **Where:** `bank-resolvers.ts:128-153` (an `AsyncIterableIterator` object), `endingWith` at `:261`, `openWatch` at `:272-286` (`highWaterMark: Infinity`, a `desiredSize` check).
- **What it does:** turns the callback watch into an iterator with a sign-in recheck at each notice; a comment justifies the reader.
- **Origin:** carried (`vault-resolvers.ts` at `e4844d4fd`).
- **Cost:** about 40 lines of iterator protocol; `@repeaterjs/repeater`, a graphql-yoga dependency, does exactly this.
- **Flavour:** solution off (library first), low.
- **Settle:** try Repeater in a scratch branch against `yoga-recipe.test.ts:140`.

#### 1.10 Contract notes describe the old shapes

- **Where and what:** `notes/deliver-contract.md:62` (L7): "Each change to the listing is followed by one new snapshot, and the listeners are told once." A thing's own change now tells the listing's listeners nothing (`listing.test.ts`, "is the same array through a thing's own change, telling no listener"). `notes/design-models.md` rows `:144` (vault snapshot `isLocked`), `:148` and `:317` (`vault.lock`), `:289` (`bank.#remakeSnapshot` with vaults); touched by `80dd685b7` but still describing a vault-level lock.
- **Origin:** carried prose; L7 wrong since 19.
- **Flavour:** solution off (prose).
- **Settle:** mark design-models.md historic, or correct it; correct L7.

#### 1.11 Listing tells listeners of damaged-row changes that its snapshot does not show

- **Where:** `listing.ts:390-394`, `if (isDamageNews) { this.tellListeners() }`, and `:443`, "Tell every listener of a change the snapshot does not show".
- **What it does:** a `useSyncExternalStore` consumer finds the same label array and does not re-render, so `damaged_rows` cannot be observed through the store contract.
- **Origin:** carried.
- **Flavour:** can't tell.
- **Settle:** whether `damaged_rows` belongs in a snapshot.

**Assertion sweep.** One test flagged, `yoga-recipe.test.ts:140`, a false positive (it asserts with `expect.poll`). Test titles changed since the first look match their assertions.

### 2. Undergrowth, new since 43f699a1e

**Control primitives: nothing new.** No queue, counter, timer, abort controller, retry, or promise stored in a field was added. Gone: the Bank's two listing subscriptions, the per-thing `subscribeOwn` closure each listing registered, `Vault.#letBoxesGo`'s null-and-goodbye. The one new flag-gated path is `Listing.align`'s `if (! this.isEnabled) { this.goodbye() }` (`listing.ts:140`), drawn by thread 18's ruling; its costs are 1.2 and 1.3.

**New mechanisms.**

- **The `children` tree:** `protected abstract get children(): readonly Alignable[]` (`storable.ts:339`); four overrides (Bank `[gateListing, vaultListing]`, Vault `[] | [boxListing]`, Box and Gate `[]`); `export type Alignable = Readonly<{ align: () => void }>` (`storable.ts:31`), re-exported from `index.ts`. Drawn by thread 18's ruling, though not by design.md. Exporting `Alignable` puts a protected protocol on the semver surface, consistent with the generous-exports rule.
- **The Device remake inside `dismissGatingAtDiscard`** (1.1): new; serves a workaround.
- **`labelOf` ×4**, each a one-line destructure (`bank-listing.ts`, `{ banklabel }) ... return banklabel`), following from the ruled label snapshots.

**Non-standard JavaScript.**

- **`Storable.alignChildren()`** (`storable.ts:236-238`, `for (const child of this.children) { child.align() }`): a protected one-line helper with one caller and no override; could be inlined.
- **A getter that constructs:** `Vault.boxListing` (1.5).
- **React:** `useBankFor(hookname)` joins the existing `*For` wrappers that exist only to name the hook in an error; `NoLabels`/`getNoLabels` duplicate the `getNothing` pattern; `subscribeToNothing` is exported from a module for one devmode caller.
- **Device dedupe:** `Device.#remakeSnapshot` still compares four fields by hand (`next.bank_tok === prior.bank_tok`), where `Storable` and `Listing` use `es-toolkit`'s `isEqual`. The style is carried; the field is new.

Little else here; the undergrowth shrank net.

### 3. New names since 43f699a1e, outside the draft

Extracted mechanically from the diff (added minus removed): 13 hits, of which three are reformatting artifacts (`listing`, `trouble`, `val`), two are locals (`vaultlabels`, `boxlabels`), and `del` is an override. **7 genuinely new names, none in design.md**, by references in `src`: `children` 12 (core), `labelOf` 11, `useBankFor` 4, `NoLabels` 4, `Alignable` 3, `alignChildren` 3, `getNoLabels` 3. Newly exported but existing: `subscribeToNothing` (17 references). `DeviceSnapshot.bank_tok` reuses an existing name.

### 4. Since the first look

Changed:

- **E3** smaller: `BankListing` lost `delBank` and `demandEnabled`, `GateListing` lost `demandEnabled`; `BankListing` now carries a working generic del (`bank-listing.ts:118-124`, `protected doTryDel(tombstone`). The Device still rebuilds the listing per life (ruled).
- **E4** smaller: `bank.lock()` still picks a branch by `isEnabled`, but both end in the one `this.align()` (`bank.ts:196-205`); `goodbye`/`#alignAll` are gone from it.
- **E5** moved: the old box listing is ended by align via `children` (`vault.ts:186-188`). The new life still gets no watch until `beginWatch`, and React learns `vault_tok` from a third store (`hooks.ts:77`). `watchedLives` stays.
- **E6** fixed: the Bank constructor no longer subscribes, and no snapshot comparison decides an align (`bank.ts:112-119`).
- **E12** smaller: five `demandEnabled`s became one base (`listing.ts:458`). `demandPromptable`/`demandAttachable` and `stopNoWatch` remain.
- **E13** half done: `bank-gate-listings.test.ts` now spies `tryBuildBank` for put and `tryDelBank` for the bank and gate del. `bank-ending.test.ts:26` still says "leaving a younger one" and asserts zero rows.
- **Undergrowth `Vault #boxListing`:** now replaced through a `vault_tok` comparison in the getter (`vault.ts:54`).

Unchanged: E1, E2, E7, E8 (`device.ts:161`, "Two calls under way share the one bank"), E9 (`bank-listing.ts`, `actRefused('vault', 'bank_void')`), E10, E11, E14.

*Probes:* the scratch test `zz-probe.test.ts` and its output are kept in the session's scratchpad (closerlook2/) until wrapup.
