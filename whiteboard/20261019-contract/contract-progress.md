# contract -- progress

The orchestrator's curated summary of what the threads have taught; newer than the plan wherever
they disagree. Workers look things up here; they do not write it.

## Line

*Orchestrator:* phase A is filed as one line: main → #193 `rename_pass` → #194 `outcome` → #196
`vault_class` → #197 `fields_and_make` → #198 `try_twins` → #199 `react_over_class` → #200
`getproof` → #195 `outcome_adapters` (A1b, restacked on top: tip 19c0cc87). Phase B builds from
19c0cc87: B1 `proof_wayin` and B3 `box` beside each other; phase A's review passes 1 and 2 run
alongside; `a-fixes` comes on B's line once the passes report.

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

*Orchestrator:* from A4 (#198):

* Each public call: `readonly #tryX = this.#trying(async (...) => {...})`; `tryX = this.#tryX`;
  `X = this.#throwing(this.#tryX)`. `tryClose` answers synchronously. `valOf` and
  `unexpectedError` exported; `outcomeOf(thunk, otherwise?)`.
* A throw that is no `VaultError` is `storage_unavailable` only where an adapter's `do*` ran;
  elsewhere `unexpected_error` (misuse), **never logged** at the vault boundary (a host's strength
  test or key deriver was handed the passphrase).
* The VaultDB base refuses a `do*` hook's Outcome-shaped answer as `bad_option` (unwrap with
  `valOf`). Its verbs cannot use `#private` members (a duck-typed `Object.create(vaultDB)` breaks).
* `hello` ignores a non-plain-bag first argument (bare event handler).

*Orchestrator:* from A5 (#199) and A6 (#200):

* `useVault()` → `Vault | null`; `useVaultSnapshot()` → `VaultSnapshot | null`; `useOpenError()`.
  The provider makes the vault in an effect (a closed vault cannot reopen); StrictMode's
  rehearsal makes an inert one that reads nothing; handlers (`onBadNews`, `getProof`) are held by
  ref behind a gate per vault, closed in cleanup.
* `src/ask.ts`: `class Ask` (`why`, `vault`, `attempt`, `lockLanded`, one shared answer), made by
  `Ask.raise`, one AbortController per ask. `#ensureLease` is sequencing only. Every data call goes
  through `#ensureLease(0)`. `#tryAttempt(proof, opts, overtaken)` and `#unlockWith` are the unlock
  path (B4's `putWayin` reuses it). A lock/close/del under a prompt refuses waiters `vault_locked`,
  settles `lockLanded`, stands the attempt down; the attempt erases any lease it wrote and stands
  down any take-up first.
* The shipped dialog is the provider's default `getProof` (`getProof={null}` declines); it asks
  only while a user gesture is in hand. The provider tests live in `tests/vault-provider/`.
* Proof parsing is still at the vault's edge (`parseProof`), for B1 to lift.

## Interim shims standing

*Orchestrator:* each is listed until a later thread removes it.

* `RefusalPolicy.heed` (`refusal-policy.ts`): every vault.ts store call goes through it, turning
  an Outcome back into a throw. A4 / phase C.
* `del-damaged-vault.ts` unwraps via `valOf`.
* GraphQL's `served` and the Postgres route recipe are not shims (A1b): a resolver reports failure
  only by throwing, and the route turns an Outcome into JSON by design.
