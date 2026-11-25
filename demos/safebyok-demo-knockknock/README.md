# safebyok-demo-knockknock

The Knock-Knock Machine on the new core (`safebyok`) and its React layer (`safebyok-react-lean`). Never published.

You sign in with any username (there is no password), create a vault with a passphrase, and save an Anthropic API key
in it. Type who's there, and Claude finishes the joke: the key goes from the vault straight to Anthropic's API, from your
browser, and never reaches React state, the QueryClient, or a server of ours.

```sh
pnpm demo:knockknock      # from the repo root: builds what the demo needs, then starts Vite
```

## What it shows

* `src/lib/sok.ts`: the giver and its bank, made once at module scope.
* `src/components/App.tsx`: `<SOK.Provider userid>` inside the host's `QueryClientProvider`.
* `src/components/KnockKnock.tsx`: the page switched on `Knock.useWorld().stage`, the kit's `CreateVaultForm`,
  `UnlockForm`, `PasskeyUnlockButton` and `UnlockDialog`, each finding its bank, and the button its passkey, through the provider.
* `src/components/KnockForm.tsx`: a `useMutation` over `Knock.withWhisper`; on a locked vault the unlock dialog asks.
* `src/components/KeyPanel.tsx`: `Knock.putBoxAction` under `useActionState` with the parts' `WhisperInput`, the
  key's mask in its sidecar from `mask` (`tail: 0`), `WhisperText` to show it, and `Knock.delBoxOnce`. The mask shown
  is the parts' `WhisperMask`, written into the page: the key's last four characters (`tail: 4`) while unlocked, the
  stored mask while locked.
* `src/components/WaysIn.tsx`: `ReplacePassphraseForm`, and `AddPasskeyForm` or `RevokePasskeyForm` by the main
  gate's `wayins.passkey0`, from `Knock.useGate()`.

## Demo scaffolding

* **The vault lives in localStorage** (`src/lib/local-vault-db.ts`): the new core has only a memory vaultDB, so the
  demo saves it after each write. A real host stores its vault on its backend.
* **Signing in is fake** (`src/lib/session.ts`). Signing out reloads the page: the giver serves one user for the
  page's life.
* **A reload lands locked**: nothing keeps the lease across a reload yet.
