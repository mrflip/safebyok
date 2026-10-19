# Thread A5: react_over_class (2026-10-19)

Branch `20261019-react_over_class`, [PR #199](https://github.com/mrflip/safebyok/pull/199), stacked on [#198](https://github.com/mrflip/safebyok/pull/198) (`20261019-try_twins`). Justify: green; 4266 tests, 193 skipped (live backends), 0 failed.

* **Built** (`packages/safebyok-react/src/vault-provider.tsx`, sectioned `[Hooks]`, `[VaultProvider]`):
  * **`useVault()` returns the vault** (`Vault | null`, null while signed out), as the thread and
    the design doc's *React Usage* tab have it. **`useVaultSnapshot()`** reads
    `useSyncExternalStore(vault.subscribe, vault.getSnapshot)` and answers `VaultSnapshot | null`:
    the stand-in `emptySnapshot` (`applabel: 'none'`, `state: 'opening'`) is gone.
  * What `useVault()` handed down beside the vault moved to hooks of its own: **`useOpenError()`**
    (`OpenErrorShape`: `openError`, `retryOpen`, `delDamagedVault`) and **`useWithUnlockedVault()`**
    (type `WithUnlockedVault`). `VaultContextShape` is gone. One context, memoized, each hook
    reading its part; a hook outside a provider throws "`<hook>` needs a <VaultProvider> above it."
  * **`onBadNews` held in a ref**: make gets one stable teller (`useCallback` over a ref updated
    in a layout effect) that calls whichever handler the last commit passed. An inline handler, or
    one coming and going, makes no new vault and is no longer warned of; a non-function is passed
    to make as it came, and refused there. The doc block lists which props make a new vault (user,
    scope, stores, deriver, lease/stale/limits, clock, logger, strength test, validator schemas)
    and which do not (handlers).
  * **StrictMode**: the first `hello()` is queued a microtask after the effect that makes the
    vault, and skipped if `vaultRef` has moved on. StrictMode's rehearsal closes the first vault
    in the same task, so it never subscribes or reads: the test counts 1 `subscribe`, 1
    `getVaultProps`, 1 `getMark` (2/2/2 at base; the test fails with the microtask removed).
  * **`retryOpen`** and the re-hello after `delDamagedVault` call `tryHello({ staleMinutes: 0 })`.
  * **Server render**: both `useSyncExternalStore` calls pass a server snapshot. At base,
    `renderToString` of the provider threw "Missing getServerSnapshot"; a test proves it now renders.
  * **`Vault.make`'s throw** goes from the effect straight to the error boundary (React delivers a
    passive effect's throw there), so `openFailure` became `helloFailure`, for the hello alone.
  * Demo components and test helpers read the new hooks; READMEs (react, core's two mentions,
    demo); TODO.md's *The react lifecycle* closed; `notes/security.md` entry via a sonnet subagent.
* **Decisions taken**:
  * **Vault still made in the effect, not in render.** Making it in render (`useMemo`; React 19
    reuses the memo across StrictMode's double render, so one vault would be made) needs the
    effect's cleanup to close a vault the render still holds; `close()` is final, so StrictMode's
    re-run, or a hidden `<Activity>` shown again, would run on a closed vault. Deferring the close
    a microtask passes StrictMode but still breaks Activity: it games the rehearsal rather than
    passing it. The effect owns the vault; StrictMode's rehearsal makes a second, inert handle
    that reads nothing.
  * **The `react-hooks/set-state-in-effect` suppression stays**, moved from `setOpenFailure` to
    `setVault` (the rule reports only the first; `setVault` was the next in line). The effect owns
    the handle, so the render can only learn it from state set there. TODO section deleted, the
    reason in the suppression's comment.
  * **`openError` vs `trouble`** (README *When opening fails*, the `openError` doc): `trouble` is
    the latest bad news on any read, for the vault's life, never a condition; `openError` is the
    provider's own hello's refusal while `opening`, conditions included, cleared once open. A
    damaged record is both, the same object (tested). The preplan's "`openError` becomes a read of
    `vault.trouble`" no longer fits since A3.
  * **`useOpenError` and `useWithUnlockedVault`**, two hooks rather than one bag, so A6 deletes
    `useWithUnlockedVault` whole and leaves `useOpenError` untouched.
* **Deviations**:
  * **`vault-provider.test.tsx` is 1,544 lines**, past STYLE's ~1,500 split. Not split: A6
    removes the `[withUnlockedVault settling]` section (~290 lines) and rewrites the dialog
    tests, and a split now would move what A6 then deletes; CLAUDE.md's *Reading* names the file.
    A6 splits it if it is still over.
  * **`WhisperField`, `PasskeyUnlockButton`, the boundary**: nothing to do. The button already
    reads `wayins` off the snapshot; the field and the boundary read no vault.
* **Discoveries**:
  * **`onClick={vault.lock}` fails `no-misused-promises`** (a promise to a void attribute), as A4
    found for `hello`. The examples write `onClick={() => { void vault.lock() }}`.
  * **A spoiling write rings the watch**: the vault tells `damaged_vault` from the ring's read
    and again from a hello, two error objects, so a handler may hear one fault twice.
* **For A6**: `getProof` goes through the same ref-held teller pattern (`badNewsRef`/`tellBadNews`),
  added to the `satisfies Record<keyof MakeVaultOpts, unknown>` bag, which fails the build until
  it is passed. `useWithUnlockedVault`, `WithUnlockedVault`, `awaitUnlock`, `endAsking`,
  `Asking` and the dialog render are the wiring to replace; `useOpenError` stays.
* **For the Coach**:
  * **Contract drift** (*getProof: your method*, last paragraph): "StrictMode's doubled effects
    make none twice" is not quite so. Proposed: "…so a change of signed-in user makes a new vault,
    and StrictMode's rehearsal, which makes and closes one in development, reads nothing through
    it." Recommend: carry it.
  * **`useVaultSnapshot()` null while signed out** rather than a stand-in. Recommend: keep.
* **Test counts** (vitest JSON; total includes skipped): react 231 to 241, all in
  `vault-provider.test.tsx` (80 to 90): hooks' examples, openError vs trouble, outside a provider,
  server render, three under StrictMode, two for `onBadNews`. Two titles gained their example
  pointers. Demo 215 (16 skipped) unchanged; every other workspace unchanged.
* **Size**: `pnpm size:budget --write`: `VaultProvider` 7.5 to 7.4 kB, `reactEverything` 8.4 to 8.5.
* **Looked up**: the design doc's *React Usage* tab (via `doc-tab-reader`), for `useVault`'s
  return and `useVaultSnapshot`'s null; the preplan's A6 text and phase-A ruling.
