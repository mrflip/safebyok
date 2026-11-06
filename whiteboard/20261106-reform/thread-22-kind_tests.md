# Thread 22: tests stop promising the incidental refusal kinds (2026-11-06)

Branch `20261106-kind_tests`, cut from main at a19292549. PR: see below. Justify: see the PR's **Tests:** line.

* **Built**: `expectRefusal`, `expectBad` and `expectSyncRefusal` (`tests/test-helpers/refusals.ts`) take
  `refusalkind` as optional: left out, any `VaultError` passes. `holdsCases` (`tests/test-helpers/cases.ts`)
  lost its `kind` argument (all 26 callers named a strip kind): a refusing case means "throws a VaultError".
  Every *strip* site of thread 20's inventory, and every site of `already_asking`, `locked_while_asking` and
  `vault_gone`, in `models/`, `storage/`, `shapes/`, `helpers/`, `loosened/` and `utils.test.ts`: the kind
  argument dropped, the title's quoted kind gone, the test kept. One commit per directory. Empty changeset.
* **Decisions taken**:
  * `vault_empty`, `vault_mismatch`, `vault_gone`, `bad_option` and `gate_issue` in `storage/vault-db-new*.test.ts`
    were `act: '...'` fields of a bad answer (`act` defaults to the refusal's kind): dropped from
    `deep.include({ ok: false, act: ..., ... })`, leaving `ok: false` and the `dbhas`/`world` the case checks.
  * Assertions of a kind that were not helper calls became kind-less checks of the same fact: `badnews`
    `.to.have.length(1)` (was the mapped kinds equal `['record_conflict']`); `TH.expectBad(outcome)` where a test
    read `err?.refusalkind`; a logged story is checked `to.have.all.keys('call', 'refusalkind')` (`models/lease.test.ts`).
  * Two tables lost their kind column or cell: `models/vault-boxes-putting.test.ts` (`PatchCases`), and
    `models/box-whisper-states.test.ts` (the cell `'bad_option'` is now `'refused'`).
  * A `new VaultError('unexpected_error', ...)` built as a test input stays: it is a fixture, not a promise.
* **Deviations**:
  * `helpers/validator.test.ts` kept whole as definitional (a validator throws the kind it is made with), except its
    guards' own refusals (a story or opts that are none, a bag that is no object): those lost their kind.
    The inventory table lists 106 strip there; I read the file as the `Checkers`/`refusingAs` subject.
  * `refusals/*.test.ts` untouched, all definitional (`errors`, `outcome`, `host-error-sanitizer`, `throwers`).
    No guard's own refusal there.
  * `helpers/mask.test.ts` (3 `bad_option`, not in the inventory) stripped too.
  * `holdsCases` lost its parameter rather than gaining an optional one: no caller keeps a kind.
* **Discoveries**: `vitest/valid-title` already warns on a title quoting a kind (116 warnings in `tests/models`
  before, 73 after, all the remainder on kept kinds): `rg`-free way to check a directory is done.
  chai's `deep.equal` does not take `expect.any`.
* **For the Coach**: nothing blocking.
