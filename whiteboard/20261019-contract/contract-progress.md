# contract -- progress

The orchestrator's curated summary of what the threads have taught; newer than the plan wherever
they disagree. Workers look things up here; they do not write it.

## Line

*Orchestrator:* main → #193 → #194 → #196 → #197 → #198 → #199 → #200 → #195 (phase A) → #201
B1 `proof_wayin` → #202 B3 `box` → #204 `a_fixes` → #203 `a_sec` → #205 B2 `lease` → #206 `a_sec2` → #207 B4a `slots` (048238e0: one passphrase, one passkey as slots on the vault props, format v5; `ruling-one_of_each.md`). → #208 B4 `put_wayin` (414e82ed: `putWayin`/`delWayin`, `Wayin.seal`, the optional `strengthChecker`, CUSTOMIZATION.md). → #209 B5 `placement` (47ab50be: private way-in constructors, internal `adorn`/`Ask.raise`, non-bag refusal, double-load refusal; the table in `thread-B5-placement-table.md` for pass 3). Phase B is complete; C1 `putbox_store` builds from #209, beside phase B's passes 1 and 2. `a_sec` was restacked onto #204
(ruled 2026-10-19: file as it stands); B2 cuts from it; `a_sec2` follows B2 and closes the create
window. Cross-device invalidation will come from a proper mechanism (each device authenticates a
token when it joins or creates a vault): don't build one ahead of it.

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

*Orchestrator:* from phase B so far (B1 #201, B3 #202) and the fix-ups:

* `src/proof.ts`: `Proof`, `PassphraseProof`, `PasskeyProof` (secret hidden on a frozen instance,
  `toJSON()` → `{ kind }`; `proof.wayinKeyFor(wayin)` derives into a non-extractable key, bytes
  zeroed). `PasskeyAnswer` is what a host hands in, `PasskeyProof` the checked class.
* `src/wayin.ts`: `Wayin` (`PassphraseWayin`, `PasskeyWayin`), `Wayin.make(vault, record, holder)`,
  statics `listOf`, `tryOpenAmong`, `sealPassphrase`, `sealFirstPassphrase`, `sealPasskey`
  (`(vault, proof, holder, stamp, vaultKey)`), `wayin.tryOpen(proof)`. `damaged_wayin` bad news
  with `meta.wayin_listed`.
* `src/box.ts`: `Box.make(vault, record, holder)`, `Box.seal(vault, boxlabel, whisper, holder,
  vaultKey, opts)` (internally `planSeal` then `sealPlanned`: the size check runs before any key
  is made), `box.tryOpen(vaultKey)`; the Zod schema is `BoxRecord`; `vault.openBox(box)`.
* **Models take the vault first and the props as `holder`.** The vault freezes every props record
  as it takes it up (`frozenVaultProps`); `holder`, `vault.props` and the snapshot's `props` are
  that one object. Never read `vault_id`/epochs off the public getters (they lag). The vault has
  public getters `logger`, `clock` (frozen, checked) and `keyDeriver`.
* `adorn`/`decorate` in `utils.ts` (the form of `adorn` awaits the Coach).
* `a_fixes`: `isCondition`, `renewMinutes`, `staleMinutes` 5; `isVaultError` knows another copy's
  refusal by a `Symbol.for('safebyok.VaultError')` mark; a locked vault refuses `bad_label` /
  `absent_box` before prompting, reading once on a listing miss.
* `a_sec` (unfiled): an ask's answer stands its attempts down (`#over`); a read that sees outrunning
  props takes them up at once and drops the key; host deriver/strength-test throws become
  `unexpected_error` (conditions pass through); react's `forBoundary` strips `cause`.

*Orchestrator:* from C1 (#213, ready 2026-10-21):

* `VaultDB.putBox(scope, expected, box, opts?)` is one conditional write per adapter and resolves the record as stored. `stale_write` carries the winner whole in `meta.box_stored` (`BoxRecord | DamagedBox | null`; the Coach's ruling, noted in `notes/security.md`), so the listing can be updated and the box opened without a read. `vault_mismatch` (new, condition) carries no meta; `invalid_box` (new) is mapped to `bad_record` at the vault.
* `meta.capacity` is not filled on storage's `vault_full`/`box_too_large` (a row: the vault fills it in C2). `BoxExpectation` stays the type of `expected`.
* putBox's arguments were reordered by codemod: spy assertions like `mock.calls[0]?.[2]` type-check at the wrong index, so grep for them on any reorder. Run GraphQL's tests through `pnpm --filter` (they need Postgres's `dist/`).

*Orchestrator:* from `b_simplify` (#214, ready 2026-10-21):

* Makers: `Wayin.seal(vault, holder, proof, stamp, vaultKey)`, `Box.seal(vault, holder, boxlabel, whisper, vaultKey, opts)`; `planSeal`/`sealPlanned` keep `(vault, holder, vaultKey, plan)` until C2 merges them into `Box.seal`.
* `Lease.grant(vault, holder, vaultKeyPair)` sets its deadline from `vault.clock.now() + vault.leaseMillis` (capped at `FarFuture`); `LeaseVault` has `leaseMillis`; `#deadlineFromNow` is gone and `#grantLease` arms the expiry from `lease.ask_passphrase_at`. Models read `clock`, scope and `leaseMillis` off the public handle (a row: freeze the handle).
* Way-in constructors are plain and public (`madeFrom` gone). The double-load check is gone: another copy's Box is refused `bad_record` by `Box.make`/`openBox`, `bad_option` by `Box.seal`'s `over` and `Proof.parse`.
* `no-misused-promises` runs with `checksVoidReturn: false` in all ten eslint configs. `notes/security.md`'s header makes amend-in-place (marked) the rule.

* *Orchestrator (`wayin_rules`, #215):* `Wayin.seal(vault, holder, proof, deviceId, vaultKey)` stamps the way in itself (epoch from the holder, time from `vault.clock`) and resolves only the way in; `WayinVault` gains `clock`. A create seals, writes, then opens its way in as stored to get the kept key (a second derivation). `PassphraseProof.checkStrongEnough()` calls back through a public `vault.strengthChecker` getter; the vault never reads `proof.passphrase`. `checkSaltShape` lives in `proof.ts`, run once at `newProofOf`. The default checker is `DefaultStrengthChecker` (internal), answering weak, logging nothing. A blank new passphrase is `weak_passphrase` (create and putWayin, before the checker); a blank proof is `wrong_passphrase`, refused in `PassphraseWayin.tryOpen` before any derivation. A new passphrase removes the passkey. `putWayin` resolves the summary of the way in it wrote (STYLE.md *Naming*: "`put` resolves what is stored"); `#reviseWayins` resolves the props it wrote; `VaultDB.putVaultProps` still resolves `void` (C7's). `safebyok/testing`'s `vaultSliceOf` carries `strengthChecker` and `clock`, with a `VaultSlice` type; `fromB64OrNull` is new in `crypto.ts`.

## Interim shims standing

*Orchestrator:* each is listed until a later thread removes it.

* `RefusalPolicy.heed` (`refusal-policy.ts`): every vault.ts store call goes through it, turning
  an Outcome back into a throw. A4 / phase C.
* `del-damaged-vault.ts` unwraps via `valOf`.
* `#refuseStalePutBox` (`vault.ts`, C1): after `vault_mismatch` the vault catches up with one read, then refuses `vault_locked` if that relocked it, else `stale_write`. `lean_core`/C2 remove the read.
* GraphQL's `served` and the Postgres route recipe are not shims (A1b): a resolver reports failure
  only by throwing, and the route turns an Outcome into JSON by design.

## Owed to the Contract tab

*Orchestrator:* carried 2026-10-19 (design doc rev ~2049): every ruling through B2's and B1/B3's
drift. Written only as *Decided, not yet built* notes, for their threads to make true: the lease
take-up leaving hello and the lazy hello everywhere (`lean_core`, a note in hello); the strength
checker's contract (B4, a note in make); putBox/delBox reading nothing before the write
(`lean_core`, a note in putBox). Left for the threads that build them: `putWayin` (the code has
`changePassphrase`/`addPassphrase`/`addPasskey`/`delWayin`; B4), `strengthChecker` (B4),
putBox's `over` and its returned Box (C2).
* *Owed again (2026-10-19):* `adorn(obj, ckey, val)` wherever the Contract shows `adorn`; once a_sec2 lands, `isVaultError` without the cross-copy mark (Shapes' paragraph).
* From a_sec2 (#206): `VaultSnapshot` and the handle lose `props`; `vault.wayins` is `WayinSummary[]`; `isVaultError` is `instanceof` plus the kind (no cross-copy recognition); `Lease.grant` throws on input a lease record cannot hold.
* From a_sec2's rework (#206): `RefusalMeta.vault_props_stored` removed; a handle refused `rolled_back` forgets its vault props and reads `opening` (row); `del()` refuses `rolled_back` after a forget (row). Storage's refusals and the host's share `VaultError`, so props never ride on `meta` (lean_core's path: `ensureVaultProps`'s good value; a VaultDB-level answer for a stale write).
* From B4a (#207): the vault props hold `passphrase` and `passkey | null` (v5); `last_wayin`, `too_many_wayins`, `wayin_id`, `wayinlabel` gone (strike from *Wayin*, *The policy*, *Refusals*); `absent_wayin` means only no passkey; another passkey's answer is `wrong_passkey`; the snapshot's `wayins` is `passphrase`/`passkey` summaries; only the standing passphrase proves a change.
* From B4 (#208): carry `thread-B4-put_wayin-contract.md` (putWayin/delWayin's full nesting, the strength checker) into the tab; *The policy* (a passkey replaces; the passphrase is never deleted); `Wayin.seal(vault, proof, holder, stamp, vaultKey)` resolving `{ wayin, sessionKey }`; `weak_passphrase` adds "a blank one handed to `putWayin()`"; *Shapes*' `cause?` is never a passphrase-hearing host function's throw; Refusals' `unexpected_error` row (no passkey maker; the checker's throw carries nothing); strike `too_many_wayins`, `last_wayin`, and `absent_wayin`'s `wayin_id` wording.
* From B5 (#209): `hello`/`ensureLease` Refuses gain the non-bag `bad_option`; *Shapes*: `adorn(obj, ckey, val)`, adorn/decorate internal, a second copy's Box or Proof refused `bad_option`; *Lease*: `tryOpen(holder)`, `grant(vault, holder, vaultKeyPair, askPassphraseAt)`.
* From the Coach's rulings (2026-10-21): *Refusals*' `unexpected_error` row corrected (no passkey maker; the checker's throw carries nothing); `lease.tryOpen` refuses `corrupt_record` for a damaged wrap or key; `Lease.make` refuses `corrupt_record` for a mangled or foreign record; `Proof.wayinKeyFor` takes a way in's header, duck-typed. **Not carried** (ruled): hello/ensureLease's non-bag `bad_option` ("Contract doesn't need to explain that functions validate their inputs"); Lease's signatures (the Coach rewrites Lease's contract). `meta.box_stored` carries the whole stored box (ruled; C1).
* From `b_fixes` (#212): an outrun `#grantLease` erases its lease (S2); `Wayin`/`Lease` `toJSON` give summaries (M3); D1 pinned as built (unlock refuses `storage_blocked`/`storage_unavailable` when the lease can't be written; the Contract's line is the row's).
* From the Coach's rulings (2026-10-21, second pass): strike `last_wayin`, `too_many_wayins`, `wayin_id`, `wayinlabel` from *Wayin*, *The policy* and *Refusals* ("remove obsolete information from the contract"); *The policy* made plain (a new passkey replaces; the passphrase is never deleted; a passphrase change removes the passkey, b_rulings); `weak_passphrase` covers a blank new passphrase, at create too (b_rulings); *Shapes*' `cause?` is never the throw of a host function that heard a passphrase; principle: every `put*` resolves what is stored, not what was sent.
* From the Coach's rulings (2026-10-21, third pass): another passkey's answer is `wrong_passkey` (B4a); `absent_wayin` removed (`wayin_api`); *Shapes*: B5's adorn lines (`adorn(obj, ckey, val)` attaches one hidden property and returns `val`; adorn/decorate internal; writable and configurable after `b_simplify`; the double-load line is moot); unlock refuses `storage_blocked`/`storage_unavailable` when the device can't keep a lease, and stays locked: "the contract is wrong"; `storage_blocked` moves from `lease.tryOpen` to `hello`; principle: the Contract says where a refusal is changed on its way, never that one passes through ("you don't need the contract to say that a refusal passes through, only to say where it's monkeyed with"), so putWayin's deriver-condition line is dropped; Vault.make's `strengthChecker` section replaces the "decided, not yet built" note, written after `checker` lands (the wrapper, the load at hello).
