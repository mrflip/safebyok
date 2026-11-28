# Thread 4: convex_fold (2026-11-26)

Branch `claude/bank-table-refactor-fr1ycq`, local only (no PR, by the handoff), on thread 1's `b29fb38`. Proved:
`pnpm --filter safebyok-convex` lint, typecheck and build green; test 6 files, 232 passed.

* **Built**: `safebyok-convex` on the two-root core. The component has two tables, `gate_things` and
  `box_things`, as Postgres has two; `bank_things` is gone, and `gate_things` gains `lifetok: v.string()`.
  `ThingTables` is `{ gate, box }`, so `tableOf` (through `Labelpath.modelkindOf`), `bankThingsIn` (stats)
  and `committedAfterIn` (the watch's `by_commit` ranges, one snapshot) read two tables with no change of
  their own. `rootsOf` reads the gate at `rootLabelpathsOf({ banklabel }).gate` and the root box; the
  banktok is `ManifestTags.banktokOf(gate)`, in every manifest and in `watchThings`, whose gate row is
  read at `Labelpath.gateOf(banklabel)`. `tracked` has the two entries `gate` and `box`. The validators'
  `rootRows` is `{ gate, root }`. `convex-vault-db.ts`, `server.ts`, `testing.ts`, `test.ts` and
  `_generated/` needed no change (the generated files name no table).
* **Tests**: every `bankThingOf` became `gateThingOf`, and `'actual.bank'` became `'actual.gate'`. A birth
  now notifies two Things, not three (the watch tests' counts moved by one), and a lone gate's notice
  carries its own lifetok as the banktok, as the core's `adapter-vault-db` test already expects.
* **Decisions made**: none open. The fold removes a table and a root; no branch was added.
* **Discoveries**: `pnpm --filter safebyok-convex test` once failed to import `safebyok-big/dist`
  while another worker was rebuilding it in the shared checkout; a rerun was green.
* **For thread 7**: `packages/safebyok-convex/README.md`, *What is stored*, still says "Three tables
  inside the component, one for each kind of Thing: `bank_things`, `gate_things` and `box_things`". Left
  for thread 7 (READMEs). Upgrading, for the changeset: a host with a deployed component must, before it
  deploys this version, clear all three tables on the dashboard's Data page (pick the `safebyok`
  component). `bank_things` is no longer in the schema, and Convex refuses to drop a table with rows (the README's own finding); an
  old `gate_things` document has no `lifetok`, so schema validation refuses the deploy; and an old
  `box_things` root box without a gate at the banklabel is a broken bank whose birth refuses. Vaults
  written before read as absent; no older shape is read.
