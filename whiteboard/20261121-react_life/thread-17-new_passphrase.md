# Thread 17: new_passphrase (2026-11-21)

Branch `20261121-new_passphrase`, PR #814, stacked on #813. Proved: `pnpm justify` green after the catch-up onto #813's
tip (safebyok 1346, safebyok-react-lean 251, knockknock 26, envman 24, e2e 576, the rest as before); no assertion
changed.

* **Built**:
  * **`useNewPassphrase(giver)`** (`packages/safebyok-react-lean/src/kit/use-new-passphrase.ts`, private to the kit):
    what `CreateVaultForm` and `ReplacePassphraseForm` each kept for a new passphrase. It wraps the giver's
    `useStrengthVerdict`, holds the two refs, the `confirmation` enumeration and `isChosenTyped`, and answers prop bags
    for the two fields (`field`, `confirmField`: ref, autoComplete, label, placeholder, required, describedby,
    onChange), the meter's and the match's ids and lines, `isReady` for the submit, and `forget` for `onReset`. Each
    form sets its own `name`s; `CreateVaultForm` overrides the field's `aria-describedby` and adds `aria-invalid` for a
    refusal, as before. The two forms lost ~40 lines each, and their copies of `strengthTextOf` and `matchTextOf`.
  * **`useReveal(bank, labelpath)`** (`packages/safebyok-react-lean/src/giver/use-reveal.ts`): the reveal machine
    `WhisperText` and `useDraft` each kept. It holds which field shows or is on its way (`fieldname`, `isRevealed`),
    masks it when the bank locks (the render-time `setState` both had), and offers `showWhisper(fieldname, write)`,
    `showTyped(fieldname)` (useDraft's typed-into field, no whisper needed) and `mask()`. `showWhisper` sets the field
    on its way, calls `withWhisper`, and inside the callback marks it shown under `flushSync` before `write(text)`
    puts the text into the page; on a refusal it masks and rethrows. `whisperTextOf` moved here from `use-draft.ts`
    (`whisper-mask.tsx` imports it from here).
  * `WhisperText` keeps only its element ref, its `onError` and its markup; `useDraft` keeps its own `lastErr`, its
    guards (`reveal.fieldname === fieldname`), the focus re-grab and the effect that empties its inputs on lock.
* **Decisions made**:
  * **`useStrengthVerdict` stays on the giver, and `judgeseq` stays a ref.** The duplication was in the forms, not in
    the giver: `useNewPassphrase` wraps the giver's hook rather than replacing it, so `SOK.useStrengthVerdict` (the
    dream interface's, and what a host's own form uses, as `tests/giver/knock-knock.test.tsx` does) keeps its contract.
    An effect cleanup's stale flag would need the passphrase as an effect dependency, so in React state, which the
    thread forbids. `useActionState` would queue every keystroke's judgement in order and keep the passphrase in
    React's action queue, and its dispatch returns nothing, where `judge` resolves once its verdict lands. The ref is
    React's own idiom for latest-wins over an imperative async call.
  * **The errors leave `showWhisper` as a rejection**, not as state in the hook: `WhisperText` hands it to `onError`,
    `useDraft` keeps it as `lastErr`. Two channels for one error would be harder to read.
  * **The hooks are private**: neither is exported from an entry. `useNewPassphrase` speaks the kit's phrases.
* **Deviations**:
  * `useDraft` now marks a field revealed inside `withWhisper`'s callback (under `flushSync`, just before writing the
    input's value) rather than after `withWhisper` resolves, since `WhisperText` needs its element mounted before the
    write. Nothing a test asserts moved; the input turns `type="text"` in the same task its value is written.
  * Rework after review: `WhisperText` is now a thin shell over an inner `WhisperTextOf` keyed by
    `JSON.stringify([labelpath, field])`, React's idiom for resetting state when a prop changes, so a revealed
    WhisperText given another box or field starts masked (it kept the old text before). No effect, counter or new
    state; one test, which fails without the key.
  * The ride-along comment on useDraft's focus branch was already there ("The unlock form takes the focus while the
    bank is locked: the field shown is given it back."), so nothing was added.
* **Discoveries**: no demo keeps a meter or a reveal of its own: both use the kit forms, `WhisperText` and `useDraft`.
  `notes/security.md` was not touched: no secret material moves (the passphrase stays in the inputs, the whisper's
  text reaches the DOM only inside `withWhisper`'s callback, as before).
* **For the Coach**:
  * **Export `useNewPassphrase`?** It is private to the kit, since it speaks the kit's phrases. Recommendation: keep
    it private until a host writes its own new-passphrase form; `useStrengthVerdict` serves that host meanwhile.
