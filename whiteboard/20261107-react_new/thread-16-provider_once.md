# Thread 16: BankProvider makes its bank once per scope (2026-11-07)

Branch `20261107-provider_once`, PR [#589](https://github.com/mrflip/safebyok/pull/589), stacked on [#586](https://github.com/mrflip/safebyok/pull/586) (thread 15,
`deviceDB.ensureBank`). Justify: green (safebyok-react 200 tests, demo 60, every package green, size budgets met;
`BankProvider` 6.41 kB of 9.4 kB).

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
    `panicWhileHeld` throws the refusal (to the platform, through the core) when the latest props hold no `onPanic`.
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
  * A misused `deviceDB` (not a DeviceDB at all) now reaches the boundary as a `TypeError` from `deviceDB.ensureBank`,
    not `bad_option` from Bank.make: `isDeviceDB` is not exported from `safebyok`. Open matter.
  * A host still passing `device_id` (plain JS) has it silently overridden by the ensured one. Open matter.
  * The demo restack will meet #587's `deviceIdOf` -> `ensureDeviceId` rename in `stores.ts`: resolve by deleting both.

* **For the Coach**: the open matters in the PR body.
