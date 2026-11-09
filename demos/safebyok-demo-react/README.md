# safebyok-demo-react

A single-page React playground for the safebyok interface: a workspace package that is never
published and never grows into its own repository.

```sh
pnpm demo:react              # from the repo root: builds safebyok, then opens the playground
pnpm justify                 # from demos/safebyok-demo-react: lint, typecheck, test (vitest only)
```

## Encrypted for real

Whispers are encrypted on this device before anything reaches storage. The page takes the
browser's batteries, `browserOpts` from `safebyok/browser`: Argon2id to derive, zxcvbn to judge
a new passphrase, and the device's leases in this browser's IndexedDB. The vault's rows live in
IndexedDB too, in a database of their own (through `safebyok-indexeddb`), standing in for the
ciphertext a backend would have. Only the fake auth's scaffolding rows sit in localStorage; the
`device_id` each user's bank is made with is kept beside the leases, as the provider asks the
deviceDB for it.

## The page

The Knock-Knock Machine: bring an Anthropic API key, say who's there, and Claude finishes the
joke. Its header has the sign-in strip
([src/components/SessionBar.tsx](src/components/SessionBar.tsx)) and, once signed in, the
account menu ([src/components/AccountMenu.tsx](src/components/AccountMenu.tsx)): the vault's
lock control, *Sign out*, which locks the user's vaults on this device, and *Delete account*,
which deletes the vault through the provider's dialog (the passphrase it asks for is the
confirmation), then the account. Under it,
[src/components/WaysIn.tsx](src/components/WaysIn.tsx) lists the vault's passphrase and passkey,
with *Change passphrase*, and a fingerprint button to add or remove a passkey. A dialog the user
cancels changes nothing, and the page says nothing of it.

Below the header sit the flows, side by side, each keeping a key of its own in its own box, so the
ways compare side by side, and each knocking with its own key through [src/lib/anthropic.ts](src/lib/anthropic.ts):

* **With managed fields** ([src/components/KnockKnockFields.tsx](src/components/KnockKnockFields.tsx)):
  the key sits in a field that `safebyok/dom` fills and saves, so it never passes through React.
  *Add key* builds and unlocks the vault as needed and shows the field; *Save* puts it; *Done*
  hides it again.
* **With an exposed whisper** ([src/components/KnockKnockExposed.tsx](src/components/KnockKnockExposed.tsx)):
  an ordinary controlled field over `useWhisper(box)`; typing is `box.patchWhisper`, *Save* is
  `box.putExposed`, and leaving the page is `box.unexpose`.
* **With a sealed key** ([src/components/KnockKnockSealed.tsx](src/components/KnockKnockSealed.tsx)):
  the key is never exposed. An uncontrolled `WhisperField` takes it, *Save* is `vault.putBox`
  (building and unlocking the vault as needed) and clears the field, and only a knock reads it
  back, with `box.extractWhisper`.

The aside, *Behind the scenes*, is for developers: its *Backend online* switch
([src/lib/outage-vault-db.ts](src/lib/outage-vault-db.ts)) takes the vaultDB offline, so every
verb refuses as an unreachable backend does. Take the aside away and what is left could ship.

## Where the layers live

| Layer | Where |
|---|---|
| the library | the `safebyok` workspace package (`packages/safebyok/src/`) |
| React plumbing | the `safebyok-react` workspace package (provider, hooks, controls, the dialogs) |
| app scaffolding a host replaces | [src/lib/auth.ts](src/lib/auth.ts) (fake sign-in over localStorage; a real app brings its own auth and passes `user_id` to the provider), [src/lib/storage.ts](src/lib/storage.ts) (the bank's options: this browser's IndexedDB standing in for a backend) |
| developer tools | [src/lib/outage-vault-db.ts](src/lib/outage-vault-db.ts), [src/components/OutageSwitch.tsx](src/components/OutageSwitch.tsx) |
| the app itself | [src/components/](src/components/), [src/lib/anthropic.ts](src/lib/anthropic.ts) |

Tests live in `tests/`, mirroring `src/`. The machinery's (auth scaffold, the Anthropic request
shape via an injected fetch) run under node; each
component's renders it under jsdom, inside a BankProvider over databases in memory, and works it as
a user would (`tests/test-helpers.tsx`). The vault and provider are tested in their own packages.
