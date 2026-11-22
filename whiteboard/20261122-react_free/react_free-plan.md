# react_free: the sprint's plan

* **Date**: 2026-11-22. **Mode**: YOLO. **Issued by**: the Coach, `/sprint
  whiteboard/20261122-react_targets/react_targets-plan.md YOLO /turbochat`.
* **Scope**: the *Free* list of `whiteboard/20261122-react_targets/react_targets-burndown.md`, from item 2, which the
  workshop's plan recommends "as a `/sprint` in another session, so that this one keeps the core questions". The core
  work (a device before its user, the BankMinder apart from the VaultMinder, the world query, persistence, the vaultDB's
  answers) and the workshop's threads 11 and 12 stay with the workshop session.
* **Levels** (defaults): review `medium`; worker `thread-worker` on `opus` at its own effort; reviewer `thread-reviewer`
  on its `sonnet` pin; style pass `style-reviewer` on its `sonnet` pin.
* **Threads at once**: 3.
* **Status**: thread 1 done; thread 2 filed (#822); thread 3 in review (#819); threads 4 and 6 building; then 5 on 4, then 7.

## Read first

* `notes/react_lib_principles.md`, whole (77 lines): the principles every React thread is held to.
* `whiteboard/20261122-react_targets/react_targets-plan.md`: *How the Coach wants it run* (what is out of bounds),
  *Rulings*, and *Rulings, fifth round*. It is a log: a later section replaces an earlier one.
* `docs/guide-headless.md`, for threads 4 and 5: the target the field hooks and the parts are built to.

## Ground rules

* **This sprint stacks on the workshop's line, not on main.** The line: #818 ← #820 ← #821, then the workshop's PRs on
  #821. Every PR's base stays `main`; the stacking is in each body's "Stacked on" line. The workshop session is live
  and still adds to the line (threads 11 and 12, on #827): never move #818, #820, #821, #827 or a branch of the
  workshop's threads 11 and 12.
* **Out of bounds** (the workshop's): the endings (lock, sweep, vacate, delete, sign-out), autolock, the adapters, the
  deviceDB, and the demos' looks for their own sake. A demo may change, or gain a feature, to show a library offering.
* **Left as they are, by the Coach's ruling**: the React layer's stale-time function and the minder's cache-level
  `onSuccess`. A thread that finds one in its way says so; it neither works around it nor reopens it.
* **The hooks over records, the bridge and the giver's Provider are the workshop's thread 12**, which rewrites them on
  #827. A thread here changes them only where its own item needs it, and says so in its report.
* **`refusalTextOf`'s default arm is held** for a separate session (`refusal_text-handoff.md` beside the workshop's
  plan): make no change to it.

## Threads

### 1. `line_up`: #823 restacked onto #825

> To settle at close-out: #823 and #825 both edit `putBoxAction`'s `catch`, so the squash meets one small merge there.
> (burndown, *Free*, 1d)

*Gloss.* Every later thread needs #823 (`putBoxMutationOptions`, `secretFieldnames`, `SubmitButton`'s `isPending`)
and #824 and #825 (`draft.discard` on a reset, the error wraps) under it; today #823 and #824 ← #825 are siblings on
#821. Rebase `20261122-multiples` (#823, worktree `/workspace/byok-multiples`) onto `20261122-error_wraps` (#825, tip
`e8c1683f4`), resolve the `putBoxAction` catch so both changes stand (the wrap by `sanitizeForeignError` and the
`texts` member), justify, push under a lease, and change #823's body to "Stacked on #825". #826 (`wontfix_demos`, on
#825) stays where it is. *Levels*: worker `opus`, effort `low`; review `none` (no new code but the merge, which
justify proves; the hunk is reported). *Depends on*: nothing. *Look-ahead*: threads 2 to 6 cut from its tip.
*Size*: small.

*Status*: done, 2026-11-22. #823 restacked onto #825, tip `908751892`, `pnpm justify` green. One conflict, in
`putBoxAction`'s doc block and catch (`react-giver.tsx`): the catch is now `return { box: null, err:
sanitizeForeignError(err), texts: textsOfForm(form) }`, #823's comment on thrown errors dropped as the wrap covers it.
No review, by its levels.

### 2. `knock_rework`: Knock-Knock takes up the multiples (#822)

> **The demos take up what applies**: Knock-Knock (#822) uses `putBoxMutationOptions` and `SubmitButton`; envman's
> (#819) Undo calls `draft.discard`, its remaining cast goes, and its wrapper around `putBoxAction` gives way to
> `secretFieldnames`. Then one review of each: neither demo PR has been reviewed, since each changes again here.
> (burndown, *Free*, 2)

*Gloss.* The Knock-Knock half. Rework of the existing PR #822 in its worktree `/workspace/byok-knock_query`: rebase it
onto thread 1's tip, then `demos/safebyok-demo-knockknock` takes up `putBoxMutationOptions` (the mutation twin; its
form stays `<form action={(form) => { save.mutate(form) }}>`, by ruling) and `SubmitButton` with `isPending`. Review
covers the whole PR from thread 1's tip, since #822 was never reviewed. *Depends on*: thread 1. *Look-ahead*: thread
7 runs this demo in a browser. *Size*: small.

*Status*: built, ready at `2b7b31502` (justify green); reviewed `fixed`; filed at `e1dc7c60b`. Stays a draft: the workshop's PRs below it are drafts, and the line closes
by the workshop's squash into #817.

*Review:* fixed, at `e1dc7c60b`: `keyPuts` a `function` declaration and its doc block shortened (tests only). Four
nits dropped with reasons (the key in the mutation cache on a throw, an unrestored spy, `liveOf` on a tombstone,
a synchronous `signIn` in `mutationFn`). Left for the record: `KeyEditor`'s error alert resets when the vault locks
and the editor remounts; it changes no stored state.

### 3. `envman_rework`: envman takes up the multiples (#819)

> (the same item, the envman half)

*Gloss.* Rework of the existing PR #819 in its worktree `/workspace/byok-envman_actions`: rebase onto thread 1's tip,
then `demos/safebyok-demo-envman`'s Undo calls `draft.discard`, its remaining cast goes, and its wrapper around
`putBoxAction` gives way to `secretFieldnames`. Review covers the whole PR from thread 1's tip. *Depends on*: thread 1.
Independent of thread 2 (another demo). *Size*: small.

*Status*: built, ready at `15100d45b` (justify green); in review. Three open matters, rows in the doc.

### 4. `field_hooks`: the headless field hooks and the verdict

> **Headless**: field hooks (`usePassphraseField`, `useWhisperField`, `useWhisperText`, `useWhisperMask`);
> `className` and `data-` state attributes on the parts; overridable words for the kit; `useNewPassphrase().verdict`;
> visible labels in the kit's forms. (burndown, *Free*, 3)
>
> `WhisperMask` is blank for a moment while locked. (burndown, *Free*, 5)

*Gloss.* The hooks half of item 3, with item 5, since `useWhisperMask` is where the blank moment is mended:
`usePassphraseField`, `useWhisperField`, `useWhisperText`, `useWhisperMask`, each the behaviour of a kit part lifted
out so the part becomes markup over the hook (`docs/guide-headless.md`, *One API key* and *Doppler-lite*), and
`useNewPassphrase().verdict` (the checker's score and reason, unworded) beside today's `verdictText` and `matchText`.
In `packages/safebyok-react-lean`. *Depends on*: thread 1. *Look-ahead*: thread 5 restyles the same parts; leave each
part a thin layer over its hook, and its markup in one place. *Size*: medium; if it runs past four hooks and the
verdict, the rest is thread 5's.

### 5. `kit_parts`: the parts' classes, state attributes, words and labels

> (item 3's other half: `className` and `data-` state attributes on the parts; overridable words for the kit; visible
> labels in the kit's forms)

*Gloss.* Each part takes `className`, passes every other attribute through, and marks its state in `data-`
attributes (`data-revealed`, `data-pending`, `data-invalid`; `docs/guide-headless.md`, *Three ways*); the kit's words
overridable in one place (`notes/react_lib_principles.md`, *Words*); visible labels in the kit's forms; and `WithLockableWhisperOpts` tied to its check, the way thread 6 ties the
others (moved here from thread 6, since it lives in a part's file). The demos'
tests may need their queries mended where a label changes. *Levels*: style pass on `opus` (the attribute and word names
are naming). *Depends on*: thread 4 (the same parts). *Size*: medium.

### 6. `opts_checked`: host-facing option types tied to their checks

> **Host-facing option types tied to their checks**, as STYLE.md asks (`PutBoxActionOpts`, `DraftPutOpts`,
> `WithLockableWhisperOpts`, `GiverConfig`): today each is written by hand beside a separate check.
> (burndown, *Free*, 4)
>
> **Say what base-32 means in our docs**: in the code it is lowercase `0-9a-v`, as `.toString(32)` writes it (the
> Coach, 2026-11-22). (burndown, *Free*, 6b)

*Gloss.* Each type derived from its check (or the check from one source), per STYLE.md *Validation* and *Shapes and
duck typing*. `GiverConfig` is also in the way of the workshop's thread 12; change its type's source, not its fields.
The base-32 line is a two-liner that rides along: wherever the docs (VOCABULARY.md, a README, a doc block) say
base-32. *Depends on*: thread 1. *Orchestrator:* `WithLockableWhisperOpts` lives in `parts/whisper-mask.tsx`, which thread 4
rewrites, so it moves to thread 5; thread 6 keeps the other three and the base-32 line.
*Size*: small to medium.

### 7. `browser_pass`: the demos in a real browser

> **A pass in a real browser**, against the Coach's run of the demos from before this workshop. (burndown, *Free*, 6)

*Gloss.* Run envman and Knock-Knock (and `safebyok-demo-react`, if it still builds on what changed) in a real
browser, headless Chromium through Playwright if the repo has it, walking each app's flows (sign in, create the vault,
unlock, save, reveal, a refusal), and record what breaks. Fix what is a plain bug in a demo; carry the rest back as
matters. The comparison with the Coach's own run is the Coach's (a *For coach* row). *Levels*: review `none` unless it
changes code. *Depends on*: threads 2 to 5, restacked into a line. *Size*: small to medium.

### Not taken

* Item 7, *Close out* (#819 and #822 caught up, every PR squashed into #817): the workshop's, after this sprint's
  line is restacked onto its tip.

## For the Coach

* This sprint restacks #823 onto #825 (thread 1): the workshop's plan records #823's tip as `4acc0477b`/`3f19f66e6`,
  which moves.
