# safebyok

A Bring Your Own Key (BYOK) browser vault: end-to-end encrypted storage for API keys and other
small secrets a user brings to a browser app. Secrets are decrypted only where the app runs, under
keys that never leave the device, and synchronized through remote storage the app plugs in. The
backend only ever has ciphertext, which cannot be decrypted even with a copy of the database, the
application, and its environments.

This repository is a pnpm workspace. Its packages:

* [`safebyok`](packages/safebyok) -- the vault itself.
* [`safebyok-react`](packages/safebyok-react) -- the React binding: a provider, snapshot hooks,
  and the dialogs that ask the user for a passphrase or passkey when one is needed.
* [`safebyok-convex`](packages/safebyok-convex) -- Convex storage: a Convex component, and the
  `BankDB` adapter that calls it.
* [`safebyok-postgres`](packages/safebyok-postgres) -- Postgres storage: the tables, and the
  server-side `BankDB` over them, through the driver your app already has.
* [`safebyok-graphql`](packages/safebyok-graphql) -- GraphQL storage: the schema and resolvers
  your server runs over a bankDB such as the Postgres one, and the bankDB over an urql
  Client that calls them from the browser.
* [`safebyok-fastkey`](packages/safebyok-fastkey) -- Argon2id through WebAssembly: a
  key deriver several times faster than the core's, deriving the same bytes under the same specs.
* [`safebyok-indexeddb`](packages/safebyok-indexeddb) -- IndexedDB storage: a bank stored in this
  browser, each call in one transaction, and a template for a key-value backend of your own.
* [`safebyok-demo-react`](demos/safebyok-demo-react) -- a playground app; never published.
* [`safebyok-e2e`](e2e) -- the tests that pair an adapter with a framework's client; never published.

`pnpm install`, then `pnpm justify` lints, typechecks, tests and builds every package.
[CONTRIBUTING.md](CONTRIBUTING.md) has the rest.

## The shape of it

A sketch; the calls and their contracts are in [the core's README](packages/safebyok/README.md),
and the names in [VOCABULARY.md](VOCABULARY.md).

### Storage: the bankDB

A facade over a backing database (Convex, Postgres, IndexedDB) or over another bankDB (GraphQL),
holding four kinds of row, each scoped by `user_id` and `banklabel`:

* a **bank** row, one per user and `banklabel`;
* its **gate** row, `main`, holding the bankKey wrapped once for each wayin: the passphrase, and at
  most one passkey;
* a **vault** row per `vaultlabel`, holding nothing encrypted;
* a **box** row per `boxlabel` in a vault, with the app's sidecar in the clear, and its whisper
  sealed under a boxKey that the bankKey wraps.

Its calls: `ensureBank`, `buildBank`, `delBank` and the gate verbs (`replacePassphrase`,
`addPasskey`, `revokePasskey`); `getVault`, `putVault`, `delVault`; `listBoxes`, `getBox`, `putBox`,
`delBox`; `tidyGone` and `watch`. A delete leaves a tombstone; a bank or vault made again is a new
life, with a new token.

### Browser

* `Device.make({ user_id, banklabel, gates: ['main'], bankDB, deviceDB, keyDeriver, requestCleartext, ... })`:
  a Device, synchronously, one per signed-in user. `device.vacate()` at sign-out.
* `device.ensureBank()`: the Bank, once the deviceDB has this device's row and the vaults are
  listed. One unlock of the bank (`bank.ensureUnlocked()`) opens every vault in it, until
  `bank.lock()`; a lease kept in the deviceDB lets this device unlock again without asking, until it
  expires. `bank.maingate` changes the passphrase or passkeys; `bank.delPrompt()` deletes the bank.
* `bank.ensureVault({ vaultlabel })`: a Vault, fetched or made, asking nobody.
  `vault.beginWatch()` lists its boxes and watches them; `vault.getBox`, `putBox` and `delBox` do
  the rest.
* A gating, handed to the app's `requestCleartext` or shown in the device's snapshot, is the one
  place the user is asked for the passphrase or passkey.
* The key derivation function is pluggable: Argon2id in the browser by default, or through
  WebAssembly with `safebyok-fastkey`.

The app vouches for the `user_id`, and its bankDB reaches all and only that user's rows. A whisper
is any JSON object.
