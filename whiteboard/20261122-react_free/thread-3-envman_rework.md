# Thread 3: envman_rework (2026-11-22)

Branch `20261122-envman_actions`, PR #819, stacked on #823 (`20261122-multiples`, 908751892). Proved:
`pnpm --filter safebyok-demo-envman` lint, typecheck, test (32 passed, 4 files); `pnpm justify` below.

The build before this rework is in `whiteboard/20261122-react_targets/thread-2-envman_actions.md` (react_targets
workshop, thread 2): read it for why every envman form is a form Action.

* **Built**:
  * **Restack.** From #821's tip onto #823's, `git rebase --onto origin/20261122-multiples origin/20261122-unlock_urgent`.
    Two conflicts, both in `EnvRow.tsx`, both #825 dropping the `(draft.lastErr as Error)` cast our side still had:
    resolved to our side without that cast. No other local branch moved.
  * **Undo calls `draft.discard`** (`EnvRow.tsx`): `<button type="button" onClick={draft.discard}>`, no longer
    `<button type="reset">`. Since #824 a form reset forgets only the typed fields, so a reset-Undo would have kept
    the settings the gear's dialog set. A refused Save now keeps those settings for the next Save, and Undo drops them.
  * **The add form names its secret field** (`AddEnvForm.tsx`): `secretFieldnames: ['val']` on `AddEnvOpts`. The form
    reads `texts` from `putBoxAction`'s result (`{ ...NewEnvTexts, ...added?.texts }`: after a landed write `texts`
    is `{}`, so the defaults show again). `envTextsOfForm` before the call, and the `AddEnvResult` type, are gone.
  * **The catches wrap in place of a cast**: `putDraftAction` (`EnvRow.tsx`), `signInAction` (`SessionBar.tsx`) and
    the dialog's `applyAction` return `sanitizeForeignError(err)`, imported from `safebyok`'s front door. No `as Error`
    is left in envman's `src/`.
  * **Test**: "keeps the settings through a refused Save, and Undo drops them": on a locked page, rename through the
    gear, type a value, Save, cancel the unlock dialog; the value is empty, the title stays, Save and Undo are enabled;
    Undo puts the old title back. With Undo back as a reset button it fails.
  * README: the row's Undo and the add form's `secretFieldnames`.
* **Decisions made**:
  * **The add form keeps a one-line wrapper.** `addEnvAction(prior, form)` returns
    `Envman.putBoxAction(newEnvLabel(), AddEnvOpts)(prior, form)`: each new env is a box under a label minted at
    submit, so the action has to be made per submit. What `secretFieldnames` replaced is the part that read the fields
    first. Set aside: a label kept in state and minted again after a landed write, with the action under `useMemo`.
    That is more moving parts than the per-submit call.
  * **Which cast goes.** The burndown's "its remaining cast goes" read against #819's body item 6, which named two:
    `(draft.lastErr as Error)`, which #825 dropped, and `return err as Error` in `putDraftAction`. `draft.put`'s
    rejection is still `unknown` to TypeScript, so the second is wrapped, as `notes/react_lib_principles.md` *Secrets*
    says ("wraps it there, once, in place of a cast"). Set aside: `.then(() => null, (err: Error) => err)`, a cast by
    another name.
  * **Each catch the same way.** `SessionBar` and the dialog catch the demo's own throws (`signIn`, `envFieldsOf`),
    always `Error`s. They are wrapped too, so the demo shows one way to write a catch, not two. See *For the Coach*.
* **Deviations**:
  * Wrapping the two catches beyond the one the burndown names (above).
  * A refused add form with a title of only spaces now shows the spaces again: `putBoxAction`'s `texts` are the raw
    text, where `envTextsOfForm` trimmed. The test's expectation changed from `''` to `' '`.
* **Discoveries**:
  * `sanitizeForeignError` reaches a host from `safebyok` (its front door re-exports `safebyok/storage`), not from
    `safebyok-react-lean`.
  * `origin/20261122-unlock_urgent` had moved by two docs commits (717a0ee3f, 9f0b0f591) past the base the branch was
    cut from; #823 contains them, so the `--onto` rebase took only this PR's seven commits.
* **For the Coach**:
  * **Wrap the demo's own catches?** I wrapped all three for one idiom. The other way: wrap only `putDraftAction`'s,
    the one catching the library's rejection, and keep `err as Error` where the demo catches its own `Error`.
  * **A title of only spaces comes back as typed** after a refused add: accept? I recommend yes; it is what the user
    typed, and the refusal says why.
  * Carried from thread 2, now answered by the rulings: a refusal outlives Undo (the Undo row of `notes/wontfix.md`);
    the dialog's settings survive a refused Save (#824, built here).
