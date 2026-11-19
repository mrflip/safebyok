# giver_needs: progress

What the threads have taught, newer than the plan wherever they disagree. Workers look things up here; the orchestrator
writes it.

## Where things stand (2026-11-19)

* The line stands on #751 (`20261119-giver_order`), which adds `peekBoxCar`, the bridge's catch-up, and the minder's
  `## Invariants` heading.
* Today's query key is `['safebyok', userid, banklabel, ...labelpath.split('/'), '.']`; the root box's query defaults
  (`gcTime: Infinity`) are set on its key.
* `listen` hands a `TSQGotAnswer` per car event (success, error, removed). The giver's `listenBoxCars` reads only
  `answer.ask.labelpath` and `answer.car`.
* The bank makes write asks (`Bank.makePutAsk`, `makeDelAsk`); `Bank.tryPutBox` and `tryDelBox` call `tryWriteThing`
  directly, around the minder.

## Rulings

None yet.
