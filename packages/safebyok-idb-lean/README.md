# safebyok-idb-lean

A `VaultDB` for the new safebyok core that keeps a bank's Things in this browser's
[IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API), and a bridge that copies a `VaultMinder`'s cache
into it. The Things are what any backend would have, ciphertext and a few unencrypted fields; nothing in them unlocks a
bank without its passphrase or passkey.

Private, at 0.0.0, until it replaces `safebyok-indexeddb`.

## Use

```ts
import { IdbMinderBridge, IdbVaultDB } from 'safebyok-idb-lean'

const vaultDB = new IdbVaultDB({ dbName: 'acme' })
```

Hand it to the core wherever a `VaultDB` is asked for.

* **`dbName`** names the database: `safebyok-<dbName>:vault-v001-001-001`, or `safebyok:vault-v001-001-001` when you
  leave it out, so every database this library writes begins `safebyok`. One database has every user's banks. Two
  `IdbVaultDB`s made with the same `dbName`, in one tab or two, share the Things.
* An option it cannot use is refused with `bad_record`.

To keep a copy of what a minder caches from another vaultDB, bridge the minder to an `IdbVaultDB`, and say hello to the
bridge before the minder:

```ts
const bridge = IdbMinderBridge.make({ minder, idbVaultDB: new IdbVaultDB({ dbName: 'acme' }), onBadNews: console.warn })
bridge.hello()
minder.hello()
```

The bridge writes each live record that lands in one of the minder's items, and each tombstone that lands in one of its
dead entries, over the Thing at its scope, where it is newer than the Thing stored there (`overwriteThing`, below). It
writes no Absent, soon or listing, and deletes nothing: a Thing in IndexedDB that the minder never tells of stays. A
VaultMinder's items are the boxes under the root box, so the bank, its main gate and its root box, which are a
`BankMinder`'s, are not copied. A copy that fails goes to `onBadNews`, a no-op if left out.

## What it promises

* **Each call is one IndexedDB transaction.** A write fetches the Thing it cites, and the bank and main gate it reports as
  the world, and writes in the same transaction, so it is written only over the Thing it expected. IndexedDB runs
  readwrite transactions one after another, across every tab of the origin.
* **A watch hears every tab's writes**, over a BroadcastChannel named for the database, once the write has committed.
* **Refusals say what IndexedDB did**, and carry IndexedDB's own error as their `cause`:
  - a write past the origin's storage quota: `vault_full`
  - an aborted transaction, or a database closed under the page: `storage_unavailable`
  - no IndexedDB at all, or storage the browser withholds: `storage_blocked`
* **`overwriteThing(record)`** stores a live record or tombstone at its scope only where it is newer than the Thing
  stored there, by life and then revision; an older record, or one at the stored revision, is ignored. A stored row that
  fails its checks is overwritten. It tells no watch. It is the bridge's: the copy it keeps is one no one else watches.

## What is stored

One object store, `things`, keyed by array: each Thing at `[userid, banklabel, labelpath]`, so one key range fetches the
children of a Thing. A deleted Thing stays as its tombstone.

## Developing this package

```sh
pnpm --filter safebyok-idb-lean test   # under Node, against fake-indexeddb
```
