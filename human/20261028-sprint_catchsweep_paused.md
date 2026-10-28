# Sprint catchsweep: paused, every remaining thread waits on the Coach (2026-10-28)

Written by the orchestrator. Where things stand, so a fresh session can resume from the sprint doc
(https://claude.ai/artifact/2XNiTb8Eo76zTgan51x8KM) and `whiteboard/20261027-catchsweep/`.

**Merged** 2026-10-28 01:56: #316 trythrow, #317 where_prefix, #324 one_sanitizer, #321 store_trynames
(main `1f357d52`).

**Filed, restacked into one line** (each PR's base `main`; merging #328 merges all three):
* #327 vault_bank_flip, `32d91c7d`, on main.
* #330 db_hooks, `e7285b66`, on #327. Includes the Coach's "pass errors through" ruling for `vaultDBOf`.
* #328 read_names, `0e48262e`, on #330. Carries the restack's size-budget rerun and the trimmed
  trythrow/read_names release notes.

**Waiting on the Coach, reviewed, unfiled, in their worktrees:**
* Thread 9 saying_story, #331, `a984cea5` in `/workspace/byok-saying_story`, still on #327's old tip
  `c51b7274`. Rows: export `ConsistencyRefusal`; STYLE.md's glosses of the shapes rule; `Story` in
  VOCABULARY.md. On ruling: resume its worker with the rulings and the one-word "saying" fix in
  `.changeset/20261028-where_prefix.md`, second review of the new commits, rebase over #328, file.
* Thread 2 aead_narrow, #325, `5e486337` in `/workspace/byok-aead_narrow`, on #316's tip `a4bbef6b`.
  Rows: the two TOP rows (the inner cipher catch; `bad_record`), plus the store error name and the
  `deviceTrouble` tail. On ruling: resume its worker with the rulings and the two doc fixes (G8 clause
  as the checkable invariant; Lease/Box class docs narrowed to "past its argument checks"), second
  review, rebase over the top of the line, file; fold bank.ts's `refusalOf` copy onto outcome.ts's.

**Also for the Coach**, Open Matters rows: `asStorageTrouble` vs `storageTroubleOf`; STYLE.md's
`Stored-` wording; STYLE.md's "Read and open the box" lead verb; the two explained rows (Vault rewraps,
sanitizer.ts) reset to drafting.

**Cleanup** (the doc's Cleanup tab, *Finally*): documentarian passes over `vault-db.ts`/`device-db.ts`,
`outcome.ts`, `safebyok-graphql`'s `vault-resolvers.ts`, `safebyok-convex` prose and the "unreadable"
test titles; `ConsistencyRefusalShape.message`'s bare `custom`; `prerebase-*` tags to delete after the
merges; sweep *Resolved* into `catchsweep-resolutions.md`; close the sprint PR #314; remove the
worktrees `/workspace/byok-saying_story` and `/workspace/byok-aead_narrow` once they file.

**Resumed 2026-10-28**, later the same day: the Coach ruled every waiting row; threads 2 and 9 build their rulings, thread 10 (host_error_sanitizer, `storageTroubleOf`) is cut from the top of the line. This note stands as the record of the pause.
