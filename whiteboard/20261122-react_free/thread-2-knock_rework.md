# Thread 2: knock_rework (2026-11-22)

Branch `20261122-knock_query`, PR #822, stacked on #823 (`20261122-multiples`, 908751892, on #825, #824, #821).
Proved: the demo's lint, typecheck and tests (28 in 4 files) at `b2124ecfb`; `pnpm justify` after the catch-up, in the PR's **Tests:** line.

The workshop built this PR as its thread 5 (`whiteboard/20261122-react_targets/thread-5-knock_query.md`, left as it was).
This thread takes up what #823 gives the mutation modality: `putBoxMutationOptions` and `SubmitButton`'s `isPending`.
Only `demos/safebyok-demo-knockknock` changes.

* **Built**:
  * **Restacked** from #821 onto #823 (`git rebase --onto origin/20261122-multiples origin/20261122-unlock_urgent`),
    `sprintbase` 908751892. No other local branch moved by the rebase (`20261122-react_free` moved by its own commit meanwhile).
  * **`KeyEditor`** (`src/components/KeyPanel.tsx`): `useMutation(useMemo(() => Knock.putBoxMutationOptions(KeyLabelpath, { whisperOf, sidecarOf }), []))`,
    still `<form action={(form) => { putKey.mutate(form) }}>`. `whisperOf` trims the key with `formTextOf` and throws
    "Paste your Anthropic API key first." on one of only whitespace; `sidecarOf` stores `mask(…, { tail: 0 })`.
    The hand-written `popField`, `networkMode: 'always'` and `Knock.putBoxOnce` are gone: the options carry them.
  * **`SubmitButton`** with `isPending` on each form the app writes itself: the key's ("Saving…"), the knock's
    ("Knocking…", `disabled` while no key is stored) and the sign-in's ("Signing in…").
  * **Test**: "refuses a key of only whitespace, and keeps the key stored" (`tests/components/App.test.tsx`), for the
    refusal that moved into a host callback. The workshop's "puts the key by a mutation that retains none of it" test
    passes unchanged over the library's delete.
  * README's bullets and the changeset's message follow.
* **Decisions made**:
  * **`secretFieldnames` left out**, so the options delete every field: the form has only the key.
  * **`useMemo` with no deps**, as the options' doc asks. Their `mutationKey` names the user signed in when they are
    made; `KeyEditor` mounts only while a bank is unlocked, so a sign-out unmounts it.
  * **`SubmitButton` on the sign-in and the knock too**, not only the key's form: the demo is one modality, every submit
    a mutation, and the part serves each the same way. Sign-out, Lock and Delete are `type="button"` and stay plain.
* **Discoveries**: the workshop's open questions on #822 are settled by #823 (`putBoxMutation` built as
  `putBoxMutationOptions`; `SubmitButton`'s `isPending`). Exporting `refusalTextOf` stays open, and out of this
  thread's bounds. `notes/react_lib_principles.md` is in the base checkout only, not on this line.
