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
  `VaultDB` adapter that calls it.
* [`safebyok-postgres`](packages/safebyok-postgres) -- Postgres storage: the tables, and the
  server-side `VaultDB` over them, through the driver your app already has.
* [`safebyok-graphql`](packages/safebyok-graphql) -- GraphQL storage: the schema and resolvers
  your server runs over a `VaultDB` such as the Postgres one, and the `VaultDB` over an urql
  Client that calls them from the browser.
* [`safebyok-fastkey`](packages/safebyok-fastkey) -- Argon2id through WebAssembly: a
  key deriver several times faster than the core's, deriving the same bytes under the same specs.
* [`safebyok-indexeddb`](packages/safebyok-indexeddb) -- IndexedDB storage: a vault stored in this
  browser, each call in one transaction, and a template for a key-value backend of your own.
* [`safebyok-demo-react`](demos/safebyok-demo-react) -- a playground app; never published.
* [`safebyok-e2e`](e2e) -- the tests that pair an adapter with a framework's client; never published.

`pnpm install`, then `pnpm justify` lints, typechecks, tests and builds every package.
[CONTRIBUTING.md](CONTRIBUTING.md) has the rest.

## Basic e2ee architecture:

The old design's sketch. The new design's calls are in [its README](packages/safebyok/README.md).

### Backend (VaultDB)

Facade over a backing database (convex, postgres, etc) or another vaultDB (graphQL, etc).
Has vault​s and box​es scoped by user_id, banklabel, vaultlabel and boxlabel.
* A box has a sidecar under the app's control and an encrypted whisper​
* verbs: vault: getVault (record and listing in one step), ensureVault (fetch or create; over a tombstone a new life), putVaultRecord, delVault (leaving a tombstone), subscribe; box: getBox, putBox, delBox.

### Browser

* a vault​ object
  - Device.make({ user_id, banklabel, gates: ['main'], vaultDB, deviceDB, keyDeriver, requestCleartext, ... })​: Device, non-async, one per signed-in user
  - device.ensureBank(): Bank, once the deviceDB has this device's row and the vaults are listed; device.vacate() at sign-out
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