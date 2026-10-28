---
"safebyok": minor
"safebyok-convex": minor
---

**Breaking: validators are renamed, and the `Validators` namespace is gone.** Every validator is now named in lowerCamelCase beside its type, which keeps its ModuleCase name, and the main entry exports each by name: `import { boxSparse, type BoxSparse } from 'safebyok'`, then `boxSparse.parse(row)`; or star-import the main entry, `import * as Safebyok from 'safebyok'`, then `Safebyok.boxSparse.parse(row)`. An enumeration's list of values is lowerCamelCase too, beside its checker and its type. Nothing a validator accepts or refuses changes, nor any refusal's kind or message. Find and replace each name below where you use the value (`.parse`, `.safeParse`, `typeof`, a schema built on it); a type annotation (`: BoxRecord`) stays as it is.

**`Validators` is gone.** The main entry no longer exports a namespace of validators: each one `Validators` held is exported by name, under its new name below, so `Validators.vault_tok` is `vault_tok` and `Validators.makeBankOpts` is `makeBankOpts`. Replace `import { Validators } from 'safebyok'` with the names you use, or with `import * as Safebyok from 'safebyok'` and `Safebyok.` where you wrote `Validators.`. `Validators.BoxRecord` as a type is gone too: import the type by name.

Validators, old -> new:

* `EpochMillis` -> `epochMillis`; `Whisper` -> `whisper`; `Sidecar` -> `sidecar`; `Ciphered` -> `ciphered`
* `BoxRecord` -> `boxRecord`; `BoxSparse` -> `boxSparse`; `BoxDamaged` -> `boxDamaged`; `BoxStamp` -> `boxStamp`
* `LeaseRecord` -> `leaseRecord`; `LeaseStamp` -> `leaseStamp`; `DeviceRecord` -> `deviceRecord`
* `VaultRecord` -> `vaultRecord`; `VaultSparse` -> `vaultSparse`; `VaultStamp` -> `vaultStamp`; `VaultTombstone` -> `vaultTombstone`
* `GateRecord` -> `gateRecord`; `GateSparse` -> `gateSparse`; `WayinRecord` -> `wayinRecord`
* `PassphraseWayinRecord` -> `passphraseWayinRecord`; `PasskeyWayinRecord` -> `passkeyWayinRecord`; `PassphraseWayinSparse` -> `passphraseWayinSparse`; `PasskeyWayinSparse` -> `passkeyWayinSparse`
* Formerly in `Validators` only: `VaultDraft` -> `vaultDraft`; `Capacity` -> `capacity`; `VaultRecordExpectation` -> `vaultRecordExpectation`; `BoxGetExpectation` -> `boxGetExpectation`; `BoxExpectation` -> `boxExpectation`; `VaultDelExpectation` -> `vaultDelExpectation`; `BoxDelExpectation` -> `boxDelExpectation`; `BoxDeletion` -> `boxDeletion`
* Formerly in `Validators` only: `passkeyAnswerShape` -> `passkeyAnswer`, named for its type `PasskeyAnswer`. `vaultDBShape`, `deviceDBShape`, `clockShape`, `keyDeriverShape` and `loggerShape` keep their names.
* Not exported, the package's own: `MadeUnderShape` -> `madeUnder` and `CipheredShape` -> `boxCiphered`, each named for its type (`MadeUnder`, `BoxCiphered`).
* `VaultScope` -> `vaultScope`. `VaultScope` was the same object as `Validators.vaultScope` under a second name: the main entry now exports it as `vaultScope`. The type `VaultScope` is unchanged.

Lists of values, old -> new:

* `BoxDamageVals` -> `boxDamageVals`; `WayinKindVals` -> `wayinKindVals`; `CorrectableKindVals` -> `correctableKindVals`; `GatingKindVals` -> `gatingKindVals`; `RefusalFamilyVals` -> `refusalFamilyVals`; `RefusalKindVals` -> `refusalKindVals`
* `safebyok-convex/server`: `SafebyokErrorKindVals` -> `safebyokErrorKindVals`

`Scopepath.bankScope`, `Scopepath.vaultScope` and `Scopepath.boxscope` keep their names. `safebyok-convex`'s own Convex validators, inside its component, are lowerCamelCase too; a host calls the component through `SafebyokComponent`, whose functions and arguments are unchanged.

**Stored format:** unchanged.
