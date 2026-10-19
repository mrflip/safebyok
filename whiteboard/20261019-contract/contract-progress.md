# contract -- progress

The orchestrator's curated summary of what the threads have taught; newer than the plan wherever
they disagree. Workers look things up here; they do not write it.

## Line

*Orchestrator:* 0 `rename_pass` filed (#193, 905b75ec); A1 `outcome` filed (#194, 35fdadb7). A1b
`outcome_adapters` and A2 `vault_class` building beside each other from A1's tip.

## Decisions and discoveries

*Orchestrator:* from thread 0 (#193):

* Names are final as the rename plan lists them. The error type was `VaultErrorKind`, not the
  preplan's `RefusalKind`; A1 renames it to `RefusalKind`, as the Contract's *Shapes* says.
* Wire forms keep `kind`: GraphQL `extensions.kind`, Convex `SafebyokErrorData.kind`, the Postgres
  route recipe's `refusal.kind`. A1b reshapes them with `Outcome` if at all.
* `StringStore` keeps `read`/`write`/`erase` (not in the plan); no thread renames it.
* No tombstone line in the `del` doc blocks yet: C3 writes it with the tombstone.
* Changesets are `minor` before 1.0 (a `major` on 0.4.0 publishes 1.0.0).
* `staleWrite` keys are `'box'` and `'del'`; `checkBox` is `checkStoredBox` (the linter reads
  "checkbox"); react's `ensureAvailable` is `checkAvailable`.
* e2e's live-backend tests (96 after A1) skip without Postgres and Convex; this machine has no
  Docker. Adapter work is proved by each package's own tests; a *For coach* row asks for a live run.

*Orchestrator:* from A1 (#194):

* `src/outcome.ts`: `Outcome`, `GoodOutcome`, `BadOutcome`, `good`, `bad`, `valOf`, `outcomeOf`.
  Exported: `outcomeOf`, the three types, `RefusalMeta`, `VaultErrorOpts`, `Capacity`, and
  `RefusalKind`, `RefusalKindVals`, `RefusalFamily`, `RefusalFamilyVals`, `RefusalFamilyForKind`.
  `valOf` is not exported yet (an Open Matters row: export it with A4's `X()` forms).
* `VaultError` has `family` (with `bad_news`: the six kinds the Contract marks) and `meta?`
  (`box_stored` typed `Box | null` until tombstones, `vault_props_stored`, `capacity`); nothing
  fills `meta` yet (C1 does).
* The `VaultDB` base wraps every public verb in `outcomeOf`; it is the one place an adapter's throw
  becomes an Outcome. It wraps the base's own checks too, so a bug reads `storage_unavailable`
  (an Open Matters row, for A4). `listBoxRecords` resolves an Outcome as well.
* `do*` hooks typed `Promise<unknown>` swallow an inner Outcome: a VaultDB wrapping another must
  unwrap (doc block says so; a runtime guard is proposed for A4).
* `isVaultCondition` means "not misuse" (`condition` or `bad_news`).
* `safebyok/testing`: `expectGood`, `expectBad`, `expectingGood(db)`, `good`, `bad`.
* Count tests as totals including skipped, per file, with a JSON reporter: passed-only figures
  look like a fall.

## Interim shims standing

*Orchestrator:* each is listed until a later thread removes it.

* `RefusalPolicy.heed` (`refusal-policy.ts`): every vault.ts store call goes through it, turning
  an Outcome back into a throw. A4 / phase C.
* `del-damaged-vault.ts` unwraps via `valOf`.
* GraphQL resolvers' `served`; the Postgres README route recipe and its test copy; the demo's
  `OutageVaultDB` `answered` helper. A1b removes what it can.
