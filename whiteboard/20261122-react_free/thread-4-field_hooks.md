# Thread 4: field hooks (2026-11-22)

Branch `20261122-field_hooks`, PR #834, stacked on #823. Proved: safebyok-react-lean 23 files / 307 tests, lint
and typecheck clean; both demos' tests (26 and 24) pass. `pnpm justify` not yet run.

* **Built**: in `packages/safebyok-react-lean/src/parts/`, four field hooks, each in a file of its own beside its part,
  exported from the `safebyok-react-lean/parts` entry:
  - `usePassphraseField(opts)` (`use-passphrase-field.ts`): `inputProps`, `toggleProps`, `isRevealed`, `isCapsLockOn`.
    Chains the host's `onKeyDown`, `onKeyUp`, `onBlur` after its own.
  - `useWhisperField(opts)` (`use-whisper-field.ts`): `inputProps` (with `WhisperFieldAttributes`), `toggleProps`,
    `isRevealed`.
  - `useWhisperText(labelpath, field, opts)` (`use-whisper-text.ts`): `textRef` (a ref callback), `isRevealed`,
    `isRevealing`, `toggleProps`. The text goes into the element by ref, inside `withWhisper`, never into state or a
    return value. A layout effect empties the element when not revealed; handed another box or field, it resets
    during render, and React's stale-result flag drops a Show still on its way.
  - `useWhisperMask(labelpath, field, opts)` (`use-whisper-mask.ts`): `maskRef`.
  - `reveal-toggle.tsx` became `reveal-toggle.ts`; `RevealToggleOpts` and `RevealToggleProps` are exported as types,
    `useRevealToggle` stays private.
  - `PassphraseInput`, `WhisperInput`, `WhisperText`, `WhisperMask` are now markup over those hooks, rendering as before.
  - `useNewPassphrase()` answers `verdict` (`PassphraseVerdict | null`) and `match` (`PassphraseMatch`); the kit
    re-exports `PassphraseVerdict` from `safebyok`.
  - Tests: `tests/parts/use-*.test.tsx` (host markup over each hook), `tests/kit/use-new-passphrase.test.tsx`, two
    blank-mask regressions in `whisper-mask.test.tsx` (both fail on the old part), `isPending` on `WhisperInput`.
  - `docs/guide-headless.md` and `docs/react-overview.md` brought up to date; a row in `notes/wontfix.md`.
* **The blank mask (burndown item 5)**: `WhisperMask` emptied its element, then wrote the mask after an async
  `withLockableWhisper`, whose locked branch awaits `minder.get`. Now, while locked, the mask is computed from the box's
  query data (`useBox`) synchronously in a layout effect, so a sync `ifLocked` paints with the lock; unlocked, the
  element keeps what it showed until the live mask lands. The element is never blanked before a write.
* **Decisions made**:
  - The hooks live in the parts' entry, each in a file of its own, so thread 5's markup diffs in the part files stay
    apart from mine.
  - Refs are ref callbacks (`RefCallback<HTMLElement>`), so any element type takes them.
  - Return types follow `StrengthVerdictResult`: `WhisperTextResult`, `WhisperMaskResult`; the input hooks answer
    nouns, `PassphraseField` and `WhisperField`.
  - `PassphraseInput` lets a host's `autoCapitalize` and the like override the hook's (`passed` after `inputProps`),
    with `type`, `value` and `defaultValue` last; `WhisperInput` keeps the hook's attributes last, as before.
  - `WhisperText` keeps its outer key by box and field: with it the part never shows the row below.
* **Deviations**:
  - **No score in `verdict`.** The handoff and the guide sketch "the checker's score and reason"; the core's
    `PassphraseVerdict` is `{strong: true} | {strong: false, reason}`, with no score. `verdict` is that verdict. A
    score would broaden safebyok-big's checker and `packages/safebyok/src/helpers/passphrase-strength.ts`'s guard.
  - **`match` pulled forward** (for thread 5's `data-invalid`, and words of a host's own), beside `matchText`.
  - **`WhisperInput` takes `isPending`**, as `PassphraseInput` does, so `useWhisperField` serves a mutation's form.
  - `WhisperTextProps` and `WhisperMaskProps` are type aliases now, not interfaces.
* **Discoveries**:
  - **React's `react-hooks/refs` lint** flags any member read of an object that holds a ref passed to `ref=`
    (`text.isRevealed` beside `ref={text.textRef}`), even under a name without "Ref". Destructuring passes. The
    hooks' docs and the guide now say to destructure; the guide's `key.textRef` sketch failed it.
  - A test of a host's `useWhisperText` beside `UnlockDialog` meets two Show buttons: the dialog's passphrase field
    has its own.
* **For thread 5**: the parts' markup is in `WhisperTextOf` (whisper-text.tsx), `WhisperMask`, `PassphraseInput`,
  `WhisperInput`. The hooks answer `isRevealed` (data-revealed), `isRevealing` (data-pending), `isCapsLockOn`;
  `useNewPassphrase().match === 'differs'` is data-invalid for the confirmation.
* **For the Coach**: the score; the destructuring the lint asks of hosts; the wontfix row (*A Show that lands after
  `useWhisperText` is handed another box or field leaves its button pressed*), awaiting a ruling.
