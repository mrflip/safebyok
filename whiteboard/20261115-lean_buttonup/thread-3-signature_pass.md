# Thread 3: signature_pass (2026-11-16)

Branch `20261116-signature_pass`, PR pending, on main. Proved so far: `safebyok` 821 tests, `safebyok-postgres` 330, typecheck
and lint in both, per commit. The step 3 list is in `handoff.md` (same folder).

* **Built**, one commit per finding or family:
  - The asks rename: drafts are `GetAskDraft`, `ListAskDraft`, `PutAskDraft`, `DelAskDraft`, `BankAskDraft`,
    `GetBoxAskDraft`; the whole asks are `GetAsk`, `ListAsk`, `WriteAsk<RecordT>` (one generic, default any kind). The
    validators followed: `checkedGetAsk`, `checkedListAsk`, `checkedWriteAsk`. VOCABULARY.md has **draft**.
  - `clear` to `cleartext` in our own parameters and locals; big's fields keep `passphraseClear`, `passkeyClear`.
  - `Proving.judgeStrength(device, scope, passphraseCleartext)`; gallant.md's `#big-to-little` status is Fixed.
  - 1, 2: the memory store's `#write(record)`, `#rootsOf(ask)`, `#worldFetchedOf(ask)`, `#worldAfter(ask)`;
    `trackedFetchedOf(ask, rows)`.
  - 3: Postgres `#fetchThing(ask)`, `trackParam(ask)`.
  - 4: `demandBornAtKept(ask, raw)`.
  - 12: `unwrittenWriteOf(raw, { ask, act, world })`, typed `UnwrittenWrite`. The types did not fight.
  - 5: the lease's `#sealText(sealer, next, text)`, `#openSealed(sealer, record)`.
  - 6: each storage policy is `(ask, stored)`.
  - 8: the gate's `wayinsOf(wayins)`.
  - 7: `otherThanBox(answer)`.
  - `notifyTrackedRecords(ask, answer)`.
  - `Bank`'s private constructor takes `(record, opts)` and parses first; `Bank.make` only constructs.
* **Decisions made**:
  - `AnyAsk` (`GetAsk | ListAsk | WriteAsk | BirthBankAsk`), new in `shapes-thing.ts` and exported from
    `safebyok/storage`, types every helper that takes "the ask" for its scope or `track`.
  - A Postgres notice that carried too little is fetched by `getAskOf({ ...scope, labelpath })`, so `#fetchThing` takes
    only an ask.
* **In progress**: item 10, the birth answer in the batch shape.
