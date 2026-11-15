# Thread 4: box_birth (2026-11-15)

Branch `20261115-box_birth`, PR [#706](https://github.com/mrflip/safebyok/pull/706), on main (with [#702](https://github.com/mrflip/safebyok/pull/702) merged). Built by hand, no
orchestrator. Proved: `safebyok` typecheck, lint and test, 680 tests green after the rebase onto main; `pnpm justify` at the catch-up
(see the PR's **Tests:** line).

* **Built** (design-boxops.md, thread 4)
  * `models/base-thing.ts`, new: `BaseThing<RecordT, ScopeT, StampT>`. It tattoos the sparse record's Thing fields as
    read-only props, keeps the record private and frozen, and declares `scope`, `stamp` and `pickle()`. Each subclass
    writes its own static `make`, because TypeScript cannot type a base `make` over a private constructor.
  * `Gate extends BaseThing<GateThing, ThingScope, GateStamp>`, rewritten. `Gate.make(record, { bank })` checks the record
    is in the bank's scope. `Gate.makeRecord(dna)` gives the first revision of a main gate: lifepath its lifeseq,
    `written_at` its `born_at`, wayins `{ main, passkey0 }`. The stamp is
    `{ userid, banklabel, labelpath, lifeseq, born_at }` (`stamps.ts`, with `citedGate`).
  * `Bank extends BaseThing`. `bank.put(args)` builds its ask with `putAsk` and calls `tryWriteThing`, checking
    `device.endCause` first.
  * Birth: `Bank.makeUnborn(record, opts)` returns `{ bank, friend }`. The gating attempt calls `friend.tryBirth(proved)`.
    `#tryBirth`:
    1. builds the lease;
    2. seals the root box's first revision (an empty whisper) over the shell that `Bank.makeRecord` now gives;
    3. calls `vaultDB.tryBirthBank` once.

    It unlocks only when the answer is ok, the stored bank's revtok is its own and the lease is still enabled;
    otherwise it evicts the lease. `checkedBirthBankAsk` is strict: every record field present, `passkey0` null for none.
  * The lease's guard: `lease.isEnabled` and `lease.demandEnabled()` read the bank's `isEnabled`/`demandEnabled`
    (device first). They replace `#demandRecord` everywhere, including the post-await checks in `#sealText` and
    `#openSealed`. `Device.endCause` is the one shared `disabled` refusal; every disabled answer of the bank carries it.
  * `tryGetBox` on a non-box row: `storage_issue` (`Phrases.GotOtherThanBox`), `dbhas: null`, the row in the refusal's
    `rows`.
  * Lease fmt 7102: `gatelabelpath`, `gate_lifeseq`, `gate_revtok` in place of `gatelabel`, `gate_tok`,
    `gate_revision_tok`.
  * Tests: `gate.test.ts` rewritten; `bank.test.ts` has `bank.put` and birth describes. `lease.test.ts` has the
    device-guard describe: sweep before and during a seal. `bank-flows.test.ts` has the shared `endCause` and the
    non-box row. The helper `buildBornBank` births for real, and `TH.spyBirths(device, answer?)` replaces the put stub.
    `ctx-bytes.test.ts` golden texts were moved on purpose, for the new gate and lease stamps.
  * Ride-alongs:
    * the `sealBox`/`tombstoneBox` doc blocks name the fresh boxKey;
    * `notes/wontfix.md` says "steps to reproduce";
    * "Decisions made" in the thread-worker agents and these thread files;
    * `notes/security.md`, through a sonnet subagent: two amendments to the 2026-11-14 lean_gate entry, and three new
      entries.

* **Decisions made**
  * **`makeRecord`'s root box is the shell**, not a made-up first revision. The birth seals over it, so the stored root is
    the first revision of life 0, sealed under the real lease. `Bank.make` accepts the shell root.
  * **"Null where empty"** is read as: `wayins.passkey0` is required and nullable, in records and in the birth ask.
  * **Ruling 1's wreckage goes in `rows.dbhas`, not `meta`.** `RefusalMeta` is closed and big is frozen, and a gate row
    has wrapped bankKeys, which `rows` (non-enumerable) keeps out of logs. `meta` carries `ask` and `act`.
  * **The friend is a frozen bag** with the one callback `tryBirth`, handed out beside the bank by `makeUnborn`. `Bank.make`
    stays plain.
  * **The passkey answer cannot be reused:** `device.test`'s `gate_made_elsewhere` case pre-births with
    `TH.buildBornBank({ device })`, because a dialog's passkey answer is spent once.

* **Deviations**
  * Guarantees loosened or changed, also in the PR:
    * `gate_tok` dropped from the wayin ctx and the lease stamp;
    * `Gate.make` checks the bank's scope, not its life;
    * `bank.put` leaves the bank in hand stale;
    * `#rootBox` is set once more, at a birth that lands;
    * `Object.keys` of a bank or gate is all its Thing fields.
  * Tightened: a sweep refuses a lease mid-seal. The check is the one after the last await (the security subagent
    confirmed there is none between the inner awaits).
  * The rebase onto main took the sweep's words over my side where both survive ("accepts", "has", "unwraps",
    "putting its boxes"), and I swept my new lines to match.

* **Discoveries**
  * **`MemoryVaultDB.tryBirthBank` answers `passed` only for a different bank revtok.** A resend of the same birth answers
    `retcon`/`stale_write`, so a lost answer to a birth that landed comes back as a refusal. `#tryBirth`'s "passed, and
    ours" branch is reached only by a vaultDB answering it; the test mocks `{ ...born, act: 'passed' }`.
  * `wayinCtxOf` lives in `wayin.ts`, not `proving.ts`.

* **For the Coach**
  * **The friend bag's shape** (`makeUnborn` → `{ bank, friend }`). Recommendation: keep it.
  * **`rows` over `meta` for ruling 1.** Recommendation: keep it; widening `RefusalMeta` means touching frozen big.
  * **A lost birth answer is refused, not passed**, as above. Recommendation: a row; no change in this thread.
