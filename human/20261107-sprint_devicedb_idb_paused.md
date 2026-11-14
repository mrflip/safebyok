# Sprint devicedb_idb: paused

Paused 2026-11-07, every remaining thread waiting on a restack.

* **Filed** (each reviewed, proved green, pushed, worktree removed): thread 1 devicedb_verbs #567;
  thread 3 storage_door #568 (on #567); thread 2 idb_devicedb #569 (on #568); thread 5
  idb_versions #570 and thread 4 graphql_schema #571, both cut from #569's tip, side by side.
* **Waits:** thread 6 docblock_trim touches files of both #570 and #571, so it is cut only from the
  top of a restacked line. The line: `/restacker main -> #567 -> #568 -> #569 -> #570 -> #571 -> #566`
  (#566 is the sprint PR, a draft). Expected conflicts: changesets and size budgets only, as #570
  touches IndexedDB/fastkey/salt and #571 GraphQL/the core's VaultDB interface; both touch
  `packages/safebyok/src/storage/index.ts` exports and the core changeset.
* **Open Matters** (the sprint doc, https://claude.ai/artifact/3qMSEQH3GzntNHvP5GnmXF): rows from
  threads 4 and 5 on drafting, none blocking the restack.
* **Worktrees:** the sprint's own, /workspace/byok-devicedb_idb; one stale harness worktree at
  /workspace/byok/.claude/worktrees/agent-ad78ff551c551866c (clean, locked by the session's own
  process, its branch deleted); /workspace/byok-closerlook2 (the vaultdb_cleanup Closer Look 2,
  kept until its triage).
