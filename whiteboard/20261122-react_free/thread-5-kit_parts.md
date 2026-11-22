# Thread 5: kit_parts (2026-11-22)

Branch `20261122-kit_parts`, PR #836, stacked on #834 (thread 4, field_hooks). Proved:
`pnpm justify` green after the catch-up onto #834 (as cut): safebyok-react-lean 332 tests in 24
files, the demos' tests unchanged (Knock-Knock 26, envman 24), e2e 576.

* **Built**, all in `packages/safebyok-react-lean`:
  * **Parts take `className` and mark their state.** `PassphraseInput` and `WhisperInput` give
    `className` and the rest to their `<input>`, which carries `data-revealed` and `data-invalid`
    (mirrors `aria-invalid`: true or `'true'`). `SubmitButton` carries `data-pending`.
    `WhisperText` gives them to its outer `<span>` (`data-revealed`, `data-pending` while the Show
    is on its way). `WhisperMask` gives them to its `<code>`, no data- attribute. Each is
    presence-based (`flag || undefined`): CSS selects `[data-revealed]`.
  * **Words in one place.** `src/parts/phrases-parts.tsx`: `PartsPhrases`, `PartsPhrasesProvider`,
    `usePartsPhrases`, and `PartsPhrasesContext` (exported to the kit, not from the index).
    `src/kit/phrases-kit.tsx`: `KitPhrases` (the parts' words among them), `KitPhrasesProvider`,
    which gives both contexts from one merge, `useKitPhrases`, and `refusalTextOf(err, phrases =
    KitPhrases)`. Each provider merges over the one above it. Every kit form and part reads its
    words from context.
  * **Visible labels.** Each field in `UnlockForm`, `CreateVaultForm`, `ReplacePassphraseForm`,
    `AddPasskeyForm` and `RevokePasskeyForm` has a `<label htmlFor>`; `useNewPassphrase`'s
    `field` and `confirmField` each carry an `id` (`useId`). The kit dropped `aria-label` where
    it controls the field; placeholders stay.
  * **`WithLockableWhisperOpts` tied to its check** in `src/giver/react-giver.tsx`, thread 6's
    pattern: `true satisfies AssertEqual<WithLockableWhisperOpts<unknown>,
    Readonly<CheckerInput<typeof Checks.withLockableWhisperOpts>>>` after the `Checks` block, and
    `AssertEqual`, `CheckerInput` exported from `packages/safebyok/src/storage.ts`. Made
    `ifLocked` optional by hand once to see it bite: tsc refused.
  * Tests: one per part for className, pass-through and its data- attributes;
    `tests/parts/phrases-parts.test.tsx` (new); `tests/kit/phrases-kit.test.tsx` (was `.ts`);
    a visible-label case per kit form through `TH.expectVisiblyLabelled` (new,
    `tests/test-helpers/labels.ts`); `useNewPassphrase` ids. `docs/guide-headless.md`: two
    *Not built yet* lines struck, one sentence on the providers.

* **Decisions made**:
  * **`className` replaces, not merges**, on `WhisperText` and `WhisperMask`
    (`className = 'whisper-text'`). Merging wants `clsx`, a new runtime dependency and a Coach's
    yes (PROCESS.md, *Dependencies*); hand-rolled joining is ruled out. On the inputs `className`
    goes to the `<input>`, as before, and the wrapper keeps `passphrase-input`.
  * **The words check is strict**: a misspelt key (`showButon`) or a non-string is refused with
    `bad_record`, rather than left in English unnoticed. The check is derived from the words
    object (`mapValues(..., () => str.exactOptional())`), so a new word needs no second edit.
  * **The passkey ceremony's four messages moved out of `KitPhrases`** into `CeremonyPhrases`
    (`src/kit/phrases-kit.tsx`, used by `src/kit/passkey.ts`). They travel as a `VaultError`'s
    message and reach the user through `refusalTextOf`'s default arm (`return err.message`),
    which is held for another session; so they cannot follow a provider, and leaving them in
    `KitPhrases` would have promised an override that does nothing.
  * **`KitPhrasesProvider` sets `PartsPhrasesContext` directly**, not through
    `PartsPhrasesProvider`, whose strict check would refuse the kit's own keys.
  * **`useNewPassphrase` keeps `aria-label` beside the new `id`**: additive, so a host spreading
    `field` onto a bare input keeps an accessible name. The kit's forms show the same text in
    their label, so the name agrees with what is seen.

* **Deviations**:
  * The handoff placed `WithLockableWhisperOpts` in `parts/whisper-mask.tsx`; it is in
    `giver/react-giver.tsx`.
  * `src/giver/use-draft.ts` still reads the static `PartsPhrases.masked`: the record hooks are
    the workshop's thread 12.

* **Discoveries**:
  * The assertion line and the `storage.ts` and import edits are thread 6's, line for line;
    whichever merges second meets a trivial conflict at the assertion's neighbour in
    `react-giver.tsx` (thread 6 asserts its own type beside it). Keep both lines.
  * `notes/react_lib_principles.md` named by the handoff is not in this tree.
  * Demo tests find fields by label text, so they kept passing unchanged; none mended.

* **For the Coach**: the open matters in the PR body: replace-not-merge for `className`, the
  strict words check, the ceremony messages not overridable, and `aria-label` kept on the hook.
