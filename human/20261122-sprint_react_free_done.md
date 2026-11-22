# Sprint react_free: done (2026-11-22)

The sprint took the *Free* list of the react_targets burndown, from item 2 on, in YOLO. The two demos now use the
library's newer offerings. The React layer gained four headless field hooks, a passphrase verdict and match, `className`
and `data-` state on its parts, kit words a host can replace, and visible labels. Four host-facing option types are now
tied to their checks, and base-32 is explained where a reader first meets it. Envman, Knock-Knock and the old React
demo were walked in headless Chromium, and no demo bug turned up. Every PR is a draft, stacked on the workshop's line
and not on main. The workshop closes that line by squashing it into #817, so nothing here is marked ready.

Sprint doc: [Sprint react_free](https://claude.ai/artifact/K5Tfgw5zf4eiW5SGbRPJPa). The plan is
`whiteboard/20261122-react_free/react_free-plan.md`; the resolutions are `react_free-resolutions.md` beside it.

## The PRs, in merge order

The line: main → #818 → #820 → #821 → #827 → #831 → #824 → #825 → #823 (the workshop's), then this sprint's:

1. [#822](https://github.com/mrflip/safebyok/pull/822) `knock_query` (thread 2), stacked on #823: Knock-Knock saves
   its key through `putBoxMutationOptions`, and every submit uses `SubmitButton` with `isPending`. Reviewed `fixed`.
2. [#819](https://github.com/mrflip/safebyok/pull/819) `envman_actions` (thread 3), stacked on #822: envman's Undo
   calls `draft.discard`, its add form uses `secretFieldnames`, and every catch wraps with `sanitizeForeignError`.
   Reviewed `fixed`.
3. [#835](https://github.com/mrflip/safebyok/pull/835) `opts_checked` (thread 6), stacked on #819: `PutBoxActionOpts`,
   `DraftPutOpts` and `GiverConfig` are asserted equal to their checkers' input, and base-32 is explained. Reviewed
   `clean`.
4. [#834](https://github.com/mrflip/safebyok/pull/834) `field_hooks` (thread 4), stacked on #835: `usePassphraseField`,
   `useWhisperField`, `useWhisperText` and `useWhisperMask`; `useNewPassphrase().verdict` and `match`; the mask no
   longer goes blank while locked. Reviewed `fixed` at `high`; reworked; second review `fixed`.
5. [#836](https://github.com/mrflip/safebyok/pull/836) `kit_parts` (thread 5), stacked on #834: `className`, `data-`
   state, `KitPhrasesProvider` and `PartsPhrasesProvider`, visible labels, and `WithLockableWhisperOpts` tied to its
   check. Reviewed `fixed`.
6. [#838](https://github.com/mrflip/safebyok/pull/838) `browser_pass` (thread 7), stacked on #836: the walk-through and
   its scripts, plus a fix for a react-giver test race CI met on Node 26 (eleven tests now wait on the harness's value
   rather than on the rendered text). No review: no product code.
7. [#832](https://github.com/mrflip/safebyok/pull/832), the sprint PR, on top: the plan, the progress document, the
   resolutions and this note.

Thread 1 moved #823 onto #825 and is in #823 itself. The workshop then restacked its own line under #823.

## YOLO decisions (each a row in the doc)

* The sprint took the *Free* list, and the core work stays with the workshop.
* #823 was moved onto #825 so that one tip carried all three library threads.
* `useWhisperMask` now clears when its box, field or tail changes, and keeps the mask only across an unlock, a lock or
  a save. The first review had found the previous box's mask showing beside a new label.
* For the browser pass, Debian's own packages were unpacked into scratch. Nothing outside scratch changed. Your
  `sudo npx playwright install-deps chromium` is the cleaner route.

## Still open (the doc's *Open Matters* has each as a row)

* **No score in the passphrase verdict** (TOP, #834): the guide promises a score, and the core's verdict has none.
* #834: hosts destructure the reveal hooks; a proposed wontfix row, where a late Show leaves its button pressed (the
  reviewer confirmed it true); `verdict` keeps the last verdict while a newer one is judged.
* #835: interface or alias for the option types; strict option checks; the giver's device options are checked only at
  sign-in.
* #836: a host's `className` replaces the part's own; a misspelt word override is refused; the passkey messages can't
  be overridden yet; the new-passphrase fields keep an `aria-label`.
* #819: envman wraps all its own catches; a spaces-only title comes back untrimmed; the sign-in form stays an Action.
* #838: **For coach**, compare the walk-through with your own run; a refused write is left half-made in the demos'
  localStorage stand-in (for the idb_lean vaultDB to avoid); the demos' own fields have no visible labels.
* The two YOLO rows above (the mask, the browser), and the first two (the scope, moving #823).

## For the workshop's close-out

* The workshop's thread 12 rewrites the record hooks, the bridge and the giver on top of #831. This sprint's #834 to
  #836 touch the kit and `react-giver.tsx`, so expect conflicts where the two meet.
* `useDraft`'s placeholder should read `usePartsPhrases()`, which #836 adds.
* A documentarian pass at close-out: the `PartsPhrasesContext` and `CeremonyPhrases` doc blocks (#836), and
  `useWhisperText`'s example, which uses a `box` it never defines (#834).
* `notes/react_lib_principles.md` is only on the base checkout's branch, and none of the line's branches has it.
