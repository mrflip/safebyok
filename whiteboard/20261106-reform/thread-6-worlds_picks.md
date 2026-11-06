# Thread 6: the worlds as Picks (2026-11-06)

Branch `20261106-worlds_picks`, PR #550, base `main` (cut from `a19292549`). Justify: green; safebyok 66 files, 2185 tests.

* **Built**:
  * `Listing`, `VaultListing` and `BoxListing` take `(world, opts)`. `ListingOpts` keeps `vaultDB` and `maxMillisSinceRefresh` (`src/shapes/shapes-vaultish.ts`).
  * `ListingWorld = Pick<Bank | Vault, 'lockState' | 'ensureTimely' | 'takeWorld' | 'tellBadNews'>`, `VaultWorld = Pick<Bank, ...>`, `BoxWorld = Pick<Vault, ...>`. `Bank implements VaultWorld` and `Vault implements BoxWorld` are gone, since a Pick of a class cannot be implemented by it.
  * Each world gets a shape check at its constructor: `VX.listingWorld` in `Listing`, extended by `VX.vaultWorld` in `VaultListing` and `VX.boxWorld` in `BoxListing`, each built in a `Checker` (`listingWorld.extend(...)`). The inline world `obj`s, `VX.world`/`World`, `vaultListingOpts`/`VaultListingOpts` and `boxListingOpts`/`BoxListingOpts` are gone.
  * `StorableOpts` and `VX.storableOpts` are gone. `Storable`'s constructor is `(world, listing, central)`, and `hydrate` and `isTimely` read `this.listing.maxMillisSinceRefresh`. That field is now public readonly on `Listing` (it was protected); its doc block stays.
  * Test fakes stay structural. `tests/test-helpers/vault-world.ts` exports `FakeBank`, a `VaultWorld` with its `readonly` stripped, returned as `fakeBank` beside `opts: ListingOpts`. Tests replace `fakeBank.requestCleartext` where they used to write through `opts.world`/`listing.world`. `hearingBadNews(world, onBadNews)` takes and answers a world. `boxListingOf(mw, overrides)` takes `BoxListingOverrides`: a world, vaultDB or horizon.
* **Directive (`_cheat_clock`)**: its own commit, `db09eb17c`. `box-seal.test.ts` `sealWorld()` and `vault-life.test.ts` `makeVaultWithBox()` no longer build a models world. Each makes `new TestableBoxListing(boxWorldOf(vault), vaultWorld.opts)`, so the vault world's `_cheat_clock` is the only one set. I chose this over the two options offered:
  * Sharing one `now` would add plumbing.
  * Building the models world first works in `box-seal`, but not in `vault-life`, where `born` is a promise made before the helper runs. `makeBornVaultWithPasskey()` sets its clock after an `await`, so the order is not even fixed.
  * The models world gave those helpers nothing but `boxListingOf`'s defaults.
* **Decisions taken**:
  * *Types by the reader*. The Coach's `Pick<Class, ...>` everywhere, so go-to-definition lands on the class member. Confirmed with tsc's language service (`getDefinitionAtPosition`, the script in my scratchpad):

    | Member | Lands on |
    |---|---|
    | `vault.world.scope` | `bank.ts:32` |
    | `vault.world.requestCleartext` | `bank.ts:38`, doc shown |
    | `vault.world.leaseMillis` | `bank.ts:40` |
    | `vaultListing.world.tellBadNews` | `bank.ts:244`, doc shown |
    | `vaultListing.world.boxRefreshMillis` | `bank.ts:44` |
    | `boxListing.world.sealStampedString` | `vault.ts:271` |
    | `boxListing.world.demandUnlocked` | `vault.ts:363` |
    | `boxListing.world.scope` | `storable.ts:74`, where Vault inherits it |

    The emitted `.d.ts` keeps the Picks as written: `dist/shapes/shapes-vaultish.d.ts` has `VaultWorld = Pick<Bank, ...>`, and `dist/models/vault.d.ts` has `readonly world: VaultWorld`.
  * *No doc block lost*. The old `VaultWorld` interface's member docs (`requestCleartext`, `onPanic`, `boxRefreshMillis`) moved onto `Bank`'s props. The old `ListingWorld.tellBadNews` doc is covered by `Bank.tellBadNews` and `Vault.tellBadNews`, which have their own.
  * *`ListingOpts` stays handrolled*. `Z.infer` of `listingOpts` would type `vaultDB` as a bag of functions (the duck), not `VaultDB`.
  * *No per-listing options checks*. Neither `VaultListing` nor `BoxListing` adds an option, so "`listingOpts` extended by what each adds" is the world checks: `vaultWorld` and `boxWorld` extend `listingWorld`. `listingOpts` is strict, so a `world` passed among the options is refused.
  * *`leaseMillis` and `boxRefreshMillis` required of a vault's world*. Bank always sets both, and `Pick<Bank, ...>` says `number`. `Vault`'s `leaseMillis = DefaultLeaseMillis` fallback and `VaultListing`'s `boxRefreshMillis = this.maxMillisSinceRefresh` fallback were dead, so both are deleted. Test changes:
    * The vault-unlock test "judges by DefaultLeaseMillis where the world names no leaseMillis" became a bank test: no `autolockMinutes` gives `DefaultLeaseMillis`.
    * `vault.test.ts` now refuses a world missing either field.
  * *Fieldnames*. A refused world is a positional argument now, so its fieldnames read `vault_tok` and `scope.applabel`, not `world.vault_tok`. The box-listing test expects the new names.
* **Deviations**:
  * *The `BoxWorld` fake in `models-world.ts` casts once*. `Pick<Vault, ...>` gives `demandUnlocked(): Vault` and `ensureTimely(): Promise<Vault>`, polymorphic `this` resolving to `Vault`. The structural fake returns `standIn()`, which is `world as unknown as Vault`, with a `//` saying no box reads the answer. I set aside the alternative: handrolling `demandUnlocked(): unknown` in src would cost cmd-click on that member. This is an open question.
  * *Test helper returns*. The mutable `FakeBank` type is a mapped type in the helper; no library type was worth a dependency.
* **Discoveries**:
  * `halpimonfire.test.ts` and `loosened.test.ts` use both worlds too. They build the models world in `beforeEach`, so the vault world's clock, set later in the test, wins. That is safe as it stands.
  * Thread 7 (host functions wrapped in Bank's constructor): Bank's constructor is unchanged apart from `new VaultListing(this, { vaultDB, maxMillisSinceRefresh })`.
* **Suppressions**: none added. One `as unknown as Vault` cast in a test helper, as above.
* **For the Coach**:
  * The `standIn()` cast in the models-world fake: keep it, or should `BoxWorld` handroll `demandUnlocked(): unknown` at the cost of cmd-click on that member?
  * The changeset is `minor`: the exported `Vault` and `Box` constructors lose their options argument.
