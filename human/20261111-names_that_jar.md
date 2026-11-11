# Names that jar with their doc blocks (2026-11-11)

A report-only pass over every `src/` in the core and the adapters, by five Opus agents, read at the tip of the stack (#648). Nothing was renamed. About 110 findings: the themes first, since each is one ruling, then the surer single findings by area. "Public" means exported from a package entry point.

## Themes: one ruling each

| # | Theme | Where | Proposal |
|---|---|---|---|
| T1 | fix **"proof"**, which VOCABULARY.md does not use (the term is a proving) | `UnlockByProof` / `unlockByProof` (about 52 hits), `checkOpens(wrongProof)`, `Phrases.ProofMissing`, the `[Proofs]` banner | `UnlockByProving`, `checkUnwraps(wrongCleartext)` |
| T2 | fix **"open"** on a key or a whisper | `unopenedWhisper`, `Lease.#opened`, `Proving.checkOpens`, doc blocks of `damagedLease`, `Box.#unseal` | `undecipheredWhisper`, `#decipherSealed`, `checkUnwraps` |
| T3 | leave, we're moving towards it **"ask" as a noun**, banned in VOCABULARY.md's *Words safebyok does not use* | `BoxAsk`, `VaultAsk`, the six `*GetAsk`/`*PutAsk`/`*DelAsk`, `boxAsk`/`vaultAsk`, `isRecordAtAsk` (about 44 hits, public in `safebyok/storage`) | `BoxRequest`, `VaultRequest`, ... Every doc block already says "request". Needs your ruling, since #639 introduced the names. |
| T4 | capacity -> stats for the bag itself, room... leave for now, it's clear  **"room" for `Capacity`** | `MemoryVaultDB.#roomIn`, `IdbVaultDB.#roomIn`, `PostgresVaultDB.#roomAt`, Convex `roomlessOf` | `#capacityOf`, `#countCapacity`, `vaultFullOf` |
| T5 | write is OK when it means "put or del or other modification" and I think these are legit, check. Even if it's not *every* put and del, if it's most of them, write is OK  **`write` as a function name** (STYLE.md bans it) | `MemoryVaultDB.#writeVaultRow`/`#writeBoxRow`, `PostgresVaultDB.#writeVault`/`#writeBox`, Convex `writeVaultDoc`/`writeBoxDoc` | `#putVaultRow`, `#callVaultWriteFn`, `putVaultDoc` |
| T6 | tell/listeners for vaultDB, ring/listeners for DeviceDB. Indexeddb adapter can use ring too **A different metaphor for notices in each adapter** | core `#tell`/`#heeders`/`Heeder`; SQL `safebyok_tell`; Postgres `Told`/`toldOf`; IndexedDB `Rung`/`#ring`/`#bellname`; `isHeardIn` | notice, notify, broadcast. `hear`/`Heard` stay as `doWatch`'s interface. |
| T7 | you are right but I'll need to think of better names, leave these **"listed" has three meanings**: an enlisted instance (VOCABULARY), a list call's result, a row from a list call | `BankListed`, `BoxesListed`, `listedRowOf`, `listedKindOf`, `ListedLease`, `bankListed`, React's `Listing`/`useListing` | Rule which meaning "listed" keeps, then rename the rest. |
| T8 | if it's the pre-image of the answer (classifier's output) I would like it to be `stored`, not `classified` or `found`. If it's the result of a get request, `answer` or `getAnswer`. A type that is partt of an answer or stored that happens to contain `act`, it's not an act  **"found" where the row is fetched or got** | `foundVaultRow`, `foundBoxRow`, `foundActVals`/`FoundAct` beside `GotAct`; Convex `findVaultDoc`/`findBoxDoc`/`findTallyRow` do a unique-key lookup, which is a `get` | `storedVaultRowOrNull`; `getVaultDoc` |
| T9 | shell is probably best **void, sentinel and shell name one thing** | `sentinelVaultOf`, `sentinelBoxOf` (public), `BoxListing.#shellFor` | `voidVaultOf`, `voidBoxOf`, `#enlistVoidBox` |
| T10 | we don't really handle damaged boxes any more. change  to gone and report which accept damaged. leave isGoneOrDamaged alone. Rename unliveAmVals to goneOrDamagedAmVals  **"tombstone" means "damaged or gone" in places** | `VX.isTombstone`, `Tombstone<>`, `tombstoneAmVals` include `am: 'd'`; `SX.isTombstoneRow` and VOCABULARY mean gone only | `isGoneOrDamaged`, `unliveAmVals` |
| T11 | add to TODO **A `fooOf` or `fooOver` that mints, constructs or mutates** | `refusalOf` (mutates the thrown error's `meta`), `versionedShelfOf` (opens and caches: an ensure), `nextRevisionOf`/`boxTombstoneOf` (mint ids), `sealedRecordOf` (does crypto), `boxListingOf` (calls `new`), `stampOfBirth`, `tombstoneOver`, `passphraseKeyOf`, GraphQL `answerOf` (sends a request), `_cheat_vaultRowsOf` (creates maps) | `ensureVersionedShelf`, `makeNextRevision`, `sealRecord`, `makeBoxListing`, `mintBirthStamp`, `makeDelTombstone`, `derivePassphraseKey` |
| T12 | as given: **The `-Error` suffix on throwers**, which breaks throwers.ts's own header rule | `lockedError` -> `needUnlocked`, `absentBoxError` -> `absentBox`, `notListedBoxError` -> `boxNotListed` (is this not `absentBox`?), `deletedVaultError` -> deletedVault, etc, and five more | `vaultLocked`, `boxAbsent`, ... matching their phrases |
| T13 | change  to `SizeEst` when it's the record size estimate, size when it's exact  **`*Bytes` means a count and a `Uint8Array`** | counts: `maxRecordBytes`, `PassphraseSaltBytes`, stored `salt_bytes`, `jsonBytes`; arrays: `keyBytes`, `boxKeyBytes` | A ruling, not a sweep: `maxRecordBytes` and `salt_bytes` are host-facing and stored. |
| T14 | I will reform these **STYLE.md's `Stored-` rule versus the code** | `RowOfVault`, `RowOfBox`, `RawLease` (public) | Either rename to `StoredVault`, `StoredBox`, `StoredLease`, or drop the rule. #647 lists the rule as stale. |
| T15 | fix **A lookup table named like a function** (STYLE.md: `FooForBar`) | `KindOfBoxAct`, `KindOfVaultAct`, `GateActOf`, `ModelkindClasses` (public) | `RefusalkindForBoxAct`, `GateActOfForVerb`, `ClassForModelkind` |
| T16 | I have not even enough idea what crossed means to suggest an alternative **"crossing" beside the core's "crossed"** | GraphQL `CrossingAnswer`, `CrossingNotice`, `crossingOf`; Convex `crossing`, `crossingOf` | `Crossed-` throughout |
| T17 | fix **Run-and-convert wrappers named as gerunds or participles** | Convex `reaching`, `crossing`; GraphQL `served`, `#asked`, `#told` | `#runQuery`, `#runMutation`, `serveSignedIn` |

## The surer single findings

### Most worth a look

| Where | Name | Proposed | Why |
|---|---|---|---|
| remove static isFUBag  models/storable.ts `static isFUBag` (public as `Box.isFUBag`) | `isFUBag` | delete, or `isWhisperedBag` | Duplicates the exported `isWhisperedBag`. |
| fix models/gating.ts `async checkStrength` (public on `Gating`) | `checkStrength` | `judgeStrength` | A `checkFoo` refuses and returns nothing. This returns a verdict and never refuses. |
| fix safebyok-react helpers/passkey.ts `bytesOf`, `answerOf`, `attemptOnce` (`attemptOnce` is public) | the three | `copyThenZero`, `makePasskeyAnswer`, `attemptThenZero` | Each zeroes its input, and no name says so. That is the thing a security reviewer needs to see at the call site. |
| fix helpers/validator.ts `verifyConsistent`, `consistent` | both | `checkedConsistent`, `isConsistent` | `verify` is not in the verbs table, and a yes/no is `isFoo`. |
| I'll handle storage/classifier.ts `function vaultRowAt`, `boxRowAt` | both | `parseStoredVault`, `parseStoredBox` | No lookup: each parses a raw row, throws, and sorts it into void, gone or live. This is your `classifyStoredRow` case. |

TODO these:

| Where | Name | Proposed | Why |
|---|---|---|---|
| refusals/throwers.ts `export const sanitizeForeignError` (public, `safebyok/storage`) | `sanitizeForeignError` | `causeOf` | It returns an Error untouched and removes nothing, yet a security reviewer reads "sanitize". |
| refusals/errors.ts `export const isCondition` | `isCondition` | `isShowable`, or narrow the body | The body is `family !== 'misuse'`, so `bad_news` passes too. Only tests call it. |
| shapes/shapes-vaultish.ts `export interface VacateStory` (public) | `VacateStory` | `VacateOpts` | A story is `{ where, advice }`. This is `{ cause }`. |
| shapes/shapes-vaultish.ts `RevokeSite` value `'undeleted'` (public) | `'undeleted'` | `'unlock'` | The doc block describes an unlock meeting a stale row. |

### Core models

| Where | Name | Proposed | Why |
|---|---|---|---|
| we're attacking  this next but make it deliver listing.ts `async #takeListed` | `#takeListed` | `#deliverListing` | "take" is on the avoid list. It is the list counterpart of `deliver`. |
| makeThing listing.ts `#makeThingOf` | `#makeThingOf` | `#makeVoidThing` | A `make...Of` blend. |
| leave, it's junk listing.ts `fateOver(_held` | param `_held` | `_listed` | The doc says listed. (The `fateOver` name itself: maybe.) |
| exposedWhisper (is it the one .whisper references?) box.ts `#keptWhisper` | `#keptWhisper` | `#unsealStored` | "kept" is vacuous, and the name hides that it unseals. |
| editAndSeal box.ts `async #edit` | `#edit` | `#sealNext` | The doc names the seal. |
| #disable bank.ts `#letGo(cause` | `#letGo` | `#disable` | The doc says disabled. Storable and Listing call the same step `#disable`. |
| I'm not sure either, it's different somehow, leave it lease.ts `evict()` | `evict` | `sweep`, maybe | VOCABULARY.md lists evict as imprecise, but defines `lease.evict()` by name. Needs your ruling. |
| `isGranted` lease.ts `get isPresent` | `isPresent` | `isInForce` | "present" means not tombstoned. The file's own phrase is "in force". |
| `vaultFriend` vault.ts `#makeFriend`, `#friend` | both | `#makeLeaseFriend`, `#leaseFriend` | Beside `#bankFriend`, a bare "friend" is ambiguous. |

### Core shapes, refusals, storage and helpers

| Where | Name | Proposed | Why |
|---|---|---|---|
| leave for now dom/box-fields.ts `#readFields` | `#readFields` | `#patchEditedFields` | It calls `box.patchWhisper`. `read` is banned as a name. |
| what does shelf mean? fix name and merge if truly duplicative storage/idb-device-db.ts `deviceShelfOf`, `bankShelfOf` | both | `ensureLeaseShelf`, `ensureBankShelf` | They open and cache. The field holding the result is `#leaseShelf`, so one shelf has two names. |
| we have bound, sealed, stamped -- stamp is the field set. if it's testing specifically  for membership in that, use isStampPart, otherwise isBoundPart or something not notably negated helpers/crypto.ts `isUnbound` | `isUnbound` | `isBoundPart`, inverted | Only ever read as `! isUnbound(...)`: a double negative. |
| refusal if it's precise refusals/outcome.ts `storageTroubleOf` | `storageTroubleOf` | `storageRefusalOf`, maybe | "trouble" is not a term. |
| parsed shapes `PutOptsGiven`, `BoxPatchGiven` | both | `...Parsed` | "Given" reads as what the caller passed, but the doc means after parsing. |
| make is better, agree deriver `argon2idDeriver` (public, `safebyok/browser`) | `argon2idDeriver` | `makeArgon2idDeriver`, maybe | The doc says "Make", and it sits beside the instance `argon2idWebV1Deriver`. |

The storage agent reported `liveVaultOf`'s doc block as stale because the code throws `vault_void`. That is wrong: `vault_void` is the act, and the refusal kind is `absent_vault`, which is what the doc block says.

### Adapters and React

| Where | Name | Proposed | Why |
|---|---|---|---|
| leave graphql-vault-db.ts `const reqParamsOf: Drop` and eight siblings | `*Of` | `*Drop` | Each strips `__typename`, and the local `reqParamsOf` shadows the core's `DB.reqParamsOf`, which the same file calls. |
| leave convex tallies.ts `forget`, `record`, `drop`, `refuses`, `kept` | all five | `addDelGrowth`, `addPutGrowth`, `delTally`, `isPastLimit`, `tallyDoc` | Off-vocabulary verbs, a boolean named as an act, and a vacuous "kept". |
| leave postgres-vault-db.ts `function mayReplace` | `mayReplace` | `isPutAllowed` | It is also true for `ifAbsent: 'add'`, which replaces nothing. |
| getUserId graphql vault-resolvers.ts `userIdOf` option (public) | `userIdOf` | `getUserId` | The host function may be async, and Convex's same option is already `getUserId`. |
| captures or contains; it might be right by the framework tho react modal-kit.tsx `holdsFocus` | `holdsFocus` | `containsFocus` | "hold" is on the avoid list. The body is `contains`. |
| reset would be better if not cache-y react modal-kit.tsx `forget` | `forget` | `resetVerdicts` | `forget` is the deviceDB's lease verb. |
| boundaryRefusalOf react provider/boundary.tsx `forBoundary` | `forBoundary` | `boundaryRefusalOf` | It converts the error and drops its cause. |
| fix react shapes.ts `providerProps` | `providerProps` | `bankProviderProps` | STYLE.md: a validator takes its type's name, here `BankProviderProps`. |
| fix, changedFieldnames react provider-hooks.ts `changedKeys` | `changedKeys` | `changedFieldnames` | A bare "key" means a cryptographic key here. |

## Next step

These are suited to `/turbochat`: a row per theme and per finding, so you can flip each one to a ruling in one sitting.
