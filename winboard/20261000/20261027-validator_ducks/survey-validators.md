# Survey: validators, their types, and who imports them

Read-only survey of `packages/safebyok/src` (and `packages/*/src` for importers) at the head of
`20261027-validator_ducks`, to plan gathering the validators into files by concern. Nothing in
`src/` was changed. Line numbers are as of this survey. Companion surveys in this folder:
`survey-signatures.md` (ducks, the getter hazard) and `survey-catches.md` (catch sites).

How importers were found: every `import`/`export ... from` line in core `src/` (single-line in the
core), namespace uses (`CX.foo`, `Validators.foo`), and a word grep of the other packages' `src/`
with comment lines dropped. "(t)" means a type-only import, which `verbatimModuleSyntax` erases, so
it is no runtime edge. "ns" = re-exported by `src/validators.ts` (the `Validators` namespace);
"idx" = exported by name from `src/index.ts`. "tests" = how many test files name it.

Runtime import graph today (value imports only): **no cycles** in core `src/` (Tarjan over the
value-import graph; script in the session scratchpad).

---

## 0. Findings that shape the plan

1. **Tree-shaking is per module and per binding.** The build is `unbundle: true` and the package
   is `sideEffects: false` (`tsdown.config.ts`), so a host's bundler drops a module whose bindings
   go unused, and keeps a reached module whole, every top-level `Validator` call in it included.
   So a group's file should be reached only by the code that needs it. Four entries matter:
   `index` (everything), `safebyok/idb` (`idb.ts`), `safebyok/browser` (`browser.ts`) and
   `safebyok/utils` (`utils.ts`), with size budgets in `.size-limit.json`.
2. **`types/types.ts` is a hub that the `idb` entry reaches**, through `idb.ts` and
   `device-db.ts`, for `LeaseRecord` and `DeviceRecord`. Reaching it also keeps `Whisper`,
   `whisperBag`, `Sidecar` and `Capacity`, which no device code uses, plus all of
   `type-aliases.ts` and `crypto.ts`'s `Ciphered`. Splitting device records from whisper and box
   shapes should trim `idbDeviceDB` (budget 32 kB) and `browserOpts` (37 kB). This is untested:
   measure with `pnpm size`.
3. **`crypto.ts` holds a validator (`Ciphered`, `crypto.ts:13`)**, so `safebyok/utils`'s
   `toB64`/`fromB64` reach `checks/validator.ts` and Zod. `safebyok-react/src/passkey.ts` imports
   exactly those two. Moving `Ciphered` to the fields file leaves `crypto.ts` free of Zod.
4. **`checks/key-deriver-spec-checks.ts` must stay its own module.** `argon2idWebV1Deriver` has
   an 8.5 kB budget with no Zod: `key-deriver.ts` → `key-deriver-spec.ts` reaches the checks
   module only through `parseKeyDeriverSpec`'s binding.
5. **Other packages import validators' types only**, with two exceptions:
   `Validators.idbOpts` and `Validator` (`safebyok-indexeddb/src/idb-opts.ts:1,12,16`). So moving
   files changes no other package, as long as `index.ts` and `validators.ts` keep their names.
   Renames are a contract change: a changeset, with no shims before 1.0.
6. **Parallel type + validator pairs are common** (§3.3): 14 hand-written types sit beside a
   validator that checks the same thing. Three of them duplicate a literal or field list
   outright: `LeaseFormat` (`lease.ts:40`) against `lit('safebyok-lease-v1')`
   (`types/types.ts:138`); `PasskeyAnswer` (`types/types.ts:125`) against `passkeyAnswerShape`
   (`proving.ts:345`); and `VaultMadeUnder` (`vault-record.ts:172`) against `vaultMadeUnderShape`
   (`vault.ts:1989`).
7. **STYLE contradicts itself on scope validators' case.** *Naming* says a shape's validator
   takes its type's name, and VOCABULARY lists scope as a shape (`VaultScope`). *Validation*
   names the scope validators `bankScope`, `vaultScope` and `boxscope`, and they exist under
   those names. `types/types.ts:56` then adds `VaultScope = CX.vaultScope`, so one validator has
   two names, both in `Validators`. This needs a Coach ruling (§5).

---

## 1. Inventory

### 1.1 `Validator` calls (34 in the core, 1 in `safebyok-indexeddb`)

| # | file:line | kind | names returned |
|---|---|---|---|
| 1 | `checks/core-checks.ts:41` | bad_scope | bankScope, vaultScope, boxscope, bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath |
| 2 | `checks/key-deriver-spec-checks.ts:19` | bad_option | keyDeriverSpec |
| 3 | `types/type-aliases.ts:45` | bad_record | vault_tok, revision_tok, salt_b64, prf_salt_b64, whisper_ciphered, box_key_wrapped, vault_key_wayin_wrapped, vault_key_lease_wrapped |
| 4 | `types/type-aliases.ts:89` | bad_option | passphraseCleartext |
| 5 | `types/types.ts:38` | bad_whisper | Whisper, whisperBag |
| 6 | `types/types.ts:70` | bad_option | Sidecar |
| 7 | `types/types.ts:81` | bad_record | Capacity |
| 8 | `types/types.ts:136` | bad_record | LeaseRecord |
| 9 | `types/types.ts:171` | bad_record | DeviceRecord |
| 10 | `crypto.ts:13` | bad_record | Ciphered |
| 11 | `vault-record.ts:27` | bad_record | PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GateRecord, VaultRecord, VaultSparse, VaultStamp, VaultStampPicked, VaultStampButFormat, VaultTombstone, GateSparse, PassphraseWayinSparse, PasskeyWayinSparse |
| 12 | `vault-record.ts:184` | bad_record | VaultDraft |
| 13 | `box.ts:35` | bad_record | BoxRecord |
| 14 | `box.ts:68` | bad_record | BoxSparse |
| 15 | `box.ts:91` | bad_record | BoxDamaged |
| 16 | `box.ts:102` | bad_record | BoxStamp |
| 17 | `box.ts:127` | bad_scope | sealBoxlabel |
| 18 | `box.ts:397` | bad_option | BaseShape, MadeUnderShape, MadeShape (and the unexported SealedUnderShape) |
| 19 | `lease.ts:30` | bad_record | LeaseStamp |
| 20 | `lease.ts:43` | bad_record | LeaseGrant, VisibleShape, CipheredShape, LeaseStampPicked |
| 21 | `vault-db.ts:78` | bad_record | VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion |
| 22 | `vault-db.ts:767` | bad_record | ListedBox, StoredRevision, ReadAnswer, ListingAnswer |
| 23 | `vault-db.ts:1032` | bad_record | StoredVaultTok |
| 24 | `vault-opts.ts:143` | bad_option | makeBankOpts, bankVaultOpts |
| 25 | `vault-opts.ts:204` | bad_option | vaultDBShape, deviceDBShape, maxWhisperBytes, maxBoxes, declaredBytes, declaredBoxes, leaseHoursAsMillis, staleMinutesAsMillis, renewMinutesAsMillis, clockShape, clockReading, keyDeriverShape |
| 26 | `bank.ts:637` | bad_scope | vaultBag, bankBag |
| 27 | `passphrase-strength.ts:68` | bad_option | strengthChecker, passphraseVerdict |
| 28 | `logger.ts:42` | bad_option | loggerShape |
| 29 | `local-vault-db.ts:57` | bad_option | localVaultDBOptsShape |
| 30 | `proving.ts:345` | bad_option | passkeyAnswerShape |
| 31 | `mask.ts:23` | bad_option | maskOpts |
| 32 | `idb-opts.ts:14` | bad_option | idbOpts |
| 33 | `vault.ts:1989` | bad_option | vaultMadeUnderShape |
| 34 | `options.ts:19` | bad_option | optionsBag: one call per `optionsCheck(...)`, made at module level in `box.ts:124` (checkSealProps), `vault.ts:1977` (checkHelloOpts), `vault.ts:1980` (checkEnsureUnlockedOpts), `vault.ts:1986` (checkDemandOpts) and `vault.ts:2010` (checkPutBoxProps) |
| x | `safebyok-indexeddb/src/idb-opts.ts:15` | bad_option | idbVaultDBOpts (private; `Validators.idbOpts.extend({ logger })`) |

Plain Zod, outside any `Validator` call: `checks/primitives.ts:88` `label`, `:109` `user_id`,
`:125` `EpochMillis` (the kit's dependencies, so they cannot move into a file that imports
`validator.ts`). Also `types/types.ts:39-43`, the internal `whisperJson` and `whisperMembers`
(`record` from zod), which are made inside call 5.

### 1.2 Each validator: what it checks, its type, and who imports it

Importers are core `src/` files that import it (value, unless marked (t)). The defining file is
left out.

**Scopes and scopepaths** (`checks/core-checks.ts`, call 1)

| name | checks | Z.infer type | importers |
|---|---|---|---|
| bankScope | applabel + user_id, strip, frozen | BankScope (`:56`) | via `CX.`: scopepath, vault-opts; ns; tests 4 |
| vaultScope | + vaultlabel, strip, frozen | VaultScope (`:58`) | via `CX.`: bank, del-damaged-vault, device-db, scopepath, types/types (alias), vault-db, vault; ns; tests 5 |
| boxscope | + boxlabel, strip, frozen | Boxscope (`:60`) | via `CX.`: scopepath, vault-db, vault; ns; tests 4 |
| bankScopepath, vaultScopepath, leaseScopepath, deviceScopepath, boxScopepath | `^`-joined path split into a kind + names tuple | Z.input types in `scopepath.ts:12-20` (BankScopepath, ...) | scopepath only; ns; tests 1-7 |
| *ScopepathFieldnameVals | (consts) | Bank/Vault/BoxScopepathFieldname | bank (`CX.BankScopepathFieldnameVals`, `bank.ts:434`) |

**Record fields** (`types/type-aliases.ts`, calls 3 and 4; `crypto.ts`, call 10)

| name | checks | type | importers |
|---|---|---|---|
| vault_tok | non-empty text | VaultTok (idx t) | types/types, vault-record, box, vault; ns; other packages use the field name only |
| revision_tok | non-empty text | RevisionTok (idx t) | box; ns |
| salt_b64 | non-empty, brand PassphraseSalt | PassphraseSalt | vault-record, proving; ns |
| prf_salt_b64 | non-empty, brand PrfSalt | PrfSalt (wayin (t)) | vault-record, proving; ns |
| whisper_ciphered | Ciphered, brand | WhisperCiphered | box, lease; ns |
| box_key_wrapped | Ciphered, brand | BoxKeyWrapped | box, lease; ns |
| vault_key_wayin_wrapped | Ciphered, brand | VaultKeyWayinWrapped | vault-record, proving; ns |
| vault_key_lease_wrapped | Ciphered, brand | VaultKeyLeaseWrapped | types/types, lease; ns |
| passphraseCleartext | any string, brand | PassphraseCleartext | gating, proving; not ns (tests' `InPackage`) |
| Ciphered | `{cipher_iv_b64, ciphertext_b64}` strict | Ciphered (`crypto.ts:19`) | type-aliases (value); ns; idx; convex mirrors it (`safebyok-convex/src/component/validators.ts`) |

**Whisper, sidecar, capacity, device records** (`types/types.ts`, calls 5-9)

| name | checks | type | importers |
|---|---|---|---|
| Whisper | JSON value, not bare null, copied | Whisper, **hand-written** (`:19`; the validator is annotated `Z.ZodType<Whisper>`, as it is recursive) | box, vault (imports the value but uses it as a type only); ns; idx; tests 5 |
| whisperBag | plain JSON object, copied | none | types/types (Sidecar); tests' `InPackage` |
| Sidecar | = whisperBag, as bad_option | Sidecar (`:71`) | box, vault (value import, type use); ns; idx |
| Capacity | `{boxes,bytes}` of `{used,max}`, max Infinity→MAX_SAFE | Capacity (`:88`) | vault-db (value); vault, errors, refusals (t); ns; convex (t) |
| LeaseRecord | strict lease record incl. CryptoKey | LeaseRecord (`:153`) | lease, device-db, idb (value); vault, proving (t); ns; idx |
| DeviceRecord | strict, readonly | DeviceRecord (`:183`) | device-db, idb (value); vault (t); ns; idx |

**Vault record and its shapes** (`vault-record.ts`, calls 11 and 12)

| name | checks | type | importers |
|---|---|---|---|
| PassphraseWayinRecord | strict wayin | `:107` | proving (value; used as type), wayin (t); ns; idx |
| PasskeyWayinRecord | strict wayin | `:113` | proving, wayin (t); ns; idx |
| WayinRecord | discriminated on wayinkind | `:116` | wayin (value, `wayin.ts:106`); ns; idx |
| GateRecord | `{passphrase, passkey/null}` strict | `:124` | gate, vault (t); ns; idx; postgres (t) |
| VaultRecord | strict + refine gate_epoch 0 ⇔ gate null | `:138`, DamagedVaultRecord `:144` (Z.input) | vault-db (value); local-vault-db, errors, gate, expectations, vault, gating, proving, types/types (t); ns; idx; every adapter (t) |
| VaultSparse | record − gate | `:150` | box, lease, vault-db (value); vault, gating, proving (t); ns; idx |
| VaultStamp | format, scope, vault_tok, registered_at (strict) | `:156` | wayin, box (value import, type use); lease, gate, vault, proving (t); ns; idx |
| VaultStampPicked | VaultStamp.strip() | none | wayin (`wayin.ts:35,81`); tests' `InPackage` |
| VaultStampButFormat | stamp − format, strip | `:164` | lease (`lease.ts:57,69`); tests' `InPackage` |
| VaultTombstone | scope + format + vault_epoch>0, strict | `:195` | vault-db (value); expectations (t); ns; idx; convex/graphql/postgres (t) |
| PassphraseWayinSparse | wayin − deriver label, salt, wrap | `:198` | types/types (t); ns; idx |
| PasskeyWayinSparse | wayin − wrap | `:201` | types/types (t); ns; idx; react (t) |
| GateSparse | gate of sparse wayins | `:204` | vault (t); ns; idx; react (t) |
| VaultDraft | VaultSparse + gate_epoch 0 + gate null | **hand-written** `:181` (`VaultRecord & {gate: null, gate_epoch: 0}`) | vault-db (value); local-vault-db, expectations, bank (t); ns; idx (t); 5 adapters (t) |

**Box** (`box.ts`, calls 13-18)

| name | checks | type | importers |
|---|---|---|---|
| BoxRecord | strict box record | `:59`, DamagedBoxRecord `:74` | local-vault-db, lease, expectations, vault-db (value); errors, vault (t); ns; idx; every adapter (t) |
| BoxSparse | record − 2 ciphered | `:71` | lease (value); vault, vault-db (t); ns; idx; convex (t) |
| BoxDamaged | `{boxlabel, revision_tok/null, damage}` strict | `:94` | vault-db (value); errors, vault, refusals (t); ns; idx; graphql (t) |
| BoxStamp | BoxSparse + vault_tok | `:105` | lease (`lease.ts:68`); ns; idx |
| sealBoxlabel | `obj({boxlabel})` as bad_scope | none | box only (`box.ts:269`); tests' `InPackage` |
| BaseShape | `{revision_tok/null, registered_at?}` loose, nullable | none; the parallel **hand-written** BoxBase is at `:113` | box only (`:415`) |
| MadeUnderShape | VaultSparse.pick(scope, tok, epochs).strip | MadeUnder (`:408`, local) | box only (`:424`) |
| MadeShape | `{madeUnder: SealedUnder, now}` | none; written inline 3× (`:242`, `:245`, `:430`) | box only (`:431`) |

**Lease** (`lease.ts`, calls 19 and 20)

| name | checks | type | importers |
|---|---|---|---|
| LeaseStamp | LeaseRecord − key material | `:31`; LeaseSparse = LeaseStamp `:34` | lease; ns; idx |
| LeaseGrant | LeaseRecord.pick(scope, tok, gate_epoch, ask_at) | none | lease only (`:297`) |
| VisibleShape | BoxSparse.strip() | none (BoxSparse) | lease only (`:316`) |
| CipheredShape | `{box_key_wrapped, whisper_ciphered}` | none; the parallel **hand-written** BoxCiphered is at `:37` (`Pick<BoxRecord, ...>`) | lease only (`:325`); BoxCiphered idx (t) |
| LeaseStampPicked | LeaseStamp.strip() | none | lease only (`:57`) |

**VaultDB protocol** (`vault-db.ts`, calls 21-23)

| name | checks | type | importers |
|---|---|---|---|
| VaultRecordExpectation | VaultSparse.pick(tok, gate_epoch).strip | `:23` | vault-db; local-vault-db, expectations (t); ns; idx; 4 adapters (t) |
| BoxGetExpectation | pick(tok).strip | `:32` | same pattern |
| BoxExpectation | + revision_tok/null | `:41` | + vault (t) |
| VaultDelExpectation | + gate_epoch uint/null | `:51` | same pattern |
| BoxDelExpectation | + revision_tok/null | `:61` | same pattern |
| BoxDeletion | `{outcome: oneof(3)}` | `:72` | expectations (t); ns; idx; adapters (t) |
| ListedBox | BoxRecord.partial(ciphered) | none | vault-db only (`:779`) |
| StoredRevision | `{revision_tok}` | none | vault-db only (`:787`) |
| ReadAnswer | `{vault: unk}` loose | none; the hand-written VaultReadResponse at `:113` is its counterpart | vault-db only |
| ListingAnswer | `{boxes: [{boxlabel}], damagedBoxes: BoxDamaged[]}` loose | none | vault-db only (`:760`) |
| StoredVaultTok | VaultSparse.pick(tok).strip | none | vault-db only (`:539`) |

**Bank options and host callbacks** (calls 24-31)

| name | checks | type | importers |
|---|---|---|---|
| makeBankOpts | key set of MakeBankOpts (all `unk`), strict; strengthChecker defaulted | **hand-written** MakeBankOpts (`vault-opts.ts:24`), its keys bound by `satisfies` | vault-opts (`:175`); ns |
| bankVaultOpts | `{vaultDB?, deviceDB?}` strict | **hand-written** BankVaultOpts (`:128`), bound by `satisfies` | vault-opts (`:187`); ns |
| vaultDBShape | 8 verbs are functions | (VaultDB class) | vault-opts (`:242`); ns |
| deviceDBShape | 7 verbs are functions | (DeviceDB interface) | vault-opts (`:250`); ns |
| maxWhisperBytes | int>0, default | none | vault-opts (`:371`); tests' `InPackage` |
| maxBoxes | int>0 optional | none | vault-opts (`:383`); tests' `InPackage` |
| declaredBytes, declaredBoxes | adapter limit or Infinity → finite | none | vault-opts (`DeclaredLimitFor`, `:277`) |
| leaseHoursAsMillis, staleMinutesAsMillis, renewMinutesAsMillis | hours/minutes → ms | none | vault-opts (`:285,297,306`) |
| clockShape | `{now: fn}` | **hand-written** Clock (`types/types.ts:212`) | vault-opts (`:353`); ns |
| clockReading | number FarPast..FarFuture | none | vault-opts (`:363`); ns |
| keyDeriverShape | algorithm?, label, salt_bytes 1..65536, deriveKeyBytes, load? | **hand-written** KeyDeriverBase/KeyDeriver (`key-deriver.ts:5,57`) | vault-opts (`:403`); ns |
| strengthChecker | fn with optional fn `load` | **hand-written** StrengthChecker (`passphrase-strength.ts:34`) | vault-opts (makeBankOpts' default); ns |
| passphraseVerdict | `{strong:true}` or `{strong:false, reason}` | **hand-written** PassphraseVerdict (`:9`), identical | passphrase-strength (`:98`); ns |
| loggerShape | log/warn/error are functions | **hand-written** VaultLogger (`logger.ts:28`) | logger (`:69`); ns |
| localVaultDBOptsShape | `{store: 5 fns}` | **hand-written** LocalVaultDBOpts (`local-vault-db.ts:16`) | local-vault-db (`:48`); ns |
| passkeyAnswerShape | `{credential_id, prf_salt_b64, prfBytes: Uint8Array(32)}` | **hand-written** PasskeyAnswer (`types/types.ts:125`) | proving (`:447`); ns |
| maskOpts | head/tail/minStars/maxLen with defaults | **hand-written** MaskOpts interface (`mask.ts:5`) | mask (`:37`); ns |
| idbOpts | `{dbName}` default, strict | **hand-written** IdbOpts (`idb-opts.ts:6`) | idb-opts (`:27`); ns; **safebyok-indexeddb (value)** |
| keyDeriverSpec | Argon2id spec bounds + refine | **hand-written** KeyDeriverSpec (`key-deriver-spec.ts:13`) | key-deriver-spec (`:117`); ns; fastkey (t) |
| vaultBag | `{applabel?, user_id?, vaultlabel}` strict | none; inline `Z.infer<typeof vaultBag>` at `bank.ts:643`; 12 params write `Pick<VaultScope,'vaultlabel'> & Partial<BankScope>` | bank (`:645`); ns |
| bankBag | `{applabel?, user_id?}` strip | none; inline at `bank.ts:433` | bank (`:180`); ns |
| vaultMadeUnderShape | vault_tok + optional str labels, num epochs, loose | parallel **hand-written** VaultMadeUnder (`vault-record.ts:172`) | vault (`:2002`); tests' `InPackage` |
| optionsBag (×5) | per-call key set, strict, optional | none | `options.ts` factory; tests 2 |

### 1.3 Hand-written types in `types/types.ts` and `types/type-aliases.ts`

| type | file:line | validator? |
|---|---|---|
| WhisperJson | types.ts:10 | yes, internal `whisperJson`; recursive, so it stays hand-written |
| Whisper | types.ts:19 | yes (Whisper); recursive, so the validator is annotated from the type: justified |
| isPlainBag (fn) | types.ts:22 | helper of Whisper |
| VaultScope (value + type alias) | types.ts:56-57 | yes, `CX.vaultScope`. Duplicate name: drop one (§5) |
| Sidecar | types.ts:71 | Z.infer ✓ |
| Capacity | types.ts:88 | Z.infer ✓ |
| WayinKindVals / WayinKind | types.ts:91-92 | **no validator**. STYLE's own example, `wayinkind = oneof(WayinKindVals)`, does not exist. `checkSlotlabel` (`vault.ts:2028`) hand-rolls it |
| PasskeySaltBytes | types.ts:97 | const; belongs in `consts.ts` beside PassphraseKeyBytes |
| PassphraseWayinSummary, PasskeyWayinSummary, WayinSummary | types.ts:105,112,115 | none. Could be `PassphraseWayinSparse.extend(VaultStamp.pick({vault_tok}).shape)`, but they are output only (log and meta), so a type alone is enough |
| PasskeyAnswer | types.ts:125 | **parallel** passkeyAnswerShape (`proving.ts:345`): make it Z.infer |
| LeaseRecord | types.ts:153 | Z.infer ✓ |
| DeviceRecordFormat | types.ts:156 | const |
| DeviceRecord | types.ts:183 | Z.infer ✓ |
| LeaseHours, StaleMinutes, MaxLeaseHours, MaxWhisperBytes, MaxBoxes | types.ts:186-206 | consts. Their only validator users are vault-opts' `leaseHoursAsMillis`, `staleMinutesAsMillis`, `maxWhisperBytes` and `parseMaxBoxes` |
| Clock, wallClock | types.ts:212,215 | **parallel** clockShape (`vault-opts.ts:227`): could be Z.infer |
| Applabel, Vaultlabel, Boxlabel, UserId | type-aliases.ts:22-31 | Z.infer of the primitives ✓ |
| VaultTok … VaultKeyLeaseWrapped | type-aliases.ts:57-78 | Z.infer ✓ |
| PassphraseCleartext | type-aliases.ts:94 | Z.infer ✓ |
| Lifecycled, Refused, ConsistencyWith | type-aliases.ts:105-117 | generic facets: no validator possible or wanted. They stay in `types/` |

---

## 2. Hand-rolled checks

### 2.1 Input-shape checks written as functions (in scope)

| file:line | function | checks | covered by? |
|---|---|---|---|
| `lease.ts:333` | checkedBytes | Uint8Array by its tag (cross-realm) | new kit maker `bytes` (custom by tag). **Inconsistent with** `passkeyAnswerShape`'s `instanceof Uint8Array` (`proving.ts:349`), which refuses bytes from another realm |
| `lease.ts:341` | checkSealProps (lease) | object whose only key is `whisper`, then bytes | `optionsCheck(({ bytes }) => ({ whisper: bytes }))`, or a strict obj. Its name collides with `box.ts:124` checkSealProps |
| `lease.ts:315,324` | checkedVisible, checkedCiphered | safeParse + own sentence | existing (VisibleShape, CipheredShape); the try/throw pattern is the same as in 2.3 |
| `box.ts:370,379,388,414,423,430` | checkedBoxRecord, checkedWhisper, checkedSidecar, checkedBase, checkedMadeUnder, checkedMade | safeParse → VaultError with own sentence | existing validators; the pattern repeats (§2.3) |
| `box.ts:124,127,268-271` | Box.seal props: checkSealProps (optionsCheck) + sealBoxlabel + checkedSidecar + checkedBase | one input, **four validators** with two kinds (bad_option, bad_scope) | breaks STYLE's "One input, one validator". One `SealBoxProps` validator needs a ruling on the kinds (a nested validator refuses with the outer kind) |
| `vault.ts:2016-2021` + `:2010` + `:1602` | putBoxPropsOf: typeof object, checkPutBoxProps, checkedSidecar, `#checkedBoxlabel` (`CX.boxscope`) | same cascade for putBox | same ruling as above |
| `vault.ts:469` | tryCheckStrength | `typeof passphrase !== 'string'` | **existing `passphraseCleartext`**, which gating already uses for the same check (`gating.ts:440`) |
| `vault.ts:2028` | checkSlotlabel | 'passphrase' or 'passkey' | new `wayinkind = oneof(WayinKindVals)` |
| `vault.ts:2001` | checkedMadeUnder | vaultMadeUnderShape.safeParse, returns `thing` itself | existing. It must keep returning `thing` (survey-signatures §0.5) |
| `vault.ts:250`, `bank.ts:141`, `idb.ts:193`, `string-store.ts:27`, `vault-db.ts:927` (checkListener), `vault.ts:683` (useWhisper callback; its message says `use`, not `useWhisper`) | `typeof x !== 'function'` → bad_option | 6 copies. A kit `fn` maker (`custom(isFunction)`) would serve them and the `*Shape` verbs |
| `vault-opts.ts:135`, `local-vault-db.ts:54` | isFunction | duplicated helper; also inline at `logger.ts:43` and `passphrase-strength.ts:64` | kit `fn` |
| `vault-opts.ts:138` | isBag | object, not null. Used at `:184`, `:475` and `del-damaged-vault.ts:42` before a parse, to give its own first sentence | keep, or fold into the bag validators. It is the "not a bag at all" message |
| `vault-opts.ts:314,329` | parseOnBadNews, parseRequestCleartext | nullish or function | kit `fn.nullish()`. The guard wrapping in parseRequestCleartext stays |
| `vault-opts.ts:351-367` | parseClock | clockShape, then read once, then clockReading | existing. Reading the clock is not Zod's job: stays |
| `vault-opts.ts:399-415` | parseKeyDeriver | keyDeriverShape + keyDeriverSpec + checkSuppliedSpecKept + warn | existing. The warn and reserved label stay as specific checks |
| `vault-opts.ts:382` | parseMaxBoxes | maxBoxes, then ≤ storeBoxes | existing, plus a comparison: stays |
| `vault-opts.ts:417,430` | parseDeclared, checkLimitsFit | declared limits, then cross-checked against options | existing plus arithmetic across adapter and options: stays as a function |
| `del-damaged-vault.ts:41-46` | delDamagedVault | isBag, `CX.vaultScope.parse({applabel: opts.applabel, ...})` rebuilt by hand, parseVaultDB, parseDeviceDB | **no strict bag validator**: a misspelt option passes quietly, against STYLE's "A bag a person typed gets .strict()". New `delDamagedVaultOpts`, from makeBankOpts' keys |
| `del-damaged-vault.ts:50` | delDamagedVaultIn | `typeof vaultDB.delDamagedVault` | `vaultDBShape` lists 8 verbs but not `delDamagedVault` or `getCapacity`. Add them there? (ruling: it changes what Bank.make accepts) |
| `mask.ts:101` | mask | `typeof whisper !== 'string'` → bad_whisper | trivial; stays (utils entry) |
| `mask.ts:36`, `logger.ts:66`, `local-vault-db.ts:47`, `key-deriver-spec.ts:116`, `idb-opts.ts:25`, `proving.ts:446` | parse* wrappers | safeParse → own sentence | existing validators (§2.3) |
| `gating.ts:439-459` | checkText, checkTexts, checkNewPasskey, checkFirstGate | passphraseCleartext.safeParse + Phrases sentence; checkedPasskeyAnswer + checkFreshSalt | existing. These are input cascades per gating attempt |
| `proving.ts:462`, `:481-484`, `wayin.ts:182` | checkFreshSalt, checkedPasskeyHeader, PasskeyWayin.isDamaged | `fromB64OrNull(prf_salt_b64)?.length !== PasskeySaltBytes` | **3 copies** of one rule. Kinds differ (bad_option, damaged_wayin, boolean), so one predicate `isPasskeySalt(b64)` beside `prf_salt_b64` fits better than a validator |
| `proving.ts:431`, `wayin.ts:151` | checkedPassphraseHeader, PassphraseWayin.isDamaged | passphrase salt length against the deriver | 2 copies; a predicate. It depends on the deriver: not Zod |
| `proving.ts:562-572` | passphraseKeyOf | deriver output: a view, not shared, 32 bytes, not all zero | host-callback output; specific checks, stays |
| `key-deriver-spec.ts:56,89` | checkSuppliedSpecKept, checkSaltFits | spec equality; salt byte length | specific checks; stay |
| `expectations.ts:32,70` | fieldOf, epochOf | read a field of an unchecked row; epochOf hand-rolls uint | **by design** (damaged rows). epochOf could be `uint.safeParse`, but expectations.ts is adapter-facing and imports no validator machinery today |
| `expectations.ts:26` vs `vault-db.ts:1005` | isTombstone (fieldOf 'format'), formatOf | the same "format of unknown" read, twice | merge into one helper |
| `vault-db.ts:1000` | mayBeNewer | `VaultSparse.shape.format.safeParse(f)` for a literal | `f === VaultFormat` says the same |
| `expectations.ts:146`, `vault-db.ts:81,770`, `box.ts:401` | `BoxRecord.shape.revision_tok` | the revision_tok validator reached through BoxRecord's shape | `revision_tok` is importable directly (`box.ts:92` does so). There are two routes to one validator |
| `vault-db.ts:775` | isNameable | `CX.label.safeParse` | existing |
| `vault-db.ts:823-844` | heldScope, heldBoxlabel, heldName | vaultScope/boxscope parse, then UTF-8 bytes ≤ adapter's maxNameBytes | parse + a check against adapter state: stays |
| `vault-db.ts:956` | checkDraft | VaultDraft + `vault_epoch === 0` by hand | could be `vault_epoch: lit(0)` in VaultDraft. That changes the exported `Validators.VaultDraft` and its message: ruling |
| `vault.ts:1955` | standsBeside | reads vault_tok and gate_epoch of an unknown kept lease | by design (comparison of possibly damaged data) |
| `outcome.ts:58` | isOutcomeShaped | `{ok: boolean, val|err}` duck | could be a validator, but outcome.ts is reached by every entry and imports no Zod: stays |
| `refusals.ts:167` | isStorageBlocked | error `name` duck | not input validation: stays |
| `crypto.ts:81` | isUnbound (cipherCtx) | no part undefined or null | internal assertion: stays |
| `passphrase-strength.ts:63` | isStrengthChecker | fn with optional fn load | used inside the strengthChecker validator: fine |
| `types/types.ts:146`, `passphrase-strength.ts:70` | inline sentences in validators | "a CryptoKey handle"; the strengthChecker error | STYLE: "Every sentence a check says lives in phrases.ts". The ~40 `new VaultError(kind, '...')` sentences in the checked*/parse* helpers are inline too |

### 2.2 State and consistency checks (out of scope; they stay functions)

`vault.ts:1106` #checkStanding, `:1114` #demand, `:1127` #demandAfterWait, `:1136`
#inconsistencyWith, `:1154` #provingInconsistency, `:1162` #leaseRefusal, `:1170` #demandLease,
`:1178` #gatedRecord, `:1534` #fitsTakeUp, `:1563` #checkWhisperFits, `:1576` #checkRoomFor,
`:385/397` demandConsistentWith/consistentWith; `bank.ts:433` #demandSameScope, `:677`
checkSameStores; `gating.ts:429` #gatedOf; `lease.ts:255` #demand; `proving.ts:246` #demand,
`:509` demandAfterFailedSeal; `gate.ts:61` Gate.make (wayins' vault_tok against base);
`vault-opts.ts:529` checkSecureContext; `vault-db.ts:862-910` withMissChecked, staleChecked,
fullChecked, withStaleVaultRecordChecked (adapter-answer meta, already validator-backed);
`vault-db.ts:967-1029` checkVaultRecord, checkWrittenVaultRecord, isSoundVaultRecord,
checkStoredBox, checkWrittenBox (validator plus comparison with what was asked); `device-db.ts:153`
deviceRecordFor, `lease.ts:149` sameScope (comparisons after a parse).

### 2.3 One pattern, repeated about 30 times

The same two shapes recur, each with its own inline sentence:

- **safeParse, then throw a sentence**: `box.ts:370-433` (6), `lease.ts:315-329` (2),
  `vault-opts.ts:241-418` (10), `logger.ts:69`, `local-vault-db.ts:48`, `mask.ts:37`,
  `key-deriver-spec.ts:117`, `proving.ts:447`, `gating.ts:440`, `vault.ts:2002`.
- **parse, catch the kind, rethrow with a prefix**: `options.ts:20-28`, `vault-opts.ts:173,183`,
  `bank.ts:643`, `idb-opts.ts:25`, `safebyok-indexeddb/src/idb-opts.ts:27`.

A consolidation could give `Validator` a per-schema sentence, or add one helper,
`refusingWith(schema, kind, sentence)`. Either is a new mechanism in `checks/validator.ts`, so it
needs a Coach's yes (CLAUDE.md, library first). It is not needed for the move itself.

---

## 3. Duplication and near-duplication

### 3.1 Fields restated across shapes

- **`applabel, user_id, vaultlabel` listed by hand** in `vaultRecordFields`
  (`vault-record.ts:67-71`), `LeaseRecord` (`types.ts:137-141`), `DeviceRecord`
  (`types.ts:172-176`), `bankBag`/`vaultBag` (`bank.ts:638-639`, as optionals) and
  `vaultMadeUnderShape` (`vault.ts:1992-1994`, as `str.optional()`). `core-checks.ts` builds
  bank → vault → box by `extend`, but returns them `.readonly()`, which cannot be extended. A
  shared shape object (`VaultScopeFields = { applabel, user_id, vaultlabel }`, spread into each
  `obj`), or an unfrozen base exported beside the frozen one, would let every record start from
  it. `bankBag` is `bankScope.partial()` written out.
- **`device_id: str.min(1)`** ×3: `vault-record.ts:35,49`, `types.ts:178`. It is a field
  validator (stored name, like `vault_tok`) that does not exist.
- **`key_deriver_label: str.min(1)`** ×3: `vault-record.ts:31`, `key-deriver-spec-checks.ts:22`,
  `vault-opts.ts:233`.
- **`credential_id: str.min(1)`** ×2: `vault-record.ts:45`, `proving.ts:347`. The second also
  restates `prf_salt_b64: str.min(1)` (`proving.ts:348`) instead of using `prf_salt_b64` (branded;
  the answer comes from the host, so unbranded may be meant).
- **`gate_epoch`** has 4 schemas (`uint`, `int.positive()`, `uint.nullable()`, `num`) and
  **`vault_epoch`** 3 (`uint`, `int.positive()` in the tombstone, `num`). See
  survey-signatures §0.3.
- **`revision_tok` nullable** made 4 times: `box.ts:92`, `box.ts:401`, `vault-db.ts:81`,
  (`StoredRevision` `vault-db.ts:770` non-null). Two routes (`revision_tok` or
  `BoxRecord.shape.revision_tok`).
- **Format literals**: `'safebyok-lease-v1'` written twice (`types.ts:138` and `LeaseFormat`,
  `lease.ts:40`), and nothing ties the two. The other formats each have one const
  (`VaultFormat`, `TombstoneFormat`, `BoxFormat`, `DeviceRecordFormat`), spread over 4 files.
- **Function-verb objects**: `vaultDBShape`, `deviceDBShape`, `clockShape`, `loggerShape`,
  `localVaultDBOptsShape.store` and `keyDeriverShape` each build `obj({ verb: custom(isFunction),
  ... })` by their own route (`verb`, `call`, `loggerCall`, inline).
- **`salt_bytes`**: `int.gte(1).lte(MaxSaltBytes)` in keyDeriverShape against
  `int.gte(8).lte(MaxSaltBytes)` in keyDeriverSpec. The difference is meant (custom derivers),
  but both are named `salt_bytes`.

### 3.2 Hand-written `Pick`/`Omit`/`Partial`/intersection types, by use site

Those equal to a named shape are marked **=**. STYLE allows an ad hoc Pick where a function reads a
few fields, so the unmarked ones are fine as they are.

| use site | type | note |
|---|---|---|
| `bank.ts:155,166,259,262,274,277,297,333,336,371,374,426` (12) | `Pick<VaultScope,'vaultlabel'> & Partial<BankScope>` | **= Z.input of vaultBag**. Name it `VaultBag` |
| `bank.ts:179` | `Partial<BankScope>` | **= bankBag**'s input (`BankBag`) |
| `bank.ts:433,643` | `Z.infer<typeof bankBag>`, `Z.infer<typeof vaultBag>` inline | missing named types |
| `gating.ts:405`, `vault.ts:1947` | `Pick<VaultSparse,'vault_tok'\|'gate_epoch'>` | **= VaultRecordExpectation** |
| `expectations.ts:62` | `Pick<VaultDelExpectation,'vault_tok'>` | **= BoxGetExpectation** |
| `expectations.ts:107` | `Pick<VaultTombstone,'applabel'\|'user_id'\|'vaultlabel'>` | **= VaultScope** |
| `lease.ts:296` | `VaultStampButFormat & Pick<VaultSparse,'gate_epoch'>` | ad hoc |
| `lease.ts:37` | `BoxCiphered = Pick<BoxRecord, ...>` | **parallel** to CipheredShape (`lease.ts:46`): make it Z.infer |
| `box.ts:411` | `SealedUnder = Pick<MadeUnder, ...>` | **parallel** to SealedUnderShape (`box.ts:399`) |
| `box.ts:242,245,432` | `{ madeUnder: SealedUnder, now: number }` inline ×3 | = Z.infer of MadeShape |
| `box.ts:113` | `BoxBase = { revision_tok: string\|null, registered_at?: number }` | **parallel** to BaseShape (`box.ts:401`) |
| `box.ts:116`, `vault.ts:2007` | SealBoxProps, PutBoxProps | parallel to the unk-key optionsChecks (`box.ts:124`, `vault.ts:2010`) |
| `vault-record.ts:172` | `VaultMadeUnder = Pick<VaultSparse,'vault_tok'> & Partial<Pick<VaultSparse, ...5>>` | **parallel** to vaultMadeUnderShape (`vault.ts:1989`). The validator is looser (`str`, `num`) than the type (labels, uint) |
| `vault-record.ts:175,181` | GatedVaultRecord, VaultDraft (`VaultRecord & {...}`) | VaultDraft is **parallel** to its validator (`:184`); GatedVaultRecord is a narrowing for `isGated`: fine |
| `vault-record.ts:210`, `proving.ts:160,411`, `gate.ts:85` | `Pick<VaultRecord,'gate'>`, `Pick<VaultRecord,'gate_epoch'\|'gate'>` | ad hoc |
| `types.ts:105,112` | `XWayinSparse & Pick<VaultRecord,'vault_tok'>` | ad hoc output types |
| `proving.ts:25,27`, `wayin.ts:18-20` | `PassphraseWayinHeader`, `PasskeyWayinHeader` = `Omit<..., 'vault_key_wayin_wrapped'>`; `WayinHeader = HeaderOf<WayinRecord>` | **the same Omit written twice in two files**, each with its own `headerOf` (`proving.ts:403`, `wayin.ts:39`). A header is a shape (stamp-like: what the wrap binds). Make it `XWayinRecord.omit({vault_key_wayin_wrapped})` beside the records |
| `del-damaged-vault.ts:11` | `Pick<MakeBankOpts, 4> & Pick<VaultScope,'vaultlabel'>` | no validator (§2.1) |
| `browser.ts:12` | `Readonly<Pick<MakeBankOpts, 3>>` | ad hoc |
| `vault-opts.ts:498,520` | VaultParts, limitsOf's Picks | internal |
| `lease.ts:102,119,144`, `type-aliases.ts:117`, `refusal-policy.ts:30`, `key-deriver-spec.ts:75`, `vault-db.ts:822` | Pick of Vault/VaultDB/KeyDeriver methods | interfaces, not shapes |
| `vault.ts:1909` Listing; `vault-db.ts:113-117` VaultReadResponse.boxes/damagedBoxes; `vault-db.ts:751,758,797` return types | `{ boxes: BoxSparse[], damagedBoxes: BoxDamaged[] }` ×5 | one named type (a vault's box listing) would serve all five |
| `vault.ts:66-79` | VaultSnapshot lists applabel, user_id, vaultlabel, format, vault_tok by hand | per STYLE a snapshot is "its sparse shape and what changes beside it". Here it is a hand list, which drops `registered_at` and the epochs. A type over `Pick<VaultSparse, ...>` at least |
| `vault.ts:2025` | DeletedBox.outcome `'deleted'\|'deleted_other'` | restates BoxDeletion's values. There is no `BoxDeletionOutcomeVals` |

### 3.3 Parallel type + validator pairs that can drift (14)

PasskeyAnswer ⇄ passkeyAnswerShape; VaultMadeUnder ⇄ vaultMadeUnderShape; VaultDraft ⇄ VaultDraft;
BoxBase ⇄ BaseShape; BoxCiphered ⇄ CipheredShape; SealedUnder ⇄ SealedUnderShape; KeyDeriverSpec
⇄ keyDeriverSpec (`output_bytes: number` vs `lit(32)`); KeyDeriverBase ⇄ keyDeriverShape; Clock ⇄
clockShape; VaultLogger ⇄ loggerShape; StrengthChecker ⇄ strengthChecker; PassphraseVerdict ⇄
passphraseVerdict (identical: Z.infer now); MaskOpts ⇄ maskOpts (Z.input); IdbOpts ⇄ idbOpts
(Z.input); LocalVaultDBOpts ⇄ localVaultDBOptsShape; MakeBankOpts/BankVaultOpts ⇄
makeBankOpts/bankVaultOpts (keys bound by `satisfies`, field types not); VaultReadResponse ⇄
ReadAnswer + ListingAnswer. Also `LeaseFormat` ⇄ the lease literal, and IdbVaultDBOpts ⇄
idbVaultDBOpts in safebyok-indexeddb.

Of these, the host-callback interfaces (VaultLogger, StrengthChecker, KeyDeriver, Clock,
MakeBankOpts) carry heavy doc blocks on each member. A `Z.infer` there loses per-member docs in a
host's editor unless the doc moves onto the schema's field (it carries through `Z.infer` for
plain fields). That is the one real cost of converting them.

---

## 4. Proposed grouping

Folder: **`src/shapes/`**. VOCABULARY and STYLE already call these "shapes"; `checks/` keeps the
machinery. Each file has `// == [Section]: names` chapters, one `Validator` call per kind per
section, and types as `Z.infer` beside each. The importer sets below are core `src/` value
importers, plus the entries that reach them.

| file | sections and contents | est. lines | value importers | reached by entries |
|---|---|---|---|---|
| `shapes/scopes.ts` (from `checks/core-checks.ts`, `types/type-aliases.ts` Names, `bank.ts:637`) | [Names] Applabel, Vaultlabel, Boxlabel, UserId; [Fieldnames] *ScopepathFieldnameVals; [Scopes] bankScope, vaultScope, boxscope, VaultScopeFields + types; [Bags] bankBag = bankScope.partial(), vaultBag + BankBag, VaultBag; [Scopepaths] 5 | ~120 | scopepath, device-db, vault-db, vault, bank, vault-opts, del-damaged-vault, other shapes | index, idb, browser |
| `shapes/fields.ts` (from `type-aliases.ts` Record fields, `crypto.ts:13`) | [Ciphered] Ciphered; [Tokens and ids] vault_tok, revision_tok, new device_id, key_deriver_label, credential_id; [Salts] salt_b64, prf_salt_b64, isPasskeySalt?; [Ciphered fields] 4 branded + types | ~110 | shapes/*, box, lease, proving, vault; crypto (t) | index, idb, browser |
| `shapes/device.ts` (from `types.ts:131-183`, `lease.ts:24-48`) | [Formats] LeaseFormat, DeviceRecordFormat; [Lease] LeaseRecord, LeaseStamp, LeaseSparse, LeaseGrant, LeaseStampPicked; [Device record] DeviceRecord | ~110 | lease, device-db, idb; vault, proving (t) | index, idb, browser |
| `shapes/box.ts` (from `types.ts:9-71`, `box.ts:15-106`, `lease.ts:37,45-46`) | [Whisper and sidecar] WhisperJson, Whisper, isPlainBag, whisperBag, Sidecar; [Box record] BoxFormat, BoxRecord, DamagedBoxRecord; [Box shapes] BoxSparse, BoxSparsePicked (was VisibleShape), BoxStamp, BoxCiphered (validator + Z.infer), BoxDamageVals, BoxDamaged | ~210 | box, lease, vault-db, vault, expectations, local-vault-db; errors, refusals (t) | index only (**Whisper leaves the idb entry**) |
| `shapes/vault.ts` (from `vault-record.ts` whole, `types.ts:90-129`, `proving.ts:25-27,345`, `wayin.ts:18-20`, `type-aliases.ts:82-95`) | [Formats]; [Wayins] WayinKindVals, wayinkind, Passphrase/PasskeyWayinRecord, WayinRecord, sparse, Header shapes (as validators), Summaries; [Gate] GateRecord, GateSparse; [Vault record] VaultRecord, DamagedVaultRecord, GatedVaultRecord, VaultDraft (Z.infer); [Vault shapes] VaultSparse, VaultStamp, VaultStampPicked, VaultStampButFormat, VaultTombstone, VaultMadeUnder; [Proofs] passphraseCleartext, PasskeyAnswer (validator + Z.infer); [Of] isGated, vaultSparseOf, gateSparseOf | ~330 | wayin, gate, gating, proving, vault, bank, box, lease, vault-db, expectations, local-vault-db | index only |
| `shapes/vault-db.ts` (from `vault-db.ts:15-118,766-772,1031-1035`, `types.ts:73-88`) | [Expectations] 5 + BoxDeletion (+ BoxDeletionOutcomeVals); [Capacity] Capacity; [Read answers] StoredBox, VaultReadResponse, a box-listing type, ReadAnswer, ListingAnswer, ListedBox, StoredRevision, StoredVaultTok | ~170 | vault-db (value); expectations, local-vault-db, vault, errors, refusals (t); 4 adapter packages (t) | index only. It takes ~130 lines out of the 1075-line `vault-db.ts` |
| `shapes/bank-opts.ts` (from `vault-opts.ts:15-238`, `types.ts:185-215`) | [Defaults] LeaseHours, StaleMinutes, MaxLeaseHours, MaxWhisperBytes, MaxBoxes; [Bags] MakeBankOpts, BankVaultOpts, BadNewsHandler, DelDamagedVaultOpts + makeBankOpts, bankVaultOpts, new delDamagedVaultOpts; [Stores and libraries] vaultDBShape, deviceDBShape, clock (Clock, wallClock), clockReading, keyDeriverShape; [Limits] maxWhisperBytes, maxBoxes, declared*, *AsMillis | ~260 (MakeBankOpts' docs are ~80) | vault-opts, del-damaged-vault, bank; browser, react (t) | index only |

`src/validators.ts` becomes re-exports of `shapes/*` plus the stay-behinds below, and `index.ts`
keeps every name. `types/types.ts` empties and can go. `types/type-aliases.ts` keeps only the
facets (rename to `types/facets.ts`?). `PasskeySaltBytes` goes to `consts.ts`.

**Stay beside their callers, and why:**

- `checks/validator.ts`, `checks/primitives.ts`: the kit and its dependencies. `primitives` in a
  file that imports `validator.ts` would make a cycle (`validator.ts:6` imports it).
- `checks/key-deriver-spec-checks.ts` (keyDeriverSpec): `argon2idWebV1Deriver`'s no-Zod budget.
  Its `KeyDeriverSpec` type could become Z.infer here (a type-only import pulls no Zod).
- `mask.ts` maskOpts: the `safebyok/utils` entry (28 kB).
- `idb-opts.ts` idbOpts: shared by `idb`/`browser` and `safebyok-indexeddb`; one tiny schema.
- `passphrase-strength.ts` strengthChecker, passphraseVerdict: moving them into bank-opts would
  make a **cycle**. `makeBankOpts` defaults to `DefaultStrengthChecker` (passphrase-strength), and
  passphrase-strength parses with `passphraseVerdict`. Keep both there, with bank-opts importing
  `strengthChecker` one way, as vault-opts does today. `PassphraseVerdict` can become Z.infer in
  place.
- `logger.ts` loggerShape: the single importer is `parseLogger`, which vault-db and react reach.
  In bank-opts it would drag every option validator wherever parseLogger goes.
- `local-vault-db.ts` localVaultDBOptsShape: single importer, single concern.
- `options.ts` optionsCheck and its five bags (`box.ts:124`, `vault.ts:1977,1980,1986,2010`):
  call-site key lists for one function each.
- `box.ts` BaseShape, MadeUnderShape, MadeShape, sealBoxlabel; `lease.ts` checkSealProps;
  `vault.ts` vaultMadeUnderShape: argument checks for one method each (bad_option). Rename to
  their types (§5), and make BoxBase, MadeUnder and SealedUnder Z.infer in place. If the Coach
  rules VaultMadeUnder a shape with label and uint checks, it moves to shapes/vault.ts (§3.2).

**Cycles.** The proposed edges are `shapes/scopes` → validator, primitives, phrases, consts;
`fields` → validator, phrases; `device` → fields, scopes; `box` → fields, phrases; `vault` →
fields, scopes, phrases; `vault-db` → box, vault; `bank-opts` → passphrase-strength, consts,
validator. Everything else is type-only. No module that a shapes file imports imports a shapes
file back, so **no cycle is created**. The one that would be (bank-opts ↔ passphrase-strength)
is avoided above. Moving `Ciphered` breaks today's value edge `type-aliases → crypto`, and
`crypto.ts` drops its `validator` import. Note survey-signatures §4: a piped or transformed
schema cannot be `pick`ed or `extend`ed, so duck validators must be built last in each file.

**Test churn:** 24 test files import `src/types/types`, 17 `src/vault-record`, 15 `src/crypto`, 7
`src/types/type-aliases`, 4 `src/checks/core-checks`, and 17 box/lease/vault-db/vault-opts.
`tests/validators.test.ts:22-26` (`InPackage`) is a hand inventory of the validators outside
`Validators`, and must track the move.

---

## 5. Naming scheme

**In use today:**

- *PascalCase, shape = type name* (STYLE's rule for shapes): VaultRecord, VaultSparse, VaultStamp,
  VaultTombstone, GateRecord, GateSparse, *WayinRecord/Sparse, BoxRecord, BoxSparse, BoxStamp,
  BoxDamaged, LeaseRecord, LeaseStamp, DeviceRecord, Capacity, Whisper, Sidecar, Ciphered,
  VaultDraft, the five *Expectation, BoxDeletion.
- *PascalCase with ad hoc suffixes*: `-Picked` (VaultStampPicked, LeaseStampPicked: a `.strip()`
  copy), `-ButFormat` (VaultStampButFormat), `-Shape` (BaseShape, MadeUnderShape, MadeShape,
  VisibleShape, CipheredShape), `Stored-` (StoredRevision, StoredVaultTok), `-Answer` (ReadAnswer,
  ListingAnswer), `Listed-` (ListedBox, against STYLE's "never -Listing ... nor -Listed").
  LeaseGrant.
- *camelCase after a parameter or field* (STYLE's rule for parameters): bankScope, vaultScope,
  boxscope, *Scopepath, passphraseCleartext, keyDeriverSpec, strengthChecker, passphraseVerdict,
  maxWhisperBytes, maxBoxes; the stored field names in their own case (vault_tok, salt_b64, ...).
- *camelCase `fooOpts`* for a host's bag: makeBankOpts, bankVaultOpts, idbOpts, maskOpts,
  idbVaultDBOpts. The validator is the type's name with a lowercase first letter. That is
  consistent with itself, but not with "a shape's validator takes its type's name".
- *camelCase `-Shape`*: vaultDBShape, deviceDBShape, clockShape, keyDeriverShape, loggerShape,
  localVaultDBOptsShape, passkeyAnswerShape, vaultMadeUnderShape. STYLE has no `-Shape` rule.
- *camelCase `-Bag`*: whisperBag, vaultBag, bankBag, optionsBag.
- *Transforming validators named for their output*: leaseHoursAsMillis, staleMinutesAsMillis,
  renewMinutesAsMillis, declaredBytes, declaredBoxes, clockReading.
- One validator with two names: `vaultScope` / `VaultScope` (`types.ts:56`).

**Proposed common scheme** (consistent with STYLE *Naming*; renames of exported names are contract
changes and take a changeset):

1. **A shape** (record, sparse, stamp, scope, tombstone, dna, snapshot, and named wire things such
   as Capacity, Ciphered, Whisper, Sidecar, PasskeyAnswer, *Expectation, BoxDeletion): PascalCase.
   The validator and its type share one name; the type is `Z.infer` (or `Z.input` for a host's
   bag with defaults). This settles the scope case: `BankScope`, `VaultScope`, `Boxscope`, dropping
   the camel ones. **Coach ruling needed**, since STYLE *Validation* names the camel ones.
2. **A variant of a shape**: `<Shape><Variant>`, from a short fixed list: `Picked` (strip, taken
   from whatever carries it; replaces VisibleShape → BoxSparsePicked), `Header` (record − wrap),
   `Summary`, `ButFormat` (or rename to a purpose: `VaultStampBound`, the stamp a box or lease
   binds). Never a bare `Shape`. MadeUnderShape → `MadeUnder`, BaseShape → `BoxBase`,
   CipheredShape → `BoxCiphered`, ListedBox → `BoxRecordAsRead` (or the Coach's word), ReadAnswer
   and ListingAnswer → `VaultReadResponse` halves (`VaultReadResponseVault` and `...Listing`, or one
   loose `VaultReadResponse` validator).
3. **A parameter or field check**: named after the parameter or stored field, in its case
   (`vault_tok`, `device_id`, `leaseHours`, `staleMinutes`, `renewMinutes`, `maxBoxes`). A
   transforming one keeps the parameter's name: the transform is the parse's job (`parseFoo`),
   not the name's. So `leaseHoursAsMillis` → `leaseHours`.
4. **A host's bag of options**: `fooOpts` with type `FooOpts` (makeBankOpts/MakeBankOpts,
   idbOpts/IdbOpts, maskOpts/MaskOpts, localVaultDBOpts/LocalVaultDBOpts, delDamagedVaultOpts). A
   bag is a parameter, so rule 3 applies. Drop `-Shape` (localVaultDBOptsShape → localVaultDBOpts).
5. **A host-implemented interface**, checked by its verbs: named after the option that carries it
   (`vaultDB`, `deviceDB`, `clock`, `logger`, `keyDeriver`, `strengthChecker`). `strengthChecker`
   is already so. To avoid shadowing locals of the same name (`vault-opts.ts:478` `const vaultDB`),
   import such a file as a namespace (`BankOpts.vaultDB`), as `CX.vaultScope` is today.
6. **Enumerations**, as STYLE says: `FooVals`, then `fookind = oneof(FooVals)`, then
   `type FooKind`. Add `wayinkind`, and `BoxDeletionOutcomeVals` (BoxDeletion and DeletedBox
   share it). VaultFreshness and the lifecycle unions are hand-written today, with no Vals.
7. **Formats**: `<Thing>Format` const for every record, with the record's `lit(<Thing>Format)`,
   and each in its shapes file (add LeaseFormat's export; drop the second literal).
8. **Bags** (`vaultBag`, `bankBag`, `whisperBag`) keep STYLE's `bag` tag. Add the named types
   `VaultBag` and `BankBag` for the 13 hand-written intersections in bank.ts.

**Open for the Coach**, with no ruling in hand: the scope validators' case (rule 1); whether the
Box.seal and putBox cascades become one validator each, with what kind (§2.1); whether
VaultMadeUnder checks labels and uints (§3.2); VaultDraft's `vault_epoch: lit(0)` (§2.1);
vaultDBShape adding `delDamagedVault`/`getCapacity`; a per-schema sentence for `Validator`
(§2.3); converting the doc-heavy host interfaces to Z.infer (§3.3).
