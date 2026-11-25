# Thread 7: one_watch, one tab holds the watch (2026-11-25)

Branch `20261125-one_watch`, PR #915 (draft), stacked on #912 (thread 6, `20261125-lifecycle`).
Proved: `pnpm --filter safebyok test` 2174 passed, lint and typecheck clean; `pnpm justify` at ready.

* **Built**:
  - `OneWatchVaultDB` and `oneWatchVaultDB(vaultDB)`, `packages/safebyok/src/storage/one-watch-vault-db.ts`,
    exported from `safebyok/browser` with `watchnameOf(scope)`. It wraps any new-core vaultDB. Each tab's `watch` asks
    for a Web Lock named `safebyok:watch:["<userid>","<banklabel>"]`; the holder runs the wrapped `watch`, posts each
    notice on a BroadcastChannel of the same name, then hands it to its own `onNotice`. Every tab's channel listens from
    the moment its `watch` is called, and passes on what another tab posts that passes `SeenChecks.itemEvent`, deeply
    frozen, through a bulletproofed `onNotice` (a host handler that throws goes to its `onBadNews`). The stop function
    stops the wrapped watch, releases the lock (the next waiting tab starts its own), and closes the channel. A tab that
    stops while still waiting starts nothing once granted (the `isReleased` check). Every other verb passes straight
    through. No `navigator.locks`: every tab runs the wrapped watch, as before.
  - Tests, `tests/storage/one-watch-vault-db.test.ts` (14): two "tabs" (two wrappers over one MemoryVaultDB in one
    Node process, whose BroadcastChannel carries posts between channels of one name) under a fake FIFO lock manager
    stubbed on `navigator`: one inner watch, both tabs hear, heard events frozen with the holder's `read_tc`, hand-over
    on stop, no watch for a tab that left while waiting, bad news to the holder only, an inner watch that throws hands
    the lock on, a holder handler that throws still posts, bad posts dropped, the pass-through without Web Locks, and
    one case under Node's own `navigator.locks` where present (Node 24 has it; the required CI job on Node 22 skips it).
  - A row in `notes/wontfix.md`: "A change notified while a OneWatchVaultDB's lock changes hands reaches no tab".
  - An entry in `notes/security.md` (sonnet subagent): sealed records now cross same-origin tabs on a BroadcastChannel.
  - Two fixes to thread 6 (#912), at the orchestrator's direction, in a commit of their own: `World#canUnlock` answers
    `boolean` (its predicate made `! canUnlock` narrow to `never` in `#endedIfStale`), and `#takeUp` narrows on `am`
    for `Lease.make`; `DeviceOpts.onLifecycle`'s doc says the host's own gate verb announces `softlocked` in its tab.

* **Decisions made**:
  - **No refresh on taking the lock** (the orchestrator's call, against the plan's older "the new holder refreshes the
    world"): the Coach since ruled "All that matters is when it was read. This is not a startup concern, it's a
    janitorial concern", and "Remember how slowly everything changes vs. time from mount to unmount". The janitor's
    staleness re-read and the listings cover the gap; the wontfix row records it.
  - **A wrapper over `VaultDB.watch`, not over `AdapterVaultDB.doWatch`**: it works for any vaultDB, and what crosses
    the channel is the finished `VaultEvent`, `read_tc` included, so other tabs date events as the holder heard them.
    The wrapped watch's events already carry `read_tc`; thread 9's `Received.read_tc` is not on this base, and needs
    nothing here.
  - **A positional constructor** (`new OneWatchVaultDB(vaultDB)`), not an options bag: there is nothing else to pass.
  - **Lock and channel named per bank only**, with no `dbName`-style prefix: two different vaultDBs over the same bank
    on one origin would share one watch. Add a prefix option when a host needs one.
  - **The holder posts before its own `onNotice`**, so a throwing host handler in the holder starves no other tab.
  - **A flag, not an `AbortSignal`, withdraws a waiting request**: the abort would reject the request with an
    `AbortError` the catch must then tell apart; the flag lets the granted callback return at once.
  - **Plain test doubles**: no library; `vi.stubGlobal('navigator', ...)`. Node 22 (the required CI job) has
    BroadcastChannel but no `navigator.locks`, so the fake lock manager is the default and the real one runs where present.

* **Deviations**:
  - **The minder's connect no longer sees a watch that fails to start.** `VaultMinder.connect` says "What the wrapped
    vaultDB's `watch` throws is thrown, and nothing is watched", and the janitor retries a watch not running. Through the
    wrapper, the wrapped watch starts later, in the lock's callback: what it throws goes to the holder's `onBadNews` as
    `storage_unavailable`, the lock passes to the next tab, and this tab's minder counts itself watching (it still hears
    the channel), so the janitor does not retry. Loosened on purpose: a throw there cannot reach `connect`.

* **Discoveries** (the freezing check the handoff asked for):
  - **Chrome**: freezing (Energy Saver, Chrome 133) applies to a tab hidden and silent for five minutes and
    CPU-intensive, and spares one that must not "Hold a Web Lock or an IndexedDB connection that blocks operations
    outside the group" ([Freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver)). A
    hidden holder that other tabs wait on is therefore not frozen; one with no waiter may be, and starves no one. The
    earlier conservative-freezing proposal had the same exemption ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/NOhYFW0rifw)).
    A discarded tab is unloaded, which releases its lock.
  - **Firefox**: no page freezing and no `freeze` event; it unloads tabs under memory pressure, which releases the lock
    ([Chrome's Page Lifecycle doc](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) lists Firefox and
    Safari as not supporting it; [bug 1545701](https://bugzilla.mozilla.org/show_bug.cgi?id=1545701)).
  - **Safari, iOS**: WebKit suspends a background tab's process as soon as its critical work is done
    ([WebKit 265064](https://bugs.webkit.org/show_bug.cgi?id=265064)), and I found nothing saying a held Web Lock
    exempts it or is released. **Unconfirmed**: a hidden iOS Safari tab holding the lock may stop hearing while a visible
    tab waits on it. Plainest remedy, not built: the holder lets the lock go on `visibilitychange` to hidden and asks
    again when shown (a re-subscription per tab switch). Safari also kept locks across a reload until 2025
    ([WebKit 283528](https://bugs.webkit.org/show_bug.cgi?id=283528), fixed).

* **For the Coach**:
  - **Safari on iOS**: is the visibility hand-off (above) wanted now, or left until seen on a device?
  - **The minder's connect** (Deviations): accept the loosened guarantee, or have the wrapper's watch count as not
    running until the lock is held?
