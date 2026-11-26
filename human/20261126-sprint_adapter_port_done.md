# Sprint adapter_port: done

The adapters that still ran on the old core took `-big` names and went private: `safebyok-convex-big`,
`safebyok-graphql-big`, `safebyok-postgres-big`, `safebyok-indexeddb-big` and `safebyok-react-big`. Their published
names passed to new-core packages. Convex (B, with E's delta watch) and GraphQL (C's design, D1's build) were ported
to the new core, and the new `safebyok-postgres` became standalone (F). G added `makePostgresListen`, H gathered the
cleanup, and a documentarian pass rewrote the doc blocks the reviews flagged. The Coach's rulings are in
`whiteboard/20261125-adapter_port/adapter_port-resolutions.md`.

## The PRs, in merge order

Merged: #916 `big_names` (A), #923 `convex_vault` (B), #931 `convex_deltas` (E), #930 `postgres_standalone` (F),
#914 `graphql_design` (C).

Open, one line on main, each with base `main` and its stack in its first line:

| PR | Thread | Stacked on |
|---|---|---|
| #932 | D1 `graphql_vault`: new-core `safebyok-graphql`, `GraphQLVaultDB` and `vaultResolvers` | main |
| #935 | G `postgres_listen`: `makePostgresListen(client)` for node-postgres | #932 |
| #936 | H `adapter_tidy`: unicorn 80 in postgres-big, the Postgres `read_tc` wontfix row, a phrase, refused write and birth acts checked | #935 |
| #938 | documentarian: the flagged doc blocks of convex, postgres, fastkey, graphql and the core's crossed checks | #936 |
| #913 | this sprint's plan and records (squashed): merging it merges the line | #938 |

## YOLO decisions

* D1 kept `try*` verbs from throwing: the Coach's "thrown on receipt" happens inside `GraphQLVaultDB`'s `do*`
  calls, so a caller meets the refusal as a bad answer (`tracked: 'unread'`), and a watch as `onEnded`, then
  `onBadNews`.
* D1: the extension that carries a refusal across the wire is named `safebyokErr`. A malformed ask stays a bad
  answer (`bad_record`); only a bad watch scope, whose core check throws, becomes a GraphQL error.
* D1: a bad watch scope refuses `bad_record`, the core's watch check's kind; big used `bad_scope`.
* G declined `pg-listen` (no per-watch counting, owns its own connection, JSON payloads, three runtime deps) and
  wrote a map of channels to watches over pg's own LISTEN and `escapeIdentifier`. No reconnection: a lost listener
  means a new `Client` and a new vaultDB, as the README says.
* H put `crossedRefusedWriteOf` and `crossedRefusedBirthOf` in the core's classifier, beside `crossedGotOf`, since
  the put table is private to it. A refused birth names one root, so only that root's put is checked.
* Core tests for the line's new exports landed on #932, not with the PRs that added the exports (the Coach: "No
  need to be fastidious on the PR commits").

## Still open

* **Your ruling:** the `notes/wontfix.md` row on two Postgres lists' `read_tc` order now matches the code
  (`uuidv7()` in the statement; order holds within one connection only). Its two alternatives, a lock per list and
  a UUID v7 built from a sequence, are the worker's wording, and the row still says it awaits a ruling.
* **The documentarian's questions (#938):** `convex.config.ts`'s `@example` has no test twin (no test can run a
  host's config); three Convex examples are twinned by tests that cover them indirectly, not by their literal code;
  no `@example` was added to `ConvexVaultDB` (a one-call constructor). Its `human/20261126-docblocks_adapters.md`
  lists each fact dropped; `openWatch`'s "the stream closes after the bad news that says why" is the one a reader
  might want back.
* **D2**, not started: the yoga recipe, a real-Postgres e2e harness for `PostgresVaultDB` (and `makePostgresListen`),
  the new GraphQL e2e suite, with `e2e/tests/graphql` becoming `e2e/tests/graphql-big`.
* **Left from reviews:** sloppy-input tests in safebyok-convex beyond `getThing` (#923); D1 minors 6 (checks beside
  their users, not in `src/shapes/`) and 10 (the `__typename` drop table, needed); two awkward `it` titles in
  `safebyok-graphql/tests/graphql-vault-db.test.ts` ("refuses a write's refusal whose act does not fit…").
* **A coupling:** safebyok-graphql's PGlite test helper uses safebyok-postgres's table names
  (`safebyok_*_things`), which are not exports. A rename there must update `tests/test-helpers.ts`.
* **A flake, not this sprint's code:** the core's `tests/minding/vault-minder.test.ts`, "sorts an answer's records
  while no one listens to it, so that they reach no one, then or later", failed once on CI's node-compat (22) for
  #935 at a1a0ae43c and passed on rerun.
* **`notes/security.md`** gained two entries this stretch, through their subagents: D1's (2026-11-25, what crosses
  the GraphQL wire) and G's (2026-11-26, the quoted channel in LISTEN and UNLISTEN).
