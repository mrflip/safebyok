# Thread 2: envman_actions (2026-11-22)

Branch `20261122-envman_actions`, PR #819, stacked on #821 (rebased 2026-11-22 from #818). Proved: see *Rework*.

* **Built**: envman (`demos/safebyok-demo-envman`) is the worked example of React 19 Actions.
  - `AddEnvForm`, `EnvSettingsDialog` and `SessionBar` are form Actions under `useActionState`, each submit the parts'
    `SubmitButton`. Each action's result carries back the non-secret fields typed (`EnvTexts`, from
    `envTextsOfForm` in `src/lib/env-form.ts`; the username for sign-in), and each input's `defaultValue` reads them,
    so React's reset after the action puts them back. The value (`val`) is never carried back.
  - `AddEnvForm` wraps `Envman.putBoxAction`: it reads the texts first, since `putBoxAction` empties the `FormData`
    before it writes, then calls it and keeps only its `err`.
  - The dialog's `onSubmit`/`preventDefault` workaround and its comment are gone. Its starting texts come from
    `envTextsOfEnv(env)`.
  - `EnvRow`'s Save: first built on `useTransition`; now a form Action (see *Rework*).
  - No `useMutation` remains in envman. `@tanstack/react-query` stays for `QueryClientProvider`.
  - Tests in `tests/components/App.test.tsx`: the add form keeps what was typed but the value on a refusal; the
    dialog keeps what was typed on a refusal; sign-in keeps a refused username. The row's tests are in *Rework*. `tests/lib/env-form.test.ts` covers the two
    texts helpers.
* **Decisions made**:
  - **Item 2, which Action** (superseded by the rework, kept for the record): a form Action was unsound with `useDraft` before #821. Spike: Save as
    `<form action>` around the value's input with `SubmitButton`. The row test (type a value on a locked vault, Save,
    Cancel the unlock dialog) fails it: after the refusal the input is `''` while Undo stays enabled (the draft
    still counts `val` as typed), and the next Save, unlocked, writes an empty value (the row's mask turns empty).
    React's reset after the action empties the uncontrolled input, and `put` rejected without discarding. So Save is
    `useTransition` on the button, and the same test passes. The spike's diff was not kept in the tree.
  - A refused title of only spaces comes back blank, since the texts are trimmed as `envFieldsOf` reads them.
  - The result types (`AddEnvResult`, `ApplyResult`, `SignInResult`) carry `err: Error | null`; the dialog's and
    sign-in's catch cast `err as Error`, as the old code did. `ApplyResult` lives inside the component, because
    `unicorn/prefer-smaller-scope` asks for it.
  - The error after an `await` in `startSaving` is set outside the transition: it shows at once, and nothing needs it
    batched.
* **Deviations**:
  - `SessionBar` was a form Action with `useState` for its gripe, and lost the username on a refusal. It is now the
    same idiom as the other two forms and keeps the username. Not in the handoff's list: done for "one idiom
    throughout".
  - The demo's README "What it shows" names the idiom. (Its "why Save is not a form" is gone in the rework.)
* **Discoveries**: where the library stops envman being exemplary, one each, in the PR body and the report:
  - `useDraft` and a form Action: closed by #821 (`useDraft` discards on its form's reset).
  - `docs/guide-suspense.md`'s *Not built yet* says `putBoxAction`'s `err` is `unknown`; on this branch it is
    `Error | null` (`PutBoxActionResult`), and the app needs no cast for it.
  - `draft.lastErr` and `draft.put`'s rejection are `unknown`, so the row casts both to `Error` to show a message.
* **Set aside**: an `onReset` on the row's form that cancels React's reset would make the form Action work, but it
  fights React from inside the app, which the handoff rules out; and a ref that restores the typed text after the
  reset is the same thing, hand-rolled.

## Rework (2026-11-22, a fresh worker)

The Coach ruled each demo a pure-form exercise in its way; envman's is React 19 Actions, every form a form Action.
#821 made that possible for a row's Save: `useDraft` discards on its form's reset, and the kit's unlock dialog submits
outside a transition, so a form Action waiting on it no longer freezes it after a wrong passphrase.

* **Rebase**: the three commits moved from `717784b37` onto #821's tip `4c7c7d608`, clean.
* **A row's Save** (`EnvRow.tsx`): `<form action={putAction} className="row">` around the mask, the value's input,
  `SubmitButton` (disabled while the draft is clean) and Undo. `putDraftAction` calls `draft.put` and resolves the
  refusal or null, under `useActionState`; a `dismissed` refusal stays hidden. Enter saves. The `useTransition`, the
  hand-kept `saveErr` state and the README's "why Save is not a form" are gone. The `useStageChange` block now only
  calls `draft.discard()` on a lock.
* **Undo** is `<button type="reset">`: the form's reset discards the draft. Chosen over `onClick={draft.discard}`
  because it is the form's own Undo; a one-line JSX comment says the reset discards.
* **`AddEnvForm.tsx` wording**: React resets the inputs on the page; `putBoxAction` deletes every field from the
  `FormData` (it does, through `emptyForm`), so the texts are read first. The README says the same.
* **Tests**: "empties a value whose Save is refused, and the next Save writes the value typed then" (locked vault,
  Save, Cancel the unlock: input `''`, Save and Undo disabled, no alert; type a new value, Save, unlock: its mask shows
  and focus reveals it). "lets a wrong passphrase be mended in the unlock a Save waits on, then writes the value"
  (the reviewer's probe, adapted). Checked against #821 undone locally (not committed): with `unlock-form.tsx` and its
  siblings reverted the wrong-passphrase test fails; with `use-draft.ts` reverted the refused-Save test fails
  (`['', false, false]`) and so does the Undo test.
* **No `useMutation` or `useTransition`** remains in envman's `src/`.

### Behaviour changed by the rework

* A refusal shown under a row (`stale_write`, say) stays after Undo and after a lock, until the next Save: a
  `useActionState` result has no reset, and before the rework Undo and the lock block cleared it.
* A refused Save also drops the settings the gear's dialog set on the draft (title, description, period), since the
  draft's discard starts again from the box stored. Before, a refused Save kept them.

### Where the library still stops envman being exemplary

* `draft.put`'s rejection and `draft.lastErr` are `unknown`: the row casts `err as Error` in its action's catch, and
  `(draft.lastErr as Error).message` when showing it. Still open.
* A form-reset discard drops the draft's sidecar as well as the typed value: an app cannot keep the dialog's settings
  past a refused Save without hand-keeping them.
* `docs/guide-suspense.md` *Not built yet* on `putBoxAction`'s `err` being `unknown`: unchanged, out of bounds here.

### Set aside in the rework

* Undo as a second submit (`formAction`) through the same `useActionState`, so it could clear the refusal: it makes
  Undo submit a form, which reads worse than the stale alert it fixes.
