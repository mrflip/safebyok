# safebyok

Store user data encrypted at rest, only accessible on the user's device. Bring Your Own Key (BYOK)
Browser Vault uses E2EE (End-to-end Encryption) and pluggable remote storage to ensure secrets are
decrypted where the app runs, using keys that never leave the device. The backend only ever holds
ciphertext: unrecoverable even with a copy of the database, the application, and its environments.

This repository is a pnpm workspace. Its packages:

* [`safebyok`](packages/safebyok) -- the vault itself, with the IndexedDB device store in `safebyok/idb` and display helpers (`mask`) in `safebyok/utils`.
* [`safebyok-react`](packages/safebyok-react) -- the React binding: a provider, snapshot hooks,
  and a guard that asks for the passphrase on demand.
* [`safebyok-convex`](packages/safebyok-convex) -- Convex storage: a Convex component, and the
  `VaultDB` adapter that speaks to it.
* [`safebyok-postgres`](packages/safebyok-postgres) -- Postgres storage: the tables, and the
  server-side `VaultDB` over them, through the driver your app already has.
* [`safebyok-graphql`](packages/safebyok-graphql) -- GraphQL storage: the schema and resolvers
  your server runs over a `VaultDB` such as the Postgres one, and the `VaultDB` over an urql
  Client that calls them from the browser.
* [`safebyok-fastkey`](packages/safebyok-fastkey) -- Argon2id through WebAssembly: a
  key deriver several times faster than the core's, deriving the same bytes under the same specs.
* [`safebyok-indexeddb`](packages/safebyok-indexeddb) -- IndexedDB storage: a vault kept in this
  browser, every verb one transaction, and the template for a key-value backend of your own.
* [`safebyok-demo-react`](demos/safebyok-demo-react) -- a playground app; never published.
* [`safebyok-e2e`](e2e) -- the tests that pair an adapter with a framework's client; never published.

`pnpm install`, then `pnpm justify` lints, typechecks, tests and builds every package.
[CONTRIBUTING.md](CONTRIBUTING.md) has the rest.

## Basic e2ee architecture:

### Backend (VaultDB)

Facade over a backing store (convex, postgres, etc) or another vaultDB (graphQL, etc).
Holds vault​s and box​es scoped by applabel, userId, vaultlabel and boxlabel.
* A box holds a sidecar under the app's control and an encrypted whisper​
* verbs: vault: getVault, ensureVault (props and listing in one step), getVaultProps, ensureVaultProps, putVaultProps, delVault, subscribe, listBoxes; box: getBox, putBox, delBox.

### Browser

* a vault​ object
  - Vault.make({ applabel, userId, vaultlabel, vaultDB, deviceDB, keyDeriver, ... })​: Vault, non-async
  - vault.hello() (initial bookkeeping that doesn't bother the user)
  - lock​, unlock​, putWayin​, delWayin​, getBox(boxlabel)​, getWhisper(boxlabel)​, putBox(boxlabel, whisper, { sidecar? })​, delBox(boxlabel)
* a pantry​ holding keys
* a DeviceDB​ safely holding and managing access to the boxes (indexedDB)
* a pluggable KDF (Argon2id wasm/native)

assume initially that the app provides and guarantees the userId, and that the vaultDB can access all and only the records needed to support this.
the app interface is to call  non-async At the app level, whisper is anything JSONable.
for concreteness of discussion, assume a postgres backing store,