# Survey: signatures taking a scope or shape, and the ducks they want

Read-only survey of `packages/safebyok/src` at the worktree's HEAD (2026-10-27), for the
validator-ducks thread. Line numbers are as of this survey. "Public" means reachable from
`src/index.ts`, `src/browser.ts`, `src/idb.ts`, `src/utils.ts` or the `Validators` namespace
(`src/validators.ts`); `tests/test-helpers.ts` (`safebyok/testing`) is noted where it matters.

Shorthand: **S** = `{ applabel, user_id, vaultlabel }` (a vault scope); **BS** = `{ applabel,
user_id }`; **strip** = Zod's default object mode (unknown fields dropped); **CX** =
`checks/core-checks.ts`.

---

## 0. Findings that shape the design

1. **Zod reads a Vault object fine, and strict mode sees only own enumerable fields** (section 4,
   verified on zod 4.6.7). A strict duck accepts a Vault object as long as its six own fields
   (`format, applabel, user_id, vaultlabel, vault_tok, registered_at`) are all known. Getters
   (`stamp`, `snapshot`, `getSnapshot`, `subscribe`, `logger`) and `#private`s are invisible to
   the unknown-field check. A getter is read only if the duck declares its name.
2. **`registered_at` is the one dangerous collision.** It means the vault's birth on a vault
   record and a Vault object, the box's first store on a Box or box record, and the wayin's seal
   on a wayin. All three are `epochMillis`, so one schema passes them all. A vault-stamp duck that
   tolerated a Box's fields would bind the **box's** `registered_at` as the vault's into a ctx.
   This is latent today: `VaultStampButFormat` (`vault-record.ts:108`, strip) already accepts a Box
   (`format` is omitted, and the other five fields are on a Box). No caller passes one yet.
3. **`gate_epoch` has four schemas**: `uint` (VaultRecord), `int.positive()` (LeaseRecord),
   `uint.nullable()` (VaultDelExpectation), `num` (`vaultMadeUnderShape`, `vault.ts:1989`, any
   number). **`format` is a different literal on every record.** **`gate`** is a `GateRecord`
   on a record and a `GateSparse` on a snapshot, and the two are mutually exclusive (both strict).
   Full list in section 3.4.
4. **Three caller shapes carry far more than any scope** and would break a strict duck if passed
   whole:
   - `VaultParts` (`vault-opts.ts:498`), which carries the stores, logger, clock, deriver and limits;
   - `MakeBankOpts`, through `CX.bankScope.parse(opts)` at `vault-opts.ts:477`;
   - the test slices (`tests/test-helpers/builders.ts:69,72`), which carry functions, a Lease and
     booleans as own fields and reach `VaultStampButFormat.parse` through `Lease`/`Box`'s `#vault`.

   Each must stay on a strip parse or hand in a scope it has already picked.
5. **`demandConsistentWith` must keep the thing itself.** `#inconsistencyWith` branches on
   `thing instanceof Proving` and `thing instanceof Gate` (`vault.ts:1144-1145`), and
   `checkedMadeUnder` (`vault.ts:2001`) deliberately returns `thing`, not the parse output. A duck
   there may only validate.
6. **Most core functions already strip correctly.** Every host-facing store call (`DeviceDB.*`,
   `VaultDB.do*`) is handed a scope that was parsed once (`this.#scope`, `asked`, `scope`). The
   duck work is mostly about (a) the validators' strictness and (b) a handful of hand-picks and
   redundant params.

---

## 1. Inventory

Columns: **Sig** | **Reads** (fields used of each object param) | **Callers** (sample) |
**Checks now**. Callers in `src/` unless prefixed `tests/`.

### 1.1 `scopepath.ts`: all public (`Scopepath` namespace)

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `bank(scope: BankScope)` :44 | BS | (none in src) | `CX.bankScope.parse` (strip, frozen) |
| `vault(scope: VaultScope)` :54 | S | `bank.ts:156,280(parts),475(parts)`; `local-vault-db.ts:90(draft),100(vaultRecord)`; `tests/vault-db.test.ts:44` | `CX.vaultScope.parse` strip |
| `lease(scope: VaultScope)` :63 | S | `device-db.ts:67(scope),79(record: LeaseRecord)`; `idb.ts:84,101(record)` | same |
| `device(scope: VaultScope)` :72 | S | `device-db.ts:86,98(record: DeviceRecord),128(both)`; `idb.ts:114,128(record)` | same |
| `box(scope: Boxscope)` :81 | S+boxlabel | `local-vault-db.ts:112,132,156` as `{...scope, boxlabel}`; `safebyok-indexeddb/src/idb-vault-db.ts:87,97,121` | `CX.boxscope.parse` |
| `withinVaultScopepathPrefix(scope)` :152 | S | `:164`; `safebyok-indexeddb/src/box-range.ts:17` | `CX.vaultScope.parse` |
| `withinVaultScopepathPred(scope)` :163 | S (via prefix) | `local-vault-db.ts:119,145,172` | via prefix |

### 1.2 `names.ts`, `device-db.ts`, `idb.ts`, `del-damaged-vault.ts`, `passphrase-strength.ts`

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `sameScope(record: VaultScope, scope: VaultScope)` names.ts:4 (internal) | S of both | `lease.ts:149(checked LeaseRecord, vault)`; `device-db.ts:155`; `vault-db.ts:502,973,980` | none (pure compare) |
| `DeviceDB.getLease/delLease/getDeviceRecord/delDeviceRecord(scope: VaultScope)` device-db.ts:30-44 (**public interface, host implements**) | S | `vault.ts:1004-1006,1395,1414,1485` (`this.#scope`); `bank.ts:556-557,570`; `del-damaged-vault.ts:56` | Caller passes a scope it parsed; the memory/idb impls go through `Scopepath.*` |
| `DeviceDB.putLease(record: LeaseRecord)`, `raiseDeviceRecord(record: DeviceRecord)` (**public**) | whole record; Scopepath reads S | `vault.ts:852`; `bank.ts:563`; `del-damaged-vault.ts:61` | none in impl (record made by us) |
| `raisedDeviceRecord(stored: unknown, record: DeviceRecord)` :126 (**public**) | S (via Scopepath.device), `highest_vault_epoch`, `device_id` | `device-db.ts:100`; `idb.ts:129` | `DeviceRecord.safeParse(stored)` only |
| `deviceRecordOf(scope: VaultScope, device_id, highest_vault_epoch)` :140 (**public**) | S | `bank.ts:561`; `vault.ts:1097` (`this.#scope`); `del-damaged-vault.ts:60`; tests 66 sites | `CX.vaultScope.parse` then `DeviceRecord.parse` |
| `deviceRecordFor(scope: VaultScope, answer: unknown)` :153 (internal) | S | `bank.ts:556,563`; `vault.ts:1004` | `DeviceRecord.safeParse(answer)`; scope not checked |
| `delDamagedVault(opts)` del-damaged-vault.ts:41 (**public**) | `applabel, user_id, vaultlabel, vaultDB, deviceDB` | host | Hand-picks the three names into `CX.vaultScope.parse({ applabel: opts.applabel, ... })` |
| `delDamagedVaultIn(scope: VaultScope, vaultDB, deviceDB)` :49 (internal) | S | `bank.ts:380`; `:45` | trusts caller |
| `guardStrengthChecker(hostChecker, scope: VaultScope)` passphrase-strength.ts:90 (internal) | S | `vault-opts.ts:516` | hand-picks S into a frozen `told` |
| `StrengthChecker(passphrase, scope: VaultScope)` :35 (**public type, host implements**) | S | the guard | host's own |
| `userInputsOf(scope?: VaultScope)` zxcvbn-strength-checker.ts:80 (internal) | S | `checkWithZxcvbn` | none |

### 1.3 `vault-db.ts`, `expectations.ts`, `local-vault-db.ts`

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `VaultDB.getVault / getVaultRecords / getCapacity / delDamagedVault / subscribe(scope: VaultScope)` :272,306,442,529,559 (**public**) | S | `vault.ts:1006,1086` (`this.#scope`); `del-damaged-vault.ts:56`; `safebyok-graphql/src/vault-resolvers.ts:128-143` (`scopeIn(args)`) | `heldScope(this, scope)` :825 = `CX.vaultScope.parse` + `maxNameBytes` per name |
| `VaultDB.getBox / delBox(scope, boxlabel, expected)` :374,464 (**public**) | S; `expected.vault_tok`(+`revision_tok`) | `vault.ts:721,1626` | `heldScope`; `heldBoxlabel` (`CX.boxscope.parse({...scope, boxlabel})`); `checkOutgoing(BoxGetExpectation/BoxDelExpectation)` (strip picks) |
| `VaultDB.putBox(scope, expected: BoxExpectation, box: BoxRecord)` :413 (**public**) | S; whole record; `expected.{vault_tok,revision_tok}` | `vault.ts:1745` (`box.record`) | `heldScope`; `checked(BoxRecord, ...)` strict; `heldBoxlabel` |
| `VaultDB.putVaultRecord(vaultRecord: VaultRecord, expected)` :330 (**public**) | whole record; S via heldScope | `vault.ts:1326` | `checkOutgoing(VaultRecord)` strict, then `heldScope(this, outgoing)` |
| `VaultDB.delVault(scope, expected: VaultDelExpectation)` :489 (**public**) | S; `expected.{vault_tok,gate_epoch}` | `vault.ts:1291` | `heldScope`; strip expectation |
| `VaultDB.ensureVault / ensureVaultRecords(draft: VaultDraft)` :290,311 (**public**) | whole draft | `bank.ts:557` (`draftOf(scope, readAt)`); graphql :133 | `checkDraft` (VaultDraft, strict) + `heldScope` |
| `readVault(scope)` :344, `ensuredVault(draft)` :353, `deletedVault(scope, expectation)` :498 (private) | S | the verbs above | trust |
| `do*(scope: VaultScope, ...)` :620-689 (**public abstract**: adapters implement) | S | base class only, always `asked` | already parsed by base |
| `heldScope(facts, scope: unknown)` :825 / `heldBoxlabel(facts, scope, boxlabel)` :834 | S | every verb | as above |
| `withStaleVaultRecordChecked(writing, scope)` :896; `checkVaultRecord(raw, scope)` :968; `checkWrittenVaultRecord(raw, written, scope)` :978; `isSoundVaultRecord(raw, scope)` :1021 | S (compare via sameScope); `written.{vault_tok,gate_epoch}` | verbs | trust |
| `Expectations.tombstoneOf(standing, scope: Pick<VaultTombstone,'applabel'\|'user_id'\|'vaultlabel'>, expected)` expectations.ts (**public**) | S | `local-vault-db.ts:169`; `safebyok-convex/src/component/vaults.ts:181` (`{...scope}` rest of args); `safebyok-indexeddb idb-vault-db.ts:137` | none; hand-builds the tombstone from S |
| `Expectations.vaultMeets(standing, expected: Pick<VaultDelExpectation,'vault_tok'>)`, `vaultRecordMeets`, `vaultRecordRefusalOf`, `boxRefusalOf`, `deletionOf`, `vaultRecordPutOf<RecordT extends Pick<VaultRecord,'vault_epoch'>>`, `newLifeOf<DraftT extends Pick<VaultDraft,'vault_epoch'>>` (**public**) | `vault_tok`, `gate_epoch`, `revision_tok`, `vault_epoch` | adapters | none (inside an adapter's atomic step) |
| `StringStoreVaultDB.do*` local-vault-db.ts:84-176 (internal class) | S via Scopepath | base class | base parsed |

### 1.4 `box.ts`

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `Box.make(vault: ConsistencyWith<VaultStamp>, record: BoxRecord, madeUnder: MadeUnder)` :235 (**public**) | `vault`: kept as `#vault`, used for `demandConsistentWith` and `heldLeaseOf` identity; **no field read**. `madeUnder`: S, `vault_tok`, `vault_epoch`, `gate_epoch` | `vault.ts:1654` (`{ ...vaultSparseOf(this.#vaultRecord), vault_tok: vaultTok }`); `tests/box.test.ts:87,204` (slice, `slice.madeUnder`) | `checkedBoxRecord` (strict); `MadeUnderShape` = `VaultSparse.pick(S, vault_tok, both epochs).strip()` (bad_option), frozen |
| `Box.seal / trySeal(vault: ConsistencyWith<VaultStamp>, props: SealBoxProps, whisper, made: { madeUnder: SealedUnder, now })` :263,266 (**public**) | `vault`: S + `vault_tok` destructured :297, plus `heldLeaseOf(vault)` and `#vault`. `made.madeUnder`: `vault_epoch`, `gate_epoch` | `vault.ts:1675` (`{ madeUnder: vaultSparseOf(...), now }`); `tests/box.test.ts:97` (`vault.making()`) | `checkSealProps`; `sealBoxlabel`; `checkedBase` (`BaseShape`, loose); `checkedMade` (`MadeShape`, strip VaultSparse pick); **vault not checked** |
| `SealBoxProps.base?: BoxBase` (`{ revision_tok: string\|null, registered_at? }`) :160 | `revision_tok`, `registered_at` | `vault.ts:1675` (a Box, a `{revision_tok, registered_at}`, or `{revision_tok}`) | `BaseShape` `.loose()` |
| `boxSparseOf(record: BoxSparse & { box_key_wrapped?, whisper_ciphered? })` :349 (internal) | spread minus two | `vault.ts:1762` | none |
| `Box` constructor (private) :192 `(vault, madeUnder: MadeUnder, record, baseRevisionTok)` | as make | make, trySeal | - |

### 1.5 `lease.ts`

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `leaseCtxOf(vaultStamp: VaultStampButFormat, leaseStamp: LeaseStamp)` :56 (internal; tests) | stamp minus format; lease stamp | `:262` (`this.#vault`, a Vault object, and `this.#record`); `:307` (`standing`, a whole VaultRecord with its gate, and `stamp`); `tests/ctx-bytes.test.ts:199` | `VaultStampButFormat.parse` (strip); `LeaseStampPicked.parse` (strip) |
| `boxCtxOf(vaultStamp: VaultStampButFormat, boxStamp: BoxStamp, purpose)` :67 (internal) | as above; BoxStamp | `:276` (`this.#vault`, `{...visible, vault_tok: this.vault_tok}`) | `BoxStamp.parse` (strict); `VaultStampButFormat.parse` (strip) |
| `Lease.make(vault: ConsistencyWith<VaultStamp & Pick<Vault,'tryLock'>>, record: unknown)` :144 (**public**) | `vault`: S (sameScope), `#vault` for ctx/demand/lock. record: whole | `vault.ts:1469,1492,1515` (`this`); `tests/lease.test.ts:143` (slice) | `LeaseRecord.safeParse` -> corrupt_record; `sameScope`. **vault not checked** |
| `cipheredWith / decipherWith / sealProps(..., visible: BoxSparse)` :175-245 (**public** methods) | whole BoxSparse | `box.ts:277,318` | `checkedVisible` (`BoxSparse.strip()`) |
| `sealLeaseRecord(standing: VaultStampButFormat & Pick<VaultSparse,'gate_epoch'>, vaultKey, grant)` :296 (internal) | S, `vault_tok`, `gate_epoch`; then `leaseCtxOf(standing)` reads `registered_at` | `proving.ts:221` (`tools.vaultRecord()`, a whole record); `tests/lease.test.ts:31` | Hand-picks five fields into `LeaseGrant.parse` (strip); ctx via `VaultStampButFormat.parse` |
| `leaseRecordOf(lease: Lease)` :285 | - | tests | - |

### 1.6 `wayin.ts`, `gate.ts`, `proving.ts`, `gating.ts`

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `wayinCtxOf(vaultStamp: VaultStamp, header)` wayin.ts:34 (internal) | whole stamp | `wayin.ts:112`; `proving.ts:172,271` (`this.#vaultStamp`, which is the VaultSparse `madeUnder`), `:382` (`madeUnder`) | `VaultStampPicked.parse` (strip) |
| `Wayin.make(vaultStamp: VaultStamp, record, kit)` :105 (**public**: `Wayin` is a value export) and ctors :78,135,167 | whole stamp (frozen copy) | `gate.ts:76-77` (a GatedVaultRecord); `proving.ts:204` (`this.#vaultStamp`); `tests/wayin.test.ts:90` | `WayinRecord.parse`; `VaultStampPicked.parse(vaultStamp)` in ctor |
| `Gate.make(vault: VaultStamp, given)` gate.ts:61 (internal: `Gate` is a type-only export) | `vault`: S, plus `vault_tok` only when `base` is null | `gating.ts:325,359,374,385` (`this.#vault`); `tests/gate.test.ts:19` | hand check of the wayins' vault_tok |
| `Gate` ctor `(vault: VaultStamp, vaultTok, baseEpoch, wayins)` :43 | S | make, of | - |
| `Gate.of(vaultRecord: GatedVaultRecord, kit)` :73 | S, `vault_tok`, `gate_epoch`, `gate` | `gating.ts:353,369,382`; `vault.ts:1332` | none |
| `gate.isHeldBy(vaultRecord: Pick<VaultRecord,'gate_epoch'\|'gate'>)` :85 | those | `vault.ts:1145` | none |
| `Proving` ctor `(vault: Vault, madeUnder: VaultSparse, header, gating, wayinKey)` proving.ts:142 | `madeUnder`: S, `vault_tok`, `gate_epoch`; whole object kept as `#vaultStamp` | `seal` :308,:380 (`vaultSparseOf(tools.vaultRecord())`) | none (`seal` is internal: `Proving` is a type-only export) |
| `PassphraseProving.seal / PasskeyProving.seal(vault: Vault, header, ...)` :305,375 | `vault`: identity for `toolsOf` only | `gating.ts:321-392` | `toolsOf` throws for a non-Vault |
| `proving.isCarriedBy(vaultRecord: Pick<VaultRecord,'gate'>)` :160; `wayinRecordAt(vaultRecord: Pick<VaultRecord,'gate'>, slotlabel)` :411 | `gate` | `vault.ts:1156`; `:262` | none |
| `madeUnderOfLease(record: LeaseRecord): VaultMadeUnder` :495 | S, `vault_tok`, `gate_epoch` | `:226,230` | hand-pick (keeps key material out of `demand`) |
| `demandAfterFailedSeal(vault: Vault, madeUnder: VaultSparse, gating)` :509 | `gate_epoch`; whole to demand | seals | none |
| `VaultPrivateTools.demand(thing: VaultMadeUnder, call, opts)` :51 | see `#demand` | provings, gatings | via `#demand` (unchecked) |
| `RaisedGating` ctor / `raise(gatingkind, call, vault: Vault, tools, onOver)` gating.ts:175,187 | identity | `vault.ts:1257` | - |
| `#strengthUnder(passphrase, thing: Pick<VaultSparse,'vault_tok'\|'gate_epoch'>)` gating.ts:405 | `gate_epoch`; whole to demand | `:319` (`{ vault_tok: held.vault_tok, gate_epoch: held.gate_epoch }`), `:354` (`base`, a Gate) | none |
| `#gatedOf(held: VaultRecord)` gating.ts:429 | `gate` | every chain: `this.#gatedOf(await this.#tools.freshen(this))` | isGated |

### 1.7 `bank.ts`, `vault-opts.ts`

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `ensureVault / tryEnsureVault / reopenVault / closeVault / clearCachedVault / delDamagedVault / vaultOf / bankVaultOf(bag: Pick<VaultScope,'vaultlabel'> & Partial<BankScope>, opts?)` bank.ts:155-374 (**public**) | `vaultlabel`, optional `applabel`/`user_id` (must equal the bank's) | host; `safebyok-react/src/bank-provider.tsx:85,91` (`{ vaultlabel }`) | `#vaultScopeOf` :426 -> `parseVaultBag` -> `vaultBag` (**`.strict()`**, bad_scope; the refusal tells the host to pass `{ vaultlabel: vault.vaultlabel }`) + `#demandSameScope` |
| `bank.demandConsistentWith(thing: Partial<BankScope>)` :179 (**public**) | `applabel?`, `user_id?` | host | `bankBag.parse` (strip: a loose duck already) |
| `#ensureEntry / #bearEntry / #settleBirth / #bear / #bearFrom / #revokeLease(parts: VaultParts, ...)` :474-569 | S from parts; stores, clock, logger | each other | `CX.vaultScope.parse(parts)` at :554, :570 (strip over VaultParts); `Scopepath.vault(parts)` :280, :475 |
| `frozenBankVault(scope: VaultScope, lifecycle)` :662; `refusedBankVault(scope, err)` :668 | S (destructured) | `:490,519,522,525` (`parts`), `:579` (`entry.view`, a BankVault) | none (destructure strips) |
| `draftOf(scope: VaultScope, now)` :682 | S | `:557` (already parsed `scope`) | `CX.vaultScope.parse` again |
| `vaultPartsOf(bank: ParsedBankOpts, scope: VaultScope, opts)` vault-opts.ts:510 (internal) | S destructured | `bank.ts:264,279,339,377` (`this.#parts`, `this.#vaultScopeOf(bag)`) | `checkBankVaultOpts(opts)` |
| `parseMakeBankOpts(opts: MakeBankOpts)` vault-opts.ts:473 | BS + every option | `Bank` ctor | `CX.bankScope.parse(opts)` :477 (strip over MakeBankOpts) |

### 1.8 `vault.ts` (searched, not read through)

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `vault.demandConsistentWith / consistentWith(thing: VaultMadeUnder, opts?)` :385,397 (**public**) | `vault_tok`; S?, `vault_epoch?`, `gate_epoch?`; `instanceof Proving/Gate` | `box.ts:314,322`; `lease.ts:256`; tests 33 sites (Box, Gate, snapshot, `{vault_tok, gate_epoch}`) | `checkedMadeUnder` :2001 -> `vaultMadeUnderShape` (`.loose()`, scope fields typed `str`, not `label`; epochs `num`), **returns `thing` itself** |
| `#demand / #demandAfterWait / #inconsistencyWith(thing: VaultMadeUnder, ...)` :1114,1127,1136 | same | about 25 internal sites: `lease`, `box`, `gate`, `proving`, `stored`, `deleted` (DeletedBox), `{ vault_tok: vaultTok }` | none |
| `static [bear](parts: VaultParts, born: BirthRead, onGone)` :808; ctor :813 | S from parts (`CX.vaultScope.parse(parts)` :822), stamp from `born.vaultRecord` | `bank.ts:564` | strip parse of VaultParts |
| `#wayinsOf(standing: GatedVaultRecord)` :912; `#wayinListOf(standing: VaultRecord\|null)` :925 | `gate` (+ stamp to Wayin.make) | snapshot, takePicture | - |
| `#judgeRead(read: VaultRecord & Listing \| null, record: DeviceRecord \| null)` :1028 | `vault_tok`, `vault_epoch`, `gate_epoch`; `highest_vault_epoch` | `:1007` | - |
| `#takePicture(found: { fresh: VaultRecord, ... })` :1052 | whole | `:1015`, ctor | - |
| `#holdLease(stored: LeaseRecord)` :1468; `#takeUpAtBirth(kept: LeaseRecord\|null)` :1511; `#fitsTakeUp(lease: Lease, ...)` :1534 | via `Lease.make(this, ...)` | proving tools; ctor | Lease.make |
| `#readBox(boxlabel, vaultTok: string, call)` :1625; `#boxUnder(record: BoxRecord, vaultTok: string)` :1653; `#storedBase(boxlabel, vaultTok, ...)` :1707; `#updateBoxListingOf(stored: BoxRecord, vaultTok: string)` :1758 | `vaultTok` | `:1617` (`lease.vault_tok`), `:1668` (`lease.vault_tok`), `:1688` (`box.vault_tok`) | - |
| `#checkRoomFor(boxlabel, base: BoxBase\|null)` :1576 | `revision_tok` | `:1674` | - |
| `#putGate(gate: Gate, call)` :1320; `#gateWriteRefusal(gate, err)` :1347; `#takeOwnWrite(next: GatedVaultRecord)` :1369 | `gate_epoch`, `base_epoch`, `vault_tok`, `record` | gating tools | - |
| `isOlderPicture(inHand: VaultSparse, fresh: VaultSparse)` :1936 | `vault_tok`, both epochs | `:1041` (a read: VaultRecord & Listing), `:1370` | - |
| `fitsLease(standing: Pick<VaultSparse,'vault_tok'\|'gate_epoch'>, lease: Lease)` :1947 | those two | `:1066,1233,1373,1536` | - |
| `standsBeside(kept: unknown, held: Lease)` :1954 | `vault_tok`, `gate_epoch` | `:1067` | `Partial<Record<keyof LeaseSparse, unknown>>` hand read |
| `frozenVaultRecord(record: VaultRecord)` :1925 | whole | many | - |

### 1.9 `vault-record.ts`

| Sig | Reads | Callers | Checks now |
|---|---|---|---|
| `vaultSparseOf(record: VaultRecord): VaultSparse` :216 (internal) | all but `gate` (rest-spread) | `vault.ts:1654,1675`; `proving.ts:308,380` | none |
| `gateSparseOf(gate: GateRecord)` :225 | wayins | `vault.ts:953` | none |
| `isGated<RecordT extends Pick<VaultRecord,'gate'>>(record)` :206 (**public**) | `gate` | many | none |

---

## 2. Convergence candidates

**SAFE** = no behaviour change visible to a host or adapter (internal, or a type-only
narrowing). **RISKY** = changes what a public call accepts or refuses, or bound bytes, or an
invariant that needs confirming. **[pub]** = a public export.

### 2.1 Scope taken whole, hand-picked today

| # | Where | Change | Flag |
|---|---|---|---|
| C1 | `del-damaged-vault.ts:43` `CX.vaultScope.parse({ applabel: opts.applabel, user_id: opts.user_id, vaultlabel: opts.vaultlabel })` | `vaultScopeDuck.parse(opts)` will not do, because opts also holds `vaultDB`/`deviceDB`. Keep the hand-pick, or use a strip `vaultScope` (today's). Note only: a strict duck is wrong here. | SAFE as is |
| C2 | `passphrase-strength.ts:92` hand-picks S into `told` | `const told = CX.vaultScope.parse(scope)` (already frozen and readonly) | SAFE |
| C3 | `lease.ts:297-304` `sealLeaseRecord` builds `LeaseGrant` field by field | `LeaseGrant.parse({ ...?? })` cannot be fed a whole record because `ask_passphrase_at` is computed. Parse `LeaseGrant.omit({ask_passphrase_at})` from `standing`, then add the deadline. Small win. | SAFE |
| C4 | `proving.ts:495` `madeUnderOfLease(record)` hand-picks 5 fields from a LeaseRecord | A `vaultMadeUnder` duck (strip) parse; the hand-pick exists to keep `lease_key` out of `demand`, and a parse does that too | SAFE |
| C5 | `bank.ts:662,668` `frozenBankVault/refusedBankVault(scope: VaultScope)` are handed `parts` (VaultParts) and `entry.view` (BankVault) | Fine as is: they destructure. Could take `CX.vaultScope.parse(x)` for one idiom. | SAFE |
| C6 | `bank.ts:683` `draftOf` re-parses an already parsed scope | Drop the parse (caller at :557 passes the parsed `scope`), or keep it per "a boundary belongs to the export" (it is not exported). | SAFE |
| C7 | `expectations.ts` `tombstoneOf(standing, scope: Pick<VaultTombstone, S>, expected)` **[pub]** | Retype as `scope: VaultScope` (same fields; `VaultTombstone` is the wrong owner for a scope). Type only. Convex passes the rest of its args; fine. | SAFE (type) |

### 2.2 Params derivable from another param or from `this`

| # | Where | Change | Flag |
|---|---|---|---|
| C8 | `vault.ts` `vaultTok` through the box path: `#readBox(boxlabel, vaultTok, call)` :1625, `#boxUnder(record, vaultTok)` :1653, `#storedBase(..., vaultTok, ...)` :1707, `#updateBoxListingOf(stored, vaultTok)` :1758 | Every value is `lease.vault_tok` or `box.vault_tok`, and those equal `this.vault_tok`: `#judgeRead` lets the object go on any `vault_tok` change (:1035), and `fitsLease` gates take-up on it. Drop the param and read `this.vault_tok`. The demands that compare `{ vault_tok: vaultTok }` then compare `this.vault_tok` with itself, which matters only if the invariant is broken. **Confirm the invariant first**; the fixup preplan already lists this. | SAFE if the invariant holds; RISKY otherwise (a demand loses its teeth) |
| C9 | `vault.ts:1654` `Box.make(this, record, { ...vaultSparseOf(this.#vaultRecord), vault_tok: vaultTok })`, and `box.ts` reading S from `madeUnder` in `make` but from `vault` in `trySeal` (:297) | Converge: `Box.make` takes S and `vault_tok` from `vault` (as `trySeal` does), and `madeUnder` shrinks to `SealedUnder` (`{ vault_epoch, gate_epoch }`), matching `seal`. **[pub]** `Box.make`'s `madeUnder` contract narrows; a test slice's `madeUnder` (a VaultSparse) still passes a strip pick. | RISKY (public signature) |
| C10 | `proving.ts` `#unwrap(wrapped, visible, usage)` :265: all three callers pass `this.#currentWrap()` and `this.header` | Drop two params | SAFE (not scope-related; listed in the preplan) |
| C11 | `gating.ts` `#gatedOf(held)`: every call is `this.#gatedOf(await this.#tools.freshen(this))` | Fold the freshen in: `await this.#freshGated()` | SAFE |
| C12 | `vault-opts.ts:510` `vaultPartsOf(bank, scope, opts)`: `bank` is always `this.#parts` | A Bank method, or leave it (it keeps vault-opts free of Bank) | SAFE, low value |
| C13 | `gating.ts:319` `#strengthUnder(passphrase, { vault_tok: held.vault_tok, gate_epoch: held.gate_epoch })` | Pass `held` (a VaultRecord is a VaultMadeUnder); the other caller passes a Gate | SAFE |
| C14 | `vault.ts:1291` `delVault(this.#scope, { vault_tok: doomed.vault_tok, gate_epoch: doomed.gate_epoch })` and `:1326` `putVaultRecord(drafted, { vault_tok: gate.vault_tok, gate_epoch: gate.base_epoch })` | The first could pass `doomed` (VaultDelExpectation is strip). The second cannot: `base_epoch` is not `gate_epoch`. Hand-building the expectation is clearer; leave both. | leave |

### 2.3 Narrow `Vault` / `VaultStamp` / `VaultRecord` params to what is read

| # | Where | Change | Flag |
|---|---|---|---|
| C15 | `Gate.make(vault: VaultStamp, ...)` / ctor: reads S and `vault_tok` only | `Pick<VaultStamp, S \| 'vault_tok'>` or `VaultScope & Pick<VaultStamp,'vault_tok'>` | SAFE (internal, type) |
| C16 | `Box.make/seal(vault: ConsistencyWith<VaultStamp>)`: seal reads S and `vault_tok`; make reads nothing. Both need the Vault identity for `heldLeaseOf`. | `ConsistencyWith<Pick<VaultStamp, S \| 'vault_tok'>>`. `registered_at` and `format` are not read here; `boxCtxOf` in the lease reads them from the lease's own `#vault`. | SAFE (type widening on a [pub] param) |
| C17 | `Lease.make(vault: ConsistencyWith<VaultStamp & Pick<Vault,'tryLock'>>)`: uses the whole stamp via `leaseCtxOf(this.#vault)`, plus S | keep | - |
| C18 | `isOlderPicture(inHand: VaultSparse, fresh: VaultSparse)`: reads `vault_tok` and both epochs | `Pick<VaultSparse,'vault_tok'\|'vault_epoch'\|'gate_epoch'>` | SAFE (type) |
| C19 | `gating.ts:405` `Pick<VaultSparse,'vault_tok'\|'gate_epoch'>` (one-off) | `VaultMadeUnder` is the named shape for "something demand judges" | SAFE (type) |
| C20 | `vault-db.ts` `checkWrittenVaultRecord(raw, written: VaultRecord, scope)`: `scope` is `heldScope(outgoing)`, a function of `written` | Drop `scope`; compare against `written`'s S | SAFE |
| C21 | `BoxBase` (`box.ts:160`) is a one-off `{ revision_tok: string\|null, registered_at? }` | Nearest named shape: `Pick<BoxSparse,'registered_at'>`-partial plus a nullable `revision_tok`. No existing shape has a nullable `revision_tok` plus `registered_at`. Keep `BoxBase` **[pub type]**. | leave |
| C22 | `VaultMadeUnder` (`vault-record.ts:143`) vs `vaultMadeUnderShape` (`vault.ts:1989`) | The type and its validator live apart, and the validator types the scope fields as `str`, not `label`. Move the validator beside the type and make it `Z.infer`'s source. **RISKY**: `label` would refuse a thing whose applabel is not a label, which `demandConsistentWith` accepts today **[pub]**. | RISKY |

### 2.4 Validators whose strictness the duck contract would flip (public)

| # | Validator | Today | Under the duck contract | Flag |
|---|---|---|---|---|
| D1 | `CX.vaultScope` / `VaultScope` / `Validators.vaultScope` **[pub]** | strip: anything carrying S passes | Strict over a known list: refuses `VaultParts`, `MakeBankOpts`-like bags, test slices, GraphQL args and any host object with extra fields. Its doc block promises "A scope carrying more fields passes". | RISKY |
| D2 | `CX.bankScope` **[pub]** | strip; `vault-opts.ts:477` feeds it the whole `MakeBankOpts` | as D1 | RISKY |
| D3 | `vaultBag` (bank verbs) **[pub]** | strict, `vaultlabel` + optional BS; refuses a Vault object or BankVault and says to pass `{ vaultlabel: vault.vaultlabel }` | A duck would *accept* a Vault object, BankVault or snapshot: a loosening, and the refusal text changes | RISKY (needs a ruling) |
| D4 | `bankBag` (`bank.demandConsistentWith`) **[pub]** | strip, all optional | Strict refuses things it accepts today | RISKY |
| D5 | `VaultStampPicked`, `VaultStampButFormat`, `LeaseStampPicked`, `MadeUnderShape`, `SealedUnderShape`, `StoredVaultTok`, expectations (all strip picks) | strip | Strict would refuse test slices (functions as own fields) reaching `leaseCtxOf(this.#vault)` and `boxCtxOf(this.#vault)`. **Keep these strip**, or make the slices plain stamps. | RISKY for tests |

---

## 3. Ducks needed

Fields read across section 1 cluster into five ducks. For each: what it hands back, what it must
tolerate, and the collisions it must resolve. "Tolerate" lists each caller shape's own enumerable
fields that are not output fields. Getters and non-enumerables never need tolerating (section 4).

### 3.1 `vaultScopeDuck` (highest traffic)

- **Output**: `{ applabel, user_id, vaultlabel }`, frozen.
- **Call sites served**: every `Scopepath.vault/lease/device/withinVault*`, `deviceRecordOf`,
  `heldScope`, `draftOf`, `guardStrengthChecker`, `Vault` ctor, `bank.#bearFrom`/`#revokeLease`,
  `sameScope` (if it parses), `Lease.make`'s scope check. About 30 src sites; about 100 test sites
  pass `TH.scopeOf(...)` (plain S).
- **Must tolerate** (union of shapes actually passed):

  | Shape passed | Extra own fields |
  |---|---|
  | VaultRecord / VaultDraft (`local-vault-db.ts:90,100`; `vault-db.ts:331`) | `format`, `vault_tok`, `registered_at`, `vault_epoch`, `gate_epoch`, `gate` |
  | VaultSparse / VaultStamp | subset of above |
  | Vault object (via `Lease.make` sameScope, `leaseCtxOf`) | `format`, `vault_tok`, `registered_at` |
  | VaultSnapshot | `format`, `vault_tok`, `gate` (**GateSparse**), `boxes`, `damagedBoxes`, `capacity`, `ask_passphrase_at` (number\|null), `freshness`, `trouble` |
  | LeaseRecord (`device-db.ts:79`, `idb.ts:101`) | `format` (lease), `vault_tok`, `gate_epoch` (positive), `lease_key` (CryptoKey), `vault_key_lease_wrapped` |
  | LeaseStamp / Lease object | `format`, `vault_tok`, `gate_epoch`, `ask_passphrase_at` |
  | DeviceRecord (`device-db.ts:98,128`, `idb.ts:128`) | `format` (device), `device_id`, `highest_vault_epoch` |
  | VaultTombstone (`vault-db.ts:502` sameScope) | `format` (tombstone), `vault_epoch` (positive) |
  | Box object / BoxStamp + scope | `vault_tok`, `vault_epoch`, `gate_epoch`, `format` (box), `boxlabel`, `revision_tok`, `whisper_codec`, `whisper_schema_version`, `sidecar`, `registered_at` (box's), `written_at` |
  | Gate object | `vault_tok`, `gate_epoch`, `base_epoch`, `passphrase` (Wayin), `passkey` (Wayin\|null) |
  | Proving | `slotlabel` (its scope fields are non-enumerable and still read) |
  | BankVault | `lifecycle`, `err?` |
  | **Not tolerable without breaking the "unknown refuses" rule** | `VaultParts` (`bank.ts:280,475,554,570`; `vault.ts:822`), `MakeBankOpts`, test slices. These callers must pass a parsed scope, or use a strip variant. |

- **Collisions it must settle** (one schema per name): `format` (one literal per record; see
  3.4), `gate` (GateRecord vs GateSparse), `gate_epoch` (uint vs positive), `vault_epoch` (uint vs
  positive), `ask_passphrase_at` (epochMillis vs nullable), `registered_at` (harmless here: not
  output), `passphrase`/`passkey` (Wayin objects on a Gate; never top-level elsewhere).
  Recommendation: validate the *scope* fields strictly and type the tolerated fields loosely where
  they collide (`format: str`, `gate: unk`, epochs `int.nonnegative()`), or keep the duck strip.
  Checking each tolerated field against its owner's schema needs a union per collision, and a
  union mis-types the field the moment one shape changes.

### 3.2 `boxscopeDuck`

- **Output**: S + `boxlabel`.
- **Sites**: `Scopepath.box`, `heldBoxlabel` (`{...scope, boxlabel}`), `vault.#checkedBoxlabel`
  (`{...this.#scope, boxlabel}`), `sealBoxlabel`.
- **Tolerates**: the Box object and a BoxStamp/BoxRecord plus scope (`format` box, `revision_tok`
  (string; nullable on BoxDamaged/expectations), `whisper_codec`, `whisper_schema_version`,
  `sidecar`, `registered_at`, `written_at`, `vault_tok`, `vault_epoch`, `gate_epoch`,
  `box_key_wrapped`, `whisper_ciphered`). Today every caller builds `{...scope, boxlabel}` by
  hand, so the duck is mainly for symmetry.
- **Collisions**: `revision_tok` (string vs nullable), `format`, `registered_at`.

### 3.3 `bankScopeDuck`

- **Output**: `{ applabel, user_id }`.
- **Sites**: `Scopepath.bank` (no src caller), `parseMakeBankOpts` (MakeBankOpts: **not
  tolerable**), `bank.demandConsistentWith` (partial), every vault-scope duck's prefix.
- **Tolerates**: a Bank object (getters only; no own enumerables, so passes), BankSnapshot
  (`lifecycle`, `vaults`, `err?`), BankVault, everything 3.1 tolerates plus `vaultlabel`.
- **Collisions**: `lifecycle` (BankVault `'starting'|'ready'|'refused'` vs BankSnapshot adds
  `'made'`).

### 3.4 `vaultStampDuck` / `vaultSparseDuck` / `vaultMadeUnderDuck`

- **Stamp output**: `format, S, vault_tok, registered_at` (and the `ButFormat` variant).
  Sites: `wayinCtxOf`, `Wayin` ctor, `leaseCtxOf`, `boxCtxOf`, `sealLeaseRecord`; fed by a Vault
  object, a VaultRecord (with gate), a VaultSparse used as a stamp (Proving's `madeUnder`), and
  test slices.
  - **Must refuse a Box, a box record and a wayin**: their `registered_at` is not the vault's.
    A tolerated `boxlabel`/`written_at` would let a Box through (finding 2). The safest rule is a
    stamp duck that tolerates only vault-shaped fields (`vault_epoch`, `gate_epoch`, `gate`) and
    nothing a box or wayin carries.
  - `format`: for the `ButFormat` variant, accept any vault format literal (it is omitted from
    the ctx so that a format bump leaves boxes open). An older vault format literal then needs a
    known-formats list or a plain `str`.
- **Sparse output**: `format, S, vault_tok, registered_at, vault_epoch, gate_epoch`. Sites:
  `Box.make` `madeUnder`, `MadeUnderShape`, `SealedUnderShape`, the Proving ctor `madeUnder`,
  `isOlderPicture`. Fed by `vaultSparseOf(record)`, records with gate, slices' `madeUnder`.
- **MadeUnder output** (`demandConsistentWith`): `vault_tok` required; S, `vault_epoch`,
  `gate_epoch` optional. It must **not** replace the thing (`instanceof` at `vault.ts:1144-1145`).
  It must tolerate Box, Lease, Gate (`base_epoch`, `passphrase`, `passkey`), Proving
  (`slotlabel`), snapshot, DeletedBox (`boxlabel`, `outcome`), VaultRecord (`gate`, `format`,
  `registered_at`), and `{ vault_tok }`. That is nearly every shape: a strict duck here would
  carry the largest tolerated list and gain the least.

### 3.5 `leaseStampDuck`

- **Output**: LeaseStamp: `format` (lease), S, `vault_tok`, `gate_epoch` (positive),
  `ask_passphrase_at`. Sites: `leaseCtxOf` (`LeaseStampPicked`, fed `this.#record` or the fresh
  stamp), `standsBeside` (hand read), `fitsLease` (Lease object), `madeUnderOfLease`.
- **Tolerates**: LeaseRecord's `lease_key`, `vault_key_lease_wrapped`, and nothing else in
  practice.
- **Collision**: `gate_epoch` positive here vs uint on the vault. A lease-stamp duck fed a vault
  record at `gate_epoch` 0 must refuse, and does, since `int.positive()` refuses 0.

### 3.6 Every field-name collision (one schema per name)

| Field | Meanings / schemas |
|---|---|
| `format` | `lit('safebyok-vault-v6')` VaultRecord/Sparse/Stamp/Vault/snapshot; `lit('safebyok-box-v8')` BoxRecord/Sparse/Stamp/Box; `lit('safebyok-lease-v1')` LeaseRecord/Stamp/Lease; `lit('safebyok-device-v1')` DeviceRecord; `lit('safebyok-tombstone-v1')` VaultTombstone; older vault/box literals in `vault-db.ts:792,993` |
| `registered_at` | epochMillis everywhere, but **three meanings**: vault made (VaultRecord, Vault, stamp); box first stored (BoxRecord, Box, BoxBase optional); wayin sealed (wayin records, Wayin objects) |
| `gate_epoch` | `uint` VaultRecord/Sparse; `int.positive()` LeaseRecord/Stamp/Lease; `uint.nullable()` VaultDelExpectation; `uint` VaultRecordExpectation; `num.optional()` vaultMadeUnderShape; Box/Proving: the vault's at read or seal (number); Gate: its own epoch (= base+1) |
| `vault_epoch` | `uint` VaultRecord; `int.positive()` VaultTombstone; Box: the vault's at read (number); `num.optional()` vaultMadeUnderShape. DeviceRecord says `highest_vault_epoch`, not a collision |
| `gate` | `GateRecord.nullable()` VaultRecord; `GateSparse \| null` VaultSnapshot. Strict wayins mean neither parses as the other |
| `passphrase`, `passkey` | wayin *records* inside `gate` (GateRecord/GateSparse); Wayin *objects* as top-level fields of a Gate object |
| `revision_tok` | `str.min(1)` BoxRecord/Sparse/Box; `.nullable()` BoxDamaged, BoxExpectation, BoxDelExpectation, BaseShape |
| `ask_passphrase_at` | epochMillis LeaseRecord/Stamp/Lease; `number \| null` VaultSnapshot |
| `lifecycle` | BankVault `starting\|ready\|refused`; BankSnapshot adds `made` |
| `boxes` | `BoxSparse[]` on snapshot and read results; `{ used, max }` only nested in `capacity` (no top-level clash) |
| `outcome` | DeletedBox `deleted\|deleted_other`; BoxDeletion adds `absent` |
| `vault` | VaultReadResponse: the raw stored record (`unknown`); Proving: the Vault object (non-enumerable) |
| `logger`, `subscribe` | Vault getters (non-enumerable, harmless); VaultParts/MakeBankOpts own fields |
| consistent across shapes | `vault_tok` (`str.min(1)`), `applabel`/`vaultlabel`/`boxlabel` (`label`, but `str` in vaultMadeUnderShape), `user_id`, `device_id` (`str.min(1)`, same meaning in DeviceRecord and wayins), `sidecar`, `written_at` |

---

## 4. Getter hazard: how zod 4.6.7 reads a class instance

Source: `node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/schemas.js`.

- **Declared keys are read with `input[key]`** (interpreted path :1072, JIT path :1097), and
  presence is `key in input` (:894, :1124). So a prototype getter **is read** for a declared
  key, a non-enumerable own property (Proving's `decorate`d scope fields) **is read**, and both
  count as present. `#private` fields are unreachable.
- **Unknown-key detection (`.strict()`) is `for (const key in input)`** (`handleCatchall` :960):
  own **and inherited** *enumerable* string keys. Class getters (non-enumerable on the
  prototype), non-enumerable own properties and symbols are never seen. An enumerable property
  inherited through `Object.create(proto)` **is** flagged.
- **The input must pass `isObject`**: `typeof === 'object'`, not null, not an array. A class
  instance passes. A function does not (so a StrengthChecker, say, never parses as an object).
- **A throwing getter escapes**: a declared key whose getter throws makes `safeParse` throw raw.
  The throw is neither a ZodError nor a VaultError (`Validator`'s `refusing` calls `safeParse`,
  so it escapes `parse` too). A getter never declared is never read.
- **Known-but-optional fields stay in the output** when present. A duck needs a final projection
  (`.pipe(scope.strip())` or `.transform(pick)`), or callers must only destructure. A piped or
  transformed schema can no longer be `.pick`/`.extend`ed: build ducks last, from the shapes.
- **Refusal wording**: `Phrases.unknownFields(count, fieldnamesOf(issue.inst))` lists every field
  the object takes, so a duck with about 25 tolerated fields would print all 25.

Empirical check (`/tmp/claude-1000/-workspace-byok/46a39e5f-5b55-4ca7-9087-e25c9fb3f72e/scratchpad/zod-getters.mjs`,
a frozen class with own S fields, prototype getters, a `#private`, a non-enumerable own field):

| Case | Result |
|---|---|
| strip / strict S <- instance | OK, `{applabel,user_id,vaultlabel}` |
| strict S + `snapshot` (proto getter) | OK, getter value read |
| strict S + `hidden` (non-enumerable own) | OK, read |
| `.readonly()` output | frozen |
| strict S <- `{...instance}` | OK (own enumerables only; a declared getter key would be missing) |
| strict S <- plain with extra `vault_tok` | FAIL `unrecognized_keys [vault_tok]` |
| strict S <- `Object.create({inherited:1})` | FAIL `unrecognized_keys [inherited]` |
| strict duck, known optional `vault_tok: 7` | FAIL `invalid_type vault_tok` (malformed known field refuses even though unused) |
| strict duck, known optional present | OK, **kept in output** |
| declared key whose getter throws | **throws out of safeParse** |
| `z.config({ jitless: true })` | same results |
| strict duck `.pipe(scope.strip())` / `.transform(pick)` | OK, projected to S |

**Verdict**: a Vault object (own enumerables = its stamp) parses directly through a strict duck
that knows `format, vault_tok, registered_at`. So does a Box, Lease or Gate whose own fields are
all known, a Proving (only `slotlabel` enumerable), and a Bank object (no own enumerables; scope
read through getters). The duck must not declare getter names (`stamp`, `snapshot`, `logger`,
`subscribe`, `getSnapshot`, `record`, `baseRevisionTok`, `wayinCtx`), which would read them and
could throw.
