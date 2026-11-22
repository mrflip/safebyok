# Thread 2: envman_actions (2026-11-22)

Branch `20261122-envman_actions`, PR #TBD, stacked on #818. Proved: `pnpm --filter safebyok-demo-envman` lint,
typecheck and test (30 tests, 4 files); `pnpm justify` at the end (see the PR's **Tests:** line).

* **Built**: envman (`demos/safebyok-demo-envman`) is the worked example of React 19 Actions.
  - `AddEnvForm`, `EnvSettingsDialog` and `SessionBar` are form Actions under `useActionState`, each submit the parts'
    `SubmitButton`. Each action's result carries back the non-secret fields typed (`EnvTexts`, from
    `envTextsOfForm` in `src/lib/env-form.ts`; the username for sign-in), and each input's `defaultValue` reads them,
    so React's reset after the action puts them back. The value (`val`) is never carried back.
  - `AddEnvForm` wraps `Envman.putBoxAction`: it reads the texts first, since `putBoxAction` empties the `FormData`
    before it writes, then calls it and keeps only its `err`.
  - The dialog's `onSubmit`/`preventDefault` workaround and its comment are gone. Its starting texts come from
    `envTextsOfEnv(env)`.
  - `EnvRow`'s Save is an Action on a button: `useTransition`, the refusal caught into `useState` and shown as before
    (a `dismissed` refusal hidden, as before). Undo and the `useStageChange` block clear that state where they called
    `save.reset()`; the block is otherwise untouched.
  - No `useMutation` remains in envman. `@tanstack/react-query` stays for `QueryClientProvider`.
  - Tests in `tests/components/App.test.tsx`: the add form keeps what was typed but the value on a refusal; the
    dialog keeps what was typed on a refusal; sign-in keeps a refused username; a row keeps a value typed when its
    Save is refused (a dismissed unlock), and the next Save writes it. `tests/lib/env-form.test.ts` covers the two
    texts helpers.
* **Decisions made**:
  - **Item 2, which Action**: a form Action is unsound with today's `useDraft`. Spike: Save as
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
  - The demo's README "What it shows" names the idiom, and says why Save is not a form.
* **Discoveries**: where the library stops envman being exemplary, one each, in the PR body and the report:
  - `useDraft` and a form Action: what `useDraft` would need is in the PR body.
  - `docs/guide-suspense.md`'s *Not built yet* says `putBoxAction`'s `err` is `unknown`; on this branch it is
    `Error | null` (`PutBoxActionResult`), and the app needs no cast for it.
  - `draft.lastErr` and `draft.put`'s rejection are `unknown`, so the row casts both to `Error` to show a message.
* **Set aside**: an `onReset` on the row's form that cancels React's reset would make the form Action work, but it
  fights React from inside the app, which the handoff rules out; and a ref that restores the typed text after the
  reset is the same thing, hand-rolled.
