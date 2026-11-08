# Query efficiently: a bank's start-up reads, and a cache shared by its tabs

A PR of its own, after the fate makeover. Moved from whiteboard/20261108-provider_interactive/hanging.md, 2026-11-08.

## Where it stands

* A hello reads every box three times: the bank-wide `watchRows`, each vault's `listBoxes`, and each vault's own `watchRows`.
* Convex's watch already sends what `listVaults` and `listBoxes` fetch. The adapter drops that first answer (convex-vault-db.ts, `doWatch`).
* A Convex query reads each document whole, ciphertext and sidecar included, and the core then strips each box to the sparse form.
* Priced in notes/reference-sizes.md, *A bank hello on Convex* (on #554), for 10 vaults of 100 medium boxes and 1,000 users loading 10 times a day:
  * today: 22 calls and 4.09 MB per hello, about $236 a month, and 1.5 MB per box write for each subscribed client;
  * listings watching only their own rows: 11 calls and 1.37 MB per hello, $72 a month, and 0.14 MB per write;
  * sparse rows stored apart: 0.80 MB per hello, $38 a month.
* What causes a hello: only a new bank, which comes at a page load (a discarded tab's reload among them), a new `user_id` or `applabel`, or in development a hot reload or StrictMode. A tab that sleeps and wakes keeps its bank, but Convex's client reconnects and re-runs every watch.

## Decided

* **The watch's starting snapshot is the list.** An adapter declares that its watch sends a starting snapshot, and the listing takes that as its list, with no list call ("things vivify anyway"). The Coach, 2026-11-08.
* **Each listing watches its own rows, and an update sends only the changed vault or box.** The bank's vault listing watches the vault rows, and each box listing its own vault's boxes. The Coach, 2026-11-08.
  * On Convex a watched query re-runs whole and sends its whole answer again. So an update that sends only the changed box takes a head row per vault, carrying a seq that every write bumps, watched by the listing. A `boxesSince(seq)` query then reads only the changed boxes through an index, with tombstones for deletions.
  * About 2-3 KB per write per client, against 136 KB for own-rows watches and 1.5 MB today.
  * Postgres's notice already carries only the box.
* **Cache the bank in IndexedDB, with no whispers or sidecars,** so a hello catches up by delta on its own and the tabs share updates. The Coach, 2026-11-08.
  * One tab leads, chosen by the Web Locks API. It holds the watch, writes the deltas to IndexedDB, and broadcasts them over a BroadcastChannel. Look at `broadcast-channel` or Dexie's `liveQuery` before writing our own (a new dependency, so the Coach's yes).
  * Built as a caching VaultDB wrapped around any adapter.
  * Vault rows are cached sparse too, with no gate. A cached salt and wayin-wrapped vaultKey would rest offline-guess material on disk. That needs a ruling, and a guarantees.md change through the sonnet route.
  * A tidied-through-seq watermark from the server, so a cache older than `tidyGone` lists again from scratch.
  * Vacate drops the cache. Seq is kept per vault, and only ever rises.
* **Get rid of `helloedVaults`,** the WeakSet in BankProvider's context value that keeps `useVault` from calling `vault.tryHello()` twice for one Vault. The Coach pretends it isn't there. Once a listing's watch is its list, a vault's hello doesn't fetch again when repeated, and the context value can be just `Bank | null`.

## Open

* `hello` awaits the strength checker's `load()`, but only choosing a passphrase needs it, so every sign-in waits on the zxcvbn dictionary (memoized per page, so only the first). Option: the guarded checker awaits its own `load` at first check, and `hello` only starts it. Cost: a broken dictionary fails at first check, not at `hello`. [agent]
