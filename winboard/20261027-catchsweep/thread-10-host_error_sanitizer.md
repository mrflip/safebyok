# Thread 10: host_error_sanitizer (2026-10-28)

Branch `20261028-host_error_sanitizer`, PR #333, cut from #328's tip `0e48262e` (#327, #330 and #328
have since merged, so the branch stands on `main`). Justify: green; core 3478 passed | 37 skipped
(64 files), react 310, convex 368 | 9 skipped, graphql 345 | 15 skipped, postgres 322 | 15 skipped,
indexeddb 167 | 11 skipped, root scripts 266; size budgets within limits.

Two renames the Coach ruled on 2026-10-28, names only; behaviour kept.

* **Built**: `packages/safebyok/src/sanitizer.ts` is `host-error-sanitizer.ts`, exported from
  `src/index.ts` as `HostErrorSanitizer` (was `Sanitizer`); `tests/sanitizer.test.ts` is
  `tests/host-error-sanitizer.test.ts`. `refusalFor` keeps its name. Followers: `proving.ts`,
  `passphrase-strength.ts`, `vault-opts.ts`, `tests/index.test.ts`; `safebyok-react`'s `modal.tsx`
  and `boundary.tsx`; `safebyok-convex`'s `convex-vault-db.ts`; `safebyok-graphql`'s
  `graphql-vault-db.ts`; `notes/guarantees.md`; `notes/security.md` (sonnet pass, identifier and
  path substitutions only, seven lines, no amendment markers added). Changeset
  `.changeset/20261028-host_error_sanitizer.md`, `safebyok` minor, names the namespace rename.
  `asStorageTrouble` (`outcome.ts`) is `storageTroubleOf`: `vault-db.ts`'s `adaptedHook` and
  `startedWatch`, `safebyok-graphql`'s `vault-resolvers.ts`, `tests/outcome.test.ts`,
  `tests/index.test.ts`, and three lines of `notes/security.md` follow. #330's changeset
  `.changeset/20261028-db_hooks.md` is amended to announce `storageTroubleOf`, so one release note
  never introduces a name and retires it; this thread's changeset carries no line for it.
* **Decisions taken**: the react, convex and graphql packages carry no changeset line of their
  own: they import the renamed names but nothing a host sees in them changes, and the packages
  release in lockstep. Prose that says "the sanitizer" (a comment in `convex-vault-db.ts`, a test
  title in `tests/index.test.ts`) stays: it is not a name.
* **Deviations**: the handoff said the PR describes itself as "Stacked on #328"; #328 merged
  before this thread opened, so the PR says it was cut from #328's tip and now stands on main
  (PROCESS.md reserves "Stacked on" for an unmerged PR).
* **Discoveries**: historic texts (`packages/*/CHANGELOG.md`, `human/` entries) still say
  `Sanitizer` and `asStorageTrouble`; left as records of what shipped or was seen. No
  `@ts-expect-error` or `eslint-disable-line` added.
* **For the Coach**: nothing needing a ruling. One open matter, below.

## Open questions

* **Historic mentions**: the spent `CHANGELOG.md`s and `human/` entries keep the old names.
  Rec: leave them.
