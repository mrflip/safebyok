# safebyok-indexeddb

A `VaultDB` for safebyok that keeps a vault's rows in this browser's
[IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API): storage for an app with no
backend. The rows are what any backend would have, ciphertext and a few unencrypted fields;
nothing in them unlocks a vault without its passphrase or passkey.

## Install

```sh
pnpm add safebyok safebyok-indexeddb
```

`safebyok` is a peer dependency, so the adapter and your app share one copy, and a `VaultError`
from one is a `VaultError` to the other. Its only dependency is
[`idb-keyval`](https://github.com/jakearchibald/idb-keyval).

## Use

```ts
import { idbVaultDB } from 'safebyok-indexeddb'

const vaultDB = idbVaultDB({ dbName: 'acme' })
```

Hand it to the core wherever a `VaultDB` is asked for.

* **`dbName`** names the database, default `'safebyok'`. The rows go in `<dbName>:vaults-v001-001-001`, and a vault
  database under an older name is deleted unread. Two `IdbVaultDB`s made with the same `dbName`, in one tab or two, share
  the rows.
* **`maxRecordSizeEst`**, an option of every `AdapterVaultDB`, is the largest box record a `putBox` accepts, 5,600 bytes if
  left out.
* **`maxBoxes`** is a best-effort cap on the box rows of one vault life, 100 if left out. A put of a new box past it is
  refused with `vault_full`. A deleted box's tombstone still counts, so deleting a box frees no room. A vault made anew
  starts at zero. This adapter currently enforces the cap exactly, because IndexedDB runs one readwrite transaction at a
  time, but the contract is a soft cap: do not rely on that.
* An option it cannot use is refused with `bad_option`.

## What it promises

* **Each call is one IndexedDB transaction.** A put or a del fetches the rows it depends on and
  writes in the same transaction, so it is written only over the row it expected. IndexedDB runs
  readwrite transactions one after another, across every tab of the origin. Deleting a vault
  deletes every box row of its life in the same transaction, or none of them.
* **A watch hears every tab's writes**, over a BroadcastChannel named for the database, once the
  write has committed.
* **Refusals say what IndexedDB did**, and carry IndexedDB's own error as their `cause`:
  - a write past the origin's storage quota: `vault_full`
  - an aborted transaction, or a database closed under the page: `storage_unavailable`
  - no IndexedDB at all, or storage the browser withholds: `storage_blocked`
* **No size limit beyond `maxRecordSizeEst` and `maxBoxes`.** The origin's quota bounds the whole database.

## What is stored

One object store, `rows`, keyed by array. A vault row is filed at
`['vault', applabel, user_id, vaultlabel]`, and a box row under its vault's life at
`['box', applabel, user_id, vaultlabel, vault_tok, boxlabel]`, so one key range fetches a bank's
vaults or a vault life's boxes. A deleted vault or box stays as a tombstone. `tidyGone` deletes the
box rows of any vault life that is over.

## Writing an adapter of your own

This package is the example of a key-value backend. To write vaults to another key-value datastore,
copy it:

* **Extend `AdapterVaultDB` from `safebyok/storage` and write its `do*` methods**, never its public
  verbs. The base class checks scope and options on the way in, validates every row on the way
  out, and turns a put or del that did not take effect into its refusal.
* **Do each `do*` in one transaction of your datastore.** Fetch the vault row with the rows the call
  may write, classify the ask with `this.classifyVault` or `this.classifyBox`, and store the ask's
  record only if `isWriteAct(classified.act)`, from `safebyok/storage`, is true. Make no check of
  your own: the classifier throws on a row that fails its checks, so it is never written over.
* **Triage your datastore's failures into refusals** where you catch them (`inOneStep` from
  `safebyok/storage` does it for IndexedDB). Anything else you throw becomes `storage_unavailable`.
* **Prove it with the battery**: `describeVaultDBBattery` from `safebyok/testing` runs every
  call against a fresh datastore, given a backdoor to its rows (`tests/idb-vault-db.test.ts`).

## Developing this package

```sh
pnpm --filter safebyok-indexeddb test   # under Node, against fake-indexeddb
```
