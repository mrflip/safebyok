# contract -- progress

The orchestrator's curated summary of what the threads have taught; newer than the plan wherever
they disagree. Workers look things up here; they do not write it.

## Line

*Orchestrator:* 0 `rename_pass` filed (#193, 905b75ec). A1 `outcome` building on it.

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
* e2e's 94 live-backend tests skip without Postgres and Convex running, here as on main.

## Interim shims standing

*Orchestrator:* none yet. Each thread that leaves one names it in its thread file; it is listed
here until a later thread removes it.
