# The export surface of the new `safebyok`: a proposal

Read at `/workspace/byok-records` (branch `20261118-records`, tip `dfe63d03d`). Read-only: no file was changed.

> "I'd rather the later problem of deprecating a foolish export than the now problem of agents writing bad code for not exporting." (the Coach)

Importing `safebyok` was meant to bring in everything from `safebyok/core`. Before 1.0 nothing binds backward, so the
cost of a foolish export is a deprecation later.

**Today:** the front door has 111 names, `core` 128, `storage` 89. 38 of core's names are missing from the front door
(the classes `Lease`, `Gate`, `Gating`, `Wayin`, `CoreBox`, `BaseThing` as values; the make-option and sealer types;
`guardRequestCleartext`, `withoutSecrets`). 42 of storage's names are missing too (`AdapterVaultDB`, the asks and
answers, `Classifier`). **Nothing imports `safebyok/core`.** The giver imports `safebyok` and `safebyok/storage`, and
postgres imports `safebyok/storage`. Both still reach into big for `Checkers`, `Throwers`, `Validator` and `EX`.

## 1. `safebyok`, the front door

```ts
export * from './core'
export * from './storage'
export { ThingMinder } from './minding/thing-minder'   // + carOf, dbHasNewer, shapes-minder, as today
export { DefaultStrengthChecker, guardStrengthChecker } from './helpers/passphrase-strength'
// + the re-exports from big (section 3)
```

All three re-export the same declarations, so `export *` should raise no ambiguity. Even `Sealed`, which both
shapes-thing and shapes-sealers export, is one binding. *Unsure until a typecheck runs.*

| Export | Kind | Who needs it (found) | Rec. |
|---|---|---|---|
| `Bank`, `Device`, `ThingMinder`, `MemoryVaultDB`, record types, checker bundles, guards | class / type / value | giver (`ThingMinder`, `BoxCar`, `dbHasNewer`, `carLivenessVals`) | keep |
| `Gate`, `Gating`, `Wayin`, `CoreBox`, `BaseThing`, `Lease` as values | class | reached already: `bank.maingate`, `maingate.main`, the `Gating` handed to `requestCleartext`; the records thread's planned statics (`Gate.isTombstone`) | add |
| `TombstonePublicProps`, `LivePublicPropsOf`, `Sealer`, `SealTags`, `RevisionOf`, `UnsealedOf`, ... | type | **named by `Bank.sealBox`'s overloads**, which the front door exports today without them | add |
| `BankOpts`, `BankDna`, `BirthOpts`, `GateOpts`, `GatingOpts`, `GatingRecord`, `LeaseOpts`, `LeaseRecord`, `LeaseStamp`, `StampedGate`, `ProvingDevice`, ... | type | named by the `make` signatures | add |
| `Proving`, `PassphraseProving`, `PasskeyProving` | type only | named by `Bank.unlockByProving` and `Bank.birth` | add as types; **values stay off every entry** (section 4) |
| `guardRequestCleartext`, `withoutSecrets` | value | none found | add through `export *` (harmless) |
| `AdapterVaultDB`, `Received`, `Classifier`, `getAskOf`..., `Actual`, `Answer`, `Track`, `DamagedThing`, ... | class / ns / type | postgres; a host that writes its own store | add |
| `GuardedKeyDeriver` | type | named by `Device.keyDeriver`; on no entry today | add (to core) |

**What must stay off:** `safebyok/testing` (it loads vitest), and a `safebyok/browser` once there is one (Argon2id,
zxcvbn, idb-keyval: big's own reason, `notes/good_bank_opts_are_in_browser.md`). Proving values stay off too. Nothing
else I found warrants a fence. One cost to name: storage's generic names (`Answer`, `Actual`, `Received`, `Track`)
land in a host's autocomplete.

## 2. The subpaths, once the front door is generous

| Entry | What it is for | Rec. |
|---|---|---|
| `safebyok/core` | The gate and the lease without the minder: no `ThingMinder`, no `@tanstack/query-core`. It is the layering line CLAUDE.md draws ("gate and lease kept apart from networking, caching"). It has no consumer. | Keep, as a strict subset of the front door. Also re-export big's refusals and logger, because `Device.endCause` names `VaultError`. |
| `safebyok/storage` | The adapter's contract: `AdapterVaultDB`, the asks, the answers, the classifier | Keep. Add what adapters reach into big for (section 3). |
| `safebyok/testing` | The adapter battery | Keep separate |

Big kept storage off its front door "so the contract a storage adapter is written against stays off the host's front
door" (big's `tsdown.config.ts`). That is a semver argument, and before 1.0 it does not hold.

## 3. Re-exports from big, judged by what big's consumers import

Already re-exported: `VaultError`, `IsVaultError`, `isVaultError`, the refusal types, `DefaultLogger`,
`setDefaultLogger`, `KeyDeriver`, `VaultLogger`, `PrfAnswerSize`, `PasskeyAnswer`, `PassphraseCleartext`,
`PassphraseVerdict`, `Sidecar`, `Whisper`.

| Add | Kind | Evidence | Where |
|---|---|---|---|
| `Outcome`, `GoodOutcome`, `BadOutcome` | type | named by `Gating.attempt` and `whenConcluded`; the demo imports `Outcome` | front |
| `WayinHeader`, `PassphraseWayinHeader`, `PasskeyWayinHeader`, `WayinRecord`, `Wayinkind` | type | named by `Gating.passkeyHeader`, `Wayin.pickle()` and `wayinkind`; react imports `WayinHeader` | front |
| `Modelkind` | type | every model's `modelkind` | front |
| `correctablekindVals`, `refusalkindVals`, `RefusalFamilyForKind` | value / type | react and demo (`correctablekindVals`); graphql (`refusalkindVals`) | front |
| `MinuteMillis`, `ForeverMillis`, `PasskeySaltSize`, `PassphraseSaltSize`, `MaxLabelChars`, `MaxUserIdChars`, `Patterns` | value | react | front |
| `Checkers`, `Checker` (and `objCheck`) | value | the giver (`minder-bank.ts`, `react-giver.ts`), convex; postgres uses `Validator.objCheck` | front |
| `Awaitable`, `GotAct`, `PutAct`, `DelAct`, `WriteAct`, `StoragePolicy`, `storagePolicyVals` | type / value | named by `AdapterVaultDB`'s abstract `do*` methods; postgres imports `EX` from internals for this | storage |
| `storageIssue`, `storageUnavailable`, `storageFailed`, `fetchFailed`, `unexpectedError`, `identityRevoked`, `sanitizeForeignError` | value | postgres (`Throwers.storageIssue`); the big adapters (`DB.*`) | storage |
| `toB64`, `fromB64`, `WhisperFieldAttributes`, `mask`, `mash` | value | react | front, or a `safebyok/utils` |
| `HostErrorSanitizer` | ns | react. *Unsure* whether the new core keeps the idea. | defer |

**Do not re-export** big's models (`Box`, `Vault`, big's `Bank`, `Device` and `Gating`, `DeviceDB`, `BankSnapshot`...):
each would be a second class under a name the new core already uses, or one it replaced. Note that `UserID`
(big) and `Userid` (new) are split: the giver takes `UserID` and `Banklabel` from big, and should take them from
`safebyok`.

## 4. The front-door test's six names

`tests/index.test.ts` (11f72f61c, an agent's commit) checks runtime properties. `Gate`, `Gating` and `Wayin` are
exported from the front door **as types**, so the test forbids only their values. `Lease` is type-only even in core,
so its check can never fail.

| Name | What it exposes publicly | Verdict |
|---|---|---|
| `Lease` | private constructor; `make(record, {bank})` needs a `LeaseRecord` that holds the leaseKey handle and the wrapped bankKey, which only `Proving.buildLease` makes; `seal`, `unseal`, `evict`, stamp getters, no key getter | **Arbitrary.** The class is useless without key material the host cannot get. Export. |
| `Gating` | `make(record, {device, bank, attempt, askUser})`, `launch`, `attempt`, `dismiss`, `judgeStrength`; the host is handed instances | **Mostly arbitrary.** One real gap: `gatingMakeArgs` checks `askUser` as `fn()`, not by its `brandGuarded` brand. A host-made gating with a raw `askUser` that throws leaves an unhandled rejection, with the device's one gating slot held. Fix it with a brand check, not a fence. |
| `Gate` | private constructor; `make`, `makeRecord`, `demandPasskeyAddable`, wayin getters; no key | **Arbitrary**, and hosts will call its planned statics. Export. |
| `Wayin` | `make(record)`, `pickle`, `toJSON`; `bank_key_wayin_wrapped` is stored ciphertext, already reachable as `bank.maingate.main` | **Arbitrary.** Export. |
| `CoreBox` | statics only (`encode`, `decode`, `sealedOf`, `recordOf`, ...); it holds no key, and sealing is the Lease's job | **Arbitrary**, and likely home of the box guards. Export. *Unsure* whether the name will survive. |
| `guardRequestCleartext` | a pure wrapper, used once in `Device`'s constructor | **Arbitrary.** Export, or drop it from core. |

**The one legitimate line is `Proving`, which is not on the test's list.** In the new core `Bank.unlockByProving(proved)` is
**public**, and `proving.buildLease(bank, gate)` is public. A host holding a `PassphraseProving` value could:

* unlock a bank outside any gating;
* build a free-floating `Lease` that `bank.lock()` never evicts. `Lease.isEnabled` checks only the device.

That is a state the core does not guard. Big's G9 rests on exactly this ("the entry points export neither `Lease` nor
`Proving`"). The `Lease` half of that is moot, since a Lease is unconstructible without a proving. The new core already
exports Proving as types only. Also, **`notes/guarantees-drift.md` has no entry for the public `unlockByProving`**:
G9's "no public Bank method accepts a proving" has drifted. Per SECURITY.md the host is inside the trust boundary, so
this guards against mistakes, not attackers.

Proposed test: every runtime name of `core` and `storage` is the same value on the front door; `VaultError` is big's;
and `PassphraseProving`, `PasskeyProving`, `Proving` and `NOVEL` are absent from all three entries, with the reason
in a comment.

## 5. Judgment calls for the Coach

1. **Front door = `export * from './core'` and `'./storage'`.** Rec.: yes, flat. The alternative,
   `export * as Storage`, avoids autocomplete clutter but breaks the "everything" reading.
2. **Keep `safebyok/core`?** Rec.: keep it as the minder-free subset, the layering line, and give it big's refusals.
   Dropping it costs nothing today, since no one imports it.
3. **Proving values off every entry, and the test rewritten around them.** Rec.: yes. Separately, record the public
   `unlockByProving` as G9 drift.
4. **Drop the test's six names.** Rec.: drop all six. Fix the `askUser` brand check in `Gating.make` as its own small
   change.
5. **Re-export big's `Checkers`, the storage throwers and the `*Act` types**, so that no consumer of the new core
   imports `safebyok-big`. Rec.: yes. These are exactly what the giver and postgres reach into big for.
6. **A `safebyok/browser` re-export of big's Argon2id deriver and zxcvbn.** A new-core host cannot call `Device.make`
   without a `keyDeriver`. Rec.: yes, as its own entry, never the front door.
