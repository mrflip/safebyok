# safebyok-idb-lean

A `VaultDB` for the new safebyok core that keeps a bank's Things in this browser's
[IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API), and a TanStack Query `Persister` that keeps a
device's cache snapshots there. The Things are what any backend would have, ciphertext and a few unencrypted fields; nothing in them unlocks a
bank without its passphrase or passkey.

Private, at 0.0.0, until it replaces `safebyok-indexeddb`.

## Use

```ts
import { IdbPersister, IdbVaultDB } from 'safebyok-idb-lean'

const vaultDB = new IdbVaultDB({ dbName: 'acme' })
```

Hand it to the core wherever a `VaultDB` is asked for.

* **`dbName`** names the database: `safebyok-<dbName>:vault-v001-001-001`, or `safebyok:vault-v001-001-001` when you
  leave it out, so every database this library writes begins `safebyok`. One database has every user's banks. Two
  `IdbVaultDB`s made with the same `dbName`, in one tab or two, share the Things.
* An option it cannot use is refused with `bad_record`.

To keep a device's caches between page loads, hand it two functions, each giving an `IdbPersister` for a bank: one for
its roots, one for its boxes:

```ts
function reportRefusal(news: VaultError) { console.warn(news.message) }

const persisters = {
  roots: ({ userid, banklabel }) => new IdbPersister({ recordlabel: `roots:${userid}:${banklabel}`, dbName: 'acme', onBadNews: reportRefusal }),
  boxes: ({ userid, banklabel }) => new IdbPersister({ recordlabel: `boxes:${userid}:${banklabel}`, dbName: 'acme', onBadNews: reportRefusal }),
}
const device = Device.make(record, { vaultDB, persisters, onBadNews: ({ news }) => { reportRefusal(news) } })
```

The device restores the signed-in bank's roots and boxes at `signin`. Every bank's records stay stored.
The device's `onBadNews` hears of a restore that fails, and each persister's of a save that fails: report both in one
place, as here.

* **`recordlabel`** names the record each snapshot is kept in, as an object by structured clone, in the database
  `safebyok-<dbName>:persist-v001-001-001`: one record per persister, so give each its own.
* **`throttleMs`** (default 1000) is the least time between writes. The device hands over the whole snapshot at every
  change to its cache; the first is written at once and then the newest after each wait. A write still waiting when the
  page closes is lost.
* **`onBadNews`** is called with the refusal of each write that fails, a no-op if left out. `restoreClient` and
  `removeClient` reject with IndexedDB's own error, which the device reports.

## What it promises

* **Each call is one IndexedDB transaction.** A write fetches the Thing it cites, and the bank and main gate it reports as
  the world, and writes in the same transaction, so it is written only over the Thing it expected. IndexedDB runs
  readwrite transactions one after another, across every tab of the origin.
* **A watch hears every tab's writes**, over a BroadcastChannel named for the database, once the write has committed.
* **Refusals say what IndexedDB did**, and carry IndexedDB's own error as their `cause`:
  - a write past the origin's storage quota: `vault_full`
  - an aborted transaction, or a database closed under the page: `storage_unavailable`
  - no IndexedDB at all, or storage the browser withholds: `storage_blocked`

## What is stored

One object store, `things`, keyed by array: each Thing at `[userid, banklabel, labelpath]`, so one key range fetches the
children of a Thing. A deleted Thing stays as its tombstone.

## Developing this package

```sh
pnpm --filter safebyok-idb-lean test   # under Node, against fake-indexeddb
```
