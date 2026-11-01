# Thread 4a: bank (2026-11-01)

Branch `20261101-bank`, PR #TBD, stacked on [#430](https://github.com/mrflip/safebyok/pull/430).
Justify: green; core 4846 passed, 37 skipped; every package green.

* **Built**
  * `VaultListing.ensure(dna, cleartexts)` (`src/models/vault-listing.ts`), put-first: build the
    novel record and its gate (`#buildDraft`, the old `#draftWithProving`), put it over no
    `revision_tok`, and only then hold a vault. Where the put lands, the vault takes up the lease
    its passphrase proving grants; where another device stored first, the `stale_write` carries
    the live record and the listing holds that vault, locked. Cleartexts are spent either way.
  * `Listing.putDraft(draft)` (`src/models/listing.ts`), the base's step for it: `#store.put(draft,
    null)`, then `#deliver` of what storage holds (the draft, or the live record of a
    `stale_write`); a `stale_write` carrying a tombstone or nothing, and any other refusal, throws.
  * `Listing.draftOf` defaults to refusing `bad_option` (`RefusalFuncs.dnaHandedToBuild`,
    `Phrases.DnaHandedToBuild`), so `VaultListing.draftOf` is gone and `VaultListing.build`
    takes a record only. `BoxListing.draftOf` gains `override`. `holdDraft` is gone.
  * `src/models/bank.ts` rewritten: options `vaultDB` (a models `VaultStore`) and `deviceDB`
    (`BankDeviceDB`: the lease verbs plus `vaultCache(bankScope)`), no `clock`; `constructor(opts,
    _cheat_clock?)`, the clock `wallClock` otherwise; lifecycle `starting`/`ready`/`refused`
    (`BankStage`) in a frozen `BankSnapshot` of its own, remade on a stage change or a change of
    the listing's snapshot; its own `subscribe`; `hello` joins one in flight and awaits
    `keyDeriver.load?.()` bare (the Coach's ruling, in its doc block); `ensureVault` fetches,
    else ensures with the cleartexts handed or through a `build_vault` gating, and joins an
    `ensureVault` in flight for the same vaultlabel (YOLO a).
  * `models-shapes.ts`: `bankDeviceDB`, `BankDeviceDB`, `cheatClock`; `bankOpts` takes `vaultDB`
    and `deviceDB`; the Store doc says a `del` over no row answers null.
  * Test fakes: the models world's `del` over no row answers null and lands nothing (YOLO b);
    the vault world's `put` refuses `stale_write`, carrying the row, over any revision but the
    prior tok. New `tests/test-helpers/bank-world.ts`, `tests/models/bank-ensure.test.ts`,
    `tests/models/bank-lifecycle.test.ts`.

* **Decisions taken**
  * **The vault cache lives on the deviceDB**: `deviceDB.vaultCache(bankScope)`. The option list
    names no `vaultCache`, and the old DeviceDB has no vault cache; this is the seam for thread 5,
    which owns the device record and may shape it otherwise.
  * **`device_id` stays an optional option** defaulting to `randomId()`, as the sketch had it; the
    device record that should keep it is thread 5's.
  * **`ensure` makes no held check**: storage judges. A second `ensure` of a stored scope meets
    `stale_write` and answers the held vault; it still runs `Gate.build`, so the bank fetches
    first.
  * **A `ready` bank stays `ready` through another hello**; only `refused` steps back to
    `starting`. A refused hello records `refusalOf(err)` in the snapshot and rethrows the
    original error.
  * **`draftOf` refuses by default** rather than staying abstract: that was how to remove
    `VaultListing.draftOf` without a stub override.
  * **`cleartextsWithRecord` and its phrase are removed**: `build` takes no cleartexts now.

* **Set aside**
  * Holding the draft and dropping it on `stale_write` (fixing the GAP in place): it holds a
    Vault before storage judges it, which put-first exists to avoid.
  * Routing `putDraft` through `put`: `put` uses the held instance's tok, and there is none.

* **Deviations**
  * The bank keeps the GAPs at `pesterMillis` (~64), `boxRefreshMillis` (~66: no vault makes a box
    listing yet) and `closeVault` (~153, thread 4b's eviction).

* **Discoveries**
  * Re-ensuring a deleted vault refuses `stale_write`: the tombstone a `stale_write` carries is
    not adopted. Thread 8 (vault deletion) should decide what it means.
  * A vault held while storage holds no row (a row removed outright, not tombstoned) would make
    `putDraft`'s landed draft meet the held vault's `receive` under another `vault_tok`, which
    refuses. The bank's fetch first makes that unlikely; thread 8 again.
  * `RefusalMeta.vault_stored` is still typed as the old `VaultRecord`; the vault world's fake
    casts through `unknown` to carry a models record, as `storedInStaleRefusal` reads it as
    unknown.
  * `BankOpts.keyDeriver` now takes `src/key-deriver`'s `KeyDeriver` (what the models' world
    takes), not `deriver/basederiver`'s.
  * Restack: threads 2 and 9 touch `bankOpts` and the bank's constructor; expect conflicts there.

* **For the Coach**
  * **vaultCache seam**: confirm the vault cache belongs on the deviceDB (`vaultCache(bankScope)`),
    or name where thread 5 should put it.
