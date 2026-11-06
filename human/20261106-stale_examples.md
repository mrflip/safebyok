# Stale examples: prose that names code the core on main does not have

Audited on `origin/main` at `a19292549` (PR #524), after `git fetch`; all twelve files read from a worktree cut from it, never from the base checkout.
Nothing in the audited files was changed. `notes/security.md` and `packages/safebyok-old/` were not opened or cited.

**Classes.** (a) names code main does not have. (b) a Goofus a reader could take for current. (c) a name that exists but is used differently.

**Rule used for Goofus blocks.** A Goofus under a *Fixed* status is the old way and is left alone. A Goofus whose status is *Planned* or *Open* claims to be what the code is now, so its names are held to main. `gallant-docblocks.md` *From the old tree* says outright that its specimens and paths are the old tree's, so those Goofus are left alone and only its Gallants are checked.

**Aliases.** `MSX.` and `VS.` are used all through `notes/gallant.md`. Main star-imports the shapes modules as `VX` (`shapes-vaultish.ts`), `SX` (`shapes-storage.ts`), `GX` (`shapes-gateish.ts`), `CX`, `EX` (STYLE.md:49-58 has that table right). One row each below, not one per line.

---

## notes/gallant.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| gallant.md:15 | "`whiteboard/20261104-newput/newput-plan.md`" | No such file on main. `whiteboard/20261104-newput/` holds `thread-1-newput.md` and `thread-shape_sections.md`. | a | Point at a file on main, or say the plan lives on branch `20261104-newdesign_plan`. |
| gallant.md:56, 74, 96, 106, 187, 215, 250, 259, 276, 286, 465, 487, 516, 522, 631, 635, 643, 703 | `MSX.boxCreateOpts`, `MSX.fetchOpts`, `MSX.timelyOpts`, `MSX.boxPutOpts`, `MSX.boxPatch`, `MSX.bankOpts`, `MSX.listingOpts`, `MSX.vaultListingOpts`, `MSX.boxListingOpts` | No `MSX` in the core. Each is `VX.…`: box-listing.ts:80, 88, 97; box.ts:151, 194; storable.ts:145, 160, 170; bank.ts:80; listing.ts:61. | a | Replace `MSX.` with `VX.`. |
| gallant.md:113, 161, 162, 436, 472, 482, 551, 612, 680, 753, 772 | `VS.sentinelBoxOf`, `VS.revisionOf`, `VS.nextRevisionOf`, `VS.VoidRevision`, `VS.VoidRevisionSeq` | No `VS` in the core. These are `SX.…`: vault.ts:80, 335; listing.ts:186-187, 251; box.ts:175, 180. | a | Replace `VS.` with `SX.`. |
| gallant.md:109, 112 | `this.demandBoxesUsable()` in the "Goofus still: `delBox`" block (status Planned, so it claims to be current) | `Vault.delBox` is this exact code with `this.demandUnlocked()` (vault.ts:327-336). `demandBoxesUsable` appears nowhere in `src/`. | a | `demandUnlocked()`, plus the `MSX`/`VS` rows. |
| gallant.md:124-144 | Goofus `this.listing.fetchListed(this)` and `this.boxListing.hello(listed)`; Gallant `hello() { return this.boxes.hello() }  // BoxListing: the watch, then refresh()` (status Planned, Thread 2) | `fetchListed` is gone. `Vault.hello` (vault.ts:293-298) is `demandEnabled(); await this.boxListing.hello(); await this.boxListing.list(); return this`. There is no `this.boxes` (the getter is `boxListing`, vault.ts:66) and no `refresh()` (the verb is `BoxListing.list`, box-listing.ts:48). | a | Goofus: mark as the old shape, or drop it. Gallant: show `boxListing.hello()` then `boxListing.list()`. Say what is still planned. |
| gallant.md:162 | `VS.nextRevisionOf(prior, this.clock.now())` in the `Listing.del` Goofus (status Planned, Thread 3) | `Listing.delOver` (listing.ts:184-189) is `SX.nextRevisionOf(prior, nowMillis())`. The clock is a module function, `nowMillis` (helpers/clock.ts:12), not a member of the listing. | a | `nowMillis()`. |
| gallant.md:293, 327 | `demandPuttable(patch, choices)` | box.ts:153, 155 and :193: `demandPuttable(patch, { ifPresent })`, signature `demandPuttable(patch, { ifPresent }: BoxPutOpts = {})`. No `choices`. | c | Write `{ ifPresent }`. |
| gallant.md:390 | `throw new VaultError('unexpected_error', Phrases.PutAnsweredNothing)` | listing.ts:168 `throw putAnsweredNothing()`, which is `new VaultError('record_conflict', Phrases.PutAnsweredNothing)` (throwers.ts:84). | c | Show `putAnsweredNothing()`; the kind is `record_conflict`. |
| gallant.md:404 | `throw new VaultError('unexpected_error', Phrases.ProofMissing)` | gating.ts:221 `throw proofMissing()`, which is `'bad_option'` (throwers.ts:156). | c | Show `proofMissing()`; the kind is `bad_option`. |
| gallant.md:510 | "Search `src/checks/validator.ts`" | The file is `packages/safebyok/src/helpers/validator.ts`. There is no `src/checks/`. | a | `src/helpers/validator.ts`. |
| gallant.md:614 | `whisper ?? { val: {} }` in the `#edit` Gallant | box.ts:178 `whisper ?? {}`. A whisper is a plain object; the `{ val }` holder is gone (shapes-core.ts:100-109). | c | `whisper ?? {}`. |
| gallant.md:632 | Goofus `device_id = randomId()` and `clock = wallClock` destructured from `opts` (status Planned) | bank.ts:81: `device_id` is required and read as given; there is no `clock` option. The package reads `nowMillis()`. | a | Drop both defaults from the Goofus. `bankOpts` still being parsed and ignored (bank.ts:80) is what remains true. |
| gallant.md:637 | "as `VX.strengthChecker`'s `custom` already is" | `strengthChecker` is `GX.strengthChecker` (shapes-gateish.ts:124); `bankOpts` uses `GX.strengthChecker` (shapes-vaultish.ts:366). | c | `GX.strengthChecker`. |
| gallant.md:657-669 | Goofus `device_id = randomId()` and `this.deviceDB.cacheDeviceRecord(…)`; status "Planned, Thread 2" | `cacheDeviceRecord` and `DeviceRecord` do not exist. `device_id` is a required `Bank.make` option (shapes-vaultish.ts:358-361). The deviceDB serves leases only: `cache`, `peek`, `vacate`, `leasesProvedBefore` (device-db-new.ts). | a | Status → Fixed; the Goofus is the old shape. |
| gallant.md:698-715 | Goofus `static async build`, `MSX.bankBuildOpts`, `deviceDB.cacheBank`, `bankRowRewritten`; status "Planned, Thread 2" | None exist. `Bank.make` is synchronous (bank.ts:76) and `device_id` is required. | a | Status → Fixed. |
| gallant.md:711-713 | "The option's doc block carries what the mint used to guarantee: a random id, never drawn from anything about the device or the user" | `BankOpts.device_id` (shapes-vaultish.ts:378) has no doc block. That guidance is in VOCABULARY.md:102 only. | c | Put the sentence on `BankOpts.device_id`, or point at VOCABULARY *deviceId*. |
| gallant.md:722-728, 775 | Goofus `{ val }` whisper holder; status "the whisper, Planned, Thread 1b" | `Whisper = Record<string, any>`, checked plain (shapes-core.ts:80, 100-109); no holder on main. Gallant matches main. | a | Status → Fixed. |
| gallant.md:872-873, 895, 917-918, 938-939 | Goofus names `demandReadyToUnsealWhisper`, `ensureReadyToUnsealWhisper`, `vaultOf(bag: VaultBag)`, `WhisperHolder`, `whisperHolder`, with the status lines (883, 907, 928, 949) saying #498 "carries" them | Main has `demandUnsealable` (box.ts:190), `vaultAt(scope: BankedVaultScope)` (bank.ts:222), `extractWhisper(): Promise<Whisper>` (box.ts:90), `#unseal(): Promise<Whisper>` (box.ts:134). None of the Goofus names exist. | b | Say in the status that these are the pre-rename names. |
| gallant.md:928 | "#498 still carries the Goofus's first sentence; the `Whisper` return is #499's" | box.ts:89 reads "The timely stored whisper, keeping nothing on the instance." The `Whisper` return has landed, and the `WhisperHolder` sentence is gone. | c | Update the status. |

**gallant.md rows: 19**

---

## notes/gallant-docblocks.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| gallant-docblocks.md:17-23, 188-189, 753 | Unresolved merge-conflict markers: `<<<<<<< HEAD`, `=======`, `>>>>>>> 32d3abf71 (docs: Gallant/Goofus code examples)`. The HEAD side is empty, so the whole *From the old tree* section (189-752) sits inside the conflict. | A file with conflict markers on main. `STYLE.md:732` points at `#three-questions` and CLAUDE.md:154 at "the pairs", and both land in the conflicted part. | a | Keep the incoming side and delete the markers. |
| gallant-docblocks.md:99-102 | Goofus `put` block: `{@link MSX.boxPatch}`, `{@link MSX.ifPresentVals}`, `opts: SendOpts`, refusal kind `'no_whisper'` | `VX.boxPatch`. No `ifPresentVals` (it is `VX.ifPresent`). No `SendOpts` (the type is `BoxPutOpts`, box.ts:151). `no_whisper` is not a refusal kind (errors.ts:36-71). | b | Label the block as the stripped old doc, or fix the names. |
| gallant-docblocks.md:496, 505-507 | `damaged_records`, `damaged_record` (Gallant at 505-507, Goofus at 496) | The list is `damaged_rows` (vault-db-new.ts:32-33; box-listing.ts:25). The two damagekinds are `format_mismatch` and `damaged_row` (shapes-storage.ts:263). | a | `damaged_rows`, `damaged_row`. |
| gallant-docblocks.md:464 | Gallant: "{@link MaxBoxes}, 100, and the `maxBoxes` the vaultDB adapter advises" | No `MaxBoxes` const. `BankOpts` has no `maxBoxes` (shapes-vaultish.ts:375-392). `maxBoxes` exists only on `memoryVaultDBOpts` (shapes-storage.ts:164). The Goofus's `maxWhisperBytes` and `maxVaultBytes` (450-453) are gone too. | a | Rewrite the Gallant for how `vault_full` arises on main, or mark it "when the option exists". |
| gallant-docblocks.md:567, 583 | Gallant `{@link TombstoneFormat}` and `{@link GateRecord}` | Neither exists. A tombstone is `am: 'x'` (`isTombstone`, shapes-vaultish.ts:74). The gate's shapes are `GateProps` and `StampedGate` (shapes-gateish.ts:62-68, 176). | a | Link `isTombstone`, `GateProps`. |

**gallant-docblocks.md rows: 5**

---

## notes/gallant-test_titles.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| gallant-test_titles.md:11, 52 | `vault.revokePasskey()` | `Vault.revokePasskeyPrompt()` (vault.ts:107); the test is `describe("vault.revokePasskeyPrompt()")` (tests/models/vault-gate.test.ts:237). There is no `revokePasskey` on Vault. | c | `vault.revokePasskeyPrompt()`. |
| gallant-test_titles.md:117 | "Status: Planned, thread `20261105-test_titles`" | 13 of the 14 Gallant titles I looked up already stand in `tests/` ("stops telling a listener once it unsubscribes", "is a no-op with no passkey held", "never seals over a sparse record", …). | c | Status → Fixed, or name what is left. |

**gallant-test_titles.md rows: 2**

---

## STYLE.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| STYLE.md:20-22 | `import * as Scopepath from './scopepath'`, `Scopepath.vault(scope)`; "`check`, not `namesCheck`; `vault`, not `vaultScopepath`" | No scopepath module in the core. Each listing has a protected `scopepathOf` (box-listing.ts:112, vault-listing.ts:169); only `ScopepathDelimiter` lives in consts.ts:4. | a | Use a module that exists (`import * as Phrases from './phrases'`). |
| STYLE.md:24 | `import { Box, BoxKinds } from './box'` | `BoxKinds` is nowhere in the core. | a | `import { Box } from './box'`. |
| STYLE.md:37-45 | `import * as CX from './shapes/scopes'`, `import * as FX from './shapes/fields'`, `from './shapes/scopes'` | CX is `./shapes/shapes-core` (STYLE.md:53 says so). There is no `shapes/scopes.ts` or `shapes/fields.ts`. | a | `./shapes/shapes-core`; drop `FX`. |
| STYLE.md:62-65, 136-137 | "the main entry exports each validator by name" (`import * as Safebyok from 'safebyok'`, then `Safebyok.vaultRecord`); "A host writes `import { boxSparse, type BoxSparse } from 'safebyok'`" | src/index.ts:1-11 exports `Bank`, `Box`, `Gating`, `Vault`, `Whispered`, `VaultError`, `isVaultError` and some types. No validator. | c | Say what a host imports today, or mark it planned. |
| STYLE.md:64 | `Box.seal(vault, props, whisper)` | No `Box.seal`. A box is stored through `box.put(patch)` (box.ts:151) or `vault.putBox(patch)` (vault.ts:317). | a | Use a real call. |
| STYLE.md:68 | "lease.ts's `leaseSealProps`, vault.ts's `putBoxProps`" | Neither exists. (`Checks` in helpers/validator.ts does.) A module-local validator that does: `mashInput` (utils.ts:13). | a | Cite `mashInput`. |
| STYLE.md:79-80 | `idbDeviceDB`, `fields_exports` in `dist/shapes/fields.js` | `idbDeviceDB` and `shapes/fields` are in no package on main outside `safebyok-old`. | a | Drop or re-measure. |
| STYLE.md:140-141 | `shapes/host-code.ts`; `vaultDBShape`, `deviceDBShape`, `keyDeriverShape`, `loggerShape` | No `host-code.ts`. `keyDeriverShape` and `loggerShape` are in shapes-core.ts:173, 182. The DB checks are `vaultDBDuck` and `deviceDBDuck` (shapes-vaultish.ts:161, 326). | c | Name the real files and checks. |
| STYLE.md:152-153 | `VX.wayinkind`, `VX.wayinKindVals` | `GX.wayinkind` (shapes-gateish.ts:25); `EX.wayinKindVals` (shapes-enums.ts:57). | c | `GX.wayinkind`, `EX.wayinKindVals`. |
| STYLE.md:159-162, 606 | `Stored-`, `StoredVault`, `StoredBox`, `StoredVaultTok`, `StoredRevision` | No `Stored*` type in the core; rows are `VaultRow` and `BoxRow`, and raw reads are `unknown` (shapes-storage.ts:271-279). | a | Rewrite the paragraph to match. |
| STYLE.md:191 | "as `getWhisper` does" | No `getWhisper` in `src/`. It is only a doc example in tests/test-helpers/refusals.ts:19. | a | Name a real getter with no null form, or drop the clause. |
| STYLE.md:198, 494 | `optionsCheck`, `readBankOpts` | Neither exists. Bank options are checked by `VX.bankOpts.parse(opts)` (bank.ts:80). | a | `VX.bankOpts`. |
| STYLE.md:201, 233-236 | `vault.consistentWith(thing)`, `vault.demandConsistentWith(thing, { leaseBound: true })` | Not on Vault. The triplet that exists is `isUnlocked` / `demandUnlocked` / `ensureUnlocked` (vault.ts:141, 360-363). `consistent` and `demandConsistent` are bag functions in helpers/validator.ts:237-245. | a | Use `isUnlocked` / `demandUnlocked` / `ensureUnlocked`. |
| STYLE.md:242-243 | "`vault.putWayin()` resolves the vault, whose `vault.snapshot.gate`"; "`VaultDB.putBox()` resolves the record" | No `putWayin` (there are the `…Prompt` verbs). `VaultSnapshot` has no `gate` (shapes-vaultish.ts:311-319). `VaultDB.putBox` resolves a `GoodAnswer<BoxRow, PutAct>` (vault-db-new.ts:181). | a | Use `replacePassphrasePrompt()` etc.; say "answers the row". |
| STYLE.md:250 | "a snapshot's `damagedBoxes`" | No such snapshot field. The list is `BoxListing.damaged_rows` (box-listing.ts:25). | a | Pick a camelCase field that exists. |
| STYLE.md:305-317, 336, 406 | "`shapes/scopes.ts`"; the `export const box = (scope) => …` and `boxscope` block; `CX.boxScopepath.parse`; `Scopepath.vault(thing)` | No such module or `boxScopepath` validator. The spelled-out maker is `BoxListing.scopepathOf` (box-listing.ts:112-114). | a | Show `scopepathOf` instead. |
| STYLE.md:355, 358 | `new VaultError('missing_label', …)`, `new VaultError('unknown_key_deriver', …)` | Neither is a refusal kind (errors.ts:36-71). The real ones: `bad_scope` for a bad label, `newer_format` for an unknown deriver label (errors.ts:50). | a | Swap the kinds. |
| STYLE.md:512, 640, 666 | `format` (a stored field, a record built with `{ format, … }`, a snapshot's `format`) | The stored field is `fmt` (`VaultFormat`, shapes-storage.ts:20-21; VOCABULARY.md:167). `VaultSnapshot` has no format. | c | `fmt`. |
| STYLE.md:533 | `Pick<Vault, 'clock' \| 'sealStampedString' \| ...>`; "never a third interface beside the class" | Neither Vault nor Bank has a `clock`; the clock is `nowMillis` (helpers/clock.ts:12). Worlds are declared types: `World`, `ListingWorld`, `BoxWorld`, `VaultWorld` (shapes-vaultish.ts:142-160, 285, 334), and Box uses `Pick<BoxWorld, 'sealStampedString'>` (box.ts:255). | a | Drop `'clock'`; describe worlds as main declares them. |
| STYLE.md:568-571 | "exported as a `Z.ZodType<T>` of it (`Z.ZodType<BankOpts>`, say), and an equality assertion of the two at the file's foot" | `bankOpts` is an `objCheck` (shapes-vaultish.ts:358) with a separate hand-written `BankOpts` type (:375). No `ZodType` annotation and no equality assertion at the foot. | c | Describe what main does, or add the assertion. |
| STYLE.md:584 | "`Boxlabel`" | No `Boxlabel` alias; box labels are plain `string` (vault.ts:303). | a | Name a real alias. |
| STYLE.md:387-390, 614-617 | "a VaultDB or DeviceDB … is known by its `Symbol.for` brand: a duck check passes anything with the right method names" | Both are checked as ducks: `vaultDBDuck` and `deviceDBDuck` list method names (shapes-vaultish.ts:161, 326). The only `Symbol.for` in `src/` is `Whispered` (consts.ts:29). | c | Say the DBs are duck-checked, or build the brand. |
| STYLE.md:636 | "(`vault.stamp`)" | No such getter. The vault stamp is `GX.vaultStamp.parse(this)` (vault.ts:250). | a | Cite a real getter, e.g. `vault.snapshot`. |
| STYLE.md:638 | `deviceDB.getLease(vault)` | deviceDB verbs are `cache`, `peek`, `vacate` (VOCABULARY.md:153, 160). | a | `deviceDB.peek(vault)`. |
| STYLE.md:687 | "`Scopepath` is a public module: a host's own key-value adapter files rows with it." | No such module, and not exported (src/index.ts, `safebyok/utils`). | c | Delete or mark planned. |
| STYLE.md:777-778 | Goofus `vaultOf(bag: VaultBag)` | Main has `vaultAt(scope: BankedVaultScope)` (bank.ts:222). `VaultBag` and `vaultOf` no longer exist. Nothing says the Goofus is the old name. | b | Say it is the pre-rename name. |
| STYLE.md:810-816 | A test file past ~1,500 lines "becomes a folder `tests/foo/bar/` of `bar-<theme>.test.ts` … `world.ts` … no `bar.test.ts` stays outside"; "`vault-opts.ts` through `Bank.make`" | Main is flat: `tests/models/box-listing.test.ts` beside `box-listing-create.test.ts` and `box-listing-rows.test.ts`; no `world.ts`; no `vault-opts.ts`. | c | Describe the flat `<module>-<theme>.test.ts` layout. |
| STYLE.md:844 | "The linter (`vitest/valid-title`) refuses a quoted kind" | eslint.config.mjs:447 sets it to `'warn'`. | c | "warns". |
| STYLE.md:868-872 | `Labels.valid(label)` in the bulk-case test | No `Labels` module. The check is `label` (primitives.ts:31). | a | `label.safeParse(label).success` or similar. |

**STYLE.md rows: 29**

---

## VOCABULARY.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| VOCABULARY.md:17 | `Wayinkind` | The type is `WayinKind` (shapes-enums.ts; STYLE.md:151 spells it so). | c | `WayinKind`. |
| VOCABULARY.md:19 | `Gatingkind` | The type is `GatingKind` (gating.ts:8, 164). | c | `GatingKind`. |

**VOCABULARY.md rows: 2**

---

## CLAUDE.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| CLAUDE.md:28 | "`ensureVault`, `vault.refresh`, `putBox`, `lock()`" | No `refresh` on Vault or Storable. A vault refreshes through `hydrate`, `fetch` and `ensureTimely` (storable.ts:144, 159; vault.ts:392). | a | `vault.hydrate` (or `vault.fetch`). |

**CLAUDE.md rows: 1**

---

## PROCESS.md

No stale hits. Every path, script, skill, agent, config key and command in it exists on main.

**PROCESS.md rows: 0**

---

## README.md

No hits. The `Basic e2ee architecture` section (lines 33-58) is stale throughout (`getVault` "record and listing in one step", `putWayin`, `getWhisper`, a pantry), but line 35 says "The old design's sketch", so it is (b)-fine.

**README.md rows: 0**

---

## packages/safebyok/README.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| README.md:52-54 | `Bank.make({ applabel, user_id, vaultDB, deviceDB, keyDeriver, strengthChecker, requestCleartext })` | `device_id` is required (`bankOpts`, shapes-vaultish.ts:358-361; bank.ts:81). The host example is refused `bad_option` as written. | c | Add `device_id: …`. |
| README.md:54, 101-104 | "none has an export yet"; "Nothing exports … a real key deriver or strength checker"; the entry point "exports `Bank`, `Box`, `Gating`, `Vault`, their snapshot types and `VaultError`" | `safebyok/browser` exists and exports `argon2idDeriver` and `argon2idWebV1Deriver` (src/browser.ts; package.json `./browser`). `safebyok/utils` exports `mask`, `mash`, `toB64`, `fromB64`. The main entry also exports `Whispered`, `WhisperedBag`, `isVaultError`, `RequestCleartext`, `BankOpts`, `Whisper`. | c | Name the deriver as available; the VaultDB, DeviceDB and strength-checker claims still hold. |

**packages/safebyok/README.md rows: 2**

---

## packages/safebyok/CUSTOMIZATION.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| CUSTOMIZATION.md:4-6 | "still names the old design's entry points … (`safebyok/browser`, `safebyok/idb`, `putWayin`), which this package does not have yet" | `safebyok/browser` exists (src/browser.ts: the two Argon2id derivers). `safebyok/idb` and `putWayin` do not. | c | Take `safebyok/browser` out of the list, or say what it has. |
| CUSTOMIZATION.md:51-52, 58, 75-80, 119 | `zxcvbnStrengthChecker`, `browserOpts()` | Neither is defined or exported anywhere in `src/`; they appear only in comments (passphrase-strength.ts:26; phrases.ts:102, 105). `safebyok/browser` exports only the derivers. | a | Mark the section as planned, or remove. |
| CUSTOMIZATION.md:58, 80, 97 | `Bank.make({ applabel, user_id, vaultDB, … })` and `Bank.make({ ...opts, … })` with no `device_id` | `device_id` is required (shapes-vaultish.ts:358-361). | c | Add `device_id`. |
| CUSTOMIZATION.md:101 | `vault.tryCheckStrength(typed)` | No such Vault method (a comment names it, passphrase-strength.ts:28). The as-you-type check is `gating.checkStrength(passphraseClear)` (gating.ts:96). | a | `gating.checkStrength`. |

**CUSTOMIZATION.md rows: 4**

---

## notes/guarantees.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| guarantees.md:128 | "`registered_at` and `ask_passphrase_at`" | No such field. The lease's time field is `proved_at` (VOCABULARY.md:163; shapes-gateish.ts `leaseStamp`). | a | `proved_at`. |
| guarantees.md:57, 130 | "(README, *Removal is not revocation*)"; "(README, *The passphrase and the passkey*)" | Neither README has either heading. packages/safebyok/README.md has *What a host relies on* (its bullet "Nothing is recoverable, and removal is not revocation"), *The cast*, *A host*, *Not done yet*, *Next*. | a | Cite *What a host relies on*. |
| guarantees.md:205, 290 | "The core has no `mask`" | `safebyok/utils` exports `mask` (src/utils.ts:8) and `mash`. | c | "The main entry has no `mask`; `safebyok/utils` does." |
| guarantees.md:388-389 | "The published entry points export neither `argon2idDeriver` nor `argon2idWebV1Deriver`, and no test of the core calls `argon2idDeriver`" | `safebyok/browser` exports both (src/browser.ts:4); `tests/browser.test.ts` calls them (6 hits). | c | Update both clauses. |

**guarantees.md rows: 4**

---

## notes/wontfix.md

| file:line | stale text | what main has instead | class | fix |
|---|---|---|---|---|
| wontfix.md:12-14, 94 | "a different `leaseHours`, `maxWhisperBytes`, `maxBoxes`, `validators` or `keyDeriver`"; "counts toward `maxBoxes`" | `Bank.make` has `autolockMinutes` (shapes-vaultish.ts:385), no `leaseHours` (only Phrases.leaseHoursShape, phrases.ts:90-92), no `maxWhisperBytes`, no `validators`; `maxBoxes` is only on `memoryVaultDBOpts` (shapes-storage.ts:164). | a | Use the option names main has; the file's banner already warns it is in flux. |
| wontfix.md:17-18 | "`fetchLease` in `packages/safebyok/src/vault.ts`" | No such file or function. The cached-lease read is `Lease.buildFromCache` (models/lease.ts:56; vault.ts:144). | a | `Lease.buildFromCache`. |
| wontfix.md:48-51 | "A lease whose `autolock_at` lies more than `MaxTimerMillis` (about 24.5 days) away arms no timer … past the Trigger's cap" | `autolock_at`, `MaxTimerMillis` and any Trigger are absent from `src/`. The core sets no timers; the host calls `bank.autolock()` (bank.ts:146-155) and a lease ages from `proved_at` by `leaseMillis`. | a | Rewrite or remove the entry. |

**wontfix.md rows: 3**

---

## Count per file

| file | rows |
|---|---|
| notes/gallant.md | 19 |
| notes/gallant-docblocks.md | 5 |
| notes/gallant-test_titles.md | 2 |
| STYLE.md | 29 |
| VOCABULARY.md | 2 |
| CLAUDE.md | 1 |
| PROCESS.md | 0 |
| README.md | 0 |
| packages/safebyok/README.md | 2 |
| packages/safebyok/CUSTOMIZATION.md | 4 |
| notes/guarantees.md | 4 |
| notes/wontfix.md | 3 |
| **total** | **71** |

---

## What was checked and found sound

- **Removed or renamed this week, none live in the prose except as listed above:** `wallClock`, `Clock`, `clock.now()`, `world.clock`, `BankOpts.clock`, `VaultDBOpts.clock`, `DeviceRecord`, `deviceRecord`, `_cheat_deviceRows`, a minted device_id, `whisperTooLarge`, `noRoomForBox`, `BoxDamagedBeyondNaming`, `refusalKind` as an option name, `sha256Hex`. Absent from `src/`, `tests/` and the prose, or listed above.
- **`clock`:** helpers/clock.ts is real (`nowMillis`, `_cheat_clock`, `_cheat_clockReset`). STYLE.md:256 and wontfix.md:100-102 use it as it is; guarantees.md:266 ("the device's clock … `Date.now()`") is true.
- **`refusalkind`:** used correctly in STYLE.md:223, 443, 709, packages README:25, gallant.md:529, 961, 967, gallant-docblocks.md:481, 487 (validator.ts:121, 145, 294).
- **`refusalOf`:** a private helper in helpers/validator.ts:210, quoted nowhere in the prose.
- **`getWhisper`:** exists only as a doc example (tests/test-helpers/refusals.ts:19); the packages README and CUSTOMIZATION name it as the old design's; STYLE.md:191 is the stale use (row above).
- **`damaged_rows`, `listVaults`, `listBoxes`, `getVault` (the row alone), `mash`:** VOCABULARY.md:144, 156, 158, 102-103 match vault-db-new.ts:32-33, 88, 104, 125 and utils.ts.
- **Refusal kinds:** every quoted kind in the twelve files was checked against `refusalKindVals` (errors.ts:36-71). The only outsiders: `damaged_records`, `damaged_record`, `no_whisper`, `vault_remade` (gallant-docblocks, old-tree Goofus), `missing_label`, `unknown_key_deriver` (STYLE.md:355-358).
- **Stored field names** (`salt_bytes`, `registered_at`, `vault_tok`, `gate_epoch`, `whisper_ciphered`, `box_key_wrapped`, `vault_key_*_wrapped`, `credential_id`, `prf_salt_b64`, `proved_at`, `damagekind`, `fmt` values 5001/6001/7001, …): present.
- **Paths:** every `.ts`, `.md`, `.mjs`, `.json`, `.yml`, `.sh` path in the twelve files was checked against `git ls-files` (old tree excluded). Misses are in the rows above, plus the old-tree paths in gallant-docblocks.md.
- **notes/guarantees.md:** about 100 member and function names in *Access points* and *G1-G10* (`Lease.buildFromCache`, `lease.evict`, `Lease.#vaultKey`, `Proving.buildLease`, `spendClears`, `checkedClears`, `RunForGatingkind`, `HostErrorSanitizer.refusalFor`, `storeFailed`, `deriveWrappingKey`, `importWrappingKeyBytes`, `#unlockByProof`, `#makeFriend`, `sealStampedString`, …) all exist. Every italicised test title quoted in it exists in `tests/`.
- **VOCABULARY.md:** `lease.sealWith/unsealWith/evict`, `proving.buildWayin/buildLease`, `FirstGateEpoch`, `PasskeyAnswer`, `wayinCtxOf`, `cipherCtx`, `LeaseStamp`, `VaultStamp`, `Argon2idWebV1` (64 MiB, 3 passes, 16-byte salt), `tidyGone`, `leasesProvedBefore`, `DefaultLeaseMillis` (14 days), `DefaultRefreshMillis` (5 min), `LabelPattern` (2-40 chars), act values (`born`/`reborn`/`replaced`/`declined`, `deleted`/`gone`/`void`, `got`/`gotvoid`/`gotgone`), `MemoryVaultDB`, `MemoryDeviceDB`, `decline()`, `whenSettled`.
- **gallant.md Gallants that match main modulo the aliases:** `BoxListing.create`, `Vault.getBox`/`BoxListing.get`, `delBox` (damaged as missing), `tryDelDamagedBox`, `Storable.del`, `Box.put`, `BoxListing.puttable`, `Listing.deliver`, `buildOrReceive`, `Vault.launchBirth`, `reconcileCentral`, `handleIfAbsent`, `isOwnRow`, `#stampOfLife`, `#isEnabled` / `demandEnabled`, `VoidRevisionTok/Seq/VoidTime`, `refusalkind` in the objCheck doc, `vaultAt`, `extractWhisper(): Promise<Whisper>`, `#unseal(): Promise<Whisper>`, `demandUnsealable`.
- **gallant-docblocks.md:** the `PutVaultOpts` and `putVault` Gallants (`camped`, `declined`, `vault_empty`, `vault_gone`, `stale_write`) match vault-db-new.ts:156-178 and shapes-storage.ts:156; `isSafelyAllZero` matches proving.ts:213; `Bank.hello` and `ensureVault(scope: BankedVaultScope)` match; "no `leaseCtxOf` in the new tree yet" is true.
- **PROCESS.md and CLAUDE.md:** commands, scripts, skills, agents, `minimumReleaseAge: 10080` with `Strict: true`, the `fixed` changeset group (seven packages), `.mergify.yml`, `scripts/git-mergify`, `scripts/cut-thread`, and the rest of CLAUDE.md's names.

## Not reported, on purpose

- STYLE.md's invented naming examples (`fooCount`, `getBoxOrThrow`, `readBox`, `createVault`, `takeStoredBox`, `updateBoxListingOf`, `putSelf`, `withinVaultScopepathPred`, `selfDestructPreventionDisabled`, `dragForceInput`, `checkBoxlabel`, `getUserId`, `keyDeriverLabel`): hypothetical names, not claims about the code.
- Goofus blocks under a *Fixed* status in gallant.md, and everything in gallant-docblocks.md *From the old tree* beyond its Gallants.
- Non-core packages (`safebyok-react`, `safebyok-indexeddb`, `safebyok-convex`, …), `idb.ts` and `string-store.ts` (STYLE.md:145), `PasskeyUnlockButton`, `GatingModal`, `useWhenShown` (guarantees.md).
- Root README.md's old-design sketch.

## Not confirmed

- gallant-test_titles.md:13 "The lint allows five levels before it warns": no nesting rule appears in either `eslint.config.mjs`. It may come from a preset I did not trace.

## One slip to disclose

Two of my `rg` commands used a `notes/*.md` glob that matched `notes/security.md`, and printed a handful of its lines (and, in the second, the `file:line` and matched token of four more) before I noticed. I did not use any of it, and nothing in this report comes from that file.
