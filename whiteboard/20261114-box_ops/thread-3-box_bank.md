# Thread 3: box_bank (2026-11-15)

Branch `20261115-box_bank`, PR [#704](https://github.com/mrflip/safebyok/pull/704), stacked on [#703](https://github.com/mrflip/safebyok/pull/703) (`20261115-box_seal`). Proved: `safebyok` lint, typecheck and
test, 661 tests green; `pnpm justify` at ready and after the review's rework (see the PR's **Tests:** line).

* **Rework after the Coach's review**: the enabled check above; `tryGetBox` returns, not throws, its impossible
  branch (storage answered a non-box) as an `unexpected_error` BadAnswer (`Phrases.GotOtherThanBox`, `dbhas` the
  row, untested as impossible); gallant's `#impossible-is-a-crash` is now `#impossible-is-a-broken-system`, with the
  Coach's opening paragraph. `#demandBox` is left as it was, while its root-lifeseq check is settled. The Gate on its
  Thing, `bank.put` and the birth through `tryBirthBank` go to thread 4.

* **Built** (design-boxops.md *Building it* item 3)
  * `models/stamps.ts`, new: `bankScope`, `bankStamp` (`{ userid, banklabel, lifeseq, born_at }`), `stampedGate`,
    `LeaseFormat` (now 7101), `leaseStamp`, `leaseRecord`. They left `lease.ts` and `proving.ts` so that `bank.ts`,
    `lease.ts`, `gate.ts` and `wayin.ts` can share them with no import cycle.
  * `Bank` on its Thing: props `userid`, `banklabel`, `lifeseq`, `born_at`; `#vaultDB`, `#rootBox`; getters `scope`,
    `stamp`, `rootBox`, `revtok`, `revseq`, `written_at`. `Bank.make(record, { device, vaultDB })`, the record holding
    `maingate` and `rootBox`; the constructor checks the root box is at `box` in the bank's scope.
  * The sugar, section `[Boxes in the vaultDB]` of `bank.ts`: `tryListBoxes()`, `tryGetBox({ labelpath, ifAbsent })`
    with `'shell'`, `tryPutBox`, `tryDelBox`. Each spreads the bank's scope and `modelkind: 'box'` over the builder's
    ask, so another bank's record or a non-box labelpath refuses in the answer.
  * `#demandBox` refuses `record_conflict` (`Phrases.BoxOfOtherRoot`) for a box whose lifepath does not start with the
    root box's lifeseq: guarantee #4 is back.
  * `Device` requires `vaultDB` (`isVaultDB`, new in `storage/vault-db.ts`), and `birthBank` hands the bank
    `device.vaultDB`.
  * The gate row stays big's: its `bank_tok` now holds the bank's lifeseq, and `gate.ts` checks it against the stamp.
  * `tests/models/bank-flows.test.ts`: the design's list, put, put again, delete and rebirth flows through a bank
    born in a `MemoryVaultDB` by `tryBirthBank`, and the sugar's refusals.
  * `core.ts`'s header corrected; exports in `core.ts`, `index.ts`, `storage.ts`.
  * design-gate.md and design-vaultdb.md brought up to date; notes/security.md amended (2026-11-14 entry).

* **Decisions taken**
  * **`tryGetBox` and `ifAbsent`.** `'shell'` and the default both ask the store for `'nil'`; `'shell'` then fills in
    `#shellOf`. No storage change for it.
  * **The shell's times** are `SX.VoidTime`, as big's shell rows; thread 2's test shell uses T0.
  * **The shell is given only one label under the root box**: a deeper box's shell needs its parent's lifepath.
  * **`tryPutBox` accepts the whole `PutAskArgs<BoxThing>`** (flags too), not just `{ cited, record }`: the builder
    already fills them.
  * **The sugar checks the device is enabled first** (the Coach's review): a disabled device answers a BadAnswer whose
    err is `Throwers.deviceDisabled()`, the thrower `Device.sweep` uses (its `#endCause` is private), with
    `act: 'unclassified_storing'`. One test, for `tryPutBox`. The vaultDB itself does not check.
  * **The flows test births the bank by `tryBirthBank`** with the born bank's Thing, `gateThingOf()` and the root
    box with a fake `whisper_sealed`: nothing seals the root box yet (`makeRecord`'s root box is a placeholder).

* **Deviations**
  * **`boxCited` accepts the shell's lifeseq** (`storage/shapes-thing.ts`). The design's flow cites the whole shell
    `tryGetBox` gives (`tryPutBox({ cited: prior, record })`), and the cited check refused its lifeseq `-1`. Only the
    box's cited check changed; the bank's and gate's are cited only as `ShellCited`.
  * **`Phrases.PutNotBuilt` reworded**: it said "This layer stores nothing", untrue once the bank stores its boxes.
  * **Exports beyond the design**: core: `BoxShell`, `GetBoxAnswer`, `GetBoxArgs`, the stamps module, `VaultDB`,
    `isVaultDB`; index: those types plus `BadAnswer`, `GoodAnswer`, `ListThingsAnswer`, `WriteThingAnswer`,
    `BoxThing`, `DelAskArgs`, `PutAskArgs`; storage: `isVaultDB`.

* **Guarantees loosened or changed**
  * **#8**: the stamp binds the lifeseq, not a random `bank_tok`.
  * **New: every birth mints lifeseq 0.** `birthBank` reads nothing stored, so two births of one scope share a
    lifeseq; their ctxs still differ by `born_at` and the gate's random `gate_tok`. Ties to TODO.md's lifeseq item.
  * **Old wayins and leases fail safe**: a stored wayin no longer unwraps (damaged); a lease of fmt 7003 fails its check.

* **Approaches set aside**
  * Narrowing `cited` to the four `ThingCited` fields in the sugar, rather than the storage change: it would hide the
    cited box's other fields from the verb's check, and leave `bank.tryPutBox` unlike `vaultDB.putAsk`.
  * Sealing the root box in the flows test: no birth seals it yet, so it would test a flow nobody runs.
  * Keeping `bank_tok` in the stamp beside lifeseq: the Coach ruled it dropped.

* **Discoveries**
  * vitest needs big built: `pnpm build:deps` in `packages/safebyok` first.
  * A device opts refusal reads `opts.vaultDB: ...`, unlike keyDeriver's guard-made prefix.
  * `birthBank` still stores through the `bank.put` seam, not `tryBirthBank`.

* **For the Coach**
  * **The root box in `makeRecord` is a placeholder** (revseq 0, a random revtok, life 0), sealed and stored by
    nothing: a `#no-fake-values` tension until a birth seals it. Recommendation: keep it until the birth is built.
  * **Two `BoxShell`s**: `models-world.ts`'s test type (with a sidecar) and `bank.ts`'s. Recommendation: rename the
    test one `BoxShellSidecar` in a later sweep.
  * **`gate.test.ts`'s "another life's bank_tok" case** still uses `'bank-tok-other'`, now a lifeseq-shaped field
    holding any string (`CX.bank_tok` is `str.min(1)`). Harmless; goes when the gate moves to its Thing.
