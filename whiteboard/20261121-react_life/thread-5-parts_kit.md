# Thread 5: parts_kit (2026-11-21)

Branch `20261121-parts_kit`, PR #800, stacked on #799. Proved: `safebyok-react-lean` lint, typecheck, build, and tests (11 files, 134: 27 new, in `tests/parts/` and `tests/kit/`).

* **Built** (all in `packages/safebyok-react-lean/src/`)
  - **Parts** (`./parts`): `WhisperInput` (masked, uncontrolled, password-manager attributes, Show / Hide), `PassphraseInput` (masked, uncontrolled, Show / Hide, Caps Lock warning, hides again at each submit, `autoComplete` `current-password` or `new-password`), `SubmitButton` (`useFormStatus`: disabled while the form's action runs, `whilePending` text), `WhisperText` (one field of a box's whisper, masked; Show calls `withWhisper`, and inside its callback `flushSync`s the text's element into the page and writes `textContent` through a ref; Hide unmounts that element; a lock hides it). Private: `reveal-toggle.tsx` (`useRevealToggle`), `phrases-parts.ts`.
  - **Kit** (`./kit`): `UnlockForm` (stage `locked`), `UnlockDialog` (the same form in a modal `<dialog>`, mounted while `isUnlockWanted`; Cancel and Escape call `dismissUnlock`), `CreateVaultForm` (stage `unborn`: new passphrase with the strength verdict beside it, a confirmation field, submit disabled until strong and matching). Private: `form-action.ts` (`formActionOf`), `modal-dialog.tsx` (`ModalDialog`), `phrases-kit.ts` (`KitPhrases`, `refusalTextOf`), and `UsernameField` (in `unlock-form.tsx`, not in the kit's index).
  - **Tests**: `tests/parts/{whisper-input,whisper-text,passphrase-input,submit-button}.test.tsx`, `tests/kit/{unlock-form,create-vault-form}.test.tsx`, and `TH.expectTextUnheld(text, container, client?)` in `tests/test-helpers/secret-search.ts`: the rendered React tree and, given a client, its query and mutation caches.

* **How a kit form is assembled from parts** (for thread 6)
  - Props: the bank as a narrow pick, `bank: Pick<BankGiver, 'useUnlock'>`; the giver too where a hook lives on it (`giver: Pick<ReactGiver, 'useStrengthVerdict'>`). A host passes `bank={Knock}` and `giver={SOK}`.
  - Call the form hook (`const replace = bank.useReplacePassphrase()`), then `const replaceAction = formActionOf(replace, ['passphrase', 'nextPassphrase', 'confirmation'], ({ passphrase, nextPassphrase }) => ({ passphraseCleartext: passphrase, nextPassphraseCleartext: nextPassphrase }))`. **List every field that holds a secret**, used or not (the confirmation too): each is deleted from the `FormData` before anything is awaited.
  - `formActionOf` resolves `true` once the mutation succeeds, `false` once it refuses (its refusal is the mutation's `error`). Wrap it in a function declared in the component, `async function action(form) { if (! await replaceAction(form)) { fieldRef.current?.focus() } }`: the React compiler lint refuses a ref read in a callback handed to a function during render.
  - `cleartextsOf` may be async: `async ({ passphrase }) => ({ passphraseCleartext: passphrase, nextPasskeyCleartext: await createPasskey() })`. The fields are taken before it runs. What it throws rejects the action (React's error boundary), as does a `.gating` made at the wrong stage. A passkey form that wants a cancelled ceremony shown in the form should catch inside `cleartextsOf` and route it to its own alert.
  - Markup: `<form action={action}>`, a `PassphraseInput` per field (`ref` for focus, `aria-invalid` and `aria-describedby` pointing at the alert), `<div role="alert">{mutation.error !== null && refusalTextOf(mutation.error)}</div>`, `<SubmitButton whilePending=…>`. Add words to `KitPhrases`; extend `refusalTextOf` for a new condition kind (it shows `err.message` for any other condition, generic trouble for the rest).
  - A form with a new passphrase copies `CreateVaultForm`'s meter: `giver.useStrengthVerdict()`, an `isChosenTyped` boolean, a `confirmation` enumeration compared through refs, and `onReset` to forget both (React empties the fields after each action without an `onChange`).

* **Decisions made**
  - **The bank reaches a part or kit form as a prop**, not a context or a bound component (`Knock.WhisperText`): one giver may have several banks, the dream rules out a bank boundary, and a prop keeps `./parts` and `./kit` free of the giver's runtime. The dream writes `<WhisperText labelpath field />` and `<UnlockForm />` without one: see *For the Coach*.
  - **`formActionOf` is mutation-shaped** (`mutation, fieldnames, cleartextsOf`), not a bare field-taker: every kit form submits a gating, and awaiting `mutateAsync` (its rejection caught) keeps `SubmitButton` pending until the mutation settles, so a double press submits once. `mutate` with an `onSettled` promise was set aside: TanStack skips per-call callbacks once the component unmounts (the dialog does, on success), leaving the action pending for good, and React entangles later transitions with a pending async action.
  - **`CreateVaultForm` has a confirmation field.** The passphrase cannot be recovered; the old kit's `BuildForm` had one. Its text is compared in the page; React keeps only `'untyped' | 'differs' | 'matches'`.
  - **A hidden username field** (`username` prop) on both forms, so a password manager files the passphrase under the account, as the old kit did.
  - **WhisperText masks with a fixed `masked`** (default `••••••••`), not the record's sidecar, so it needs no `useBoxRecord`.
  - **No prop validators** in parts or kit: `withWhisper` checks the labelpath, and the rest are typed props a host writes once in JSX.

* **Ported** from `safebyok-react` (old, frozen): `useRevealToggle` (`hooks/reveal-toggle.tsx`), `WhisperField` → `WhisperInput`, the private `PassphraseField` → `PassphraseInput` (without its advice line), the private `SubmitButton`, `ModalDialog`'s `showWhileMounted` and Escape handling, `UsernameField`, the comparison in `useChosenPassphrase`, and the dialog words of `helpers/messages.ts`. Not ported: `useAttemptAction`, `DialogBoundary`, the lease-length footnote (`unlockedFor`).

* **Discoveries**
  - React retains the action's `FormData` (the controls' tests prove the search reaches it), and the field-deletion is what keeps the passphrase out: with `textOf`'s `form.delete` commented out, the pending-unlock and wrong-passphrase cases fail.
  - A test component that takes the secret as a prop puts it in React's tree: hand a test form an `onHeard` callback, not an array.
  - jsdom implements `getModifierState('CapsLock')` from `modifierCapsLock` in the event's init.

* **For the Coach**
  - **The bank prop.** Every part and kit form that needs the bank takes `bank={Knock}`; `CreateVaultForm` also takes `giver={SOK}` for `useStrengthVerdict`. The dream shows neither. Recommend keeping the props; the alternative is bound components on the bank giver (`Knock.UnlockForm`), which would pull the kit into the giver's entry.
  - **Words are English constants** (`KitPhrases`, `PartsPhrases`), with no way for a host to change them yet. Recommend leaving that until a host asks.

* **Looked up**: nothing in the plan or progress document; the handoff, the dream, the survey and thread 3's file were enough.
