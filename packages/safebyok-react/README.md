# safebyok-react

React binding for safebyok: the giver, whose hooks read a bank's records through your own TanStack Query
client; `parts`, one form field each; and `kit`, ready-made forms built from the parts over the hooks.

It replaces the React binding built on safebyok-big, now the private `safebyok-react-big`. A full guide is coming;
until then, [the React overview](../../docs/react-overview.md) sketches the target interface.

## Install

```sh
pnpm add safebyok safebyok-react @tanstack/react-query use-effect-event
```

`safebyok`, `react`, `react-dom`, `@tanstack/react-query` and `use-effect-event` are peer dependencies, so the binding
and your app share one copy of each.

## Entry points

* **`safebyok-react`** -- `reactGiver(config)`, made once at module scope, and its hooks.
* **`safebyok-react/parts`** -- `PassphraseInput`, `WhisperInput`, `WhisperText`, `WhisperMask`, `SubmitButton`.
* **`safebyok-react/kit`** -- `CreateVaultForm`, `UnlockForm`, `UnlockDialog` and the other forms.
* **`safebyok-react/testing`** -- for your own tests: a search for a secret in what React and the QueryClient keep,
  and a fake WebAuthn authenticator.
