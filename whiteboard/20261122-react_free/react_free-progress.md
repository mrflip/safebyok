# react_free: what the threads have taught

The orchestrator's curated summary, newer than the plan where they disagree. Workers look things up here; they do
not write it.

## The line under this sprint

* #818 `react_fruit` ← #820 `bulletproof` ← #821 `unlock_urgent` (`9f0b0f591`): the workshop's, reviewed. On #821,
  as siblings: #824 `draft_truth` ← #825 `error_wraps` (`e8c1683f4`) ← #826 `wontfix_demos`; #823 `multiples`
  (`3f19f66e6`); #819 `envman_actions`; #822 `knock_query`; #827 `minder_house` ← the workshop's thread 11.
* *Orchestrator:* thread 1 moved #823 onto #825: `origin/20261122-multiples` at `908751892` carries all three library
  threads, and is the base of threads 2 to 6. `putBoxAction`'s catch is `return { box: null, err:
  sanitizeForeignError(err), texts: textsOfForm(form) }`.
* *Orchestrator:* the workshop restacked its line after thread 1: `origin/20261122-multiples` is now `1c051f5f7`, on
  #825 ← #824 ← the workshop's thread 11 (`minder_client`) ← #827 ← #821. Threads 4 and 6 caught up onto it; #822 and
  #819 were filed on `908751892`, and their next filing rebases them (their `sprintbasebranch` is
  `origin/20261122-multiples`).
* Threads 2 and 3 rework the workshop's #822 and #819 in the workshop's own worktrees, rebased onto `908751892`.

## The sprint's line (restacked 2026-11-22)

*Orchestrator:* on #823 (`1c051f5f7`, the workshop's): #822 `782aa5d54` ← #819 `742699ea0` ← #835 `c31f46d71` ← #834
`7c288890f` ← #836 `14cc583e6`, each body "Stacked on" the one below, all drafts, verified. One conflict, kept both
assertion lines in `react-giver.tsx`. Rollback tags `<branch>-prerestack-rf1` in the base repo; local refs reset to
origin and each `sprintbase`/`sprintbasebranch` set to the PR below.

## Where things are

* *Orchestrator:* `notes/react_lib_principles.md` is committed only on the base checkout's branch, not on the line:
  handoffs name it as `/workspace/byok/notes/react_lib_principles.md`. `docs/guide-headless.md` is on the line (#818).

* *Orchestrator:* no `base-sync` from this sprint: the base checkout's branch carries the workshop's whole line, and
  the workshop session syncs it. A sync of this sprint's stack alone would drop the rest.

## What the threads found

* Thread 2 (#822): Knock-Knock's key form is `useMutation` over `putBoxMutationOptions`; every submit in that demo is
  the kit's `SubmitButton` with `isPending` (new pending labels "Signing in…", "Saving…", "Knocking…").
* Thread 3 (#819): envman's Undo is a `type="button"` calling `draft.discard`; the add form passes
  `secretFieldnames: ['val']` and refills from `texts`; every catch in envman's `src/` wraps with
  `sanitizeForeignError` (re-exported by `safebyok`), no `as Error` left.
* Thread 4 (#834): `usePassphraseField`, `useWhisperField`, `useWhisperText` (`textRef`), `useWhisperMask` (`maskRef`) in
  the `parts` entry, `src/parts/use-*.ts`; the parts are markup over them. The hooks answer `isRevealed`, `isRevealing`,
  `isCapsLockOn`; `useNewPassphrase()` answers `verdict` (no score: the core's has none) and `match`
  (`'untyped' | 'differs' | 'matches'`). Hosts destructure the reveal hooks (React's refs lint).
* Thread 6 (#835): option types asserted equal to their checkers' input, `true satisfies AssertEqual<T,
  Readonly<CheckerInput<typeof Checks.x>>>`; an array field's check needs `.readonly()`.
* Thread 5 (#836): parts take `className` (replacing their own) and pass attributes through; `data-revealed`,
  `data-invalid` (with `aria-invalid`), `data-pending`. Words: `KitPhrasesProvider` and `PartsPhrasesProvider`, read by
  `useKitPhrases()` and `usePartsPhrases()`; `KitPhrasesProvider` also supplies the parts' words. Visible `<label>`s in
  the kit's forms; the demos already query by label text. The passkey ceremony's messages are a `CeremonyPhrases`, not
  overridable. For the workshop's thread 12: `useDraft`'s placeholder should read `usePartsPhrases()`.

## The sprint doc

*Orchestrator:* [Sprint react_free](https://claude.ai/artifact/K5Tfgw5zf4eiW5SGbRPJPa), doc
`9263e7b5-3849-4fb3-8433-bf6f10ec32f1`; tabs Open Matters `0dccff07-9b57` (body `772f52dd-31e7`), Cleanup
`17a93409-b0ef` (body `69a0ec33-1add`), Progress `748b3543-647e` (body `f6dec94a-ad45`), Resolved `4e6a3a5e-8688` (body
`9b083ff2-4a6f`); the `State` enum `87d1b810-c3e3`. Last read bookmark: rev 4 (no flips); my own writes since reach rev 15. A new row: insert `"as":"blocks"` at the matters table's end (table
`mgne8td40ga.57`) with a placeholder word in the State cell, then `replace` that paragraph by id with `"with":{"as":
"markdown","blocks":{k: dropdown index 0},"from":…}` (replace takes `with`, not `source`). Insert one row per op: a multi-row
blocks insert has been refused as "a short row" twice, for no reason found.
