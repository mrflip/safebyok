# Thread 7: demo_knockknock (2026-11-21)

Branch `20261121-demo_knockknock`, PR #803, stacked on #801. Proved: `safebyok-demo-knockknock` lint, typecheck, test (4 files, 25: the app's integration test 8, `local-vault-db` 4, `session` 9, `anthropic` 4), `vite build`; `safebyok-react-lean` lint, typecheck, test (12 files, 189) and build (attw, publint). `pnpm demo:knockknock` serves the page; nobody has clicked through it in a real browser yet.

* **Built**
  * **`Knock.usePasskeyHeader()`** (`packages/safebyok-react-lean/src/giver/react-giver.tsx`): the bank's passkey header, or null. A marked cheat: the bank's snapshot carries no gate, so it reads `slot.device?.bank?.maingate.passkey0` during render, and re-renders on each change of stage (`useBank`) and each successful form mutation under `['sok', banklabel]` (`useMutationState`); the header is memoized on the `Wayin`, so it is the same object until the passkey changes. Tests: `describe("usePasskeyHeader")` in `react-giver.test.tsx` (4).
  * **`safebyok-react-lean/testing`**, a new entry (`tests/testing.ts`), built as the core's `safebyok/testing` is: `expectTextUnheld`, `holdsText`, `reactTreeOf`, `installFakeAuthenticator`. vitest is its optional peer. The demo's tests use it, so the secret search and the fake authenticator are ported, not copied.
  * **`demos/safebyok-demo-knockknock`**: `eslint.config.mjs`, the three tsconfigs, `index.html`, `tests/setup.ts` and `vite.config.ts` copied with `cp` from the old demo (vite: one page, not two, plus a chunk-size limit for zxcvbn); `build` script, `pnpm demo:knockknock` at the root.
    * `src/lib/sok.ts`: `SOK = reactGiver({ banks: { knock: { vaultDB: new LocalStorageVaultDB() } }, keyDeriver: argon2idWebV1Deriver, strengthChecker: zxcvbnStrengthChecker })`, `Knock`, `KeyLabelpath = 'anthropic'`, the `queryClient`.
    * `src/lib/local-vault-db.ts`: `LocalStorageVaultDB extends MemoryVaultDB`, loading every saved bank when made and saving the written bank after `doWriteThing` and `doBirthBank`. A mangled entry reads as no bank.
    * `src/lib/session.ts` + `src/hooks/useSession.ts`: the fake sign-in (username → a stable random userid, session in localStorage); `signOut` removes the session and reloads the page.
    * `src/components/`: `App` (QueryClientProvider, `SOK.Provider userid`), `SessionBar`, `KnockKnock` (the stage switch; `UnlockDialog` at every stage), `KnockForm` (`useMutation` over `withWhisper`; a `dismissed` refusal is quiet), `KeyPanel` (the mask from the sidecar, `WhisperText` Show, `putBoxAction` under `useActionState` with `WhisperInput`, Delete via `useMutation` over `delBox`), `WaysIn` (`ReplacePassphraseForm`, then `AddPasskeyForm` or `RevokePasskeyForm` by `usePasskeyHeader`).
    * `src/lib/anthropic.ts` and its test, ported from the old demo (arrow consts made function declarations).
  * **The integration test** (`tests/components/App.test.tsx`) drives the real app, giver and core over the app's own localStorage vaultDB, with `safebyok/browser` mocked so `argon2idWebV1Deriver` is the core's test deriver, the real zxcvbn, and the old demo's `fakeAnthropic` as the global `fetch`. A reload is `vi.resetModules()` and a fresh import of the app (a fresh giver over what localStorage kept). Cases: new user → vault → key → knock → joke; reload lands locked → knock → dialog → unlock → joke; cancel the dialog; lock and unlock; wrong passphrase; Show and Delete; replace the passphrase and unlock with the new one after a reload; add a passkey, unlock with it, revoke it. Each searches the rendered tree and both QueryClient caches (action state is in the tree) for both passphrases and the key.

* **Cheats** (`// Cheat (react_life): …`)
  * `usePasskeyHeader` reads the gate during render (above).
  * `LocalStorageVaultDB` reaches the memory vaultDB's Things through `_cheat_things`; another tab's writes are not heard, and the last tab to write wins.

* **Decisions made**
  * **Locked and unlocked render one component, `Opened`**, with the knock form and the key panel at the same place in the tree. Rendering a different component per stage unmounted the knock form when the dialog unlocked the bank, and the joke landed in a mutation nobody observed (the first version of the reload test caught it). A host following the dream's `switch (bank.stage)` literally meets this; worth a line in the dream or the kit's docs.
  * **At `locked` the page shows the unlock form inline, the knock form and the key's mask with Show**; the key editor, Delete and the ways in show only while unlocked (writes refuse `bank_locked`, and the ways-in forms are for a user already in).
  * **The demo's own vaultDB is a subclass**, not a wrapper: overriding the two protected write methods is where a save belongs, and a wrapper would have to forward every verb.
  * **A testing entry over copies**: CLAUDE.md says port, never reimplement; two files the demo needs were in the lean package's tests.

* **For envman (thread 10): what to copy**
  * `cp` from this package: `eslint.config.mjs`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html` (title), `tests/setup.ts`, `package.json` (name, description, and `--filter 'safebyok-demo-envman^...'` in `build:deps`; drop `@anthropic-ai/sdk`), `src/main.tsx`, `src/lib/local-vault-db.ts`, `src/lib/session.ts`, `src/hooks/useSession.ts`, `src/lib/form-text.ts`, `src/components/SessionBar.tsx`, `App.tsx` (the shell), and the `loadPage`/`signIn`/`createVault` helpers at the top of `App.test.tsx`. Change `SavedPrefix` and the session keys' `knockknock:` prefix so the two demos do not share a vault on one origin. Add a `demo:envman` line beside `demo:knockknock` in the root `package.json`.

* **Discoveries**
  * **`safebyok-react-lean` resolves through its built `dist/`** in the demo (vite and vitest), so `pnpm build:deps` must run after a change to it; `pretest` and `prebuild` do it.
  * **zxcvbn runs fine under jsdom** and judges the test passphrases quickly; no stub needed.
  * `vi.resetModules()` reloads the workspace packages (inlined) but not React or React Query (externalized), which is what a page reload test wants.
  * Device.make warns about the test deriver; the integration test silences `console.warn`.

* **For the Coach**
  * **Stage switch unmounts state**: should the dream note that the locked and unlocked screens share their components, so a knock waiting on the dialog keeps its result? Recommend a sentence in the dream's stage switch.
  * **`safebyok-react-lean/testing`**: a new entry, private like the package. Recommend keeping it; `safebyok-react` had none, and a host testing its own components wants `expectTextUnheld`.
  * **Hand run**: the page serves, but I could not drive a browser here (no Playwright). The flows are proven only under jsdom; recommend a click-through before the demo is shown.

* **Looked up**: nothing in the plan or progress documents; the handoff, the dream, `survey-app.md` sections 1, 3, 4 and thread 6's file were enough.
