# safebyok-demo-react

A single-page React playground for the safebyok interface: a workspace package that is never
published and never grows into its own repository.

```sh
pnpm demo:react              # from the repo root: builds safebyok, then opens the playground
pnpm justify                 # from demos/safebyok-demo-react: lint, typecheck, test (vitest only)
```

## Encrypted for real

Whispers are encrypted on this device before anything reaches storage: the inspection panels show
the ciphertext rows a backend would hold, and the lease around a key handle the browser will
not export. The vault's records live in IndexedDB (through `safebyok-indexeddb`, and the
lease through `safebyok/idb`); only the fake auth's scaffolding rows sit in
localStorage.

## The page

* **The Knock-Knock Machine** ([src/components/KnockKnock.tsx](src/components/KnockKnock.tsx)) --
  the "app". Save your Anthropic API key once (it goes into the vault as the box
  `anthropic_api_key`), type who's there, and hit *(( … Who? ))*: the key is decrypted on-device
  inside `vault.useWhisper(...)` and sent browser-to-Anthropic (Claude Haiku, the cheapest model) for a
  punchline. No server of ours ever sees the key.
* **Vault dashboard** ([src/components/VaultDashboard.tsx](src/components/VaultDashboard.tsx)) --
  direct manipulation of the vault: add, view, edit, remove and *use* boxes. Whisper-touching
  actions summon the passphrase dialog only when the vault is actually locked; an unlock grants
  the device a lease of seven days. Signing out locks the vault.
* **Ways in** ([src/components/WaysIn.tsx](src/components/WaysIn.tsx)) -- the vault's one
  passphrase and its passkey, if it has one, shown even while locked, and buttons to change them.
  Each calls one vault method, and the provider's dialog for that change asks for your passphrase
  as proof: "Change passphrase" (`vault.putWayin('passphrase')`: the current passphrase and the
  next, which removes the fingerprint: add it again under the new passphrase); "Add fingerprint",
  or "Replace fingerprint" once there is one (`vault.putWayin('passkey')`: your passphrase, then
  the browser makes the passkey, which takes the place of any the vault had, the passphrase
  dialog then offering "Use a passkey"); and "Remove fingerprint" (`vault.delWayin('passkey')`).
  A passkey needs a browser and authenticator with the WebAuthn PRF extension. *Delete account*,
  in the sign-in strip, deletes the vault through its own dialog (`vault.del()`), proven by the
  passphrase likewise.
* **Inspection panels** ([src/components/inspection/](src/components/inspection/)) -- the raw
  rows of the pretend-backend store and the device-local store, rendered straight from storage by
  machinery that never talks to the vault. The backend's panel has an outage switch
  ([src/lib/outage.ts](src/lib/outage.ts)): take the pretend backend down, sign out and back in,
  and the dashboard says "Can't reach your vault" in place, with a Retry button -- the refusal
  `safebyok-react`'s `useVault('main')` hands an app in the bank's entry, and the ask again
  through `useBank()`. **To delete them:** remove the two tagged lines (and
  imports) in [src/App.tsx](src/App.tsx), then delete `src/components/inspection/`. What remains
  is the app as a host would actually build it.

## Where the layers live

| Layer | Where |
|---|---|
| the library | the `safebyok` workspace package (`packages/safebyok/src/`) |
| React plumbing | the `safebyok-react` workspace package (provider, hooks, the dialog for each change) |
| app scaffolding a host replaces | [src/lib/auth.ts](src/lib/auth.ts) (fake sign-in; a real app brings its own auth and passes `userId` to the provider), [src/lib/stores.ts](src/lib/stores.ts) (this browser's IndexedDB standing in for a backend) |
| the app itself | [src/components/](src/components/), [src/lib/anthropic.ts](src/lib/anthropic.ts) |

Tests live in `tests/`, mirroring `src/`. The machinery's (auth scaffold, whisper text handling,
the outage switch, the Anthropic request shape via an injected fetch) run under node; each
component's renders it under jsdom, inside a BankProvider over stores in memory, and works it as
a user would (`tests/test-helpers.tsx`). The vault and provider are tested in their own packages.
