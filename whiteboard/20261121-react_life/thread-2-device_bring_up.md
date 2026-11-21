# Thread 2: device_bring_up (2026-11-21)

Branch `20261121-device_bring_up`, PR #798, stacked on #797. Proved: `pnpm --filter safebyok` test (29 files, 1336 tests), lint, typecheck; `safebyok-react-lean` test (4 files, 88), lint, typecheck.

* **Built**
  - `Device` makes and owns its `ThingMinder`, and is its friend: `MinderFriend` is now a structural interface (`shapes-minder.ts`) that both `Device` and `Bank` satisfy. The device's `rootBox` is its bank's, or a shell of the root box until it has one; its `makeGetAsk`/`makeListAsk` delegate to its bank when it has one (so asks track the bank as before), and otherwise build untracked asks.
  - `device.hello()`: starts the minder, then gets `bank`, the main gate and the root box through it. A live bank becomes the device's bank, locked (`Bank.make`), and its vault is made; none shows stage `'unborn'`; a refusal shows `'failed'` with `lastErr` (kind, family, message, frozen). Memoised; never rejects.
  - `device.bank`, `device.vault`, `device.minder` getters; `device.adoptBornBank(bank)` (Internal).
  - `Vault.make(bank, minder)`: checks both, and that the minder's scope is the bank's (`record_conflict`). It no longer makes a minder.
  - `queryCacheOpts` moved from `BankOpts` to `DeviceOpts`: the bank knows nothing of the minder now.
  - Removed `cheatHoldBank`, `cheatDropBank`, `#thisIsTemporaryBank`, `#madeBanks`. `device.lock()`/`sweep()` reach the device's one bank.
  - Tests: `device.hello()` (born bank: `starting` → `locked`, then unlock; empty: `starting` → `unborn` → birth → `unlocked`; a mangled bank row: `failed` with `damaged_row`; same promise twice), `adoptBornBank` refusals, `Vault.make(bank, minder)` refusals.
  - A `notes/wontfix.md` row: a bank born on a device while its `hello` still fetches.

* **For thread 3: the device's surface**
  - `const device = Device.make(record, opts)`; `opts.queryCacheOpts` sets the minder's defaults.
  - `await device.hello()`; snapshot stages via `device.subscribe` / `device.getSnapshot().bank.stage`: `'starting'` (= `PendingBank`) → `'locked'` | `'unborn'` | `'failed'`.
  - Birth: `Bank.birth(device, cleartexts)` or `Bank.birthGating(device, cleartexts).attempt()`. Either hands the born bank to the device itself; afterwards `device.bank` and `device.vault` are set and the snapshot follows the bank (`'unlocked'`). Thread 3 need do nothing to hand it over.
  - `device.vault` (null until a bank), `device.bank`, `device.minder`.
  - The giver's `GiverDevice`/`onBankStart` compiled and passed unchanged.

* **Ownership choices and cheats** (rule 6)
  - The device makes the vault when it takes a bank, and owns it (`device.vault`). Thread 3 could own it instead; `Vault.make(bank, minder)` is public.
  - `// Cheat (react_life)` in `bank.ts` `birthGating`: birth hands the born bank to its device by calling `device.adoptBornBank`, a bank-to-device call (as `cheatHoldBank` was, but at birth alone). Rule 7's other way, birth's caller handing it over, would change every `Bank.birth` caller and test; set aside for that reason.
  - `// Cheat (react_life)` in `device.ts` `#bringUp`: `hello` skips the fetch when the device already has a bank, because the test helpers birth before they say hello (`buildBornVault`).
  - `unborn` is real, not faked: the bring-up's get of `bank` answers absent.

* **Deviations**
  - **Sweep's snapshot.** `Bank.sweep`'s doc promised "if its device's snapshot shows this bank, it goes back to `PendingBank`"; that went with `cheatDropBank`. The device keeps the swept bank, and its snapshot shows stage `'swept'`. Sweep code itself is unchanged; its tests changed only where they asserted `PendingBank` after a sweep or relied on several banks per device: dropped "show the next bank made on it", "leaves a bank working when a second is made", "sweeps every bank made on the device", "locks every bank made on the device", "still shows its bank when an earlier bank is swept"; "follows the last bank made on it" became "shows its own bank still when another bank is made over the same vaultDB".
  - A device swept then reborn: `vault.sweep` goodbyes the device's minder, so a bank born on it after a sweep gets a vault over a minder that said goodbye. Ending is out of bounds; untested.
  - `minder-giver-world.ts` (react-lean): `const friend: MinderFriend = Object.freeze({...})` became `Object.freeze<MinderFriend>({...})`; with an interface in place of a `Pick`, inference widened `am: 'a'` to string.
  - `safebyok/core`'s `index.test.ts` assertion still holds (core exports no `ThingMinder`); unchanged.

* **Decisions made**
  - A failed bring-up shows only in the snapshot's `lastErr`, not through `onBadNews`: a caller (the startup UI) reads the snapshot.
  - `hello` fetches the three rows in parallel through the minder; `Bank.make` checks gate and root, so a missing or tombstoned gate refuses into `'failed'`.
  - No retry of a failed `hello`: the promise is memoised (rule 8, and no whizbangs).

* **Discoveries**
  - The minder's get of an absent root box resolves (to a shell), so the unborn path needs no special order.
  - The device↔bank and device→vault→bank value imports are circular; they evaluate fine because every cross-use is inside a function or a lazy check.

* **For the Coach**
  - The wontfix row (birth during `hello`) awaits a ruling.
  - Sweep now leaves the swept bank in the device's snapshot rather than `PendingBank`; confirm that is the intended stand-in until thread work on ending.
