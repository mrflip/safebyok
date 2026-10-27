---
"safebyok": minor
"safebyok-convex": minor
---

**Breaking, a rename only.** Every validator is now named in lowerCamelCase beside its type, which keeps its ModuleCase name: `import { boxSparse, type BoxSparse } from 'safebyok'`. An enumeration's list of values is lowerCamelCase too, beside its checker and its type. Nothing a validator accepts or refuses changes, nor any refusal's kind or message. Find and replace each name below where you use the value (`.parse`, `.safeParse`, `typeof`, a schema built on it); a type annotation (`: BoxRecord`) stays as it is. The `Validators` namespace holds the same validators under the new names, and only validators: import a type by name from the main entry.

Validators, old -> new, at the main entry and in `Validators` alike:

* `EpochMillis` -> `epochMillis`; `Whisper` -> `whisper`; `Sidecar` -> `sidecar`; `Ciphered` -> `ciphered`
* `BoxRecord` -> `boxRecord`; `BoxSparse` -> `boxSparse`; `BoxDamaged` -> `boxDamaged`; `BoxStamp` -> `boxStamp`
* `LeaseRecord` -> `leaseRecord`; `LeaseStamp` -> `leaseStamp`; `DeviceRecord` -> `deviceRecord`
* `VaultRecord` -> `vaultRecord`; `VaultSparse` -> `vaultSparse`; `VaultStamp` -> `vaultStamp`; `VaultTombstone` -> `vaultTombstone`
* `GateRecord` -> `gateRecord`; `GateSparse` -> `gateSparse`; `WayinRecord` -> `wayinRecord`
* `PassphraseWayinRecord` -> `passphraseWayinRecord`; `PasskeyWayinRecord` -> `passkeyWayinRecord`; `PassphraseWayinSparse` -> `passphraseWayinSparse`; `PasskeyWayinSparse` -> `passkeyWayinSparse`
* In `Validators` only: `VaultDraft` -> `vaultDraft`; `Capacity` -> `capacity`; `VaultRecordExpectation` -> `vaultRecordExpectation`; `BoxGetExpectation` -> `boxGetExpectation`; `BoxExpectation` -> `boxExpectation`; `VaultDelExpectation` -> `vaultDelExpectation`; `BoxDelExpectation` -> `boxDelExpectation`; `BoxDeletion` -> `boxDeletion`
* `VaultScope` -> `vaultScope`. `VaultScope` was the same object as `Validators.vaultScope` under a second name: the main entry now exports it as `vaultScope`, and `Validators.VaultScope` is gone.

Lists of values, old -> new:

* `BoxDamageVals` -> `boxDamageVals`; `WayinKindVals` -> `wayinKindVals`; `CorrectableKindVals` -> `correctableKindVals`; `GatingKindVals` -> `gatingKindVals`; `RefusalFamilyVals` -> `refusalFamilyVals`; `RefusalKindVals` -> `refusalKindVals`
* `Refusals.StaleWriteVals` -> `Refusals.staleWriteVals`
* `safebyok-convex/server`: `SafebyokErrorKindVals` -> `safebyokErrorKindVals`

`Scopepath`'s three readers of a scope from a scopepath are renamed for what they do, so none shares a validator's name: `Scopepath.bankScope` -> `Scopepath.bankScopeOf`, `Scopepath.vaultScope` -> `Scopepath.vaultScopeOf`, `Scopepath.boxscope` -> `Scopepath.boxscopeOf`.

`safebyok-convex`'s own Convex validators (`VaultRecord`, `BoxRecord`, ... in its component) keep their names.

**Stored format:** unchanged.
