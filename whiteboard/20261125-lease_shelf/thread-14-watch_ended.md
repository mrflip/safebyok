# Thread 14: watch_ended, a watch that ends of itself is announced (2026-11-25)

Branch `20261125-watch_ended`, PR #929, stacked on #925 (thread 12, `20261125-set_stage`).
Proved: `pnpm --filter safebyok test` (lint, typecheck, 36 files, 2,316 tests). `pnpm justify` after the catch-up: see the PR's **Tests:**.

* **Built**:
  - **A new lifecycle kind, `watch_ended`** (`src/shapes/shapes-bankish.ts`): `lifecyclekindVals` gains it,
    `WatchEnding = { kind: 'watch_ended' }` joins `DeviceAnnouncement` (now `LeaseAnnouncement | StageCrossing |
    WatchEnding`), exported from `core.ts`. `device.announce` checks it (`Checks.announcement`, a strict
    `{ kind: lit('watch_ended') }`). `DeviceOpts.onLifecycle`'s doc names it; `LifecycleHandler`'s doc block, which
    still said "what changed the device's lease", now says it hears each `DeviceAnnouncement`.
  - **`DefaultOnLifecycle`** (`src/models/device.ts`) logs it at `log`, story `{ oplabel: 'Device.onLifecycle', kind }`,
    message `Phrases.WatchEnded` ("The device's watch of its bank ended; it starts again at the janitor's next tick.").
  - **The path**: `VaultMinder.connect(onEnded?)` (`src/minding/vault-minder.ts`) takes an optional callback, checked
    by `VaultMinderChecks.connectArgs`, and calls it from the `onEnded` it hands the wrapped watch, after clearing
    `#unwatchWrapped` (so a handler finds `isWatching` false), and so before the bad news saying why. A second
    `connect` while watching does nothing, its `onEnded` dropped. `World#startWatch` (`src/models/world.ts`) passes
    `() => { this.#device.announce({ kind: 'watch_ended' }) }`. The minder knows nothing of the device.
  - Tests: vault-minder (3): `onEnded` called with `isWatching` false; a connect made while watching never has its
    `onEnded` called; a non-function `onEnded` is refused and nothing is watched. world `the host's onLifecycle` (1):
    under a fake lock manager, a OneWatchVaultDB whose inner watch threw is heard to end once, and the janitor's
    restart adds nothing (fails without the world.ts line: 0 heard). device `device.announce`: the default handler
    logs `watch_ended`. `kindsHeardOn` in world.test.ts keeps only `leasekindVals` now (was: drops `stage_crossed`).

* **Decisions made**:
  - **`connect(onEnded)`, not a listener field or a make option.** Set aside: an `onWatchEnded` on
    `VaultMinderListener` (every listener would carry it, and the world listens through the vault TSQ too); an option
    on `VaultMinder.make` or the `CarWorld` (the device makes the minder, so either the device would announce in place
    of the world, or the minder's `world` would grow a second duty). `connect` is where the watch starts, so its
    caller is the one who hears it end, mirroring `VaultDB.watch`'s own `onEnded`.
  - **The name `watch_ended`**: VOCABULARY.md gives `watch` to a vaultDB's watch of a bank, which this is; the past
    participant matches `stage_crossed`, `autolocked`. The type `WatchEnding` matches `StageCrossing`.
  - **No announcement when the janitor restarts the watch**: nothing in the restart path tells the world it worked
    (`#startWatch` returns nothing; the watch's start is asynchronous for a OneWatchVaultDB), so a `watch_started`
    would not fall out naturally. The test pins that the restart adds no `watch_ended`.

* **Discoveries**: none beyond the above; the ended watch's bad news (`storage_unavailable`) still goes to `onBadNews`
  after the announcement, so a host hears both, the announcement first.
