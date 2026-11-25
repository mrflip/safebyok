# Thread 24: the inventories (2026-11-24)

For the thread that makes the remaining optional fields required, and for whoever gathers the record makers into one
place. Report only: thread 24 changed none of this. Lines are at thread 24's tip; paths under `packages/safebyok/src`
unless named. Test counts are `rg -l` counts; most asks and events in tests are built by the helpers in
`tests/test-helpers/vaultdb-world.ts`, which ships as `safebyok/testing` and runs in the idb-lean and postgres
batteries, so changing a helper covers most files at once.

## A. Optional fields left

Making each required, in the order of least cost. "null" means `T | null`, required.

* **`BankAskDraft.ifAbsent?`** (shapes-bankish.ts:28). Its one caller, `VaultMinder.getOnce` (vault-minder.ts:122), supplies `'nil'`. Type change only; 4 core test files call `makeGetAsk`/`makeListAsk`.
* **`PutOnceArgs.cited?` / `DelOnceArgs.cited?`** (shapes-vault-minder.ts:38, 41). No src caller leaves it out (`Vault.#sealedWriteOf`, gating.ts:263 supply it). Readers: vault-minder.ts:157, :172 `args.cited ?? this.#citableAt(args.record)`. Required, `#citableAt` (thread 24's R2) goes. Tests: vault-minder.test, vault-tsq.test.
* **Event `read_tc`** (shapes-vault-event.ts:86). Every producer sets it (adapter-vault-db.ts:75, the minder's dispatch, device.ts:386). Readers: vault-minder.ts:307 `notice.read_tc ?? readTcNow()`, vault-tsq.ts:226. Type, two readers, thing.test.
* **Event `sourcelabel`** (:84). Only adapter-vault-db.ts:75 sets `undefined`; the minder overwrites it (:330). Give the raw adapter a fixed label. No readers.
* **Event `agerank` / `agerankWas`** (:78, :80), **aged `agekindWas`** (:116). Producers: adapter-vault-db.ts:75 (`undefined` both, a raw watch keeps no ageranks), vault-minder.ts:330, device.ts:385, agerank.ts:89-91 (none before a first record). No reader tests them. null; or split a raw notice's type from `VaultEvent`, so a raw watch's event has no agerank fields at all.
* **Event `banktok`** (:82). Producers: adapter-vault-db.ts:74 (`world?.lifetok`), vault-minder.ts:53/:298 (`answer.banktok ?? undefined`), device.ts:376-379. The rung check (shapes-vault-minder.ts:56) reuses the loggable ask's optional banktok. Readers: vault-minder.ts:270, :307 (`?? this.#newestBanktok`, unchanged by null). null matches the answers' `banktok: Lifetok | null`.
* **Answer `tracked?`** (shapes-answers.ts:20, :30; adapter-vault-db.ts:26). Producers: adapter-vault-db.ts:35, :139, :190, :192; refused-answer.ts:12; vault-minder.ts:96. Reader: vault-minder.ts:370 `(tracked === undefined) ? [] : …`. null, as `ActualBeside` already has (shapes-answers.ts:107). Tests: 5 core files, react-lean `record-hooks.test.tsx` (175, 283).
* **Ask `track?` / `banktok?`** (drafts shapes-asks.ts:192, 196, 201, 206; checks :40, :42 `.optional()`). Left out by vault-minder.ts:233 (`#bankFields`: both only once `knownRoots` has all three roots), `birthPutsOf` (shapes-asks.ts:158), gating.ts:162 (banktok, no track), postgres `postgres-vault-db.ts:221`. Readers: shapes-asks.ts:248 (`optionalsGiven`), thing-classifier.ts:229 `if (track === undefined) { return null }`, postgres :67. Nothing reads `ask.banktok` past its check. null touches the drafts and checks, `optionalsGiven`, `birthPutsOf`, `#bankFields`/`knownRoots`, gating.ts:162, the classifier :229, postgres :67 and :221; idb-lean src nothing. Tests: 19 core files build asks (6 name them), the idb and postgres batteries through the helpers.
* **Put flags and `options?`** (shapes-asks.ts:192, :201; check :51 `options: thingOptions.optional()`; `Flagged` :16). Defaults filled at :211 and :225. Left out by vault.ts:233 (no flags, no options), gating.ts:263 (no flags), postgres :221 (no ifAbsent). `options` readers: shapes-asks.ts:22 (`isDelFixed` tests `options === undefined`), :27, :178; thing-classifier.ts:390; policies.ts:38; postgres :137. Required: `putAskOf`/`delAskOf` emit `options: { policies: [] }` and the flags; `isDelFixed` tests `policies.length === 0`; the five readers lose `?.`/`??`. A draft may keep its defaults: it is the host-facing input, and the ask the builder makes is then whole.
* **`ThingMakeOpts.bulletproofCallback?`** (shapes-thing.ts:446, check :451). No producer leaves it out (world.ts:147 always passes it); default `callAsIs` at thing.ts:54, passed through box.ts:17-18, bank.ts:84-86, gate.ts:94. Required: drop `?`, `.optional()` and the default; 4 core test files call `Box/Bank/Gate.make`, and `tests/test-helpers/plain-thing.ts:22`.
* **Box `cited.lifeseq`** (shapes-thing.ts:200 `lifeseq: anyLifeseq.optional()`, and `partialOf` :60-63 over the cited checks). Left out by `Shell.Cited` (:365), `Shell.childCited` (:368), `birthPutsOf`. Required: add `lifeseq` to `thingCited` (:88-93), and the void lifeseq to both shell citations. 10 core test files and 1 idb test name the shell citations.
* **Box sealable `sidecar?`** (shapes-thing.ts:213). Left out by the shell the root box is sealed over (gating.ts:153, :160) and a cold box's citable (`Vault.#donorAt`). Readers: base-box.ts:67-69 (`sidecarMissing`). Required needs a body on the shell and the sparse form, which they have not: see the thread file, *cannot be made whole*.
* **`CitedOf`'s body fields** (shapes-asks.ts:101). Cited without a body by both shell citations, `birthPutsOf`, `#citableAt`, `Vault.#sealedWriteOf` (`Thing.sparseOf(donor)`); only gating.ts:263 cites whole. Reader: shapes-asks.ts:178 `ask.cited.wayins?.main` (testimony). Not practical to make required: a shell and a sparse form have no body.
* **The loggable ask** (shapes-asks.ts:65-85, every field optional). Optional by purpose: a refusal of a malformed ask carries its sound part (`loggableAskOf` :263, adapter-vault-db.ts:192 `ask: {}`). No readers. null per field is the only alternative.

Not itemized: optional parameters (`parent?` in `Shell.of` and the lifepath helpers, `ShellChecks.shellScoped`'s
defaults :325-328, `publicProps = {}`, `secretProps?`); host option bags (`DeviceOpts`'s seven, idb's `dbName?`,
postgres's `listen?` and `Told.thing?`/`world?`).

## B. Where records are made

* **shapes-thing.ts**: `rootShellOf` :343 (root shell; `Shell.of`); `Shell.Cited` :365 (root shell citation; shapes-asks, vault-minder, postgres :79); `Shell.childCited` :367 (child shell citation; vault-minder, tests); `Shell.of` :374 (void sentinel, with `labelpathWithParentage` :403, `lifepathWithParentage` :418; `Shell.under`, gating.ts:153); `Shell.under` :387 (shell under an ancestor; `inParentLivesOf`, classifier :203/:302/:413); `Shell.inParentLivesOf` :396 (world.ts:145).
* **shapes-asks.ts**: `birthPutsOf` :157 (the three birth puts over `Shell.Cited`; adapter-vault-db.ts:147, `checkedBirthBankAsk`).
* **base-thing.ts**: `sparseOf` :134 (Thing fields; thing.ts:172, classifier :320, vault.ts:233, react-lean giver-defaults.ts:31, use-draft.ts:243); `nextLifeOf` :137 (base-box :74, :86).
* **thing.ts**: `citedOf` :172 (frozen citation, `citable`).
* **base-box.ts**: `donorPropsOf` :39, `nextRevisionOf` :64 (a birth over a shell), `tombstoneOf` :82, `recordOf` :115 (stored box rebuilt; lease.ts).
* **gate.ts**: `makeRecord` :108 (birth gate), `makeNextRecord` :117, `wayinsOf` :326. **bank.ts**: `mintStamps` :94, `makeRecord` :104.
* **gating.ts**: `birthBank` :142 (the three roots; the root box sealed over `Shell.of`), `nextGateAsk` :262.
* **lease.ts**: `seal` :137, `unseal` :155, `withoutSecrets` :258. **world.ts**: `seal` :298, `unseal` :307, `makeThing` :142 (the record or a shell). **vault.ts**: `sealBox` :129, `unsealBox` :146, `#sealedWriteOf` :231.
* **thing-classifier.ts**: `storedOf` :133, `writtenOf` :138, `storedCitedOf` :144 (and postgres :148), `storedThingOf` :148, `writtenThingOf` :151 (memory, idb, postgres), `writtenRootsOf` :154, `listedThingOf` :163, `watchedThingOf` :170, `worldOf` :193 (world record; memory, idb, postgres), `shellAt` :202, `ancestorOf` :208, `trackedOf` :243, `listedOf` :319 (thread 24: a live box sparse, else whole), `classifyBirthBank` :346, `unwrittenBirthOf` :399 (world :407, shell :413; postgres :176).
* **vault-minder.ts**: `#citableAt` :187 (thread 24), `bankOfWorld` :375.
* **root-shelf.ts**: `stowRoots`/`shelvedOf`, `peekRoots`/`rootsOfShelved`. **device.ts**: `#receiveShelved` :169 (`Checks.shelvedRoot`), `shelvedEventOf` :382, `#maskedRootRows` :298. **masked-rows.ts**: `maskedRowsOf` :14, `maskedRecordRowOf` :30.

**Where the two sides make the same thing**:

1. The world record `{ ...bank, maingate }`: classifier :197, :352, :407, postgres :173; its inverse, `bankOfWorld`.
2. Shells: the classifier's own `shellAt` and two direct `Shell.under(…, null)`; the model side's `Shell.inParentLivesOf` and `Shell.of`. (`PerKindChecks.shellAt` is a check that shares the classifier's name.)
3. Shell citations: `#citableAt` re-derives the parent lifepath with `Lifeseq.leadingOf`, as `Shell.inParentLivesOf` does.
4. Sparse forms: `listedOf`, `citedOf`, vault.ts:233 each call `sparseOf`.
5. A stored row checked into a new record: `writtenOf`/`storedOf`, `BaseBox.recordOf`, `unseal`, `Checks.shelvedRoot`.
6. A next revision's `revtok`/`revseq`/`written_at`: `nextRevisionOf`, `tombstoneOf`, `Gate.makeNextRecord`.
7. Births: `Bank.makeRecord`, `Gate.makeRecord`, the root box sealed over `Shell.of`.
8. Item events (not records, the same field list): adapter-vault-db :72, vault-minder :329, device `shelvedEventOf`, the test helper.
