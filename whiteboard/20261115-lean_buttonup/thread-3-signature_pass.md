# Thread 3: signature_pass (2026-11-16)

Branch `20261116-signature_pass`, PR #713, on main. Proved: `safebyok` 822 tests, `safebyok-postgres` 331, typecheck and
lint in both, per commit; `pnpm justify` at the tip after the catch-up. The step 3 list is in `handoff.md` (same folder).
Nothing on the list was skipped.

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
  - 10: **reverted** (the Coach's ruling). Item 10 had `doBirthBank(ask)` and a batch-shaped `tryBirthBank` answer, with
    the bank put at `ifPresent: 'fail'`. That changed the birth's working-state contract: the birth is an ensure (an
    idempotent get-or-create, "write a new bank's three roots, or answer the roots already stored"), and a repeated
    birth must not be refused. The birth is redesigned in a later thread (the bank becomes a function of the main
    gate), so the three-slot answer shape is not kept either. The branch is as before item 10: `doBirthBank(ask, puts)`,
    `BankRootsMissing`, the `storage_issue` over a bank stored without its roots, the removed bank test, the wontfix.md line.
* **Decisions made**:
  - `AnyAsk` (`GetAsk | ListAsk | WriteAsk | BirthBankAsk`), new in `shapes-thing.ts` and exported from
    `safebyok/storage`, types every helper that takes "the ask" for its scope or `track`.
  - A Postgres notice that carried too little is fetched by `getAskOf({ ...scope, labelpath })`, so `#fetchThing` takes
    only an ask.
* **Deviations**:
  - Item 10 is reverted, above; the birth's redesign is a later thread.
  - The validators were renamed with the types (`checkedGetAsk`, `checkedListAsk`, `checkedWriteAsk`), beyond the list.
* **For the Coach**:
  - Goofus/Gallant: only `judgeStrength` was in `notes/gallant.md`. Pairs not shown there, for the Coach to place:
    `#sealText(text, stamps, purposes, tags)` / `#sealText(sealer, next, text)` (`#pass-it-whole`);
    `otherThanBox(ask, row)` / `otherThanBox(answer)`; `demandBornAtKept(ask, stored, raw)` / `(ask, raw)` (one source
    of truth, not two); `#fetchThing(scope, track?)` / `#fetchThing(ask)`; `wayinsOf(main, passkey0)` /
    `wayinsOf(wayins)`.
  - `buildNovel(bank, gate, passphraseCleartext, device)` still puts the secret before the device (`#big-to-little`);
    not on the list, left for a ruling.
  - Safety hatches added: none.
