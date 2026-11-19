---
---

Empty: the new `safebyok` is private, and nothing published reaches what changed. What a caller of `VaultDB.watch` on the new core now gets:

- **One Thing per notice.** `ThingNotice` drops its `world` field: a notice carries `ok`, `act` and `val` alone.
- **No world.** A bank's `world` is never notified. Each change a store hands `AdapterVaultDB`'s watch becomes one notice of the changed Thing; the world beside it is ignored.
- **Tracked Things, out to in.** For a verb's answer, the watch is notified of the bank, the main gate and the root box its `tracked` reports other than `'same'`, in that order, and only those (the `doNotifyTracked` option covers these alone).
- **A refusal's `dbhas`.** A refused get, write or birth notifies its `dbhas` where it is a Thing, after the tracked Things, whatever `doNotifyTracked` says. That holds for a thrown refusal that carries one (a `gate_issue`, say). A refused listing notifies nothing.
- **Before the answer.** Each of those notices reaches every watch of the bank before the verb's answer reaches its caller. A store's own notices keep no promised order against it.
- **The minder.** A `ThingMinder`'s `tryWrite` caches only the record a good write answers with. A refusal's `dbhas` reaches the cache through the watch alone. A minder under a vaultDB that sends no notices will not see a refused write change any car.

What a store passes its watch's `receive` (`Received`) is unchanged. Nothing stored changes.
