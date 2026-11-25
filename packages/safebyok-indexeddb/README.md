# safebyok-indexeddb

A `VaultDB` for safebyok that keeps a bank's Things in this browser's
[IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API). The Things are what any backend would have, ciphertext and a few unencrypted fields; nothing in them unlocks a
bank without its passphrase or passkey.

It replaces the IndexedDB store built on safebyok-big, now the private `safebyok-indexeddb-big`. Its database has another name, so it reads nothing that store wrote.

## Use

```ts
import { IdbVaultDB } from 'safebyok-indexeddb'

const vaultDB = new IdbVaultDB({ dbName: 'acme' })
```

Hand it to the core wherever a `VaultDB` is asked for.

* **`dbName`** names the database: `safebyok-<dbName>:vault-v001-001-001`, or `safebyok:vault-v001-001-001` when you
  leave it out, so every database this library writes begins `safebyok`. One database has every user's banks. Two
  `IdbVaultDB`s made with the same `dbName`, in one tab or two, share the Things.
* An option it cannot use is refused with `bad_record`.

## What it promises

* **Each call is one IndexedDB transaction.** A write fetches the Thing it cites, and the bank and main gate it reports as
  the world, and writes in the same transaction, so it is written only over the Thing it expected. IndexedDB runs
  readwrite transactions one after another, across every tab of the origin.
* **A watch hears every tab's writes**, over a BroadcastChannel named for the database, once the write has committed.
* **Refusals say what IndexedDB did**, and carry IndexedDB's own error as their `cause`:
  - a write past the origin's storage quota: `vault_full`
  - an aborted transaction, or a database closed under the page: `storage_unavailable`
  - no IndexedDB at all, or storage the browser withholds: `storage_blocked`
  - a browser whose quota for the page is under 5,000 bytes, refused at the first call the device makes (the world read at sign-in), before anything is stored: `storage_blocked`

## What is stored

One object store, `things`, keyed by array: each Thing at `[userid, banklabel, labelpath]`, so one key range fetches the
children of a Thing. A deleted Thing stays as its tombstone.

## Developing this package

```sh
pnpm --filter safebyok-indexeddb test   # under Node, against fake-indexeddb
```
