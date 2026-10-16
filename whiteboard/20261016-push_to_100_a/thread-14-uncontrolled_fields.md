# Thread 14: uncontrolled_fields (2026-10-16)

Branch `20261016-uncontrolled_fields`, PR [#134](https://github.com/mrflip/safebyok/pull/134),
stacked on [#129](https://github.com/mrflip/safebyok/pull/129) (cut at `3d62fc04`). Justify:
green at every package (react 180, demo 176 + 15 skipped, core 1612 + 33 skipped).

* **Built**:
  - **CI flakes, first, three `tests:` commits.** (1) `vault-provider.test.tsx`: the grabber kept
    what `useVault` handed down in a *passive* effect. `waitFor` returns on the DOM mutation (a
    microtask after the commit); on a loaded machine React's scheduler yields after the commit,
    and RTL's `setTimeout(0)` drain can beat the scheduled passive-effect flush, so `latest()`
    handed down the render before -- `openError` still null, so `eraseDamagedVault()` was a
    no-op that resolved. Now a layout effect (same task as the commit). Reproduced: 9 failures in
    480 shuffled runs at 24 in parallel; 0 in 288 after. (2) The demo's `App.test.tsx`
    click-through ran five 64 MiB Argon2id derivations (~0.85 s each here, >5 s on CI under
    coverage); it now swaps `TH.testDeriver` into `browserOpts`' bag by `vi.mock`, keeping the
    bag's identity. 4.5 s -> 0.5 s. (3) That exposed a real race in the test: it locked the vault
    the moment "unlocked until" showed, before the save the dialog re-runs had landed, and the
    lock won (as `withUnlockedVault` documents). It now waits for the lockbox's `view` button. 2
    in 64 before, 0 in 128 after. No timeout was raised.
  - **`WhisperField`** is uncontrolled: no `value`/`defaultValue` (both forced undefined after
    the host's props), `onChange` optional, `ref` passes through, read by `FormData` under
    `whisper_text`. `WhisperFieldAttributes.autoComplete` is `'off'` (was `'new-password'`).
  - **The passphrase field** (`PassphraseModal`, new internal `PassphraseField`): uncontrolled,
    read by ref at submit; `autocomplete`/`name` `new-password` while creating, `current-password`
    while unlocking; a hidden `autocomplete="username"` input in the same form; no
    capitalize/correct/spell-check; a Show / Hide button. Props `passphraseUsername` and
    `passphraseAdvice` on `PassphraseModal` and `VaultProvider`; `PassphraseAdvice` and
    `PassphraseModalProps` exported.
  - `src/reveal-toggle.tsx`: `useRevealToggle`, the one Show / Hide for both fields (internal).
  - README *The passphrase field* (new), *Entering a whisper*, *Revealing a whisper*; two
    thread-7 entries in `notes/security.md` brought up to date, two appended. Demo: the key field
    and the ways-in passphrase field are uncontrolled.

* **Rows**: the plan gives thread 14 no `G###` list. It settles the two *Open Matters* rows
  already in the resolutions (uncontrolled fields; `autocomplete="new-password"`): **closed**, in
  code, the README and `notes/security.md`. The one-line restatement sits beside thread 7's
  question in its thread file, on this branch.

* **Decisions taken**:
  - **Sources for the passphrase field.** Chromium, *Create Amazing Password Forms*
    (https://www.chromium.org/developers/design-documents/create-amazing-password-forms/) and
    *Password Form Styles that Chromium Understands*
    (https://www.chromium.org/developers/design-documents/form-styles-that-chromium-understands/):
    each flow in its own `<form>`, `username` / `current-password` / `new-password`, a hidden
    username field where the form has none. web.dev *Sign-in form best practices* and *Sign-up
    form best practices* (https://web.dev/articles/sign-in-form-best-practices,
    https://web.dev/articles/sign-up-form-best-practices): a show-password toggle that flips
    `type` (a `type="button"`), `aria-describedby` for what is said of the password, allow paste,
    no composition rules (NIST SP 800-63B). WHATWG HTML, *Autofill*
    (https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill): the
    tokens themselves. The Chromium PSA *Ignoring autocomplete='off' for password fields*
    (chromium-dev, 2014): why `off` is not a full answer for the whisper field.
  - **The username default** is `<user_id> (<vaultlabel> vault)` (`Messages.passphraseUsername`),
    not the bare user id: a manager seeing a new password for the user's *sign-in* name would
    offer to overwrite their login password. One vault, one entry.
  - **Advice is advice**: it never blocks Create. Empty text asks nothing; only the latest answer
    shows (a counter, no debounce); a throw or rejection goes to the dialog's boundary. The region
    is `role="status"` (polite), mounted with the field, only while creating and only when given.
  - **The passphrase field gets the reveal toggle too** (web.dev recommends it; the Coach's
    "eyeball" question covered both fields), with its own words in `messages.ts`.
  - `useRevealToggle` returns a render function for the button; a separate component would need
    the state lifted anyway.

* **Deviations**: the demo's `WaysIn` passphrase field went uncontrolled as well (it had the same
  leak); its dashboard textarea did not (below). Two React tests' helpers moved to module scope
  for `unicorn/consistent-function-scoping`. No suppressions added beyond one
  `jsx-a11y/no-autofocus` moved with the field it was on; no `@ts-expect-error`, no `any`.

* **Discoveries**:
  - **For the restack onto thread 10** (`passphraseStrengthTest`): 10 adds an `openVault` option,
    so `VaultProvider`'s `openOpts ... satisfies Record<keyof OpenVaultOpts, unknown>` stops
    compiling until it is destructured and passed through: do that, then hand the dialog
    `passphraseAdvice={passphraseAdvice ?? adviceFrom(passphraseStrengthTest)}`, where
    `adviceFrom` turns 10's verdict into the sentence (its refusal reason) or null. The host's
    own `passphraseAdvice` wins. If 10 makes `weak_passphrase` a condition, the dialog shows the
    refusal in its alert region with no change here; if it is misuse, the dialog shows "Something
    went wrong" -- 10 should make it a condition.
  - The stub vault in the React tests now carries a scope (`TH.scopeOf('u1')`): the dialog reads
    `snapshot.scope` for the username.
  - Measured with `react` and `safebyok` external: React everything 4,876 B (thread 7: 4,554),
    `{ VaultProvider }` 4,412 B, `{ WhisperField }` 1,053 B. Under thread 8's appended lines
    (5.3 kB, 4.7 kB) as their method was described; the restack's `pnpm size` is the check.

* **Review** (thread-reviewer, `fixed`): `passphraseAdvice` hears the passphrase in plain text,
  so its doc block, the README and the security note tell the host to keep it on the device; the
  changeset names the `defaultValue` removal and the `ref` passthrough. Folded in at filing (the
  reviewer's three recommendations, one `client:` commit, a test each): a superseded advice
  call's failure is ignored; what was said goes when the mode changes (render-adjusted state,
  plus a layout effect making in-flight calls stale -- `set-state-in-effect` refuses the plain
  effect); an `undefined` answer reads as null. Left for the Coach, as sprint-doc rows: the
  reveal toggle's `aria-pressed` and label, the demo `WaysIn` field, the changeset reading as a
  migration, the demo App tests' order dependence, host CSS defeating `hidden`.

* **For the Coach** (each is in the report's *Open matters* too):
  - **Capital letters**: "passphrase must contain a capital letter" is a composition rule; NIST
    SP 800-63B advises length and strength instead. Rec: none of ours; the advice slot lets a
    host say what it likes, and the README steers it to length and guessability.
  - **Chrome and `autocomplete="off"`**: Chrome still offers a saved password on a
    `type="password"` field marked `off`. Rec: accept, as ruled; the only way out is a
    `type="text"` field masked by the non-standard `-webkit-text-security`, not worth it.
    → *Coach (2026-10-16):* WONTFIX: accepted; thread 9 enters it in notes/wontfix.md.
  - **The demo dashboard's whisper textarea** stays controlled (the edit form fills it with the
    stored whisper, and the table shows whispers in plain text by design). Rec: leave it.
