# safebyok-demo-react

A two-page React playground for the safebyok interface: a workspace package that is never
published and never grows into its own repository.

```sh
pnpm demo:react              # from the repo root: builds safebyok, then opens the playground
pnpm justify                 # from demos/safebyok-demo-react: lint, typecheck, test (vitest only)
```

## Encrypted for real

Whispers are encrypted on this device before anything reaches storage. The page uses the
browser defaults, `browserOpts` from `safebyok/browser`: Argon2id to derive keys, zxcvbn to check a
new passphrase's strength, and the device's leases in this browser's IndexedDB. The vault's rows
are in IndexedDB too, in their own database (through `safebyok-indexeddb`), which stands in for a
backend. Only the fake sign-in's rows are in localStorage. The `device_tok` each user's bank records
is kept with the leases, because the device asks the deviceDB for it.

## The pages

The landing page ([index.html](index.html), [src/pages/LandingPage.tsx](src/pages/LandingPage.tsx)) is the app with the DOM flow and no control panels. The labs page ([labs.html](labs.html), [src/pages/LabsPage.tsx](src/pages/LabsPage.tsx)) has all three flows, with the control panels below them.

The Knock-Knock Machine: bring an Anthropic API key, say who's there, and Claude finishes the
joke. Its header has the sign-in strip
([src/components/SessionBar.tsx](src/components/SessionBar.tsx)); a user signing in for the first
time is asked to choose a passphrase, which builds the bank that holds the vault. Once signed in, the
account menu ([src/components/AccountMenu.tsx](src/components/AccountMenu.tsx)): the bank's
lock control, *Sign out*, which vacates the device (the bank locks, and this device forgets its
unlock), and *Delete account*, which asks for the passphrase in the provider's dialog, deletes the
bank with every vault in it, then the account. A user who cancelled the bank's dialog at sign-in
is asked again by the first *Save* or *Add key*. Under it,
[src/components/WaysIn.tsx](src/components/WaysIn.tsx) lists the bank's passphrase and passkey,
with *Change passphrase*, and a fingerprint button to add or remove a passkey. A dialog the user
cancels changes nothing, and the page says nothing of it.

On the labs page the three flows sit side by side, for comparison. Each keeps its own key in its
own box, and knocks with that key through [src/lib/anthropic.ts](src/lib/anthropic.ts):

* **Widget form** ([src/components/KnockKnockWidget.tsx](src/components/KnockKnockWidget.tsx)):
  the key is never exposed. The user types it into an uncontrolled `WhisperField`. *Save* calls
  `vault.putBox`, building and unlocking the vault as needed, and clears the field. Only a knock
  gets the key back, with `box.extractWhisper`.
* **Toolkit form** ([src/components/KnockKnockToolkit.tsx](src/components/KnockKnockToolkit.tsx)):
  an ordinary controlled field over `useWhisper(box)`. Typing calls `box.patchWhisper`, *Save*
  calls `box.putExposed`, and leaving the page calls `box.unexpose`.
* **DOM form** ([src/components/KnockKnockDom.tsx](src/components/KnockKnockDom.tsx)):
  the key is in a field that `safebyok/dom` fills and puts, so it never passes through React.
  *Add key* builds and unlocks the vault as needed and shows the field, *Save* puts the key, and
  *Done* hides the field again.

The labs page's aside, *Behind the scenes*, is for developers: its *Backend online* switch
([src/lib/outage-bank-db.ts](src/lib/outage-bank-db.ts)) takes the bankDB offline, so every
bankDB call refuses as it would with an unreachable backend. The landing page is the app without
this aside.

## Where the layers live

| Layer | Where |
|---|---|
| the library | the `safebyok` workspace package (`packages/safebyok/src/`) |
| React plumbing | the `safebyok-react` workspace package (provider, hooks, controls, the dialogs) |
| app scaffolding a host replaces | [src/lib/auth.ts](src/lib/auth.ts) (fake sign-in over localStorage; a real app brings its own auth and passes `user_id` to the provider), [src/lib/storage.ts](src/lib/storage.ts) (the bank's options: this browser's IndexedDB standing in for a backend) |
| developer tools | [src/lib/outage-bank-db.ts](src/lib/outage-bank-db.ts), [src/components/OutageSwitch.tsx](src/components/OutageSwitch.tsx) |
| the app itself | [src/components/](src/components/), [src/lib/anthropic.ts](src/lib/anthropic.ts) |

Tests live in `tests/`, mirroring `src/`. Tests of the scaffolding (the fake sign-in, and the
shape of the Anthropic request through an injected fetch) run under Node. Each component's test
renders it under jsdom, inside a `BankProvider` over in-memory databases, and drives it as a user
would (`tests/test-helpers.tsx`). The vault and provider are tested in their own packages.
