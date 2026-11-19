---
---

Empty: the new `safebyok` is private, and nothing published reaches what changed. What a caller of `VaultDB.watch` on the new core now gets:

- **One Thing per notice.** `ThingNotice` drops its `world` field: a notice carries `ok`, `act` and `val` alone.
- **The bank and main gate as notices of their own.** For each change a store hands `AdapterVaultDB`'s watch (the changed Thing and its bank's world, as a store's watch passes them now), `onNotice` gets a notice of the changed Thing, then one of the bank, then one of the main gate, each checked as the Thing is; one that fails its checks goes to `onBadNews` and the others still come. A world the store found missing or unsound brings no bank or gate notice. The same holds for each Thing an answer's `tracked` reports other than `'same'`.
- **Repeats.** A watcher may hear of a bank or main gate again at a revision it has heard of. A `ThingMinder` keeps the car it had for such a repeat, but `listen` still tells a `thing` event for it.

What a store passes its watch's `receive` (`Received`) is unchanged. Nothing stored changes.
