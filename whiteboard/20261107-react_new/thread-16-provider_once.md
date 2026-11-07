# Thread 16: BankProvider makes its bank once per scope (2026-11-07)

Branch `20261107-provider_once`, PR [#589](https://github.com/mrflip/safebyok/pull/589), stacked on [#586](https://github.com/mrflip/safebyok/pull/586) (thread 15,
`deviceDB.ensureBank`). Justify: green (safebyok 2471 tests, safebyok-react 204, demo 60, every package green, size budgets met;
`BankProvider` 6.45 kB of 9.4 kB).

* **Built** (`packages/safebyok-react/src/bank-provider.tsx`, its tests, the demo):
  * `BankProvider` makes its bank once per `applabel` + `user_id`: the bank effect's dependencies are
    `[applabel, user_id, askUser, endShowing]` (the last two stable callbacks). Every other prop is read from
    `latestProps`, one ref of the props as of the last commit, as the effect runs.
  * Right before `Bank.make`, the effect awaits `making.deviceDB.ensureBank({ applabel, user_id })` and makes the bank
    with its `device_id`. The `device_id` prop is gone from `BankProviderProps` (`Omit<BankOpts, 'user_id' |
    'device_id' | 'requestCleartext'>`). The wait sits inside the existing `waiting` stage (no bank held).
  * After the await, `if (! kept.held) return`: the effect's cleanup sets `kept.held = false`, so a sign-out, a user or
    applabel change, or StrictMode's first effect makes no bank. No abort controller, no retry.
  * A refusal from `ensureBank` or `Bank.make` (now inside an async function) is put in a `refused` state, and the next
    render throws it to the nearest error boundary: the same place a failed make went before.
  * The handlers (`onBadNews`, `onPanic`, `requestCleartext`) are called through `latestProps`, so an inline one is
    called as last rendered. Whether a handler exists, and a misused (non-function) one, is fixed at the making.
    An `onBadNews` or `onPanic` dropped after the making falls back to the one the bank was made with (rework, below).
  * The ignored-change warning: `fixedPropsOf(props)` picks the eight Bank.make option props plus handler presence;
    `madeWith` holds it for the bank made. An effect with no dependency list compares the latest to `madeWith` each
    commit, only while `provided.bank` is set (so not in the render where the scope changes), and warns once per
    provider through `bank.logger` (`{ call: 'BankProvider', props: [...] }`), suggesting a `key` for a fresh bank.
  * Gone: the three prop-to-ref effects, `remakers`/`toldOfRemakers` and the remake warning, `unlistedJson` and
    `refusable` (an unknown prop now reaches Bank.make by the rest spread, which refuses it `bad_option`), the long
    dependency list, `hasBadNewsHandler`/`hasPanicHandler` as dependencies, the `satisfies` (the spread passes every
    option by construction).
  * `provided` also checks `held.bank.applabel === applabel`.
  * Tests (`tests/bank-provider.test.tsx`): new applabel makes a new bank; each bank's `device_id` is the deviceDB's
    for its scope; sign-out while `ensureBank` is held makes no bank (`vi.spyOn(Bank, 'make')`); refused `ensureBank`
    reaches the boundary; StrictMode now counts `Bank.make` results that reached `ready` (the old `seenBanks` count
    did not catch a leaked bank); a `BankProvider's props` describe (changed prop kept and warned once; each changed
    prop named; a handler given late named; inline handlers not warned; per-user props not warned);
    `requestCleartext` called as last rendered. The misuse tests now `waitFor` the boundary. Both the sign-out and
    StrictMode tests fail with the `kept.held` guard removed (checked).
  * `TH.providerPropsOf` passes no `device_id`; `TH.DeviceId` stays for `passkey.test.ts`, its doc changed.
  * Demo: `deviceIdOf` and `device_id` gone from `src/lib/stores.ts` and its test, from `tests/test-helpers.tsx`
    (`DeviceId` too), and two README sentences that said the device_id sits in localStorage.
  * Changeset `.changeset/20261107-provider_once.md`, safebyok-react minor.

* **Decisions taken**:
  * Dialog props (`passphraseUsername`, `passphraseAdvice`) stay live: they are render props of the dialog, not bank
    options, so they are neither fixed nor warned of.
  * Warned once per provider, not once per bank: simpler, and the warning is a coding mistake to fix once.
  * Handler presence is part of the compared set: whether the bank has a handler is fixed at making, so adding one
    later is ignored and should be said.

* **Discoveries**:
  * A host still passing `device_id` (plain JS) has it silently overridden by the ensured one. Open matter.
  * The demo restack will meet #587's `deviceIdOf` -> `ensureDeviceId` rename in `stores.ts`: resolve by deleting both.

* **Rework after review** (two commits on top of the reviewer's three):
  * **A dropped handler falls back.** The build read `guardOnPanic` (`packages/safebyok/src/models/bank.ts`) wrong:
    it does not treat a throwing handler as a panic nobody hears. It reports the throw to the platform and still
    answers true (heard), so the vault is never vacated; only a bank made with no `onPanic` at all vacates. So
    `panicWhileHeld` and `tellWhileHeld` now call the latest props' handler when it is a function, else the one the
    bank was made with (`onBadNews`/`onPanic` from the effect's `making`). "The bank has a handler" holds for the
    bank's life, matching what Bank.make was told; the ignored-change warning already names the dropped prop. A
    let-go bank's panic is still thrown (reported to the platform, never the next user's handler). Set aside: throwing
    when the latest has none (the build's, wrong as above); remaking the bank on a dropped handler (what this thread
    removed). Tests: drop `onPanic` after make, a panic reaches the made-with one and the vault stays; drop
    `onBadNews`, `bank.tellBadNews` reaches the made-with one. Both fail on the old code (checked).
  * **A misused `deviceDB` is refused `bad_option`.** The core already had `brandedDeviceDB` (a `Checker` on
    `isDeviceDB`, `shapes/shapes-vaultish.ts`, the check `bankOpts` uses), exported from no entry point; it is now
    exported from `safebyok/storage` beside `DeviceDB` (no checker sat on any entry point before; `storage` is where
    the DeviceDB contract and `Checker` live). `BankProvider` parses `deviceDB` with it (`where: 'deviceDB'`) inside
    the make's `try`, so a refusal reaches the boundary by the same `refused` path. Second changeset
    `.changeset/20261107-provider_once-2.md`, safebyok patch (as directed; PROCESS.md reads minor for an exported
    name, moot in the lockstep group beside safebyok-react's minor). Test: an object with an `ensureBank` that is no
    DeviceDB reaches the boundary `bad_option`; fails on the old code (checked).

* **For the Coach**: the open matters in the PR body.
