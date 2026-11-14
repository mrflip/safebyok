# Thread 14: react_doc_trim (2026-11-07)

Branch `20261107-react_doc_trim`, PR #581, cut from main (a80589274). Justify: green.

* **Built**: every doc block in `packages/safebyok-react/src` is one line of purpose (the multi-line
  ones folded to their first sentence; `@example` blocks kept; single-line ones with a `;` or `:`
  tail cut to the clause before it; "Default: ..." tails of prop docs dropped). The package README
  is two lines: what the package is, and that a full guide is coming. A `safebyok-react` patch
  changeset (`.changeset/20261107-react_doc_trim.md`).
* **Decisions taken**: nothing reads the README (no test, script, workflow, or `files` entry
  beyond npm's automatic inclusion), so nothing was kept from it; no other file links to its
  headings. `@returns` on `useRevealToggle` went (no lint rule needs it; its `@example` stays).
  `//` comments, behaviour, names and tests untouched. Doc blocks that were already one short line
  were left alone.
* **Discoveries**: the package lints with no jsdoc warnings after the trim.
* **For the Coach**: the one-liners are deliberately small, and some information the old blocks
  carried (the `passphraseAdvice` privacy caveat, "read the whisper at each render, never keep it",
  the autocomplete reasoning on `WhisperField`) is gone from doc blocks; the documentarian run
  may want to restore the caveats a caller needs. It is also gone with the README's guide until
  the rewrite.
* **Meeting lines**: `passkey.ts`, `passkey-unlock-button.tsx`, `bank-provider.tsx` (thread 13) and
  `reveal-toggle.tsx`, `vault-controls.tsx` (thread 5) are touched at doc blocks only; the end's
  restack settles any conflict.
