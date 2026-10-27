# 2026-10-27: Doc blocks of the core's src/, all but vault.ts and storage -- three renames and six questions

Documentarian run 5c of the fixup sprint: every doc block in `packages/safebyok/src/`, `checks/` and
`types/`, but `vault.ts`, `vault-db.ts`, `local-vault-db.ts`, `expectations.ts`, `device-db.ts`,
`idb.ts`, `idb-opts.ts`, `refusals.ts`, `errors.ts` and `outcome.ts`, which runs 5a and 5b own.
Doc blocks only; no behaviour, name, message or example changed. PR: [#303](https://github.com/mrflip/safebyok/pull/303).

## What changed, in short

* **Said once.** A fact every member of a class or module shares moved to that doc: `Bank`'s misuse
  ('bad_scope', 'bad_option', before storage is touched) and "a call refuses with what storage
  refuses, as it came"; `Lease`'s lease-bound demand before and after each wait, and its
  'damaged_lease'; `Box`'s misuse refusals; `Scopepath`'s "any record carrying its fields";
  `primitives.ts`'s "plain Zod"; `StringStore`'s listener contract (from the private `makeBell`,
  where no host met it); `vault-record.ts`'s "each parse refuses 'bad_record'".
* **Linked, not restated.** `MakeBankOpts`' `clock`, `logger` and `strengthChecker` point to the
  `Clock`, `VaultLogger` and `StrengthChecker` docs; `Bank.delDamagedVault` to the
  `delDamagedVault` function; the box and lease ctx to `boxCtxOf` and `LeaseStamp`; tours of a
  shape's fields to the shape (`WayinSummary`, `LeaseSparse`, `BoxStamp`, `VaultStamp`).
* **Shorter first lines**, the brief's two among them: `#freshenGated` 36 words to 13,
  `Proving.#unwrap` 37 to 17, `Bank.#initialize` 50 to 21; and several others over 35.
* **Retired words**: "proof" (VOCABULARY: cleartext, a proving), "in hand" (held), "stood" and
  "where it stands" (as it was, pending, stage, lifecycle), "unlock" as a noun. No "standing".
* **Callers unnamed**: "what X calls", "`Box.seal` is the call" and the like turned into an
  instruction ("Call it in a Vault object's constructor") or dropped.
* **Maintainer facts moved to running comments**: why `refusing` clones; `DeviceRecord`'s
  format-bump rule; `decide` being the one place; why zxcvbn's `Strong` is its own.
* **Module docs above their imports** in eleven files (`browser`, `change-bell`, `crypto`, `gate`,
  `gating`, `held-lease`, `lease`, `proving`, `sanitizer`, `scopepath`, `wayin`): each sat below
  the imports, where an editor or TypeDoc does not take it as the file's.
* **`{@link}`s out of scope** made plain code (`EpochMillis`, `FarPast`, `FarFuture`,
  `PasskeySaltBytes`, `Box`, `Vault.demandConsistentWith`, `DeviceDB.putLease`, private members).
* **grantLease** lost its "In order: ..." step list for its contract, every security-relevant
  clause kept.

No `@ts-expect-error` or `eslint-disable` was added.

## Counts

Lines inside `/** */` blocks, and the words in them. Lines barely move: a one-line block over the
width became a first line and a body. Words fall 5%: the restyle sprint had already brought most of
these files near the house style.

| File | Doc lines before | after | Words before | after |
| --- | ---: | ---: | ---: | ---: |
| `bank.ts` | 283 | 271 | 3654 | 3411 |
| `box.ts` | 173 | 165 | 2188 | 1973 |
| `browser.ts` | 18 | 19 | 167 | 167 |
| `change-bell.ts` | 22 | 22 | 208 | 208 |
| `checks/core-checks.ts` | 20 | 20 | 227 | 218 |
| `checks/key-deriver-spec-checks.ts` | 6 | 6 | 102 | 94 |
| `checks/primitives.ts` | 41 | 43 | 380 | 359 |
| `checks/validator.ts` | 62 | 59 | 766 | 661 |
| `console-logger.ts` | 2 | 2 | 36 | 36 |
| `consts.ts` | 26 | 26 | 231 | 230 |
| `crypto.ts` | 64 | 66 | 682 | 690 |
| `del-damaged-vault.ts` | 30 | 30 | 316 | 308 |
| `gate.ts` | 38 | 39 | 367 | 368 |
| `gating.ts` | 141 | 153 | 1979 | 1965 |
| `held-lease.ts` | 15 | 15 | 160 | 160 |
| `helpers.ts` | 20 | 19 | 210 | 193 |
| `index.ts` | 5 | 5 | 49 | 49 |
| `key-deriver-spec.ts` | 58 | 58 | 587 | 568 |
| `key-deriver.ts` | 66 | 66 | 630 | 630 |
| `lease.ts` | 129 | 128 | 1651 | 1484 |
| `logger.ts` | 64 | 64 | 699 | 696 |
| `mask.ts` | 40 | 40 | 414 | 414 |
| `names.ts` | 1 | 1 | 11 | 11 |
| `one-at-a-time.ts` | 11 | 11 | 115 | 115 |
| `options.ts` | 13 | 13 | 142 | 135 |
| `passphrase-strength.ts` | 52 | 54 | 617 | 600 |
| `phrases.ts` | 20 | 20 | 189 | 189 |
| `proving.ts` | 203 | 205 | 2466 | 2392 |
| `refusal-policy.ts` | 25 | 24 | 244 | 239 |
| `report-error.ts` | 6 | 6 | 60 | 60 |
| `sanitizer.ts` | 12 | 13 | 114 | 108 |
| `scopepath.ts` | 84 | 84 | 697 | 682 |
| `stable-jsonify.ts` | 7 | 7 | 58 | 59 |
| `string-store.ts` | 25 | 26 | 189 | 202 |
| `text.ts` | 12 | 12 | 107 | 106 |
| `types/type-aliases.ts` | 47 | 51 | 608 | 606 |
| `types/types.ts` | 110 | 104 | 1253 | 1169 |
| `utils.ts` | 4 | 4 | 41 | 41 |
| `validators.ts` | 12 | 10 | 146 | 119 |
| `vault-opts.ts` | 180 | 170 | 2237 | 2067 |
| `vault-record.ts` | 110 | 108 | 1338 | 1293 |
| `wayin.ts` | 73 | 70 | 848 | 790 |
| `whisper-field.ts` | 13 | 13 | 128 | 128 |
| `zxcvbn-strength-checker.ts` | 41 | 41 | 508 | 493 |
| **Total** | 2384 | 2363 | 27819 | 26486 |

## Changes and dropped facts, member by member

Each entry says what changed; a fact dropped is quoted, with why.

### checks/
- validator.ts Validator: dropped "as safebyok's own whisper check does" (example of judging a keyed object whole with custom).
- validator.ts refusing: clone-not-Object.create reason moved to running comment.
- primitives.ts: "plain Zod, parse throws ZodError" gathered into module doc from label, user_id, EpochMillis.
- core-checks.ts scope validators: dropped "Each refuses 'bad_scope', naming each failing field" (module doc says it).
- key-deriver-spec-checks.ts keyDeriverSpec: dropped "parseKeyDeriverSpec checks a spec through it" (who calls it).
### types/
- types.ts VaultScope: dropped "It is CX.vaultScope, under the name a host imports" (how it works).
- types.ts PassphraseWayinSummary / PasskeyWayinSummary: first lines no longer tour the sparse shape's fields ("its kind and when and by which device it was sealed", "what to ask the authenticator with"); linked shape carries them.
- types.ts PasskeyAnswer: "to hand to the vault as proof" -> the cleartext a gating's attemptPasskey takes (VOCABULARY retires "proof"); credential_id and prfBytes facts moved onto the fields.
- types.ts LeaseRecord: dropped "as every stored record is" (of strictness).
- types.ts LeaseRecord.ask_passphrase_at, LeaseHours: "proof" reworded (cleartext / a gating unlocks).
- types.ts DeviceRecord: format-bump paragraph moved to a running comment.
- types.ts Clock: {@link FarPast}/{@link FarFuture} were not in scope; now plain code.
- type-aliases.ts ConsistencyWith: "vault record in hand" -> "held".
### src/: helpers, entry points, logger, stores, scopepaths, mask, strength checkers
- stable-jsonify.ts: "sorted by code point" -> "by UTF-16 code unit" (safe-stable-stringify sorts with `<`; checked: {'｡','\u{1F600}'} puts the emoji first). OPEN QUESTION.
- sanitizer.ts: module doc moved above the import (it sat below it), first line no longer opens "What of".
- validators.ts: dropped the restatement of Validator's refusal message ("naming each failing field and quoting no input", "safeParse is Zod's own"); dropped "the names every scope and time is made of" for the three primitives; dropped `BoxRecord` from the e.g. list.
- helpers.ts module doc: dropped "how a model attaches its vault and its record" (what is attached).
- helpers.ts decorate: "what a model's constructor calls" -> instruction.
- helpers.ts nextMicrotask: "Batches simultaneous initialization or requests arriving in the same event loop" -> "Await it to batch requests made in the same task".
- validators.ts: "the options and objects a host passes" -> "the options a host passes".
- browser.ts, change-bell.ts, scopepath.ts: module docs moved above the imports (they sat below them).
- logger.ts parseLogger: "beside the vault it opens" dropped.
- refusal-policy.ts decide: "the one place that decides" moved to a running comment above it (maintainer invariant).
- string-store.ts: the listener facts (called in turn, a throw stops no other and fails no write, goes to the default logger and reportError, subscribe refuses 'bad_option' for a non-function) moved from the private makeBell to the StringStore doc, where a host meets them.
- scopepath.ts: "any record carrying its fields" gathered from bank and vault makers into the module doc, for every maker; dropped "vault record and leases among them".
- del-damaged-vault.ts delDamagedVault: "nothing here asks for an unlock or a passphrase" -> "a passphrase" (unlock as a noun is retired).
- del-damaged-vault.ts delDamagedVaultIn: dropped "what `bank.delDamagedVault` calls too" (who calls it).
- mask.ts: maskOpts, Unsafe, butcher first lines no longer open on "What"/"The cut itself".
- passphrase-strength.ts StrengthChecker: added "never hears a blank passphrase" (from guardStrengthChecker); "never runs on an unlock of a vault that has its passphrase" -> "never runs on an unlock".
- passphrase-strength.ts guardStrengthChecker: "what vault.checkStrength asks, and the only caller of the host's checker" -> instruction "Ask the host's checker only through it".
- passphrase-strength.ts loadStrengthChecker: dropped "what bank.hello() does before any vault is born" (who calls it).
- passphrase-strength.ts strengthChecker/passphraseVerdict: dropped "what Bank.make's options schema holds strengthChecker to" (who uses it).
- zxcvbn-strength-checker.ts Strong: why it is its own (no validation code in browserOpts) moved to a running comment.
### src/: crypto, key derivers, wayins, gates, provings, leases, boxes, vault record
- crypto.ts makeVaultKey: "The vaultKey a vault holds between operations is a separate, non-extractable unwrap" -> no one holds it between operations; a lease keeps it wrapped and unwraps it non-extractable per call (lease.ts #vaultKeyOrNull). OPEN QUESTION (old prose vs code).
- crypto.ts unwrapKeyUnder: "how a wrong proof is learned" -> "a wrong passphrase or passkey".
- crypto.ts, lease.ts, held-lease.ts: module docs moved above the imports.
- lease.ts module doc: dropped the tour of a lease's own stamp fields ("its format, scope, the vault record's vault_tok and gate_epoch at the grant, and the deadline"); links LeaseStamp and BoxStamp.
- lease.ts Lease: the lease-bound demand before and after each wait, said on cipheredWith and decipherWith ("as cipheredWith does"), gathered into the class doc; 'damaged_lease' said once there. Dropped the field tour in paragraph 1 (LeaseSparse linked).
- lease.ts Lease: "a hello does not mend it, and a new unlock does" -> "unlocking again does" (unlock as a noun).
- lease.ts cipheredWith: dropped the restatement of the box ctx ("its vault's stamp (the scope, vault_tok and registered_at), every field of visible and this lease's vault_tok"), now a link to boxCtxOf; dropped "`Box.seal` is the call" (also on sealProps) and "`box.extractWhisper` is the call" on decipherWith (who calls).
- lease.ts endsBy: dropped "`endsBy(now + renewMillis)` is how `ensureUnlocked({ renewMinutes })` asks ahead of the end" (who calls; the example shows asking ahead).
- lease.ts #boxCtxOf: dropped "See VOCABULARY.md on ctx."
- lease.ts sealLeaseRecord: "which a proof just opened" -> "the one a proving just unwrapped"; "the vault puts the record in the device store" -> instruction.
- held-lease.ts registerLeaseReader: "what a Vault object's constructor calls" -> instruction. {@link Box} not in scope -> plain code.
- box.ts BoxRecord: dropped the restatement of the stamp ("every field it shows is fixed for its life", the vault stamp's fields "the scope, vault_tok and registered_at"), linked BoxStamp; dropped "Its boxlabel is a label, as `label` checks"; "as every stored record is" dropped.
- box.ts BoxRecord fields registered_at/written_at: {@link EpochMillis} not in scope; dropped "an EpochMillis" (the kit's epochMillis checks it).
- box.ts Box: misuse refusals ('bad_whisper', 'bad_scope', 'bad_option') gathered from seal into the class doc. Old class doc said "A missing or malformed vault, record or option throws 'bad_option'": Box.make throws 'bad_record' for a record, and neither make nor seal checks the vault (seal meets a non-vault as 'vault_locked'). OPEN QUESTION.
- box.ts Box: dropped "which carries the revision it was sealed over as baseRevisionTok" (the getter says it), and the sentence on private fields no loop/spread/log/JSON sees, folded into "its private record".
- box.ts Box.make: dropped "and 'bad_option' for a madeUnder that is none" (class doc's misuse).
- box.ts Box.seal: dropped "every visible field, the sidecar among them, and the lease's vault_tok, so the record moved or altered anywhere will not open" (BoxRecord says it); "a malformed base, or a made that is none" now under class misuse.
- box.ts extractWhisper: now says it demands after the decipher too (the code does).
- box.ts parseJsonOrNull: dropped "what a decipher hands the whisper check" (who calls).
- box.ts badMadeUnder: "as it stood" -> "as it was"; lockedError "no lease in hand" -> "held".
- key-deriver-spec.ts loadKeyDeriver: dropped "what bank.hello() does before any vault is born" (who calls).
- key-deriver-spec.ts parseKeyDeriverSpec: dropped "`argon2idDeriver` makes it, and so does `Bank.make` of a deriver declaring `algorithm: 'argon2id'`" (who calls; Argon2idKeyDeriver's doc says Bank.make checks the spec).
- wayin.ts, gate.ts: module docs moved above the imports.
- wayin.ts module doc: dropped the stamp's field list "(its format, scope, vault_tok and registered_at, each fixed for the vault's life)"; links wayinCtxOf.
- wayin.ts Wayin: field tour replaced by a link to WayinSummary; "which a host asks the passkey with" moved to PasskeyWayin.toJSON.
- wayin.ts Wayin.wayinkind: "Which kind of proof opens it" -> cleartext.
- wayin.ts Wayin.make: dropped "the schema's own refusal".
- gate.ts Gate: {@link Vault.demandConsistentWith} not in scope -> plain code; "the gate in hand" -> "the gate the vault holds"; the garbled "as once a read took it after it was stored" rewritten.
- vault-record.ts: "Each parse refuses 'bad_record', quoting none of it" said once, in the module doc (dropped from the Validator block); "never a parallel list" dropped.
- vault-record.ts PasskeyWayinRecord.prf_salt_b64: {@link PasskeySaltBytes} not in scope -> plain code.
- vault-record.ts GateRecord, VaultRecord: "proof" -> cleartext / "a passphrase or passkey".
- vault-record.ts VaultRecord: the stamp's field list dropped (links VaultStamp).
- vault-record.ts VaultSparse: dropped "What a log line, a refusal's meta, demandConsistentWith and Box.make take" (who uses it).
- proving.ts: module doc moved above the imports; "the gate in hand"/"vault record in hand" -> held throughout; "as it stood" -> "as it was".
- proving.ts ProvingTools.putLease: {@link DeviceDB.putLease} not in scope -> plain words.
- proving.ts registerProvingTools: "what a Vault object's constructor calls" -> instruction.
- proving.ts Proving: the tour of what it holds dropped ("its vault, its slotlabel, the header it was sealed over, what it was made under (the vault record's scope, vault_tok and gate_epoch as it was sealed), the gating that made it, and the wayinKey"); kept what shows and what does not.
- proving.ts grantLease: the step-by-step "In order: ..." rewritten as its contract (STYLE: never the order of steps). Kept: nothing awaited between the demands and the store; a lock or gating's end before refuses 'gating_landed'; after, erases the lease behind it in the device store's order; the post-store demand on vault_tok and gate_epoch never asks for a lease; a refusal there holds nothing. Dropped: "a fresh leaseKey" (sealLeaseRecord says it), "the vaultKey unwrapped from its wayin".
- proving.ts #unwrap: first line 37 words -> 17 (brief's ask).
- proving.ts PassphraseProving.seal: dropped "to prove the gate in hand" from the first line.
- proving.ts sealWayins: "in one method so the vaultKey never crosses" kept as its own sentence.
- proving.ts deriverThrewRefusal: "as the deriver heard the passphrase, and a throw may quote it" -> "as a throw may quote the passphrase".
### src/: bank, gatings, bank options
- gating.ts: module doc moved above the imports.
- gating.ts Gating: dropped the inline list of the correctable kinds (CorrectableKindVals, linked, is the list).
- gating.ts GatingCommon.leaseMillis: "an unlock this gating grants" -> "the lease this gating grants" (unlock as a noun).
- gating.ts decline, GatingTools.freshen/delVault: "in hand" -> held; "the picture in hand" -> "the vault record held".
- gating.ts landLock: "while it stood" -> "while it was pending".
- gating.ts #grantAfterChange: "said through the logger" -> "logged as a warning" (it is logger.warn).
- gating.ts #freshenGated: first line 36 words -> 13 (brief's ask); now names 'absent_vault', which the code throws.
- bank.ts Bank: gathered into the class doc: a bag amiss refuses 'bad_scope', options amiss 'bad_option', before storage is touched (was on vaultOf, bankVaultOf, closeVault, ensureVault, clearCachedVault); and "a call refuses with what storage beneath it refuses, as it came, unless its doc says otherwise".
- bank.ts ensureVault: dropped 'identity_revoked' and 'storage_unavailable' as pass-throughs; added, from #bear, that a birth refused 'identity_revoked' or 'vault_behind' erases this device's lease. Dropped "a store in the bag naming the vault refuses 'bad_scope', as any field but its names does" (class doc). The reach now names DeviceDB.getDeviceRecord.
- bank.ts closeVault: "A prompt up for a proof ends" -> "A pending gating ends".
- bank.ts closeVaults: "what an app does at sign-out" -> instruction.
- bank.ts clearCachedVault: dropped "no unlock" (noun); dropped "a bag or options amiss refuse 'bad_scope' or 'bad_option'... keeping it listed" (class doc's misuse).
- bank.ts delDamagedVault: dropped the restatement of what storage checks ("it deletes only a vault record that fails its checks and still names its vault_tok"): the delDamagedVault function's doc says it; dropped "'storage_unavailable' and the rest"; dropped "and resolves" after "erases only this device's lease"; dropped "no unlock".
- bank.ts BankVault, BankSnapshot, LibsLoad, lifecycle: "where ... stands" reworded (stage / lifecycle), clear of the retired "standing".
- bank.ts #publish, #relist, #demandSameScope: caller lists turned into instructions or dropped.
- bank.ts #initialize: first line 50 words -> 21.
- bank.ts #loadThenSettle, #bearFrom: {@link} to private members -> plain code.
- bank.ts #bear: "asks for a proof" -> cleartext.
- vault-opts.ts MakeBankOpts.user_id: dropped the character list and "percent-encode (RFC 3986) one that holds anything else" (the exported user_id's doc says both).
- vault-opts.ts MakeBankOpts.leaseHours: "a proof's lease" -> "a lease ... after a gating unlocks it".
- vault-opts.ts MakeBankOpts.onBadNews: added that a throw at a birth's news, with no Vault object yet, goes to the logger and reportError alone (bank.ts #tellBadNews).
- vault-opts.ts MakeBankOpts.clock: dropped "now() returns epoch milliseconds, as Date.now() does, from 1981 to 2255; fractions rounded down. Bank.make reads it once, and refuses 'bad_option' for one out of bounds or one that throws. Every later reading is taken as it comes." (the Clock type's doc says it; linked).
- vault-opts.ts MakeBankOpts.logger: dropped "The vault hands it no secret material and no option's value; a host's own error goes as the host made it. Whatever it throws is ignored. Pass functions that do nothing for quiet." (VaultLogger's doc says each, the silent logger as its example).
- vault-opts.ts MakeBankOpts.strengthChecker: dropped what StrengthChecker's doc says: when it runs (initialize_gate, change_passphrase; before any derivation; never on unlock), what it hears (passphrase and scope), "make it once, before any bank", its load at hello, "each vault asks it as vault.checkStrength(typed)", and the 'bad_option' / 'unexpected_error' refusals for a bad checker.
- vault-opts.ts makeBankOpts/bankVaultOpts, the option validators, vaultPartsOf: first lines untangled.

## Proposed renames

1. `RefusalPolicy.decide(refusal)` to `responseOf(refusal)`. Its first line is "What a vault does
   about a storage refusal beyond throwing it": a pure function, so `fooOf`; `decide` names no
   object.
2. `Proving.wrongProof()` to `wrongCleartext()` (or `wrongCleartextError()`, beside `lockedError`).
   VOCABULARY.md retires "proof"; the refusal is of cleartext that does not open the wayin.
3. `checkSealProps` in `lease.ts` to `checkedSealProps`: it returns `{ whisper }`, and STYLE's verb
   table keeps `checkFoo` for one that returns nothing. (`box.ts`'s `checkSealProps` returns nothing
   its caller uses, and may keep its name.)

## Open questions

1. **`stableJsonify`'s key order.** Its doc said "sorted by code point"; safe-stable-stringify
   sorts by UTF-16 code unit (`{ '\uFF61': 1, '\u{1F600}': 2 }` puts the emoji first; by code
   point it would come second). The doc now says code unit. Both orders are stable across
   devices, so stamps are unaffected; is code unit what was meant?
2. **`makeVaultKey`.** Its doc said "The vaultKey a vault holds between operations is a separate,
   non-extractable unwrap". No one holds a vaultKey between operations: a lease keeps it wrapped and
   unwraps it non-extractable for each call (`Lease.#vaultKeyOrNull`). The doc now says so. A
   security statement, rewritten rather than kept: please confirm.
3. **`Box` takes its vault unchecked.** The class doc said "A missing or malformed vault, record or
   option throws 'bad_option'". `Box.make` refuses a bad record 'bad_record', and neither `Box.make`
   nor `Box.seal` checks `vault`: `seal` meets a non-vault as 'vault_locked', and `make` builds a
   Box over it. The doc now says what the code does. Should an exported `Box.make` check its vault
   (CLAUDE.md, *Validate at each module entrypoint*)?
4. **Refusal messages still say "proof".** `Lease.make`'s two 'corrupt_record' messages ("the vault
   asks for a proof instead") and `box.ts`'s `lockedError` ("which asks for a proof"). Messages are
   behaviour, so they stayed; a follow-up could reword them.
5. **`onBadNews` at a birth.** `MakeBankOpts.onBadNews` said a handler's throw "becomes the vault's
   `trouble`". At a birth there is no Vault object: `Bank.#tellBadNews` only logs and reports it.
   The doc now says so; is that the intended contract?
6. **`MakeBankOpts` hovers say less.** `clock`, `logger` and `strengthChecker` now link their types'
   docs rather than restating them, as STYLE's *Say a thing once* asks; an editor hover on
   `Bank.make({ strengthChecker })` shows one line and a link. Put any back that a host needs at
   the option itself.
