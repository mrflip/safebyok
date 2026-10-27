# Thread 11: wire_meta (2026-10-22)

Branch `20261022-wire_meta`, PR [#246](https://github.com/mrflip/safebyok/pull/246), stacked on #244. Justify: green (graphql 310 passed, 15
skipped; core 2769; postgres 297; convex 311; e2e 100); `pnpm size:budget` within every budget.

* **Built**: over GraphQL a write's refusal that learned something answers in the mutation's body,
  never in an error's `extensions`.
  * Schema (`packages/safebyok-graphql/src/vault-schema.ts`): `safebyokPutVaultProps` resolves
    `SafebyokPutVaultPropsAnswer { landed, refusalkind, message, vault_props_stored }` in place of
    a `Boolean!`; `safebyokPutBox` resolves `SafebyokPutBoxAnswer { landed, refusalkind, message,
    box_stored, capacity }` in place of a `SafebyokBox!`. The new `SafebyokStoredRecord` scalar
    carries a stored record as JSON, sound or damaged, as `SafebyokWayin` does.
  * Resolvers (`vault-resolvers.ts`): `served` takes an `inBody` hook. A `stale_write` (props or
    box) and a box write's `vault_full` answer `landed: false` with the kind, the calm message and
    what stands or `capacity`. Every other refusal still crosses as a GraphQL error whose
    `extensions` is `{ kind }` and nothing more; `metaCrossing` is gone.
  * Client (`graphql-vault-db.ts`): `doPutVaultProps` and `doPutBox` read the answer and throw the
    VaultError the server's VaultDB made, with the same `meta` (`refusalOfAnswer`). The core's
    `Result` and `err.meta` are untouched, and the conformance suite passes unchanged.
  * Tests: `vault-resolvers.test.ts` ("a write's answer in the body") pins the body on success and
    on both failures, no `errors` on them, and `extensions` of `{ kind }` alone for every other
    refusal, including a `stale_write` a VaultDB hangs a record on from a verb with no body;
    `graphql-vault-db.test.ts` pins the client's reading, and that an old-style error carrying
    `extensions.meta` is not believed.
  * README, doc blocks, a changeset (`safebyok-graphql` minor), `notes/security.md` entry.
* **Decisions taken**:
  * The shape mirrors Convex's `{ landed, refusalkind, ... }` answers (`PutBoxAnswer`), so the two
    adapters speak alike; the type name says "Answer" as Convex's doc blocks do.
  * Only refusals that carry something (`stale_write`, `vault_full`) move to the body. Others
    (`not_permitted`, `identity_revoked`, `vault_mismatch`, a `delBox`'s stale write) stay GraphQL
    errors: they carry no record, and a gateway's auth handling should keep seeing errors.
  * `capacity` moves too ("meta out of the error"): it is not a secret, but one rule is simpler
    than two, and `extensions` is then only ever `kind`.
  * `vault_props_stored` and `box_stored` are the opaque scalar, not `SafebyokVaultProps` /
    `SafebyokBox`: a damaged standing record would not satisfy the non-null fields and GraphQL
    would null the whole answer. The base class checks what arrives, as before.
  * On a landed props update `vault_props_stored` is null: the server's VaultDB returns only
    `true`, and the browser holds what it wrote. A landed box write carries the box as stored.
* **Deviations**: none from the Coach's ruling. The records verbs were not renamed (pending a ruling).
* **Discoveries**:
  * The Postgres route recipe (`packages/safebyok-postgres/README.md`) already answers a refusal
    in the JSON body as `{ refusal: { kind, message, meta } }` with status 200, not in an error
    channel, and Convex already answers `{ landed: false, ... }`; the demos have no GraphQL server
    of their own. None needed a change. The recipe's `meta` is a whole `RefusalMeta`, so it also
    carries `box_listed` / `wayin_listed` should an adapter's refusal have them; the core's VaultDB
    puts those on `damaged_*` refusals only. Worth a look in the end pass.
  * Residual: the records are now in the response `data`. A host that logs GraphQL responses
    would still log them; the README says so. A client-side urql cache never stores a mutation's
    answer by default document caching (mutations are not cached), so no change there.
* **For the Coach**: nothing blocking. Race flagged, not solved: none new; the stale-write answer
  is read in the same atomic step that refused the write, as before.
