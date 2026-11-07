# safebyok-indexeddb

A `VaultDB` for safebyok that keeps a vault's rows in this browser's
[IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API): storage for an app with no
backend. The rows are what any backend would hold, ciphertext and a few unencrypted fields;
nothing in them opens a vault without its passphrase or passkey.

## Install

```sh
pnpm add safebyok safebyok-indexeddb
```

`safebyok` is a peer dependency, so the adapter and your app share one copy, and a `VaultError`
from one is a `VaultError` to the other. The one dependency is
[`idb-keyval`](https://github.com/jakearchibald/idb-keyval).

## Use

```ts
import { idbVaultDB } from 'safebyok-indexeddb'

const vaultDB = idbVaultDB({ dbName: 'acme' })
```

Hand it to the core wherever a `VaultDB` is asked for.

* **`dbName`** names the database, default `'safebyok'`; the rows go in `<dbName>:vaults-v001-001-001`, and a vault database of an older name is deleted unread. Two
  stores made with one `dbName`, in one tab or two, share the rows.
* **`maxRecordBytes`** is the AdapterVaultDB's own: the largest box record a `putBox` takes.
* An option it cannot use refuses with kind `bad_option`.

## What it promises

* **Each call is one IndexedDB transaction.** A put or a deletion reads the rows it depends on
  and writes in the same transaction, so it lands only over the row it expected; IndexedDB runs
  readwrite transactions one after another across every tab of the origin. Deleting a vault
  tombstones its every box in that transaction, or none of them.
* **A watch hears every tab's writes**, over a BroadcastChannel named for the database, once the
  write has committed.
* **Refusals say what IndexedDB did.** A write past the origin's storage quota refuses with kind
  `vault_full`; a transaction aborted, a database closed under the page, storage the browser
  withholds, or no IndexedDB at all, with kind `storage_unavailable`. Either carries IndexedDB's
  own error as its `cause`.
* **No limits of its own.** The origin's quota bounds the whole database.

## What is stored

One object store, `rows`, keyed by array. A vault row is filed at
`['vault', applabel, user_id, vaultlabel]`, and a box row under its vault's life at
`['box', applabel, user_id, vaultlabel, vault_tok, boxlabel]`, so one key range reads a bank's
vaults or a life's boxes. A deleted row stays as its tombstone until `tidyGone` clears the boxes
of a life that is over.

## Writing an adapter of your own

This package is the example of a key-value backend. To store vaults in another key-value store,
copy it:

* **Extend `AdapterVaultDB` from `safebyok/storage` and write its `do*` methods**, never its public
  verbs: the base class checks scope and options on the way in, validates every row on the way
  out, and turns a put or deletion that did not land into its refusal.
* **Do each `do*` in one transaction of your store**, reading the vault row beside the rows it
  writes, and answer what it found (`ante`, and `vault` for a box) with whether it landed.
  `src/idb-vault-db.ts` decides each with the predicates `safebyok/storage` exports.
* **Triage your store's failures into refusals** where you catch them (`inOneStep` from
  `safebyok/storage` does it for IndexedDB); anything else you throw becomes `storage_unavailable`.
* **Prove it with the battery**: `describeVaultDBBattery` from `safebyok/testing` runs every
  call against a fresh store, given a backdoor to its rows (`tests/idb-vault-db.test.ts`).

## Developing this package

```sh
pnpm --filter safebyok-indexeddb test   # under Node, against fake-indexeddb
```
