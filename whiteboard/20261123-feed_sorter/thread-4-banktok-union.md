# Thread 4 rework: an ask carries the bank's lifetok; the item notice is a union; the SortedVaultDB is made at hello (2026-11-24)

For the Coach, and for whoever picks up thread 4: Changes E, F and G on the Coach's rulings of 2026-11-24, commit
`383f46e33` on `20261124-sorted_feed`. The seven Minder tests still fail, unchanged (same assertions, same lines).

## Change E: every ask carries `bank_lifetok`

`AskChecks.getAsk`, `listAsk`, `writeAsk`, `birthBankAsk` and `loggableAsk` each take an optional `bank_lifetok` (the
UUID check of a stored lifetok), so `GetAsk`, `ListAsk`, `WriteAsk`, `BirthBankAsk` and `LoggableAsk` all carry
`bank_lifetok?: string`. The drafts (`GetAskDraft` and the rest) take `bank_lifetok?: Lifetok`. It is the sender's: a
vaultDB checks its shape and nothing more (`AskChecks`' doc block, and a comment at the check).

* **Who sets it**: `Bank.makeGetAsk`, `makeListAsk`, `makePutAsk` and `makeDelAsk` set `bank_lifetok: this.lifetok`
  (the Bank object's own life, beside its `track`; both may be stale, and the answer's `world` says so). The gating's
  birth sets `bankRecord.lifetok`, the record it births. `Device`'s fallback builders, before it has a bank, send none.
  `Gate.#putGate` sends none (it sends no track either; see open matters).
* **`getAskOf` and `listAskOf`** spread `optionalsGiven({ track, bank_lifetok })` (was `trackGiven(track)`), so an
  undefined field is left out, as before.
* **Where a notice gets its `bank_lifetok`** (`SortedVaultDB`):
  - an answer's notices: `answer.ask.bank_lifetok ?? answer.world?.lifetok ?? #bankLifetok`;
  - a feed notice: its own, else `#bankLifetok`; a bell notice: its own, else `#bankLifetok`;
  - `#bankLifetok` is the lifetok of the newest answer's `world`, set before that answer's notices go out. It is never
    read from a val, and never from an ask.
  - `lifetokOf`, the `BankChecks` import and the `seens` argument of the stamp are gone; one private method,
    `#notifyEventsOfAnswer(answer, seens)`, replaces the four `#notifyEventsOf(seens, #stampOf(answer, seens))` calls.

## Change F: `VaultItemEvent` is a union on liveness

```ts
export type VaultItemEvent = VaultEventOf<'item'> & ItemSeen

export type ItemSeen =
  | Readonly<{ liveness: 'full', val: LiveOf<ThingRecord> }>
  | Readonly<{ liveness: 'soon', val: Sparse<LiveOf<ThingRecord>> }>
  | Readonly<{ liveness: 'gone', val: Tombstone<ThingRecord> }>
  | Readonly<{ liveness: 'void', val: VoidSentinel }>
```

`ItemSeen` is exported from `safebyok/storage` and `safebyok/core` beside `VaultItemEvent`.

* **Producers**: `itemSeenOf(seen)` (exported from `feed-sorter.ts`) builds the case from the guards: void sentinel,
  then live whole or sparse, then a tombstone. `FeedSorter.eventify` and `AdapterVaultDB`'s raw notice both spread it;
  the adapter's own `livenessOf` is gone. `SortedVaultDB` passes the sorter's events through.
* **Casts**: one `as` added, `seen as Tombstone<ThingRecord>` in `itemSeenOf`: the last case is reached unguarded,
  since `Thing.isTombstone` narrows to the whole tombstone and a sparse one has no predicate; the sorter's check has
  passed it as live or a tombstone. None removed. The adapter's three casts in `answerOf` are untouched.
* **Consumers**: `Minder.#takeNotice(event)` returns for a void, and hands the rest to `sendToTSQ`, a comment
  saying what each case does there. Behaviour unchanged. `bell` checks `liveness` (one of `livenessVals`), then a
  `void` notice's val as the void sentinel (`VoidSentinelExpected`) and any other's as a Thing's fields, never the
  sentinel (`ThingFieldsExpected`); `RecordOrVoidExpected` is gone. Test builders (`TH.itemEventOf(record,
  bank_lifetok?)`, the Minder world's `noticeOf`, `sparseNoticeOf`) derive the case with `itemSeenOf`.

## Change G: the SortedVaultDB is made just before the minders hello it

`#bringUp` now opens:

```ts
      await this.#restore(bankMinder, this.#persisters?.roots)
      await this.#restore(minder, this.#persisters?.boxes)
      const sortedVaultDB = SortedVaultDB.make(this.scope, { vaultDB: this.vaultDB })
      this.#sortedVaultDB = sortedVaultDB
      bankMinder.hello(sortedVaultDB)
      minder.hello(sortedVaultDB)
```

still inside the `try`, so a host watch that throws at make shows `failed` (the device test "shows failed, and does not
reject, where its vaultDB cannot watch" passes unchanged). `signIn` never rejects. A `Device.sweep` during the restores
is a crossing: a row in `notes/wontfix.md`.

## Tests

* New: ask checks accept and refuse a `bank_lifetok`; the builders carry one given and none otherwise; the loggable ask
  keeps it (a get and a birth); a vaultDB answers alike with another lifetok on the ask; a device's asks carry none
  before it has a bank and the bank's after; three `BadRings` rows (an unknown liveness, a void whose val is a record,
  a non-void whose val is the sentinel).
* **Meaning changed**:
  - `bank.test.ts` "fill in the bank's scope, the modelkind, the default flags and the track" is now "... the track and
    the bank's lifetok", each ask expected with `bank_lifetok`.
  - `gating.test.ts` "births the bank, its main gate and its root box in one call to the vaultDB" adds ", its ask
    carrying the new bank's lifetok", and expects it.
  - `sorted-vault-db.test.ts` "stamps each notice with its bank's lifetok: its dispatch's own, else the newest bank
    record's sorted, else none" is replaced by "stamps an answer's notices with its ask's bank_lifetok, else its world's,
    and a ring's with its own, else the newest world's".

## Decisions and approaches set aside

* **The last-world fallback stays** for an answer with neither (a refusal with no world), as the brief's "as now" had
  it. Set aside: none at all, which would leave such notices bare though the SortedVaultDB knows the bank.
* **The ask's lifetok wins over the world's**, as directed. Its consequence is an open matter below.
* **Bell narrows its check** on the rung `liveness`. Set aside: leaving the check as it was, since bell never reads the
  liveness (the sorter derives its own). Narrowing refuses what was accepted: a void notice holding a record, a record
  notice holding the sentinel, an unknown liveness. It does not check that `full` is whole or `soon` sparse.
* **No `switch`** in `#takeNotice`: the lint rules (`unicorn/switch-case-braces`, `prefer-else-if`) push to an early
  return, and the codebase has none.

## What I would change elsewhere (not edited)

* **VOCABULARY.md**: an entry for the notice's `liveness` and its four cases, if it is to be a word of the cast; and a
  line that `bank_lifetok` on an ask is the sender's view of the bank's life.
* **`notes/answer-contract.md`**: that an answer's `ask` (the loggable ask) now carries `bank_lifetok`, and that a
  vaultDB never refuses on it.

## Open matters

* **A stale sender's notices carry its old lifetok.** With the ask's lifetok preferred, a Bank object from a life since
  ended stamps the new life's records with the old token, though the answer's world shows the new one. Recommend
  preferring the world's where the answer has one, the ask's only where it has none.
* **The gate's put sends no lifetok** (`Gate.#putGate`, no track either), though the gate's `bankStamp` has one.
  Recommend leaving it, as directed, until a gate write's notices need it.
