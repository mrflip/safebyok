# safebyok-indexeddb

A `BankDB` for safebyok that keeps a bank's rows in this browser's
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
import { idbBankDB } from 'safebyok-indexeddb'

const bankDB = idbBankDB({ dbName: 'acme' })
```

Hand it to the core wherever a `BankDB` is asked for.

* **`dbName`** names the database: `safebyok-<dbName>:bank-v001-001-001`, or `safebyok:bank-v001-001-001` when you
  leave it out, so every database this library writes begins `safebyok`. One database holds every user's banks. Two
  `IdbBankDB`s made with the same `dbName`, in one tab or two, share the rows.
* **`maxRecordSizeEst`**, an option of every `AdapterBankDB`, is the largest box record a `putBox` accepts, 5,600 bytes if
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
  deletes every box row of its life in the same transaction, or none of them; deleting a bank
  deletes its gate rows, vault rows and box rows in the same transaction.
* **A watch hears every tab's writes**, over a BroadcastChannel named for the database, once the
  write has committed.
* **Refusals say what IndexedDB did**, and carry IndexedDB's own error as their `cause`:
  - a write past the origin's storage quota: `vault_full`
  - an aborted transaction, or a database closed under the page: `storage_unavailable`
  - no IndexedDB at all, or storage the browser withholds: `storage_blocked`
* **No size limit beyond `maxRecordSizeEst` and `maxBoxes`.** The origin's quota bounds the whole database.

## What is stored

One object store, `rows`, keyed by array. A bank row is filed at `['bank', user_id, banklabel]`, a gate row at
`['gate', user_id, banklabel, gatelabel]`, a vault row at `['vault', user_id, banklabel, vaultlabel]`, and a box row under
its vault's life at `['box', user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel]`, so one key range fetches a
bank's vaults or a vault life's boxes. A deleted bank, and a vault or box deleted on its own, stays as a tombstone; deleting
a bank removes its gate, vault and box rows outright. `tidyGone` deletes the vault rows left from an earlier life of the bank
and the box rows of any vault life that is over.

## Writing an adapter of your own

This package is the example of a key-value backend. To write banks to another key-value datastore,
copy it:

* **Extend `AdapterBankDB` from `safebyok/storage` and write its `do*` methods**, never its public
  verbs. The base class checks scope and options on the way in, validates every row on the way
  out, and turns a put or del that did not take effect into its refusal.
* **Do each `do*` in one transaction of your datastore.** Fetch the rows the call depends on, classify the ask with the
  `classify*` method of its kind, and store the ask's record only if `BX.isWriteAct(stored.act)`, from `safebyok/storage`,
  is true. Make no check of your own: the classifier throws on a row that fails its checks, so it is never written over.
* **Triage your datastore's failures into refusals** where you catch them (`inOneStep` from
  `safebyok/storage` does it for IndexedDB). Anything else you throw becomes `storage_unavailable`.
* **Prove it with the battery**: `describeBankDBBattery` from `safebyok/testing` runs every
  call against a fresh datastore, given a backdoor to its rows (`tests/idb-bank-db.test.ts`).

## Developing this package

```sh
pnpm --filter safebyok-indexeddb test   # under Node, against fake-indexeddb
```
