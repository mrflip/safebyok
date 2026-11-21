# Thread 11: giver_surface (2026-11-21)

Branch `20261121-giver_surface`, PR [#806](https://github.com/mrflip/safebyok/pull/806), stacked on #805. Proved: `safebyok-react-lean` lint, typecheck, 219
tests (14 files); the Knock-Knock demo lint, typecheck, 26 tests. `pnpm justify` after the catch-up: see the PR's **Tests:** line.

* **Built**, the Coach's five rulings on the giver's surface:
  * **Standalone gatings and mutation options**, back on the bank giver beside the five form hooks:
    `birthGating`, `unlockGating`, `replacePassphraseGating`, `addPasskeyGating`, `revokePasskeyGating` (synchronous,
    refusing `absent_vault` at a stage the verb has no bank for), and `birthMutationOptions()`, `unlockMutationOptions()`,
    `replacePassphraseMutationOptions()`, `addPasskeyMutationOptions()`, `revokePasskeyMutationOptions()`, typed
    `FormMutationOptions` (exported). Each hook is now the two together: `useUnlock()` is `useMutation` over the
    options keyed by the user the provider shows, with `unlockGating` as its `.gating` (the same function).
    TanStack's route: `const unlock = useMutation(Knock.unlockMutationOptions()); unlock.mutate(Knock.unlockGating({ passphraseCleartext }))`.
  * **How a part finds its bank**: `SOK.Provider` renders a package-level context, `GiverContext`
    (`src/giver/giver-context.ts`, not exported), holding `{ giver, bank }`. Every part and kit form takes `bank` (and
    `CreateVaultForm` and `ReplacePassphraseForm` take `giver`) as an optional override; left out, the nearest
    provider's is used (`useGivenBank`, `useGivenGiver`). Outside every provider with no prop, the part refuses
    `bad_record` at render. So `<UnlockForm />`, `<UnlockDialog />`, `<CreateVaultForm />`, `<WhisperText labelpath field />`
    work bare under the provider.
  * **Renames**: `nullifyThing` is `liveOf` (exported from `.`), `PutBoxActionResult.error` is `err`, the bank giver's
    `delBox` is `delBoxOnce`.
  * **Form mutation keys** are `['sok', userid, banklabel, verb]`, userid null while signed out, built by
    `formMutationKeyOf` in `giver-defaults.ts`; `usePasskeyHeader` watches `formMutationsKeyUnder({ userid, banklabel })`.
  * **`maskOf(text, schedule?)`**, `src/mask.ts`, exported from `.` with `MaskSchedule` and `DefaultMaskSchedule`
    (`{ head: 7, tail: 4 }`). The demo's own `maskOf` is gone; it imports this one, and stores its sidecar mask with
    `{ head: 7, tail: 0 }` (`sk-ant-…`): by the Coach's later ruling, the value stored in the sidecar carries no secret
    character. Thread 12's `withLockableWhisper` is to show a live `tail: 4` reveal while unlocked; not built here.
  * **The demo** drops its `bank={Knock}` and `giver={SOK}` props, reads `saved.err`, and imports `maskOf`; its tests
    expect `sk-ant-…` where they expected `sk-ant-…cdef`.

* **Final names, for envman (thread 10)**: from `safebyok-react-lean`: `reactGiver`, `liveOf`, `maskOf`,
  `DefaultMaskSchedule`, `MaskSchedule` (store a sidecar mask with `tail: 0`, as the demo does); on the bank giver: `useBank`, `usePasskeyHeader`, `useBox`, `useBoxList`,
  `boxQuery`, `keys`, `withWhisper`, `putBoxOnce`, `delBoxOnce`, `putBoxAction` (resolves `{ box, err }`), `useDraft`,
  `lock`, `dismissUnlock`, the five `useFoo` form hooks, the five `fooGating`, the five `fooMutationOptions`. Render the
  kit and parts bare under `SOK.Provider`.

* **Decisions made**:
  * **`liveOf`** for `nullifyThing`: STYLE.md's `fooOf(thing)` is a pure derivation, and what it derives is the live
    record (`LiveOf<RecordT>`), or null, or undefined for a sparse one. `BoxShown` was taken; `liveRecordOf` adds nothing.
  * **`maskOf`, not the dream's `mask`**: STYLE.md names a pure function for what it returns; a bare `mask` reads as an
    act. The dream's line needs `mask(` changed to `maskOf(` (orchestrator, see the report).
  * **Short texts show nothing**: `maskOf` shows its head and tail only where at least as many characters stay hidden
    as show (22 characters for the default schedule); otherwise `…`. The old demo used a flat `> 16`. A tuned schedule
    gets the same rule, so a short secret never shows more than half of itself.
  * **Tuneable per call**, `maskOf(text, { head, tail })`: no module-level setting to mutate. A host wanting its own
    schedule everywhere wraps it once.
  * **The standalone options key by whoever is signed in when called** (the slot's userid), as `keys` and `boxQuery`
    do; the hooks key by the user the provider shows.
  * **The context's giver is typed `Pick<ReactGiver, 'useStrengthVerdict'>`**: a `ReactGiver<'knock'>` is not
    assignable to `ReactGiver<string>` (its `bank` takes only its own banklabel), and the kit needs only the strength hook.
  * **`PasskeyUnlockButton` still takes `passkeyHeader`**: not in the rulings; it could default to the bank's
    `usePasskeyHeader()` later.

* **Approaches set aside**: a context per giver (as the userid's) would need the parts handed the giver to find it,
  which is what the ruling removes; a throw-free fallback outside the provider (render nothing) would hide a host's
  missing provider.

* **Deviations**: the dream (`dream_interface.md`) is in the sprint worktree, which this thread may not write: its
  `nullifyThing` (line 65), `Acme.delBox` (line 113) and `mask(` (line 107) want `liveOf`, `delBoxOnce` and `maskOf`.
  The older thread files (3 to 7) keep the old names as history.
