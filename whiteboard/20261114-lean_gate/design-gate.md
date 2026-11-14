# Lean gate: what each class needs for three flows

Thread `20261114-lean_gate`, worktree `/workspace/byok-lean_gate`. The new `safebyok` holds Device, Bank, Gate,
Gating, Wayin, Proving and Lease, with no VaultDB (big's BankDB) or deviceDB methods. Each class is made by
`.make(recordish, livepropsAndOpts)` (`notes/gallant.md`, `#record-then-opts`): the record give or take a few fields,
then the live objects and options that come out of band, such as `{ device }`. Helpers, shapes and throwers come from `safebyok-big/internals`, so
`VaultError` stays one class across both packages.

There is no Vault, and no Box class in this layer. A box is a plain `BoxRecord`, whose `lifepath` stands where
`vault_tok` and `box_tok` stood. Boxes take a tree structure later.

Assumed, not built in this layer:

* `bank.put({ ifPresent })` stores the bank's current state, its maingate included. Here it is a seam that rejects;
  tests stub it.
* `gate.put({ policies: [gatingkind] })` does what that gating's verb does today. None of the three flows needs it.

## The three flows

### 1. `device.birthBankPrompt()`

```
device.birthBankPrompt()
  → Gating.make({ gatingkind: 'birth_bank' }, { device: this, bank: null, askUser: this.#askUser, attempt }).launch()
    attempt(cleartexts) = birthBank(device, cleartexts)                                   module function, gating.ts
      const { passphraseClear, passkeyClear } = checkedCleartexts(GX.bankBuildCleartexts, cleartexts)
      const { bankStamp, gateStamp } = Bank.mintStamps(device)
      const passphraseProving = await PassphraseProving.buildNovel(bankStamp, gateStamp, passphraseClear, device)
      const passkeyProving    = passkeyClear ? await PasskeyProving.buildNovel(bankStamp, gateStamp, passkeyClear, device) : null
      const main     = await passphraseProving.buildWayin(NOVEL)
      const passkey0 = await passkeyProving?.buildWayin(passphraseProving) ?? null
      const bankRecord = Bank.makeRecord({ ...bankStamp, maingate: { ...gateStamp, wayins: { main, passkey0 } } })
      const bank = Bank.make(bankRecord, { device })
      await bank.put({ ifPresent: 'fail' })                                               assumed
      await bank.unlockByProving(passphraseProving)
      return bank
```

* Everything through the unlock happens inside the attempt. So a refused put reaches the dialog, and the lease is
  attached only once the bank is stored.
* Birth has create semantics. The put refuses where a live bank stands, and the attempt reports that as
  `gate_made_elsewhere`. Fetching a stored bank, and calling `birthBankPrompt` only where none is stored, is the
  layer above's branch.

### 2. `bank.unsealBox(box)`, giving the box with its whisper, its sealed fields left out

### 3. `bank.sealBox(ante, { whisper })`, giving the sealed `BoxRecord` at the next revision

Generically, `sealFoo(record, cleartexts)` and `unsealFoo(record)`. The record given to a seal is the record without its
sealed fields (`BoxAnte`: `Omit<BoxRecord, 'box_key_wrapped' | 'whisper_ciphered'>`, live or a tombstone), so its
`sidecar` travels in it. New props for the box are a patch, applied elsewhere before the seal.

The lease seals any record, given the kind of Sealer for the part being sealed, and knows nothing of boxes. `sealers.ts`
holds one function-only singleton per sealed part, the export named by its sealerkind: `BoxWhisper` now, and `GateAuth`
for the gate's signed `auth` bag, should it come. The lease takes the sealerkind (`'BoxWhisper'`) and picks the sealer
from the module, so no caller hands it one. A Sealer knows everything about its part:
* the next revision;
* what the seal binds: for a box's whisper, the bank's stamp, then the box's own sparse fields, its `lifepath` among them;
* the ctx purposes for the key and the ciphertext;
* where the ciphertext sits in the record;
* the codec of the cleartext;
* the brands of what it returns: `BoxWhisper` brands its output as a box's whisper, as `GateAuth` would
  brand a gate's signed auth. So the lease brands nothing.

```
Sealer<AnteT, RecordT, CleartextsT>                   sealers.ts
  nextRevisionOf(ante)          → record              the next revision of `ante`: a new life over a tombstone
  stampsOf(record)              → CipherCtxRecord[]   what the seal is bound to, after the bank's stamp
  purposes                      → { key, cipher }     for a box's whisper, 'box_key_wrapped' and 'whisper_ciphered'
  encode(cleartexts)            → string              for a box's whisper, the codec it names (`json_v1`: stableJsonify)
  decode(text)                  → cleartexts          the same, back: damaged_whisper when it will not parse or check
  sealedOf(record)              → Sealed              the wrapped key and the ciphertext, picked out of the record
  recordOf(next, sealed)        → RecordT             the full record, branded

lease.seal(sealerkind, ante, cleartexts) → RecordT    the next revision, sealed
lease.unseal(sealerkind, record)         → cleartexts

bank.sealBox(ante, { whisper })  → this.#demandLease().seal('BoxWhisper', ante, { whisper })
bank.unsealBox(box)              → { ...box without its sealed fields, whisper }, the whisper from this.#demandLease().unseal('BoxWhisper', box)
```

## Per class

### Device

| Signature | |
|---|---|
| `static make(record: DeviceRecord, opts: DeviceOpts): Device` | `DeviceOpts` takes `requestCleartext?` |
| `birthBankPrompt(): Promise<Bank>` | |
| `#askUser: AskUser \| null`, made by `guardRequestCleartext(requestCleartext)` | |
| `attachGating(gating)`, `detachGating()`, `demandEnabled()`, `isEnabled`, `sweep()` | |
| `keyDeriver`, `strengthChecker`, `device_tok`: the `GX.ProvingDevice` world a proving reads | |

### Bank

| Signature | |
|---|---|
| `static make(record: BankRecord, { device }): Bank`, the record holding its `maingate` | |
| `scope`, `stamp`: getters | |
| `static mintStamps(scope): { bankStamp, gateStamp }` | |
| `static makeRecord(dna: BankDna): BankRecord`, its `maingate` made by `Gate.makeRecord` | |
| `unlockByProving(proved: Proving, cited: CitedGate = this.maingate): Promise<this>` | |
| `#attachLease(lease: Lease): void` | private |
| `unsealBox(box: BoxRecord): Promise<BoxUnsealed>` | refuses `record_conflict` for a box of another bank |
| `sealBox(ante: BoxAnte, { whisper }): Promise<BoxRecord>` | the same |
| `put({ ifPresent }): Promise<this>` | assumed: a seam here |
| `lock(): this`, `maingate`, `isLocked`, `isUnlocked` | |

### Gate

| Signature | |
|---|---|
| `static make(record: BX.GateRecord, { bank }): Gate`, the bank a `Pick` of the Bank: its `stamp` | |
| `static makeRecord(bankStamp: BankStamp, dna: GateDna): BX.GateRecord`, the dna a gate stamp with its `wayins` | |
| `scope`, `stamp`, `bankStamp` (getters), `wayins` (with the stamps, the `StampedGate` duck), `gatelabel`, `gate_tok`, `revision_tok` (the `CitedGate` duck), `main`, `passkey0` | |
| `put({ policies: [gatingkind] })` | assumed; not needed here |

A Gate is one frozen revision; a gate verb makes a new one. The Bank's `#maingate` then has to be replaceable.
That comes with `gate.put`, not with these flows.

### Gating

| Signature | |
|---|---|
| `static make(record: { gatingkind }, opts: { device, bank, attempt, askUser }): Gating` | |
| `launch(): Promise<Bank>` | |
| `birthBank(device, cleartexts): Promise<Bank>`, a module function: the `birth_bank` attempt | |
| `checkedCleartexts(checker, cleartexts)`, a module function | |
| `attempt` (refused before `launch`), `dismiss`, `judgeStrength`, `whenConcluded`, `toJSON` | |

The gatingkinds are the core's own, `birth_bank` alone for now. Big's enum still says `build_bank`.

### Wayin

`static make(record)`, `pickle()`, `toJSON()`.

### Proving

`PassphraseProving.buildNovel`, `PasskeyProving.buildNovel`, `buildStored`, `buildWayin(source)`. `buildLease(bank, gate)`
builds the lease whole: it unwraps the bankKey, wraps it under a fresh leaseKey, and hands the record to
`Lease.make`. So the naked bankKey never crosses a method boundary. `bankStamp` and `gateStamp` are getters.

### Lease

| Signature                                                                                                  |                                                      |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `static make(record: LeaseRecord, { bank }): Lease`, the bank a `Pick` of the Bank: its `stamp` and `lock` |                                                      |
| `stamp`: a getter                                                                                          |                                                      |
| `seal(sealerkind, ante, cleartexts)`, `unseal(sealerkind, record)`                                         | brand nothing; refuse a kind `sealers.ts` has no sealer of |
| `evict()`, `isEvicted`                                                                                     |                                                      |

### Sealers (`sealers.ts`)

| Signature                                                                                                                             |     |
| ------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `interface Sealer<AnteT, RecordT, CleartextsT>`: `nextRevisionOf`, `stampsOf`, `purposes`, `encode`, `decode`, `sealedOf`, `recordOf` |     |
| `BoxWhisper: Sealer<BoxAnte, BoxRecord, { whisper }>`, a function-only singleton, of sealerkind `'BoxWhisper'`                  |     |

## Principles

Directions this work leans, not rules.

* **Prompt on the journey in.** A `…Prompt` method asks the user through a gating. The bare verb makes the change
  and asks no one.
* **Secrets stay where they are made.** A proving lives and dies inside its attempt. The bank's lease never leaves
  the bank.
* **Layers stay apart.** This layer holds records and keys. Storing, caching and instance sugar sit above it and call
  in.

## Where things stand

* The relocation is [#696](https://github.com/mrflip/safebyok/pull/696); this thread stacks on it.
* Built, in `packages/safebyok`, exported as `safebyok/core`: the seven classes and `sealers.ts`, the three flows end to end, with tests ported from
  big's DB-free cases.
* `BoxRecord` is still big's, with `vault_tok` and `box_tok`: `lifepath` waits on its definition. The box seal binds
  the bank's stamp, then the box's sparse fields; it no longer binds a vault stamp.
