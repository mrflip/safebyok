# Thread A1b: outcome_adapters (2026-10-19)

Branch `20261019-outcome_adapters`, [PR #195](https://github.com/mrflip/safebyok/pull/195), stacked on
[#194](https://github.com/mrflip/safebyok/pull/194) (`20261019-outcome`). Justify: green. Tests: root 265, safebyok
2183 (+35 skipped), indexeddb 144, postgres 267, react 230, convex 272, fastkey 49, demo-react 199, graphql 261,
e2e 89 (96 skipped: live backends).

A1 had already made every adapter's verbs resolve Outcomes through the base (`outcomeOf` at the
public verbs) and changed the adapters' tests as far as justify needed. What was left was small:
the host's auth refusals passed through with `cause`, a test of line 5.6 per adapter, the demo's
two rejecting mocks, and the look-ahead notes. Nothing in the GraphQL schema changed shape, so
no result type was reshaped.

* **Built**:
  * **Postgres** (`postgres-vault-db.ts`): every statement goes through `sent`, which turns the
    database's own refusal, `42501` (a privilege the role lacks, or a row-level security
    `WITH CHECK`), into `not_permitted`, the driver's error as `cause`. Tests over PGlite with two
    guest roles (`TH.roleClient`): a role without the privilege to write a box, and one an RLS
    policy keeps from inserting; and a vault over the first stays unlocked and reads on.
  * **Convex**: `SafebyokErrorKindVals` gains `not_permitted`, which a host's `getUserId` throws as
    a `ConvexError` (`GetUserId`'s second example, tested). Every safebyok refusal from the
    deployment now carries its `ConvexError` as `cause`. `storage_unavailable` still carries
    nothing of Convex's error. The e2e ConvexReactClient copies of the looped tests follow.
  * **GraphQL**: a refusal crossing to the browser carries the GraphQL error as `cause`; a
    server's own `FORBIDDEN` is `not_permitted`; `UNAUTHENTICATED` stays `storage_unavailable`
    (VAULTDB.md 5.5: a token mid-refresh is not a user gone). A `vaultDBFor` that throws a
    VaultError of kind `not_permitted` or `identity_revoked` crosses as it is; any other throw is
    still the generic `bad_option` (a `postgresVaultDB` `bad_option` names the server's setup).
  * **Demo**: `VaultDashboard.test.tsx`'s `getVaultProps` and `delDamagedVault` spies resolve
    `TH.bad(...)`.
  * Each README's errors section and each doc block says the above; VAULTDB.md 5.6 names the
    pass-throughs; `notes/security.md` has an entry.
* **Decisions taken**:
  * **Convex refusals carry their `ConvexError` as `cause`.** The thread asks for `cause`; a
    refusal's ConvexError holds the function name, the request id and the `{ kind, message }`
    safebyok or the host wrote, never the call's arguments. The sanitizer still guards
    `storage_unavailable`, whose Convex error may quote them.
  * **Only `not_permitted` and `identity_revoked` cross from `vaultDBFor`.** These are the host's
    auth refusals; letting every VaultError through would send `postgresVaultDB`'s setup messages
    to the browser, which a test already forbids.
  * **`FORBIDDEN` maps; `UNAUTHENTICATED` and HTTP 401/403 do not.** `not_permitted` locks
    nothing, so mapping Apollo's convention costs little; `identity_revoked` locks the vault, and
    a 401 or `UNAUTHENTICATED` can be a token mid-refresh. An HTTP 403 may be a gateway's, not the
    host's rule. Two-way doors.
  * **Wire `kind` stays; `family` does not ride.** The VaultError constructor reads `family` from
    `kind` on each side, so carrying it is redundant and could disagree. A non-JS client would want
    it; none exists.
  * **Interim shims: none removed, one left.** GraphQL's `served` and the Postgres route recipe are
    not shims: a resolver reports failure only by throwing, and the route turns an Outcome into
    JSON, both the Outcome used as designed. The demo's `OutageVaultDB` `answered` (a wrapper
    VaultDB unwrapping its inner VaultDB's Outcomes) stays until A4 exports `valOf` or its
    successor; A1's `heed` and `del-damaged-vault` unwraps are A2/A4's.
  * **Tests changed their expectations where behaviour moved**: `vault-tables.test.ts`'s stranger
    role is now refused `not_permitted`, not `storage_unavailable`; Convex's `refusals.test.ts`
    counts `not_permitted` among the kinds again (it had been dropped earlier as unthrown).
* **Deviations**:
  * **The Postgres e2e battery did not run.** No Docker, no `postgres` binary, and no PGlite socket
    server in the workspace; adding one is a new dependency. The battery (`describeVaultDB`) runs
    against Postgres over PGlite in the package, against Convex over its fake
    deployment (ConvexClient here, ConvexReactClient in e2e), and against GraphQL executed in-process
    with PGlite behind. The e2e Postgres suites (battery, races, foreign key:
    96 skipped) typecheck and wait for CI's service container.
* **Discoveries**:
  * **An RLS policy that hides rows refuses nothing.** Postgres filters: the vault reads as
    absent, a write over a hidden row is `stale_write`, and a box write under a vault row the
    role cannot lock `FOR SHARE` is `stale_write` too. Only a missing privilege or a `WITH CHECK`
    violation errors. The README says so.
  * **A read-only role cannot unlock a vault**: unlocking calls `ensureVaultProps`, an
    `INSERT ... ON CONFLICT`, which needs `INSERT` and `UPDATE` on the vault table.
  * **`subscribe` still throws** `identity_revoked` synchronously in Postgres (`mustReach` in
    `doSubscribe`); A1 left `subscribe` outside the Outcome rule, since it returns an unsubscribe.
* **Contract drift** (proposed text; built to the Contract as written):
  * *VaultDB*, putBox's Refuses, `err.cause // what the backend threw`: add "where the adapter can
    carry it safely: Convex's `storage_unavailable` carries none, as Convex's own error may quote
    the call".

## Look-ahead for C1

How each backend would make `putBox` one atomic conditional write that reports what stands is in
[thread-A1b-c1-putbox.md](thread-A1b-c1-putbox.md), for C1's worker. In short: Postgres, one
statement whose miss locks the row (an `UPDATE` with a `CASE`, or `ON CONFLICT DO UPDATE`), so
`RETURNING` hands back the winner; Convex, one mutation; GraphQL, `extensions.meta.box_stored`.

## For the Coach

* **Postgres e2e not run here**, for want of a Postgres; see *Deviations*.
* The three two-way doors above: `cause` on Convex refusals, `FORBIDDEN` only, `family` off the wire.
