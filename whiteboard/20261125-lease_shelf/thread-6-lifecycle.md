# Thread 6: lifecycle (2026-11-25)

Branch `20261125-lifecycle`, PR #912, stacked on #909 (1b). Proved: `safebyok` lint and typecheck clean, its suite
2160 tests green; `safebyok-react-lean` typecheck clean. `pnpm justify` after the catch-up: see the PR's **Tests:**.

* **Built**:
  * **Owed to 1b** (commit `vault: an unlock after the stored lease has passed its end…`): `World#leaseFollowed`
    follows `#endedIfStale(stored)`, so a grant over a live record that can no longer unlock (every tab closed past
    its end) starts the next life through `Lease.tombstoneOf`, where it renewed the old one. `Lease.stow` parses
    its argument and uses `deviceDB` plainly, no `checked`.
  * **`onLifecycle`** on `DeviceOpts` (shapes-bankish.ts): a `LifecycleHandler` hearing a `DeviceEvent`
    `{ kind, device }`, `kind` one of `lifecyclekindVals`:
    `'lease_taken_up'` (World `#takeUp`, the stored lease unlocks), `'lock_taken_up'` (`#takeUp`, it no longer does,
    and the tab held one), `'autolocked'` (`#lockPastLeaseEnd`), `'softlocked'` (`#softlockPastGate`). One line at
    each place: `this.#device.announce({ kind })`.
  * **`device.announce(announcement)`** (device.ts, section *Telling the host*, beside `tellBadNews`): parses the
    kind, calls the guarded handler, awaits nothing. The guard, `guardOnLifecycle`, is big's (`Consts.brandGuarded`,
    `ReportError.reportToPlatform` through `safebyok-big/internals`), so a throw or a rejection is reported to the
    platform and never breaks the device. `DefaultOnLifecycle` does nothing.
  * Exports from `core.ts`: `DefaultOnLifecycle`, `lifecyclekindVals`, types `DeviceAnnouncement`, `DeviceEvent`,
    `LifecycleHandler`, `Lifecyclekind`.
  * Tests: world.test.ts `the host's onLifecycle` (7: take-up at sign-in and none for the birth; a lock and an unlock
    taken up, nothing in the tab that acted; nothing for a tab signing in locked; the autolock; a softlock as the gate
    changes elsewhere; a throwing handler leaves the tab following). device.test.ts `device.announce` (4) and an
    opts case for a non-function `onLifecycle`.
  * notes/wontfix.md: the entry on what lands across a disconnect or a disable now says its take-up is announced.
* **Decisions made**:
  * Big's `DeviceEvent` and `LifecycleHandler` are typed on big's Device, so they were ported as lean types (as
    `BadNews` was), not re-exported. The guard is big's code, re-used whole.
  * **Kind names follow the deviceDB, not the act**: a take-up is `lease_taken_up` whether the other tab unlocked,
    renewed or softlocked; the tab cannot tell, and needs no branch to. `lock_taken_up` covers another tab's lock and
    its autolock alike.
  * **A take-up is announced however it began**: a ring, a connect, a sign-in, a reload. So a host's own
    `connect()` after its `disconnect()` hears `lease_taken_up`. Telling which take-ups the host caused would need
    a flag through `#followStored`; the brief's "a host's own call is not announced" is kept for `unlock`, `lock`
    and `disable`, which announce nothing in the tab that called them.
  * `lock_taken_up` is guarded by `this.isUnlocked`, so a tab that never held the lease hears nothing.
  * The default does nothing, where big's logs: per `#lock-is-intent` these are news, never alarms.
  * No handler switch after a disable (big swaps in its defaults): an announcement landing after one is a crossing,
    written into the wontfix entry.
* **Approaches set aside**:
  * Announcing from `Lease` or the deviceDB's bell: the World is where the kind is known, and one line there reads
    plainest.
  * Routing announcements through `onBadNews`: refusals stay bad news, and these are not refusals.
  * A `'locked'`/`'unlocked'` pair in place of the take-up kinds: wrong of a softlock or a renewal taken up.
* **Deviations**: none from the brief. `safebyok-react-lean` needs no change: `GiverConfig` is `DeviceOpts` less
  `vaultDB`, the provider spreads it into `Device.make`, and its config check is not strict.
* **Discoveries**: an expired lease still attached (the janitor not yet run) is renewed by a grant in that tab;
  untouched, outside the brief.
* **For the Coach**: the take-up on the host's own connect or reload, `lease_taken_up` for a softlock taken up, the
  silent default, and no handler switch after a disable, each above, are open in the PR.
