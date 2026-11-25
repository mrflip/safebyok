# Thread C: graphql_design (2026-11-25)

Branch `20261125-graphql_design`, PR #914, stacked on #912. A docs-only PR, proved by `pnpm justify`: see the
PR's **Tests:** line.

The design is [graphql_vault-design.md](graphql_vault-design.md). Read its *Open questions* first.

* **Built**: a design for a new-core `safebyok-graphql`:
  * a client `GraphqlVaultDB` on `AdapterVaultDB`;
  * `vaultResolvers({ vaultDB, getUserId })` wrapping any `VaultDB`;
  * one operation per verb, plus `safebyokStats`;
  * a `safebyokWatchThings` subscription whose notices carry `{ record, banktok, read_tc }`, which is `Received`
    as #911 left it;
  * the wire forms, refusals, validation at each end, the carry-over table from `safebyok-graphql-big`, package
    layout and exports, the e2e plan, and a split into two build threads (D1 the package, D2 the recipe and e2e).
* **Decisions made** (each also an open question where it touches the wire):
  * **The wire answer is the vaultDB's own answer, less `ask`, with `err` reduced to an allowlist.** The client
    tells a thrown refusal from a refusal by act through the answer contract's own marker, `tracked: 'unread'`.
    For a thrown refusal it rethrows the crossed error, so its base class's `answerForThrown` makes the same
    answer. For a refusal by act it returns the Actual, and `answerOf` rebuilds the refusal.
  * **The client re-checks every record** with the classifier check a concrete adapter's report goes through. To
    the client, the server is its storage. Three such checks are private today (`shellAt`, `listedThingOf`,
    `rootStoredOf`), so D exports them from the classifier.
  * **Records, asks, `tracked` and the listing lists cross as `SafebyokJson`, under a typed envelope**
    (`ok`, `act`, `banktok`, `read_tc`, `err`). `track` and `tracked` could be typed (their keys are
    `bank`, `gate` and `box`), but each `tracked` value is a record or `'same'`, and the whole is `'unread'` on a verb
    that threw: GraphQL types that only with a union per root, over records already sent as JSON, so a typed `track`
    alone would leave the ask half-typed.
* **Deviations**:
  * The design proposes porting big's `crossedErr` and `vaultErrorOfCrossed` into the new core, rather than
    leaving them in the adapter, so that Convex (thread B) can share one allowlist.
  * The design renames `e2e/tests/graphql` to `graphql-big` and gives the new suite the old directory.
  * The design adds a real-Postgres harness for `PostgresVaultDB` to e2e. None exists yet.
* **Discoveries**:
  * The new core has no real-Postgres e2e for `PostgresVaultDB`. D2 builds the harness, and it could serve a
    plain Postgres vault suite too.
  * Big's `crossedErr` meta lacks `act` and `labelpaths`. The new core's thrown refusals carry both (`dubdel`,
    `policied`).
  * `AdapterVaultDB.tryBirthBank` computes its puts locally, so the client sends only the ask, and the server's
    vaultDB computes its own.
  * graphql-js builds a literal input object with a null prototype. The `SafebyokJson` scalar's `parseLiteral`
    must make plain bags. Variables arrive as plain JSON already.
* **Approaches set aside**:
  * **A thin server that ships raw rows for the client to classify.** A conditional write must be decided on the
    server in one step.
  * **Typed rows, as big has them.** Drift, `__typename` stripping and union quirks, for a wire whose one reader
    runs the core's checks anyway.
  * **An Actual-shaped wire.** It would put an internal shape on a public surface.
  * **A wire version.** Nothing binds backward before 1.0.0.
* **Rulings (the Coach, 2026-11-25)**: Q2 answer-shaped; Q3 every bad answer ("transparently carry the answer
  across"); Q4 one mutation; Q5 report it; Q6 `storage_issue`, and "don't catch errors just to rethrow" (only a
  failed check of what crossed refuses; no catch-and-relabel); Q7 `GraphQLVaultDB`. Q1 stays open. The design
  records each beside its question; its body still writes `GraphqlVaultDB` until D builds.
* **For the Coach**: eight open questions, Q1–Q8, in the design; Q2–Q7 are ruled (above), so Q1 (how typed) and Q8
  (the crossed-refusal check in the core) remain.
  D waits on the Coach's yes, on A, and on #905 and #911 reaching the line.
