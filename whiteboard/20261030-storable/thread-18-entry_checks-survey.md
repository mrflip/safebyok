# Thread 18: the survey of entries (2026-10-31)

For a reviewer of thread 18's coverage, and whoever adds an entry to Box, BoxListing, Storable or Listing.

* **Already checked first:** Storable's constructor (`storableArgs`); `box.send`'s opts (`sendOpts`); the `box.whisper` setter (`whisperHolder`, before `demandUnlocked`); Listing's constructor (`listingOpts`); `listing.fetch` (`fetchOpts`, `scopeOf`); `listing.put` (`recordOf`); `listing.del` (`scopeOf`); `ensureTimelyWorld` (`timelyOpts`).
* **Checked through their first call** (`hydrate` or `ensureTimelyWorld`): the `ensureReadyTo*` guards, `unsealWhisper`, `expose`.
* **Newly checked, before any guard:**
  * `edit` (so `send`, and `box.seal`): the patch through the concrete class's `isFullPatch` (below), then the opts through `timelyOpts`.
  * `storable.fetch`: its opts through `fetchOpts` (an `ifAbsent` was only looked at after `ensureTimely`).
  * `storable.hydrate`, `storable.del`: `timelyOpts`.
  * The `isWatchable` setter: `MSX.watchable` (a boolean). Both `subscribe`s: `MSX.listener` (a function). Both new, in the Options Checkers call.
  * `listing.at(scope)`: `scopeOf`, refusing `bad_scope` (it answered null for a scope with no fields).
  * `listing.hydrateAll`: `timelyOpts`, so bad opts refuse once, where they were told as one bad news per thing.
  * BoxListing's constructor: `boxListingOpts` (`world.scope`, `world.vault_tok`), before `super`.
  * `boxListing.build`: parses its dna (`boxDna`) before it looks at the lock (a private `#demandUnlocked`; lint's `no-declarations-before-early-exit` asked for the guard as its own call). Before, a locked vault refused a bad dna `vault_locked`.
  * `boxListing.absentRefusal`: `scopeOf`, refusing `bad_scope`.
  * `hasRevision` takes `unknown`, and answers false for null, undefined and a primitive, where `'revision_seq' in input` threw a TypeError.
* **Left unchecked, with reason:** `storable.receive` (the listing calls it with records its answer checks already passed; `classifyRecordShape` judges damage, and reconcile is thread 20's); `staleMetaOf` (a packer; `storedInStaleRefusal` checks what it reads back); `settle`, `priorTok` and the getters take no argument.

