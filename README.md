# safebyok

Keep user data encrypted at rest, only accessible on the user's device. Bring Your Own Key (BYOK)
Browser Vault uses E2EE (End-to-end Encryption) and pluggable remote storage to ensure secrets are
decrypted where the app runs, using keys that never leave the device. The backend only ever has
ciphertext: unrecoverable even with a copy of the database, the application, and its environments.

This repository is a pnpm workspace. Its packages:

* [`safebyok`](packages/safebyok) -- the vault itself.
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

The old design's sketch. The new design's calls are in [its README](packages/safebyok/README.md).

### Backend (VaultDB)

Facade over a backing database (convex, postgres, etc) or another vaultDB (graphQL, etc).
Has vault​s and box​es scoped by applabel, user_id, vaultlabel and boxlabel.
* A box has a sidecar under the app's control and an encrypted whisper​
* verbs: vault: getVault (record and listing in one step), ensureVault (fetch or create; over a tombstone a new life), putVaultRecord, delVault (leaving a tombstone), subscribe; box: getBox, putBox, delBox.

### Browser

* a vault​ object
  - Bank.make({ applabel, user_id, vaultDB, deviceDB, keyDeriver, requestCleartext, ... })​: Bank, non-async, one per signed-in user
  - bank.ensureVault({ vaultlabel }, { vaultDB?, deviceDB? }?): Vault, born from one read of storage (never absent: `novel` until its passphrase is set)
  - vault.hello() (reads storage once its picture has aged; never asks the user)
  - ensureUnlocked, lock​, putWayin(slotlabel)​, delWayin(slotlabel)​, del(), getBox(boxlabel)​, getWhisper(boxlabel)​, putBox({ boxlabel, sidecar? }, whisper?)​, delBox(boxlabel)
  - a gating, handed to the app's requestCleartext, is the one place the user is asked for the passphrase or passkey
* a pantry​ keeping keys
* a DeviceDB​ safely keeping and managing access to the boxes (indexedDB)
* a pluggable KDF (Argon2id wasm/native)

assume initially that the app provides and guarantees the user_id, and that the vaultDB can access all and only the records needed to support this.
the app interface is to call  non-async At the app level, whisper is anything JSONable.
for concreteness of discussion, assume a postgres backing database,