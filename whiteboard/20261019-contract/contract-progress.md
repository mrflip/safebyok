# contract -- progress

The orchestrator's curated summary of what the threads have taught; newer than the plan wherever
they disagree. Workers look things up here; they do not write it.

## Line

*Orchestrator:* 0 `rename_pass` #193 (905b75ec) → A1 `outcome` #194 (35fdadb7) → A2
`vault_class` #196 (7b175db8) → A3 `fields_and_make` #197 (f924b90e) → A4 `try_twins` building. A1b `outcome_adapters` #195
(15b238fc) stands on A1 beside A2; it joins the line at the restack before phase B.

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

*Orchestrator:* from A1b (#195):

* Auth refusals pass through with `cause`: Postgres `42501` → `not_permitted`; a Convex host's
  `getUserId` may throw a `ConvexError` of kind `not_permitted`; GraphQL `FORBIDDEN` →
  `not_permitted`, and `vaultDBFor` may throw `not_permitted`/`identity_revoked`. `UNAUTHENTICATED`
  and 401/403 stay `storage_unavailable` (VAULTDB.md 5.5). The wire carries `kind`, not `family`.
* A Postgres driver error as `cause` carries PGlite's `query` and `params` (ciphertext); it stays on
  the server. Never let a `cause` cross a wire: the route recipe and GraphQL's `crossing` send only
  kind and message.
* **For C1:** `thread-A1b-c1-putbox.md` (on #195's branch) is how each backend does the one-statement
  conditional `putBox`: Postgres `UPDATE ... SET = CASE` / `ON CONFLICT DO UPDATE` with `RETURNING`
  (as `EnsureVaultPropsSql` does); Convex one mutation; GraphQL the winner as
  `extensions.meta.box_stored`.
* The battery runs here over PGlite (Postgres), the fake deployment (Convex, both clients), and
  GraphQL with PGlite behind it; that is the adapter proof this machine can give.

*Orchestrator:* from A2 (#196):

* `export class Vault` with `static make`, a private constructor, `parseMakeVaultOpts(opts)` (in
  `vault-opts.ts`) its first line. Public methods are bound arrow-function fields; private state is
  ES `#` fields and `#methods`. Section banners all kept (`[The handle]`, `[The Vault value]` gone).
* **The vault never reads its own state back through a public, writable property**: the review
  found `this.leaseMillis` and `this.hello()` read internally, which a host could overwrite on the
  handle; now `#leaseMillis` and `#hello()`. Every later thread keeps this discipline.
* A hand-made object no longer type-checks as a `Vault` (test doubles cast).
* Model classes (B1-B3) reach the vault's scope, clock, logger and deriver through accessors the
  vault grants; there is none yet.

*Orchestrator:* from A3 (#197):

* `make` touches nothing; the first `hello()` (the host's, or one any data call starts) reads,
  starts the watch (marked begun before the adapter is asked: an adapter may ring synchronously)
  and settles. `hello({ staleMinutes })`: default 1 minute from the last read by any call; `0`
  forces; concurrent calls share one read.
* Fields (the Contract's block plus `syncing`, `snapshot`, `leaseMillis`) are getters over a frozen
  snapshot that only `#settle()` writes. `VaultSnapshot` swapped `scope` for `applabel`,
  `user_id`, `vaultlabel`.
* `onBadNews`: every public async method wrapped by `#tellingBadNews`; each `bad_news` told once,
  before the call settles, never awaited; a throw or rejection (any thenable) lands in `trouble`.
  `trouble` is the latest bad news only. A listing's damaged box is news with `meta.box_listed`.
* **Lease take-up vs key change:** an `AbortController` per take-up (`#takeUp`), aborted by
  `#dropKey` and by `#grantLease` before it writes. An aborted take-up installs nothing and deletes
  no lease. This is the one place lock timing is decided before the policy session.
* The hello theme lives in `tests/vault/vault-hello.test.ts`; `rolledBackWorld` moved to `world.ts`.
* The react suite resolves `safebyok` through its `dist/`: rebuild the core first.

## Interim shims standing

*Orchestrator:* each is listed until a later thread removes it.

* `RefusalPolicy.heed` (`refusal-policy.ts`): every vault.ts store call goes through it, turning
  an Outcome back into a throw. A4 / phase C.
* `del-damaged-vault.ts` unwraps via `valOf`.
* The demo's `OutageVaultDB` `answered` helper, until `valOf` (or its successor) is exported (A4).
* GraphQL's `served` and the Postgres route recipe are not shims (A1b): a resolver reports failure
  only by throwing, and the route turns an Outcome into JSON by design.
