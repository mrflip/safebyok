# Thread 5: timerless (2026-11-03)

Branch `20261103-timerless`, PR #453, stacked on #449. Justify: green: `safebyok` 4585 passed, 37 skipped (84 files); root 302; no size budget moved.

* **Built**: a Storable's timeliness is a timestamp, `#refreshedAt` against a horizon (`maxMillisSinceRefresh` at construction). No timer; `fetch` keeps the spec's join (1️⃣): overlapping calls share one `get`, through `oneAtATime`. `vault.ensureTimely(maxMillis?)` hydrates and demands present: recent answers itself with no fetch, older fetches, `0` always fetches, a vault found gone refuses `absent_vault`. `MSX.Promptly` (2,000 ms) is what `ensureReadyToChangeGate` passes.
* **Removed**: Storable's `Trigger`, `doFetch`, `ensureReadyToFetch` (the join stays, as a private `#oneFetchAtATime`); `listing.hydrateAll`, `#told`; `MinRefreshMillis`, `eagerFrac` from `models-shapes.ts`; `DefaultPesterMillis`, `pesterMinutes`, `pesterMillis` on the bank. Tests of all of these are deleted, not ported. `listing.hello` now only starts the watch; `VaultListing.hello` also takes up cached leases.
* **Decisions taken**:
  * `fetch` checks the world timely itself, then joins `#oneFetchAtATime`, which runs `listing.fetch` with `ifAbsent: 'nil'` and answers whether a record was stored; each caller judges its own `ifAbsent`, joined or not.
  * `send` still hydrates, through `hydrate`, per the Coach's ruling ("it might be sparse"). `hydrate` stays though the spec tables do not name it.
  * The world's `ensureTimely` takes a plain `maxMillis` number, as the `TimelyOpts` were only ever one number to it. `listing.ensureTimelyWorld` parses it.
  * A sparse central always fetches on hydrate: the 50 ms `MinRefreshMillis` throttle was a guard for a fetch storm, and there is no machinery left for it to guard.
  * `Listing.hello` answers a Promise, as `VaultListing` overrides it with one and callers await.
* **Deviations and disagreements settled**:
  * The builder first removed the join on the handoff's word; the spec's 1️⃣ on `vault.fetch` and `box.fetch` ("overlapping calls join, one at a time") draws it, so rework put it back, and nothing more. No deviation from the table remains.
  * `TimelyOpts` keeps `maxMillisSinceRefresh`/`maxWorldMillis`, where the spec says `maxMillis`: a fiddly rename the end-to-end test does not reach. `FetchOpts` still accepts an ignored `maxMillisSinceRefresh`.
  * `ensureUnlocked` and `#unlockByProof` do not pass `Promptly` yet: they are the lease's lines, left to thread 3 and gating. `ensureUnlocked` has one forced edit, `this.ensureTimely()`, for the new signature.
  * A thing never refreshed, under a horizon of `Infinity`, now fetches, where the Trigger's Infinity meant never. Unreachable through a listing, which receives a record before it holds a thing.
* **Set aside**: a `refreshAfter`/horizon timer in the listing or bank (the refresh timer is deferred, so nothing replaces it); making `Listing.hello` sync and adding a separate `takeUpCachedLeases` verb (more churn than the thread earns, and thread 12 rewrites `bank.hello`).
* **Discoveries**:
  * A fetch that finds nothing (`val: null`) under a held vault refuses `record_conflict`, not `absent_vault`: existing behaviour in `receive`. Only a tombstone reads as gone. Both refuse, so `ensureTimely` meets its row.
  * `hydrate` asks the world for timeliness and then `listing.fetch` asks again. Harmless while the world's answer is a no-op; thread 12's `tidy` may want to look.
  * No lock crossing is added or changed by this thread: with no timer there is no background fetch left to land after `lock`.
* **For the Coach**: restack with thread 3 (#451) touches `vault.ts`'s `ensureTimely()` line, `vault-listing.ts`'s `hello`, and `models-shapes.ts`. Once both are in, `helpers/trigger.ts` and `tests/helpers/trigger.test.ts` have no caller in `models/` and can go; `one-at-a-time.ts` stays while old `src/vault.ts` uses it.
