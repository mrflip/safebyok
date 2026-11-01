# Thread 13: vault_boxes (2026-11-01)

Branch `20261101-vault_boxes`, PR #440, stacked on #439 (thread S, `20261101-seams`). Justify: green; safebyok 5187 passed, 37 skipped; scripts 290 passed.

* **Built**:
  * `Vault` holds a private `BoxListing` (`#boxListing`, made by a field initializer, `world: this`), and delegates to it: `boxes`, `boxscopeOf(bag)`, `boxOf(bag)`, `getBox`/`tryGetBox`, `makeBox`/`tryMakeBox`, `ensureBox`/`tryEnsureBox`, `helloBoxes`, `goodbyeBoxes` (`src/models/vault.ts`, section *Its boxes*). A bag naming another vault refuses 'bad_scope' with `Phrases.boxOfOtherVault`; `MSX.boxBag` checks it.
  * `BoxListing.ensure(dna, opts)`: answers the box stored; failing that, revives a held tombstone through `send`; failing that, puts a draft through `putDraft`, as `VaultListing.ensure` does (`src/models/box-listing.ts`).
  * The vault snapshot's `boxes` is the box listing's snapshot. The vault subscribes to its box listing and settles on each change.
  * `Vault.evict` ends the box watch and evicts every box (each `Box.evict` disarms), then lets the lease go, as before. `VaultListing.goodbye` ends each vault's box watch.
  * `boxRefreshMinutes` reaches the boxes: `VaultWorld` gains `vaultDB: BoxVaultDB` and `boxRefreshMillis`, which the bank already had. The GAP comment in bank.ts is gone.
  * `BankOpts.vaultDB` is now a `BankVaultDB`, `{ vaultStore(scope), boxStore(vaultScope) }`, the shape a `StoreFront` already has. `MSX.bankVaultDB` and `MSX.boxVaultDB` check it.
  * `Box.expose`'s forget counter (`#exposedSeq`): each change to `#exposed` other than an expose's own counts, whether disarm, the whisper setter, `adopt` forgetting, or eviction. An expose that sees the count move while it unseals keeps nothing and still resolves.
  * Tests: `tests/models/vault-boxes.test.ts` (new, 20), and in `tests/models/box.test.ts` a section *Expose overtaken* (8). With the counter's check removed, 6 of the race tests fail.
* **Decisions taken**:
  * **The vaultDB carries the box stores.** I reshaped the bank's `vaultDB` option into a front-like pair. I set aside a separate `boxDB` option: a `StoreFront` already answers both, and one object keeps one backend. The models are not exported yet, so no host sees the change.
  * **No box device cache yet.** The vault's box listing gets `UnkeptBoxCache` (it loads nothing and saves nothing), with a `GAP` comment in vault.ts. `DeviceDB` has no box cache, and growing one belongs to the devicedb threads.
  * **The box watch starts lazily**, at the first box verb (`helloBoxes`, once; a refused hello is begun again by the next call). I left `VaultListing.hello` untouched, to stay clear of 5b (#438). `VaultListing.goodbye` gained one line, `vault.goodbyeBoxes()`, ahead of `letLeaseGo()`.
  * **`ensureBox` keeps what is stored.** A box already stored keeps its whisper and sidecar: `ensure` means "make sure it exists", as `ensureVault` does. A held tombstone is reborn with the dna's whisper. After an ensure that stores, the box holds no whisper exposed until `expose`/`getWhisper`, as `putDraft` holds the stored record.
  * **A whisper the host sets while an expose unseals wins**: the counter counts the setter too, so the newer intent is kept. A lock while unsealing forgets nothing, so the expose keeps what it opened. The getter answers LOCKED until the vault unlocks.
* **Left out of the delegating verbs, on purpose**:
  * `delBox`: the host calls `box.del()`; deletion with the vault is thread 8.
  * `vault.getWhisper(bag)` and `useWhisper(bag)` shortcuts.
  * A public `boxListing` getter.
  * Enumerating stored boxes (`findBoxes`): the `BoxStore` has no find verb, and the watch's first sweep is silent, so a vault knows only the boxes it has been asked for.
* **Deviations**: two small changes outside the listed scope. `src/phrases.ts` gains `boxOfOtherVault`. `src/models/vault-listing.ts` gains `BoxVaultDB`, the two `VaultWorld` fields, and the `goodbye` line. Neither touches the lease mutex or `#withLeaseDB`.
* **Discoveries**:
  * A box made by `build` (and so `makeBox`) is staged at revision 0 and reads `isPresent: true`, so the vault snapshot shows it before it is sent. "Present" here means not a tombstone, not stored.
  * `send` on a drafted box needs the full patch (`{ whisper, sidecar }`) again.
  * `bank.closeVault` locks before it evicts, so after a close `box.whisper` reads LOCKED, not null. The snapshot's `exposed: false` is what shows the forget.
  * Each box change settles the vault, which re-saves the vault's copy to its device cache. That is cheap with the cache as it stands; worth a look if box traffic grows.
* **For the Coach**:
  * The `BankOpts.vaultDB` reshape (above): confirm, or ask for a separate `boxDB`.
  * Thread 11, exporting `Vault`'s box verbs, should export `BoxDnaInVault`, `BoxBag`, `BankVaultDB` and `BoxVaultDB` with them.
  * Thread 8 can call the vault's evict path for boxes on deletion: `#evictBoxes` is private, and `evict()` is the door.
