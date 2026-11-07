# safebyok-demo-react

A single-page React playground for the safebyok interface: a workspace package that is never
published and never grows into its own repository.

```sh
pnpm demo:react              # from the repo root: builds safebyok, then opens the playground
pnpm justify                 # from demos/safebyok-demo-react: lint, typecheck, test (vitest only)
```

## Encrypted for real

Whispers are encrypted on this device before anything reaches storage. The vault's rows live in
this browser's IndexedDB (through `safebyok-indexeddb`), standing in for the ciphertext a backend
would hold; the device's leases live in memory, so a reload locks the vault again. Only the fake
auth's scaffolding rows, and this browser's `device_id`, sit in localStorage.

## The page

For now the page is parked while the React package moves onto the new core: a sign-in strip
([src/components/SessionBar.tsx](src/components/SessionBar.tsx)) over a `BankProvider`, which
makes the signed-in user's bank and says hello. Signing out locks the user's vaults on this
device. *Delete account* deletes the vault through the provider's dialog, which asks for its
passphrase, then the account; a vault never built has nothing to delete. Under the strip,
[src/components/WaysIn.tsx](src/components/WaysIn.tsx) shows the vault's passphrase, and its
passkey if it has one, with *Change passphrase*, which asks for the passphrase in use and a new
one. A dialog the user cancels changes nothing, and the page says nothing of it. The app proper
-- the boxes, the account menu, the Knock-Knock Machine over
[src/lib/anthropic.ts](src/lib/anthropic.ts) -- comes back as the package grows the hooks it needs.

## Where the layers live

| Layer | Where |
|---|---|
| the library | the `safebyok` workspace package (`packages/safebyok/src/`) |
| React plumbing | the `safebyok-react` workspace package (provider, hooks, the dialogs) |
| app scaffolding a host replaces | [src/lib/auth.ts](src/lib/auth.ts) (fake sign-in; a real app brings its own auth and passes `user_id` to the provider), [src/lib/stores.ts](src/lib/stores.ts) (this browser's IndexedDB standing in for a backend, and a strength checker that only counts characters) |
| the app itself | [src/components/](src/components/), [src/lib/anthropic.ts](src/lib/anthropic.ts) |

Tests live in `tests/`, mirroring `src/`. The machinery's (auth scaffold, the Anthropic request
shape via an injected fetch) run under node; each
component's renders it under jsdom, inside a BankProvider over stores in memory, and works it as
a user would (`tests/test-helpers.tsx`). The vault and provider are tested in their own packages.
