# Seed for the sprint after unrace

The Coach, 2026-11-03, on closing unrace after threads 21 and 14 and running the rest as a new sprint from a fresh session: "Agree". The source is
the sprint doc's *Closer Look* tab, *Draft for triage*, and its *Open Matters*, which keep getting rows ruled: read those first, as this file is only what had been ruled when it was written. Their words are the Coach's.

## Ruled

* **Damage shrinks to a listing.** "a separate listing would allow them to be unlisted; that should be the extent of it: use a tombstone in a separate response field to signal a special action, doing nothing else." `damaged_records` stays on `getBank`'s and `getVault`'s answers; `am: 'd'`, `isDamagedVaultAt`, `isDamagedBoxAt`, `damagekind` and the store's own judging go. Its own thread, first: about 95 lines, and the seam gets simpler without them.
* **A bad row asked for by name** refuses `damaged_record`, and `delVault` of a bad row goes: the customer clears it with their own store's tools.
* **The deviceDB's surface.** "Rather than bank and vault getting methods to cache leases vault friend should. Make cache device record be cache bank as I assume they are isomorphic. If you rename cache vacate call it "forget"". The first cut proposed a `cachedLease` object with `peek`, `cache`, `forget`, `leasesProvedBefore`, the public `deviceDB` dropped; that renames about 9 source and 24 test sites.

## Plain instructions from Closer Look, not yet shaped into threads

The plan's threads 18 `plain_seam`, 19 `world_whole` and 20 `test_teeth` carry the Coach's words. Beside those: `demandEnabled` called only from the `demandReadyToFoo` guards; `#isGreeted` and first-box vivification go; callback parameters that select a branch go, and "don't use null as a sentinel"; `try*` and throw forms trade bodies where a `try*` wraps a body; Outcome round trips.

## Left to the Coach, or after

`fateOver` and `SlotFate`, reflective installs and reach-ins (the Coach is looking); fire-and-forget ("investigate after sprint"); the gating family.
