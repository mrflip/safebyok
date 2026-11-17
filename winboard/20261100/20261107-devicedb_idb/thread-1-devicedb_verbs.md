# Thread 1: devicedb_verbs (2026-11-07)

Branch `20261107-devicedb_verbs`, cut from main (495cc5d6e), PR [#567](https://github.com/mrflip/safebyok/pull/567). Justify: green. The core has
70 files and 2305 tests; lint shows 0 errors and 365 warnings, all of them pre-existing kinds.

* **Built**:
  * **mash** (`src/utils.ts`) answers the SHA-256 as 43 characters of unpadded base64url
    (`toB64`), no longer 64 hex. Its doc block, `@example`, the VOCABULARY row and the tests changed
    with it. The tests add a case that checks the shape and round-trips the value through
    `fromB64`.
  * **DeviceDB verbs** (`src/storage/device-db-new.ts`): `stow`, `peek`, `forget`, `listLeases`,
    each with a try twin. The hooks are `doStow`, `doPeek`, `doForget` and `doListLeases`.
    * `doListLeases` answers every row, unsorted and unchecked. The base parses each row with
      `SX.leaseDated`, drops the damaged ones and sorts oldest first.
    * `listLeases()` takes no cutoff.
  * **adapted is gone.** Each verb's body is `try { … } catch (err) { throw refusalOf(err, '<verb>') }`.
    `refusalOf` is a module-level one-liner: a VaultError passes through as it came, and anything
    else becomes `Refuse.storeFailed(call, thrown)`.
  * **The vault_tok split stays**, with the `//` comment above `forget`.
  * **Bank** (`src/models/bank.ts`):
    * `#listOwnLeases()` calls `tryListLeases` and keeps this bank's rows. A refused call becomes
      bad news and `[]`.
    * `autolock` filters `proved_at < cutoff` itself, and `#eraseOwnLeases` uses the same helper.
    * `FarPast` and `FarFuture` are no longer imported there: the clamping to them went with the
      cutoff argument.
  * **Lease friend** (`shapes-gateish.ts`, `vault.ts`): `tryStowLease`, `tryForgetLease`.
  * **Lease** (`src/models/lease.ts`): `stow`, `tryStow` and `stowAsStowCan`, and the static
    `Lease.forget` and `Lease.tryForget`. The private helper `uncacheForgotten` is now
    `forgetOutdated`.
  * **Battery**: `tests/test-helpers/device-db-battery.ts`, exported from `safebyok/testing` as
    `describeDeviceDBBattery(label, { makeDeviceDB, _cheat_rowsOf?, _cheat_failNextCall? })`, with
    the types `DeviceDBBatteryOpts` and `DeviceDBRowCheats`.
    * The opts are checked by `objCheck`.
    * A case that needs a missing backdoor is skipped with `it.skipIf`.
    * `tests/storage/memory-device-db.test.ts` runs the battery over MemoryDeviceDB. Its
      `_cheat_failNextCall` spies on the four `do*` hooks.
    * `tests/storage/device-db-new.test.ts` keeps only the BrokenDeviceDB cases: the refusal names
      the verb and the thrown name, never the message.
  * **Docs**:
    * VOCABULARY rows: the vault lifecycle (vacate), lease, deviceDB and dated.
    * `notes/guarantees.md`: the call paths and the refusal's source are renamed.
    * `notes/wontfix.md`: `tryForgetLease`.
    * `TODO.md` gets a Soonish entry, *An extended key structure for the deviceDB*, which quotes
      the Coach.
  * **Changeset**: `.changeset/20261107-devicedb_verbs.md`, minor. It says the app is unreleased
    and keeps no compatibility layer.

* **Decisions taken**:
  * **"cache" stays as a noun and an adjective.** `Lease.buildFromCache`, `#isFromCache`, "the
    device cache" and "a cached lease" are unchanged. Only the verbs that are the deviceDB's act
    were renamed.
  * **`lease.vacate` and `lease.evict` stay.** They do more than forget a row: they drop the keys
    too.
  * **`stowAsStowCan`** is a mechanical rename of `cacheAsCacheCan`. It reads a little odd. Kept so
    the rename stays mechanical; see the open matter.
  * **The `cutoff` checker was removed** from `shapes-storage.ts` and from `safebyok/storage`'s
    exports. Nothing used it once `listLeases` took no argument. That removes an exported name,
    and the changeset says so.
  * **TODO entry under Soonish.** The handoff said "Later", but TODO.md has no such shelf. Soonish
    is the shelf for "wanted, a design question first".
  * **The battery in one file.** It is about 230 lines and needs no split like the VaultDB
    battery's.

* **Discoveries**:
  * **Bank reads better without a cutoff argument.** The filter is one line in `autolock`, and the
    `FarPast`/`FarFuture` clamp it used to need is gone. No open matter is needed.
  * **For thread 2**, which runs the battery over fake-indexeddb:
    * `_cheat_rowsOf` needs only a raw put at the scope's key and a getAll.
    * `_cheat_failNextCall` can be a spy on the `do*` hooks, as Memory's is, or a store-level
      fault.
    * A store left without either backdoor still runs every other case.
  * **The battery's skipped cases** use `it.skipIf(noRows)(…)` inline. An alias such as
    `const withRows = it.skipIf(…)` trips `vitest/expect-expect` and `vitest/no-standalone-expect`.

* **For the Coach**: see the open matters in the PR. Nothing blocks.
