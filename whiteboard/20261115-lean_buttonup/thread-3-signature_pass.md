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
  - 10: `doBirthBank(ask)`, and `tryBirthBank` answers in the batch shape (`vault-db.ts`):

    ```ts
    type SlotAnswer<RecordT extends Thing = Thing> =
      | Omit<GoodAnswer<RecordT, EX.PutAct>, 'world' | 'tracked'>
      | Omit<BadAnswer<RecordT | null>, 'world' | 'tracked'>
    type BirthSlotAnswers = Readonly<{ bank: SlotAnswer<BankThing>, gate: SlotAnswer<GateThing>, box: SlotAnswer<BoxThing> }>
    type BirthBankAnswer =
      | Omit<BadAnswer, 'dbhas'>
      | { ok: true, ask: Readonly<{ op: 'birth' }>, act: 'born' | 'noop', world: WorldRecord | null, tracked?: Tracked, val: BirthSlotAnswers }
    ```

    Stores report `BirthBankActual = { act, world, tracked?, slots: BirthSlotActuals }`, each slot a `SlotActual`
    (`{ ok, act, record }`). `classifyBirthBank(ask, fetched)`, `unwrittenBirthOf(ask, fetched)`, `writtenBirthOf(ask,
    written)` (was `writtenRootsOf`); `birthPutsOf` is exported. No SQL changed. `Bank.birth` throws
    `gate_made_elsewhere` where the bank's slot is `stale` over a live bank, else the first refused slot's `err`.
* **Decisions made**:
  - `AnyAsk` (`GetAsk | ListAsk | WriteAsk | BirthBankAsk`), new in `shapes-thing.ts` and exported from
    `safebyok/storage`, types every helper that takes "the ask" for its scope or `track`.
  - A Postgres notice that carried too little is fetched by `getAskOf({ ...scope, labelpath })`, so `#fetchThing` takes
    only an ask.
  - A slot's `ask` is its put's loggable ask, and a refused slot's `err` has `oplabel: 'writeThing'`: what the lone put
    would answer. The good birth answer's `ask` is `{ op: 'birth' }`, after complete.md's `Pick<BatchAsk, 'op' |
    'policies'>`; the refused one keeps the whole loggable birth ask.
  - Slots are keyed `bank`, `gate`, `box` (labelpaths), while the ask and `BankRootsFetched` keep `root`. The batch ask
    replaces both later.
  - A slot's only good act here is `born`; `slotActualOf` says so in a comment rather than branching on other acts.
* **Deviations**:
  - `birthPutsOf`'s bank put refuses over a live bank (`ifPresent: 'fail'`, was `'get'`). With `'get'` the bank's slot
    would answer `passed` with `val`, not `dbhas`, against complete.md's "each slot's `dbhas` carries the root the winner
    stored"; and over a live bank missing both its gate and its root box, every slot would be good, so the batch would
    write a gate and root box under another's bank. Consequence: a live bank stored without its gate is no longer a
    `storage_issue` (`BankRootsMissing` is gone); it answers `noop`, the gate's slot `born`, writing nothing.
  - The validators were renamed with the types (`checkedGetAsk`, `checkedListAsk`, `checkedWriteAsk`), beyond the list.
  - The test "unlocks where the vaultDB passes on this same bank" went: no birth answers `passed` now.
* **Discoveries**: Postgres's `birth_roots` needs no change: it stores nothing where any root exists and reads the
  three back, which `unwrittenBirthOf` classifies. A race on the gate or root insert still throws whole (unchanged).
* **For the Coach**:
  - Goofus/Gallant: only `judgeStrength` was in `notes/gallant.md`. Pairs not shown there, for the Coach to place:
    `#sealText(text, stamps, purposes, tags)` / `#sealText(sealer, next, text)` (`#pass-it-whole`);
    `otherThanBox(ask, row)` / `otherThanBox(answer)`; `demandBornAtKept(ask, stored, raw)` / `(ask, raw)` (one source
    of truth, not two); `#fetchThing(scope, track?)` / `#fetchThing(ask)`; `wayinsOf(main, passkey0)` /
    `wayinsOf(wayins)`.
  - `buildNovel(bank, gate, passphraseCleartext, device)` still puts the secret before the device (`#big-to-little`);
    not on the list, left for a ruling.
  - Safety hatches added: none.
