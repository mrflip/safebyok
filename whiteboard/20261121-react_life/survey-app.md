## Survey report: Knock-Knock demo, safebyok-react, the new giver (read-only; no subagents spawned)

Both checkouts (/workspace/byok and /workspace/byok-react_life) are at 56e56b094 and hold an identical dream_interface.md. In /workspace/byok it is untracked.

### 1. The existing Knock-Knock app

The app is the "Knock-Knock Machine" in `demos/safebyok-demo-react`. It is **not** a box-of-jokes app. The user stores one Anthropic API key, types a "who's there", and Claude finishes the joke (`src/lib/anthropic.ts:24` `tellKnockKnockJoke`). There is no joke list, and no add/edit/delete of jokes. The only add/edit/delete is of the key. `e2e/` never mentions the demo (rg: no hits), and `whiteboard/20261116-react_backwards/app-side.md` is a *proposal* for the future API (it names the demo only as "today" in comparison tables), not a description of the app.

| Feature | File(s) | Old-core API |
|---|---|---|
| Fake sign-in, user switching: type a username, no password, account and session in localStorage | `src/components/SessionBar.tsx:11`, `src/lib/auth.ts:37` `createAuth`, `src/hooks/useSession.ts` | none; `user_id` goes to `BankProvider` (`DemoShell.tsx:26`) |
| Shell, provider, header | `src/components/DemoShell.tsx` | `BankProvider {...bankOpts} user_id` |
| Create vault: the first-time user is shown the provider's passphrase dialog, plus a `CreateVaultButton` when `stage==='absent'` | `AccountMenu.tsx:41` | `useVault('main')`, `CreateVaultButton`, `Device.ensureBank` |
| Unlock (passphrase, passkey) and the strength meter | No demo code. The provider's `GatingModal` and `PassphraseModal` draw them (`safebyok-react/src/modals/passphrase-modal.tsx`, `modal-kit.tsx:214 useChosenPassphrase`) | `gating.judgeStrength`, `gating.attempt`, `PasskeyUnlockButton` |
| Lock | `AccountMenu.tsx:40` | `BankLockControl` |
| Sign out | `AccountMenu.tsx:15` | `device.vacate()` |
| Delete account | `AccountMenu.tsx:20` | `bank.tryDelPrompt()` |
| Change passphrase, add/remove passkey | `src/components/WaysIn.tsx:42-48` | `bank.gateListing.at`, `bank.maingate.tryReplacePassphrasePrompt / tryAddPasskeyPrompt / tryRevokePasskeyPrompt`, `passkeysAvailable` |
| Save key (widget flow) | `KnockKnockWidget.tsx:21-40`, uncontrolled `WhisperField` | `device.ensureBank`, `bank.ensureUnlocked`, `bank.ensureVault`, `vault.putBox({boxlabel, whisper}, {ifAbsent:'add', ifPresent:'repl'})` |
| Reveal/mask | `safebyok-react/src/components/whisper-field.tsx` + `hooks/reveal-toggle.tsx` (Show/Hide) | `WhisperFieldAttributes` |
| Toolkit flow (controlled field) | `KnockKnockToolkit.tsx` | `useWhisper`, `box.patchWhisper / putExposed / unexpose` |
| DOM flow | `KnockKnockDom.tsx` | `BoxFields` from `safebyok-big/dom`, `BoxWhisperField`, `box.expose` |
| Knock form and joke | `KnockForm.tsx:13` | `vault.getBox`, `stored.extractWhisper()` (`lib/api-key.ts:18`) |
| Error panels | per-component `gripe` state, `lib/refusals.ts:4` (`isVaultError(err,'dismissed')` is quiet), `TroubleBoundary.tsx:12` | `isVaultError` |
| Devmode, labs page only | `LabsPage.tsx:15-18`, `OutageSwitch.tsx`, `lib/outage-bank-db.ts` (extends `IdbBankDB`) | `DevBoxInspector`, `DevDeviceDBInspector` from `safebyok-react/devmode` |

There are two pages: `index.html` shows the widget flow only, and `labs.html` shows all three flows plus the dev aside (`vite.config.ts:11` has two inputs).

The new-core "knock-knock" so far is a test only. `packages/safebyok-react/tests/giver/knock-knock.test.tsx` (5 tests, all passing) has a locked bank and a `useMutation` calling `vault.withWhisper(JokesPath, …)`. A `<dialog>` appears while `isUnlockWanted` is true, its form action runs `unlock.mutate(await unlock.gating({passphraseCleartext}))`, and a Cancel button calls `Acme.dismissUnlock()`. The fixture is `tests/test-helpers/knock-knock-world.ts:55` `buildKnockKnockWorld`, with `_cheat_giverDeviceOf` at :72.

### 2. `packages/safebyok-react/src` today

Everything below imports `safebyok-big` except `src/giver/*`, which imports `safebyok`. `src/index.ts` exports **nothing** from `giver/`. There are no parts or kit directories.

| Dir | Files |
|---|---|
| components | `whisper-field.tsx` (masked uncontrolled input with Show/Hide), `box-whisper-field.tsx` (DOM-bound field of a big `Box`), `bank-controls.tsx` (`BankLockControl`, `CreateVaultButton`), `passkey-unlock-button.tsx` |
| hooks | `hooks.ts` (`useDevice`, `useBank`, `useVault`, `useBox`, `useBoxes`, `useWhisper`, ...), `reveal-toggle.tsx` |
| modals | `modal-kit.tsx` (private `SubmitButton`:90, `PassphraseField`, `useChosenPassphrase`, `ModalForm`), `passphrase-modal.tsx`, `replace-passphrase-modal.tsx`, `add-passkey-modal.tsx`, `revoke-passkey-modal.tsx`, `del-bank-modal.tsx`, `del-vault-modal.tsx` |
| provider | `bank-provider.tsx` (`BankProvider`), `gating-modal.tsx`, `boundary.tsx`, `provider-hooks.ts` |
| devmode | `dev-box-inspector.tsx`, `dev-device-db-inspector.tsx`, `last-call.tsx`, `index.ts` |
| helpers | `passkey.ts`, `messages.ts` (English `Messages`), `attempt-refusals.ts` |
| giver | `react-giver.ts`, `react-bridge.ts`, `minder-bank.ts`, `shapes-giver.ts` |
| root | `shapes.ts` (prop types, checkers), `index.ts` |

Mapping to the dream:
- `WhisperInput` and `WhisperText`: the nearest are `WhisperField` (the closest seed) and `BoxWhisperField`. Neither is the dream's part.
- `PassphraseInput`: the private `PassphraseField` in `modal-kit.tsx`, not exported.
- `SubmitButton`: the private one at `modal-kit.tsx:90`, with Messages words; it does not use `useFormStatus`.
- Unlock form: `UnlockForm` in `passphrase-modal.tsx:100`. Create-vault form: `BuildForm` at :72, with the strength meter in `useChosenPassphrase`.
- Other kit candidates: `ReplacePassphraseModal`, `AddPasskeyModal`, `RevokePasskeyModal`, `BankLockControl`, and the demo's `WaysIn`.
- All of these are `<dialog>` modals driven by an old `Gating` (`gating.attempt({passphraseClear})`), not by the new form mutations.

### 3. Demo package set-up

- `demos/safebyok-demo-react/package.json`: `"private": true`, version 0.0.0. Scripts are `dev` (vite), `lint`, `typecheck` (`tsc -b`), `test` (`vitest run`, with `pretest` running `build:deps`), and `justify`. There is no `build` script, so the root `pnpm build` skips it. Dependencies are `react 19`, `@anthropic-ai/sdk`, `safebyok-big`, `safebyok-indexeddb` and `safebyok-react` (all `workspace:*`). The dev dependencies include the full eslint stack, `@testing-library/react`, jsdom, `fake-indexeddb`, vite 8, `@vitejs/plugin-react` and vitest 5. It has no `@tanstack/react-query`.
- Tooling: Vite plus the react plugin. The one `vite.config.ts` serves both dev and vitest, with node as the default test environment and `// @vitest-environment jsdom` in each component test (13 files). There are 99 tests in 17 files, and `tests/setup.ts` stubs `HTMLDialogElement.showModal`. tsconfig is split into `tsconfig.app.json` (`src` and `tests`, jsx react-jsx, DOM lib) and `tsconfig.node.json`, both extending `tsconfig.base.json`.
- `pnpm-workspace.yaml` globs `packages/*`, `demos/*`, `e2e`, so a new demo directory is picked up with no edit. `pnpm justify` (root `package.json`) runs `pnpm lint`, `typecheck` and `test` over `pnpm -r`, so the new package is covered with no CI edit (`ci.yml:34` says so). Root `test` runs `pnpm build` first.
- `pnpm demo:react` is a root script naming the old demo, so a knockknock demo wants its own such script.
- Needed for `demos/safebyok-demo-knockknock`:
  - `package.json` with `"private": true`, version 0.0.0.
  - Its own `eslint.config.mjs` (the demo's is a 498-line copy of big's with React rules).
  - `tsconfig.json`, `tsconfig.app.json` and `tsconfig.node.json`.
  - A `vite.config.ts`, a `README` and a `tests/setup.ts`.
  - A changeset: private packages are never released (`scripts/release.ts:120` `NeverReleasedDirs`), `scripts/changeset.ts` refuses `--package` for a non-public one, and a PR changing no public package carries `pnpm changeset --empty` (PROCESS.md *Releases*). Under `demos/`, `release check` fails the build if the package is not `private`.
  - Not in the `fixed` group, which only holds public packages.
- Dependency rule: the new `safebyok` is private at 0.0.0, so a published package may take it only as a devDependency. This is why `safebyok-react/package.json` lists `safebyok` under devDependencies. A private demo may depend on it directly. Dependencies are subject to the 7-day `minimumReleaseAge`. PROCESS.md *Dependencies* says runtime dependencies are proposed in chat first, and plainly-boring dev dependencies may simply be installed.

### 4. What vaultDB a demo can use with the new core

- **Memory only.** `MemoryVaultDB` (`packages/safebyok/src/storage/memory-vault-db.ts:16`, exported from `safebyok/storage` and the root) is volatile. The other `AdapterVaultDB` subclass is `PostgresVaultDB`. **No IndexedDB VaultDB exists**: `safebyok-indexeddb` has only `IdbBankDB` (old BankDB), and `safebyok-convex` and `safebyok-graphql` have no VaultDB either. A new-core browser demo therefore cannot persist across reloads.
- `safebyok/browser` (`src/browser.ts:9`) re-exports `argon2idWebV1Deriver`, `zxcvbnStrengthChecker` and `IdbDeviceDB`, plus `browserOpts()`. `Device.make` **ignores the deviceDB** (`shapes-bankish.ts:100`), so leases are not cached.
- Test or fast deriver: `testDeriver`, `anyStrengthChecker` and `quietLogger` live in `safebyok-big/tests/test-helpers/builders.ts` and are re-exported via `safebyok/testing` (`tests/test-helpers.ts:9`). That entry pulls in vitest (`models-world.ts:10` imports `vi`), so it fits tests but not a browser bundle. A demo wanting a fast deriver in the browser would need to write its own `KeyDeriver`. `Device.make` warns when it sees the test deriver (`device.ts:103`). `safebyok-fastkey` is a WASM Argon2id and only ports big.

### 5. Dream names against the giver

Giver file is `packages/safebyok-react/src/giver/react-giver.ts`, abbreviated RG below.

| Dream name | Status |
|---|---|
| `SOK.Provider`, `useSignIn`, `reactGiver(device,{queryClient})`, `SOK.useQueryOptions`, `sok.acme.box`, typed `whispers` | absent everywhere. The giver is `makeReactGiver(device)` (RG:119); `useBridge` (RG:129) takes the QueryClient from context, and `forBank` (RG:165) stands in for `SOK.bank`. |
| `Acme.useBank` | giver has `useBankSnapshot` (RG:182, with selector), flat `stage`, `isLocked`, `isUnlockWanted`, `leaseEndsAt`. `isWatching` and `heardAt` are absent. |
| `useBox`, `boxQuery` | giver has `useBoxRecord` (RG:218) and `boxRecordQueryOptions` (RG:196). `data` is null for a tombstone via `shownRecordOf` (RG:54), which stands in for `nullifyThing` (absent). The keys are `boxRecordQueryKey` and `bankQueryKey` (RG:331, 336), exported from RG but not on `Acme`. There is no `Acme.keys.under`. |
| `useSuspenseBox`, `useSuspenseQuery` | absent. |
| `useBoxList`, `useBoxes` | core has `ThingMinder.list` (thing-minder.ts:257), `listingAt` (:183) and `listQueryKey` (:480). Not surfaced: the giver drops list events (`minder-bank.ts:137`). |
| `withWhisper` (Acme or SOK) | core has `Vault.withWhisper` (vault.ts:136, with `'box/'`-prefixed labelpaths). Not surfaced in React. |
| `whisperQuery` | absent. |
| `WhisperText`, `WhisperInput`, `PassphraseInput`, `SubmitButton`, parts, kit | absent. See section 2 for the old near-equivalents. |
| `useUnlock`, `useBirth`, `useReplacePassphrase`, `useAddPasskey`, `useRevokePasskey` | all exist (RG:237, 259, 273, 295, 309). `.gating` is **async**, returns `Promise<Gating>`, and its call is awaited in the doc example. |
| `unlock.formAction` | absent (Proposed only). |
| `useStrengthVerdict` | exists, on the giver (RG:143) rather than `SOK`. |
| `dismissUnlock` | exists (RG:314). |
| `lock` | `Bank.lock()` (bank.ts:359) and `Device.lock()` exist. The giver does not surface it. |
| `putBoxAction`, `putBox` (revisor), `putBoxOnce` (labelpath or scoped record), `delBox`, `useDraft` | absent in the giver. The core has only `Vault.putBoxOnce(cited, patch, secrets)` (vault.ts:86) and `delBoxOnce` (:103). The revisor `putBox` is absent. The dream's `putBoxOnce(lp,{sidecar},{whisper})` shape does match the core's. |

### Surprising or contradictory

1. The dream's `Device.make({banks:{acme:{vaultDB}}, keyDeriver})`, `device.vacate()` and `device.hello()` do not match the core. The core has `Device.make(record, opts)` with **one bank scope per device**, and **no `ensureBank`, `onBankStart`, `hello` or `vacate`** on `Device` (`rg` finds none in `safebyok/src`). `hello()` exists only on `ThingMinder`. The giver demands `GiverDevice` with `ensureBank` and `onBankStart`, so today only test helpers implement it, via `_cheat_giverDeviceOf`. The design file (react_life-design.md "Found in the code") says the same.
2. A real new-core demo needs a Device that can hand over a started bank. The core must grow that or the demo must cheat, as the test world does.
3. The giver is unexported. It is not in `index.ts`, the tsdown entries or the `exports` map, so `safebyok-react` offers a demo no import path. `shapes-giver.ts:4` carries an eslint-disable saying so.
4. A published `safebyok-react` that bundles the giver would depend on `safebyok`, which is only a devDependency, against the memory rule. This must be settled when the giver is exported.
5. The design says drop `swept`, `vacated` and `deleted`, but the core's `bankStageVals` still has `'swept'` (`shapes-bankish.ts:105`). The dream's `deleted` and `vacated` are already gone from the core.
6. `@tanstack/react-query` is only an optional peer of `safebyok-react`, though the giver imports it unconditionally.
7. The old demo's `lib/storage.ts` ties persistence to `IdbBankDB`. Nothing replaces it for the new core.
8. `app-side.md` is a stale proposal (`SafebyokProvider`, `useBank()` returning `[snap, bank]`, `useWhisperDraft`). It differs from the newer dream and the design in names and shape.
9. In the dream, `unlock.gating(...)` is called synchronously. In the giver it returns a Promise.
10. `pnpm justify` in the old demo has no build step, so a demo that needs `vite build` to be checked would need a `build` script added.
