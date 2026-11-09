# Thread 1: conditional writes judge a validated row (2026-11-09)

Branch `20261109-validated_writes`, PR [#612](https://github.com/mrflip/safebyok/pull/612), stacked on [#610](https://github.com/mrflip/safebyok/pull/610). Justify green: core 2614, indexeddb 127, postgres 140, convex 244, fastkey 43, react 273, demo 96, graphql 269, e2e 349, safebyok-old 3537, idb-old 167, scripts 311.

* **Built**:
  * `shapes-storage.ts`: `isCheckedLiveVault` is `isLiveVaultRecord`; `isLiveBoxRecord`, `isVaultPutAllowed`, `isBoxPutAllowed` are new; `isLiveRowUnder` is gone. `isLifeOver` answers false for any row failing `vaultRow`.
  * All four adapters: `doPutVault`, `doPutBox`, `doDelVault`, `doDelBox` judge through those, and the four copies of `isPutAllowed` are gone.
  * `Listing.del` lost its damaged-duck branch. `landingActOf`'s comment no longer says a put lands over a damaged row.
  * The battery pins every adapter: `delBox`, `delVault`, `putBox`, `putVault` at the row's own revision refuse a row failing its check and leave it standing; `tidyGone` keeps the boxes under a vault row that fails `vaultRow` while peeking as a tombstone or another life.
  * `tests/shapes/row-formats.test.ts` writes each row's JSON schema to `tests/.snapshots/shapes/row-formats/<row>-fmt<N>.schema.json`.
* **Decisions taken**:
  * The shared check is two thin exports over one private `isPutAllowedOver`, which takes the `foundBoxRow` or `foundVaultRow` check. A row failing the check is `found.success === false`, and `isRowAt` (the only reader of the peek) runs after that check. Set aside: one export taking the row check as an argument, since an adapter would then have to pick the right validator.
  * `isRowAt` stays in `doDelBox` and `doDelVault` next to the `Record` checks rather than folded in, as the handoff spells them and because `doDelVault` needs `isOurs` and the revision apart.
  * The snapshot file holds `JSON.stringify` output with a trailing newline, one file per row per format number. A bump leaves the old file in place.
* **Discoveries**:
  * No test changed meaning. Nothing in any adapter's suite asserted the old peek landing, so the defect had no test either way; the new battery cases are the only coverage.
  * The new cases against the old source: 25 failed. `putBox` landed over all four flaws. `putVault` landed only over a tombstone-peeking flaw, as no host call passes `ifPresent: 'repl'`, so a live-peeking flawed vault was already refused. `delBox` over a tombstone-peeking flaw was already refused too; `delVault` and `tidyGone` landed.
  * `Zod.toJSONSchema` hides two things in the row shapes: `prfSalt`'s `refine` (the decoded salt's length, in the vault row's passkey wayin), shown as a plain `minLength: 1` string; and `sidecar`, a `custom` check shown as `{}`. A change to either passes the snapshot. Brands disappear too, harmlessly.
* **For the Coach**:
  * `VaultListing.del` (`models/vault-listing.ts:119`) still carries `(ante.am !== 'd')`, a sibling of the branch yanked from `Listing.del`. Outside this thread's named scope; left.
