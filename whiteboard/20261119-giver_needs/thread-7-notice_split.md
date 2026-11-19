# Thread 7: notice_split (2026-11-19)

Branch `20261119-notice_split`, PR [#766](https://github.com/mrflip/safebyok/pull/766), stacked on [#765](https://github.com/mrflip/safebyok/pull/765). Proved: safebyok
`vitest` 1210 green, typecheck and lint clean; safebyok-postgres 331 green (it runs the watch battery on PGlite, against a
rebuilt `safebyok/testing`).

* **Built**: `AdapterVaultDB.watch` (`packages/safebyok/src/storage/adapter-vault-db.ts`) splits each `Received` a store
  hands it into one notice of the changed Thing, then one of the bank, then one of the main gate (`worldThingsOf`), each
  checked by `Classifier.watchedThingOf`; one that fails goes to `onBadNews` and the rest still come, as does a handler that
  throws on one. A null world brings no bank or gate notice. `ThingNotice` (`storage/vault-db.ts`) drops `world`;
  `VaultDB.watch`'s doc says what a watcher hears, repeats included. `notifyTrackedRecords` is unchanged in code: it calls
  each feed's `receive` with `answer.world`, so each tracked Thing now brings its own three notices. `Received`, every store's
  `doWatch`, `MemoryVaultDB`'s `#notify`, the other verbs and the classifier are untouched. `ThingMinder.hello`'s callback
  still reads `notice.val` alone; the class doc's list of sources names the bank and main gate beside each notice.
* **Tests**: adapter (split order, a bad world Thing, a throwing handler hears on), the watch battery rewritten for three
  notices per change, and over the minder (`thing-minder-staleness`): the bank and main gate reach the cache through the
  watch after a box is written (fails on the old adapter), and a repeat of the bank keeps its car's identity while `listen`
  still tells a `thing` event for it.
* **Decisions made**: *order*: the changed Thing first, then bank, then main gate. The store reads the world in the same
  step as the record or later, so this is the order it learned of them; it also matches the minder's rule that a write's own
  record lands before the world. Bank before gate as a birth writes them. All three run synchronously inside one `receive`,
  which `MemoryVaultDB` and `notifyTrackedRecords` both call on a later microtask, so a watcher's handler still never runs
  inside a verb. *No dedupe*: a gate write's world repeats the gate, and a tracked bank repeats the world's bank; dropping a
  world Thing by labelpath could drop a newer one where a store read the world later, and the car merge already makes a
  repeat a no-op.
* **Pulled in by directive**: the orchestrator's retitling of thread 6's new test titles (cache, listen, listing-orders) to
  one clause, a `tests:` commit of its own; and a rebase onto #765's reviewed tip `d8df2053b`.
* **Discoveries**: TanStack's `setQueryData` dispatches `success` even when `bestCarOf` returns the prior car, so a repeat
  bumps the car's `dataUpdatedAt` (it reads as timely again) and `listen` tells an event, though the car is the same object.
  The giver passes on box events only, so bank and gate repeats reach no React entry. No code in `packages/safebyok/src`
  outside `storage/` reads a verb answer's `world` (`Bank.#tryBirth` reads `answer.val`; the minder lands only the write's
  own record). safebyok-postgres's tests import `safebyok/testing` from `dist`, so a battery change needs
  `pnpm --filter safebyok build` before they see it.
* **For the Coach**: (1) the cost of repeats, and (2) whether a verb answer's `world` should go out as notices too: see the
  PR body's *Open questions*. Recommendation for (2): keep it in the answer only.

Approaches set aside: splitting in `MemoryVaultDB`/the store (the directive keeps what an adapter hands the wrapper);
building notices in `notifyTrackedRecords` directly (it would duplicate the split; going through `receive` keeps one path);
deduping by labelpath (above).
