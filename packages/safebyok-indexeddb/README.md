# safebyok-indexeddb

safebyok's storage in this browser's [IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API):
**`idbVaultDB`**, the VaultDB for an app with no backend. Everything a synced backend would hold
is kept on this device instead, so the app's whispers are encrypted at rest all the same: the rows
are ciphertext and a few public fields, and nothing in them opens a vault without its passphrase.

It is also the example of a key-value backend: to store vaults in another key-value store, copy
this package and type in the three places *Writing an adapter of your own* names.

## Install

```sh
pnpm add safebyok safebyok-indexeddb
```

`safebyok` (and `zod`, its peer) are peer dependencies: your app installs them, so the adapter
and your app share one copy, and a `VaultError` from one is a `VaultError` to the other. Its one
dependency is [`idb-keyval`](https://github.com/jakearchibald/idb-keyval), which `safebyok`
already brings for its device store.

Platform: evergreen browsers with IndexedDB, and Node 22 and up (with a fake IndexedDB, for tests);
the floor is stated in the core's *Where it runs*.

## Use

```ts
import { openVault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { idbVaultDB } from 'safebyok-indexeddb'

const vault = await openVault({
  applabel:   'acme',
  userId:     session.userId,
  vaultlabel: 'main',
  vaultDB:    idbVaultDB({ dbName: 'acme' }),
  ...browserOpts({ dbName: 'acme' }),   // the key deriver, and the device store beside the vault
})
```

* **`dbName`** names the IndexedDB databases the records go in, default `'safebyok'`: the vault's
  rows in `<dbName>:vault_db`, and, through `browserOpts`, the remembered unlock in
  `<dbName>:device_db`. Anything but non-empty text refuses with kind `bad_option`.
* **`logger`**, when given, hears what the store has to say (a listener that threw, say); left
  out, the store uses the one `openVault` is given, else the console.
* **Every verb is one IndexedDB transaction.** IndexedDB runs readwrite transactions over one
  store one after another, across every tab of the origin, so a write lands only while what it
  expects still stands, and refuses with kind `stale_write` otherwise. Two tabs creating a vault
  at once settle on one; erasing a vault takes its every lockbox with it, or none of them.
* **Other tabs' writes** ring `subscribe`, over a BroadcastChannel, so a vault open in two tabs
  stays current in both. The bell says only that something changed; the vault reads again. Its
  channel is closed when the last vault listening to it closes.
* **No limits of its own.** IndexedDB sets none per record or per vault, so `maxRecordBytes`,
  `maxVaultBytes` and `maxLockboxes` are `Infinity`: a vault holds what `openVault`'s
  `maxLockboxes` allows (100 by default), the origin's storage quota bounds the whole database,
  and a write past it refuses with kind `storage_blocked`, IndexedDB's own error as its `cause`.
* **Storage the browser withholds** -- site data blocked, a private window or frame that keeps
  none, no room left, or no IndexedDB at all -- refuses with kind `storage_blocked`, which a retry
  cannot mend, by the rule the vault says its device store's failures by; any other trouble from
  IndexedDB, with kind `storage_unavailable`.
* **Best-effort storage.** The browser may evict IndexedDB under pressure, and "clear site data"
  removes it: the vault goes with it, and there is no other copy. Call
  `navigator.storage.persist()`, and tell your users plainly that the vault lives only in this
  browser.

It runs anywhere with an `indexedDB` global: every browser, and Node or Bun with
[`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB), which is how its tests run.
There, its BroadcastChannel never holds the process open, and a `subscribe` listener that throws
never escapes as an uncaught error: what it threw is dropped, so a listener of your own reports
its own failures.

## What is stored

One IndexedDB database per `dbName`, `<dbName>:vault_db`, holding one object store, `records`:
**a row per record, each the record itself**, as safebyok wrote it, kept by structured clone
field by field. Nothing is serialized, normalized or repaired: every field a record holds is
bound into its encryption, but for the bundle's `unlock_epoch` and which envelopes its `unlocks`
list holds, so one changed in storage makes the record refuse to open.

| ckey                                               | Row                       |
| -------------------------------------------------- | ------------------------- |
| `vault^<applabel>^<user_id>^<vaultlabel>`          | the vault's `VaultBundle` |
| `box^<applabel>^<user_id>^<vaultlabel>^<boxlabel>` | one `Lockbox`             |

The names are joined on `^` (the core's `Ckeys`), which the floor every name is held to keeps out
of every name, whatever a host's validators admit.

* **Encrypted**: each whisper (`whisper_ciphered`), each lockbox's lockboxKey
  (`lockbox_key_wrapped`), and, inside the bundle, the vaultKey, wrapped under each passphrase.
* **In the open**: the scope, each `boxlabel` and public bag (`public_json`), the `vault_id`, `unlock_epoch`,
  `revision_id`s, how each passphrase was made into a key (its key deriver's label and salt),
  when each vault and lockbox was first stored and each lockbox last written (epoch
  milliseconds), and the length of every ciphertext.
* **Never**: a whisper, a passphrase, any key in usable form. The remembered unlock lives in the
  device store's database, not here.

A vault written under the JSON-tuple ckeys of earlier versions (`["vault","acme","u1","main"]`)
reads as absent, its rows left as they were.

### Looking at the rows

`inspectIdbVaultDB({ dbName })` is a raw window onto the rows, for a debug panel or a demo's
"what the backend sees": `rows()` lists every stored row with its ckey, `subscribe(listener)`
hears every write, and `wipe()` removes every row, every user's vault in that database. It asks
no vault's opinion: what it shows is what is stored.

## Writing an adapter of your own

This package is the example of a key-value backend, as `safebyok-postgres` is of a SQL one and
`safebyok-convex` of a hosted one. To keep vaults in another key-value store -- a different
browser store, a native one in an app shell, a key-value service -- copy it, and type in three
places:

1. **`src/ckeys.ts`: where each record lives.** A ckey per record, built from its scope, so a
   read is one lookup and a vault's lockboxes are the rows under its prefix, read as a key range
   (`boxRange`) rather than by scanning the shelf. The core's `Ckeys` joins on `^`, which no name
   holds, so a vault's prefix (`box^acme^u1^main^`) begins its own lockboxes' ckeys and no
   other's. If your store has columns or namespaces, use them instead.
2. **`src/idb-vault-db.ts`: each verb, in one transaction of your store.** Extend `VaultDB` and
   write its `do*` methods, never its public verbs: the base class checks labels, scope, records
   and expectations on the way in, validates every record on the way out, and turns a `false`
   into `stale_write` and anything you throw into `storage_unavailable`. A write reads what
   stands, compares, and writes, all in one transaction (`src/shelf.ts`'s `inOneTransaction`);
   a store with no transactions needs a conditional write instead (compare-and-set on the
   ckey), or it cannot keep the promise.
3. **`doSubscribe`: how your store tells listeners of a write.** Here, `ChangeBell` from
   `safebyok/idb`, rung after each write that lands: this tab's listeners, and a
   BroadcastChannel to the others. Another store in this browser rings a bell of its own name the
   same way. A store with push of its own -- a live query, a socket -- calls from that, and one
   with none leaves `doSubscribe` out: the vault refreshes after its own writes regardless. The
   base class calls each listener so that one that throws stops neither the others nor the
   write, and unsubscribes once; yours is to let no handle (a channel, a socket) hold a Node
   process open, and to close it when its last listener leaves.

And keep, as they are:

* **`Expectations`, from `safebyok`**: the comparisons each write makes before it lands
  (`Expectations.bundleMeets`, `lockboxMeets`, `vaultMeets`, `vaultIdMeets`). An adapter
  compares only the scope, `boxlabel`, `vault_id`, `unlock_epoch`, `vault_key_epoch` and
  `revision_id`, and a standing row too damaged to show one of them fails the comparison. A
  lockbox write compares the bundle's `vault_key_epoch` too, in the same transaction: skip it,
  and a device still holding a vaultKey since replaced can seal a whisper under it.
* **Store each record as itself, field by field**, exactly as handed to you, and return it
  exactly as stored, or null for none. Never look inside a ciphered field, never repair a
  damaged row: safebyok validates everything it reads back.
* **Prove it with the shared suite**: `describeVaultDB` from `safebyok/testing` runs every verb,
  expectation and refusal against a fresh adapter, in one line
  (`tests/idb-vault-db.test.ts`), each group of tests named for the line of the
  [VaultDB contract](https://github.com/mrflip/safebyok/blob/main/packages/safebyok/VAULTDB.md)
  it checks. It makes two writes at once, which is what one transaction per verb is for, and,
  told your adapter pushes (`{ pushes: true }`), checks that `subscribe` hears each write. Your
  own tests are for what is yours alone: the rows as stored, a damaged row, a failure partway,
  another tab's ring.

The packaging is the template too: `package.json` (`safebyok` and `zod` as peers, ESM and
CommonJS through `exports`), `tsdown.config.ts`, `vitest.config.ts`, `tsconfig.json`, and an
`eslint.config.mjs` cut from the core's, which differs from it in nothing but its names. Rename
the package, its rules' names and its entry points, and add it to the `fixed` group in
`.changeset/config.json`.

## Developing this package

`pnpm justify` here runs its lint, typecheck, tests and build, with publint and
arethetypeswrong. The tests run under Node against fake-indexeddb: IndexedDB's own semantics,
transactions and structured clone included, with no browser. They build the core first
(`pnpm build:deps`) and read it through its `dist/`, as a consumer would; the typecheck and lint
read it from source.
