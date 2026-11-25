# Thread 13: watch_recovery, a OneWatchVaultDB watch that cannot start ends (2026-11-25)

Branch `20261125-watch_recovery`, PR #TBD, stacked on #924 (thread 10, `20261125-car_read_at`).
Proved: `pnpm --filter safebyok lint` and `typecheck` clean; the one-watch, minder and world tests pass (19, 715 with
`tests/minding`, 71 in world). `pnpm justify` pending.

* **Built**:
  - **`VaultDB.watch` takes an optional fourth argument, `onEnded`** (`src/storage/vault-db.ts`): called where the
    watch ends before its stop is called, as one that cannot start may; once, never before `watch` returns, before the
    bad news that says why; nothing is notified after, and its stop need not be called. A vaultDB whose watch ends only
    at its stop never calls it, so `AdapterVaultDB` (and so `MemoryVaultDB`, Postgres, idb-lean) is unchanged.
    `AskChecks.watchArgs` checks it as an optional function.
  - **`VaultMinder.connect`** (`src/minding/vault-minder.ts`) hands the wrapped watch an `onEnded` that clears
    `#unwatchWrapped`, so `isWatching` goes false; the docs of `isWatching` and `connect` say so. The janitor's
    existing retry (thread 8: while connected, a watch not running is started through `World#startWatch`) asks for
    the lock again at its next tick. No change to `world.ts` (thread 12's ground).
  - **`OneWatchVaultDB.watch`** (`src/storage/one-watch-vault-db.ts`): where the wrapped watch throws as it starts
    (in the lock's callback), the tab closes its BroadcastChannel, calls `onEnded`, then `onBadNews` with
    `storage_unavailable`; the lock passes on as before. `#holdWatch` and `#whileLocked` take an `onFailed` in place
    of `onBadNews` for that path. Without Web Locks it hands `onEnded` straight to the wrapped watch.
  - **Names**: `watchnameOf({ userid, banklabel })` is now `safebyok/<userid>/<banklabel>/bank` (was
    `safebyok:watch:["<userid>","<banklabel>"]`), for the Web Lock and the BroadcastChannel alike.
  - Tests: one-watch (19): a failing holder ends (its `onEnded` before its bad news), hears nothing after, and the
    next tab takes over; **the lock-loss case**: both tabs' starts throw, both end, and once started again one inner
    watch serves both; without Web Locks `onEnded` is handed through; a non-function `onEnded` is refused; a table of
    names. Minder: an `onEnded` leaves it not watching, and its next `connect` watches again. World: under a fake lock
    manager, a OneWatchVaultDB whose inner watch threw is started again at the janitor's next tick (fails without the
    fix: `isWatching` stayed true).
  - `TH.fakeLockManager()` moved from the one-watch test into `tests/test-helpers/web-locks.ts`, for the world test.

* **Decisions made**:
  - **A new channel, `onEnded`, because none fits.** `VaultDB.watch` says `onBadNews` gets trouble "whether or not
    it ends the watch" (`AdapterVaultDB.doWatch` says the same), and the synchronous throw only covers a start in the
    call itself; the wrapper's start happens later, in the lock's callback. Set aside: a refusal kind meaning "ended"
    (overloads bad news, broadens big); the wrapper re-requesting the lock itself (a retry loop in a primitive, and the
    Coach approved the narrower janitor route); `onEnded(news)` carrying the reason (two bad-news channels).
  - **The failed tab closes its channel and stops hearing.** Left open, the janitor's next `connect` would open a
    second channel in the same tab and every notice would arrive twice. Between the failure and the next tick the tab
    hears nothing, but counts itself not watching, so the vault TSQ holds nothing fresh meanwhile (thread 8).
  - **`onEnded` before `onBadNews`**, so whoever hears the news finds the watch already ended.
  - **The name**: the Coach's words were "safebyok, userid and bank's labelpath". The bank's labelpath is `bank`,
    the same for every bank, so I kept the banklabel too (without it two banks of one user on one origin would share a
    lock): `safebyok/<userid>/<banklabel>/bank` reads as the bank Thing's full path. `/` separates because neither a
    userid (`Patterns.user_id`) nor a label can hold one. `watch` is dropped from the name, per his list.

* **Deviations**: `VaultDB` gains an optional parameter: an interface a host may implement grows, but optionally,
  so no implementation breaks. `#holdWatch` takes six parameters, on lines of their own.

* **For the Coach**:
  - **Name**: confirm `safebyok/<userid>/<banklabel>/bank` (banklabel kept, `watch` dropped).
