# safebyok

A Bring Your Own Key (BYOK) browser vault: end-to-end encrypted storage for API keys and other
small secrets a user brings to a browser app. Secrets are decrypted only where the app runs, under
keys that never leave the device, and synchronized through remote storage the app plugs in. The
backend only ever has ciphertext, which cannot be decrypted even with a copy of the database, the
application, and its environments.

This repository is a pnpm workspace. Its packages:

* [`safebyok`](packages/safebyok)`/core`: Usable on its own in front of any datastore served by one of the provided adapters
  - storage primitives to list, get, delete and update raw record objects
  - Seal and unseal records.
  - Unlock the bank by passphrase and passkey
  - Create a new bank, delete one, add other proof methods ("wayin"s)
* [`safebyok`](packages/safebyok)`/cached`: A managed cache of objects handling polling and subscriptions based on `@tanstack/query-core`
* [`safebyok`](packages/safebyok): Class instances and a sync/async listing that offers durable live-updating objects that make it both safer and more straightforward to use the library
  - storage operations that offer merging of stored secret records retry with backoff
  - instances move to a safe state when it is deleted, or the bank locks, is swept from the page, etc
* [`safebyok-react`](packages/safebyok-react) -- the React binding: a giver whose hooks read a bank's records
  through your TanStack Query client, form fields, and ready-made forms built from them.
* [`safebyok-postgres`](packages/safebyok-postgres) -- Postgres storage: the tables, and the
  server-side vaultDB over them, through the driver your app already has.
* [`safebyok-fastkey`](packages/safebyok-fastkey) -- Argon2id through WebAssembly: a
  key deriver several times faster than the core's, deriving the same bytes under the same specs.
* [`safebyok-indexeddb`](packages/safebyok-indexeddb) -- IndexedDB storage: a bank's Things stored in this browser.
* [`safebyok-convex`](packages/safebyok-convex) -- Convex storage: a component that keeps a bank's Things, and the
  vaultDB that reaches it through your app's Convex client.
* `safebyok-convex-big`, `safebyok-graphql-big`, `safebyok-indexeddb-big`, `safebyok-postgres-big` and
  `safebyok-react-big`, under [`packages/`](packages) -- the adapters and binding on safebyok-big, private and frozen
  until a port to the new core replaces each.
* [`safebyok-demo-react`](demos/safebyok-demo-react) -- a playground app; never published.
* [`safebyok-e2e`](e2e) -- the tests that pair an adapter with a framework's client; never published.

`pnpm install`, then `pnpm justify` lints, typechecks, tests and builds every package.
[CONTRIBUTING.md](CONTRIBUTING.md) has the rest.

## The shape of it

A sketch; the calls and their contracts are in [the core's README](packages/safebyok-big/README.md),
and the names in [VOCABULARY.md](VOCABULARY.md).

### Storage: the bankDB

A facade over a backing database (Convex, Postgres, IndexedDB) or over another bankDB (GraphQL),
with four kinds of row, each scoped by `user_id` and `banklabel`:

* a **bank** row, one per user and `banklabel`;
* its **gate** row, `main`, with the bankKey wrapped once for each wayin: the passphrase, and at
  most one passkey;
* a **vault** row per `vaultlabel`, with nothing encrypted;
* a **box** row per `boxlabel` in a vault, with the app's sidecar in the clear, and its whisper
  sealed under a boxKey that the bankKey wraps.

Its calls: `ensureBank`, `buildBank`, `delBank` and `putGate`, under the storage policy of the
gate change it makes (`notes/storage-policies.md`); `getVault`, `putVault`, `delVault`; `listBoxes`, `getBox`, `putBox`,
`delBox`; `tidyGone` and `watch`. A delete leaves a tombstone; a bank or vault made again is a new
life, with a new token.

### Browser

* `Device.make({ user_id, banklabel, gates: ['main'], bankDB, deviceDB, keyDeriver, requestCleartext, ... })`:
  a Device, synchronously, one per signed-in user. `device.vacate()` at sign-out.
* `device.ensureBank()`: the Bank, once the deviceDB has this device's row and the vaults are
  listed. Unlocking the bank once (`bank.ensureUnlocked()`) opens every vault in it, until
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
