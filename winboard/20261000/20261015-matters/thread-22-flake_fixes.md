# Thread 22: flake_fixes (2026-10-16)

Branch `20261016-flake_fixes`, PR [#118](https://github.com/mrflip/safebyok/pull/118), against main (the line it stood on has merged). Justify: green (core 1246 passed | 18 skipped, react 102, convex 311 | 14 skipped, demo 141 | 9 skipped).

* **Built**:
  * Convex's "lists, signs and erases the 1365 lockboxes..." has a 120 s ceiling and a one-line comment saying why (it was `30_000`, the default itself). The fill is as it was.
  * **A product race fixed, behind both the React and the demo flakes** (`packages/safebyok-react/src/vault-provider.tsx`): the provider ended its dialog in `useEffect(() => () => endAsking(...), [vault])`. When `vault` went from `null` to the opened handle, the *previous* effect's cleanup ran, as a passive effect after the commit. If an action had already opened a dialog in the meantime, the cleanup closed it as "its vault is gone" and the action resolved `null`, with no dialog ever shown. Now the open effect's own cleanup ends the dialog, beside `handle.close()`. A patch changeset says so.
  * A regression test ("keeps a dialog an action opens in the very commit that gave the provider its vault") opens an action from a `useLayoutEffect`, which runs before passive effects; it fails on the old code every time, passes on the new.
  * Demo: `tests/setup.ts` sets Testing Library's `asyncUtilTimeout` to 5 s and `vite.config.ts` gives each test 15 s.
* **How each was met**:
  * React `vault-provider` ("wrong passphrase...", "an action through withUnlockedVault...", and four more dialog tests): **reproduced** with 60 parallel `vitest run` copies of the file (about 5 of 60 failed, in a different dialog test each time); traced with timestamps to the cleanup above; after the fix 0 of 80 (with `--sequence.shuffle`) failed.
  * Demo `answerPassphraseDialog` ("could not find the passphrase field") and `VaultDashboard` view/use/delete tests: **reproduced** with 60 parallel runs of `test-helpers.test.tsx` and `VaultDashboard.test.tsx` (4 of 60 failed on the same race: `findByText('locked')`, click, no dialog); after the product fix 0 of 60.
  * The demo's remaining failures at 30 whole-suite runs in parallel (3 of 30: "adds a lockbox", KnockKnock's save, SessionBar's sign-in) were not races: waits of 1 s (and one test of 5 s) outlasted by making a vault under load. Fixed by the longer ceilings; 0 of 30 after. Not shown for `VaultDashboard` delete on node-compat 26 in particular: it is the same family (a dialog, then a wait), and no run of mine failed it.
  * Convex: fixed by reading (4.5 s locally, 31-34 s in CI per the report); not reproduced under coverage here.

* **Decisions taken**:
  * Fixed the race in the product, not by flushing effects in the tests (`await act(async () => {})` after the first wait made the React file pass too, and I had it working): the same race would meet any host's tests that click right after a `findBy`, and a test-side flush would hide it.
  * `asyncUtilTimeout` raised only in the demo; the React package's tests passed 80 of 80 starved with the default.

* **Deviations**: the plan called this a `tests:` thread; it pulls in a one-file product fix to `safebyok-react` (with its changeset) because the race is the product's. Declared in the PR.

* **Discoveries**: a dialog an action opens before React's passive effects have run is rare for a person (a click inside the few milliseconds between the commit and the effect flush) but easy for code: any host effect or event handler that calls `withUnlockedVault` right as the vault appears.
  The stale-action case I called unlikely was real, and my change had widened it: see the review follow-up.
  Do not poll with `pgrep -f "vitest run"` from a shell whose own command line contains that text.

* **For the Coach**: nothing blocking.

## Review follow-up

* The reviewer's `client:` fix. With the dialog's ending moved into the open effect's cleanup, an action whose `vault_locked` refusal reaches `withUnlockedVault` after its vault went (a host action holding the refusal back past a sign-out) opened a dialog that nothing ended: it showed over the next user's vault, or hung on an unmount while signed out. My thread had widened the window to the whole signed-out stretch. `awaitUnlock` now resolves `null` at once while there is no vault (`vaultRef`), a new test holds such a refusal across a sign-out, and the changeset says so.
* The reviewer's `tests:` fix: the Convex ceiling's comment names the real work (landing 1365 lockboxes, a mutation each) and drops a machine-dependent local time.
* One suppression the reviewer added: `eslint-disable-next-line unicorn/prefer-promise-with-resolvers` in the new test, following the file's own precedent.
* Rebase: onto main after the line merged; the one conflict was `vault-provider.tsx`, where main's `eraseDamagedVault` sat beside the lines I moved (`endAsking` above the open effect); both kept.
