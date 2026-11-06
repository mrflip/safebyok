# Thread 2: claims the code on `main` no longer bears

For the Coach, and for whoever strikes or rewrites these clauses. Each stands in `notes/guarantees.md`
as it was written; the pass changed names and paths only. Checked at `main` 57f33ee9.

**F1. The old core's clauses describe `packages/safebyok-old`, not the published core.** The old core
moved to the private, frozen `packages/safebyok-old` (pkgsplit), where every one of these names still
stands; `packages/safebyok` has none of them. Where a guarantee pairs an old-core clause with an
"In `src/models/`" twin, the twin is what `main` publishes, and the two sometimes disagree (G2: the old
clause zeroes the PRF bytes in `PasskeyProving.seal`'s `finally`; the twin says no proving zeroes them).
Old-core names left standing:
- G1: `attemptOf`, `PassphraseProving.seal`, `vault.tryCheckStrength` in the chain sentence.
- G2: `PasskeyProving.seal`'s `finally`, `spendAnswer`.
- G4: `KeptLease.tryGet`, the lease dropped at its `ask_passphrase_at`; *Kept by* `idb.ts` (the core
  has no IndexedDB DeviceDB: `storage/device-db-new.ts`, `storage/memory-device-db.ts`).
- G6: `Box.seal`, `whisperBytesOf`, `#checkWhisperFits`, `extractWhisper`, `mask` from `safebyok/utils`
  (no `safebyok/utils` entry point, no `mask`).
- G9: `KeptLease`, `#loadFromStorage`, `#applyVault`, `leavesInForce`, `#takeUpFromPantry`,
  `#takeUpAtBirth`, `leaseOn(vault)`, `heldLeaseOf`, `vault[provingTools]`, `putLease`, `holdLease`.
- The secret-values table: `KeptLease` (leaseKey row); `PasskeyProving.seal`, `spendAnswer` (PRF row);
  `Box.seal`, `box.extractWhisper` (whisper row).
- Access points: the passphrase chain whole (`attemptPassphrase` to `checkedPassphraseHeader`), the
  passkey chain's first half (`attemptPasskey` to `spendAnswer`), the leaseKey's carried chain
  (`DeviceDB.putLease`, `idb.ts`, `Lease.make`, `KeptLease`, `DeviceDB.getLease`, `DeviceDB.delLease`,
  `vault.#lockNow`, `del-damaged-vault.ts`), the whisper's chain whole (`#sealAndPutBox` to `useWhisper`).
- The minimal-path paragraph: the passkey bytes "imported ... and zeroed" by `PasskeyProving.seal`. In the
  core `PasskeyProving.buildNovel` and `buildStored` zero nothing; `spendClears`
  (`models/gating.ts:266`) zeroes them after the attempt, or leaves them on a correctable refusal.
- Open item 1, `vaultRecordHeldBy`: only in `packages/safebyok-old/src/proving.ts:92`.

Recommendation: strike the old-core clauses and let the models twins stand alone, writing the missing
twins (the passphrase and whisper access chains, the leaseKey's carried chain) from the code, as one
follow-up thread with a Coach's ruling.

**F2. G8 and *Where the guarantees are kept*: "Each guard hands what it caught to
`HostErrorSanitizer.refusalFor`."** Only the strength checker's does:
`helpers/passphrase-strength.ts:89` `throw HostErrorSanitizer.refusalFor(err, 'unexpected_error', ...)`.
The deriver's guard is `models/proving.ts:196-199` `catch { throw keyDeriverThrew() }`, and the
dialog's `models/gating.ts:87-88` `catch { this.#endAsking(requestCleartextThrew()) }`: neither calls
`refusalFor`. Both keep nothing of the throw, so the guarantee (no host throw kept) holds; the named
route does not. G8's `deriverThrewRefusal (kind only, logged)` and `guardRequestCleartext (kind only,
logged)`: the core logs neither. Threads 5 and 7 move these sites (thread 7 wraps the host functions once
in Bank's constructor); recommend the rewrite wait for thread 7.

**F3. G8: "Every validator's refusal quotes no input: `tests/validators.test.ts`, *no refusal repeats
its input*."** The sweep lives only in `packages/safebyok-old/tests/validators.test.ts:92`. The core's
`tests/helpers/validator.test.ts` has no sweep, and one case asserts the opposite for a record-keyed
schema: `:70` *repeats the keys of a schema keyed by its input in the refusal*, expecting
`meta.fieldnames` to be `['host_chosen_key']`. Recommend: the claim narrows to values (a key a host
chose is not a secret), and a sweep is ported to the core.

**F4. G8: "The invariant at the one catch that ends each Lease and Box throwing form (`refusalOf`,
`outcome.ts`)."** `refusals/outcome.ts:81` defines `refusalOf`, and nothing in `packages/safebyok/src`
calls it (`helpers/validator.ts:219`'s `refusalOf` is another function). The Lease and Box `try*` forms
go through `outcomeOf`, which defaults to `unexpectedError`. Recommend naming `outcomeOf` there, a
change of site the Coach should rule on.

**F5. G9: "A `Box` reaches the Lease through the module-private `heldLeaseOf`."** The models' `Box`
reaches it through public `Vault` methods: `models/vault.ts:276` `sealStampedString` and `:282`
`unsealStampedString`, called from `models/box.ts:261` and `:139`. No key crosses; the route is public.

**F6. G9: "The entry points export `Lease` and `Proving` as types and classes alone."**
`src/index.ts` exports neither: `Bank`, `Box`, `Gating`, `Vault`, `Whispered`, `VaultError`,
`isVaultError`, and types. Recommend: "export neither `Lease` nor `Proving`".

**F7. Open item 2: "The core's `Box` of G6 holds no whisper; the models are not yet exported."**
`src/index.ts:1-4` exports the models' `Bank`, `Box`, `Gating`, `Vault`.

**F8. G10: "a deriver wearing a supplied label must carry exactly its parameters (`Bank.make`)."**
`Bank.make` (`models/bank.ts:80`) checks no spec; `keyDeriverShape` (`shapes/shapes-core.ts:197`) has no
spec check. The check is `checkSuppliedSpecKept` (`deriver/basederiver.ts:25`), through
`parseKeyDeriverSpec`, called by `argon2idDeriver` (`deriver/argon2id-webv1.ts:8`): a host's own
deriver under a supplied label is not checked.

**F9. G10: "Randomness from `crypto.getRandomValues` and `subtle.generateKey` alone (`randomBytes`,
`randomId`, ...)."** `helpers/crypto.ts:25` `randomId = (): string => crypto.randomUUID()`, as in the old
core: pre-existing. Recommend adding `crypto.randomUUID` to the sentence.

**F10. *The construction*: the ctx names "for a wayin its `format`".** No wayin field is a format:
`wayinCtxOf` (`models/wayin.ts:14`) binds `vaultStamp` (`shapes/shapes-gateish.ts:155`: applabel,
user_id, vaultlabel, vault_tok, registered_at), the purpose, and the wayin header (`shapes-storage.ts:73`:
wayinkind, key_deriver_label, salt_b64, device_id, registered_at). Recommend dropping the clause.

**F11. G8's WebCrypto sentence is #511's, adopted verbatim.** It narrows the old claim: the old text
counted "the cipher step of `Lease.cipheredWith`" among the caught; `Lease.sealWith`
(`models/lease.ts:130`) catches nothing, and #511's wording says so. The meaning change is #511's,
reviewed there; adopting it spares the restack. Review found the route wrong for the seal: `Vault.putBox`
(`models/vault.ts:323-326`), `box.put` (`models/box.ts:152`) and `putExposed` reach `Lease.sealWith` with no
`outcomeOf`, so a raw DOMException reaches the host, and only the `try*` forms wrap it. The sentence is
corrected in #511 (ac7ecf8e9) and carried here word for word; #511's changeset tells a host.

**F12. G2: "Checked by: ... `tests/wayin.test.ts`".** No core counterpart. `tests/models/wayin.test.ts`
tests the record check, `pickle` and `toJSON`, none of G2. The nearest core case is
`tests/models/proving.test.ts:387`, *binds the wayin to its vault: under another vault's stamp it will not
open*. The citation stands as written. Recommend
dropping it from G2, or porting the old core's case to the core.
