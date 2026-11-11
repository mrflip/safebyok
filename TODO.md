# TODO

Three shelves. **Roadmapped**: the order we build in, in flight or next, each a sprint or a thread.
**Side quests**: straightforward, likely to be done, not needed yet; pick one up when the roadmap
is blocked. **Soonish**: wanted, but a design question has to be settled first; the note says which.
Work that is reasonable but deferred is in `NOTYET.md`: do not anticipate it in your implementation.
**Potential Optimizations**: a user-facing rough edge the core leaves alone for now, to keep its
control flow simple (STYLE.md, *Control flow and refusals*), with the argument for smoothing it.
* Boxscope was somehow called out as an exception without VaultScope getting it -- the thread to revert this must have died. MAke it BoxScope and BoxScopepath everywhere (also any zod checkers or var names)

What is the difference between refusals and errors

Assess the vaultDB integrity checks contract for gate verbs

## Loud

Add a helper like objStrict, objDuckish, implementing the duckish type (an otherwise-strict type allowing certain specified fields that are validated, ignored and stripped)

Items every adapter author and reviewer should keep in front of them, so they are not lost in a shelf below.

DeviceDB intelligently handles versioning of cached objects on LWW among records with same version

* **The vaultDB closest to the database owns validation and consistency.** The Coach, 2026-10-22
  (the primitives sprint, on keeping both a checked and an unchecked form of each get): "the vaultdb closest to the database should
  handle validation and consistency checks. I don't mind if graphql does checks as well. But
  every vaultDB relies on the consistency guarantees of its backing storage -- in the case that
  you're a facade on another vaultDB this is particularly easy." Today the base class checks every
  record that each verb returns, in whichever layer it runs: a facade (`GraphQLVaultDB`, the demo's
  outage adapter) checks again what the vaultDB behind it already checked; the GraphQL server calls
  the hosted vaultDB's `try*` verbs, and its client checks the answers again in the browser. Decide
  where the single check belongs (in the adapter next to the storage, with the other layers trusting
  it), and remove the rest, once the VaultDBs' verbs have settled.

## Sand in the sandals

Small irritants, each a few lines, picked up by whoever is nearby.

* **Postgres `InsertBoxOutcome` typed loosely.** From the reform2 sprint
  ([#177](https://github.com/mrflip/safebyok/pull/177)'s review; the Coach: "add as todo"):
  `insertBox` in `safebyok-postgres/src/postgres-vault-db.ts` casts its row to a type that names
  only the four flags and leaves the box columns untyped. Type them, or return the box as
  one `row_to_json` column, the next time the Postgres adapter is changed.
* **`postgres` a required check, once it has run a while.** Ruled 2026-10-16
  ([#131](https://github.com/mrflip/safebyok/pull/131), the Postgres container): CI's `postgres`
  job runs the VaultDB battery, its races and the `23503` case against a real server, and is not
  required by the main ruleset until it has a track record. The ruleset is the Coach's to change.
* **`node-compat (22)` a required check.** Ruled 2026-10-16
  ([#130](https://github.com/mrflip/safebyok/pull/130)): the job gates on Node 22, the platform
  floor (`engines`), and only reports on the newest Node. A workflow cannot make a check
  required; the ruleset is the Coach's to change.

## Roadmapped

In order. A later item that depends on an earlier one says so.

* **A void vault in place of the create dialog.** The Coach, 2026-11-07 (thread 11 of the react_new
  sprint, [#578](https://github.com/mrflip/safebyok/pull/578)): a vault not yet stored starts as a
  tombstone, as a box does, so `bank.ensureVault` never opens a dialog by itself. A thread of its
  own, after the react_new sprint. Meanwhile the React layer works around it: `useVault` never
  asks, and the first click that needs the vault creates it.

* **A bank's hello could load far more efficiently.** Today it reads every box three times, and whole. The plan, and
  what each step saves, is in whiteboard/20261108-query_efficiently/query_efficiently.md. Its cost is
  worked out in notes/reference-sizes.md, *A bank hello on Convex*. To be done after the fate makeover.

## Side quests

Straightforward, likely to be done, not needed yet. Each is a thread cut from `main`.

* **The dialogs' phrases, sent in by the host.** The Coach, 2026-10-24 (on
  [#265](https://github.com/mrflip/safebyok/pull/265), ruling that what the user types to open the
  vault shows as "Vault unlocker"): "TODO: an i18n friendly way to send in phrases displayed".
  Every word safebyok-react shows is in `src/helpers/messages.ts`, in English only, and each sentence
  that varies is a template around its variable part. Give a host a way to supply its own phrases
  (for example, a locale's bag of phrases passed through `BankProvider` and the dialogs), so that a
  translation, or the host's own term in place of "Vault unlocker", needs no fork.
* **One test container for every backend.** The Coach (2026-10-16): a big container serving
  Convex (its local backend), Postgres, and each backend added later, used by CI as a service
  container and by a contributor locally. It would cover what the race battery
  ([#119](https://github.com/mrflip/safebyok/pull/119)) cannot test in-process: Postgres's
  one-statement writes under concurrent connections (one `pg` pool per device) are argued for in
  thread 11 of the matters sprint (`winboard/20261015-matters/thread-11-postgres_verdict.md`) but
  not tested, and the Convex tests run against `convex-test`, not a real deployment. Decide: one image or a
  compose file of services; whether `e2e/` owns it; which suites run against it in CI and which
  stay in-process so `pnpm justify` needs no Docker.
* **A schema snapshot test for `format`.** Ruled 2026-10-16
  ([#115](https://github.com/mrflip/safebyok/pull/115)): any change to what a stored record may
  contain -- a field, a shape, or a range a check accepts -- bumps `format`. A test renders each
  stored schema with Zod's own `toJSONSchema`, keyed by its `format` literal, and fails with
  "bump `format`" when a schema changes under the same literal, so a loosened check (`.min(1)`
  to `.min(0)`) cannot ship unmarked.

* **`ShelfVaultDB`, a base for key-value databases.** Declined for the store-base sprint, ruled
  2026-10-16 ("agree, add as a TODO"; thread 5b, [#137](https://github.com/mrflip/safebyok/pull/137)).
  A connector for a list/get/put shelf implements one atomic step, and the base implements every
  verb on top of that step, which would fold `localVaultDB` and `idbVaultDB` into it. It needs a
  short promise chain that we would have to hand-roll, so it waits for a later design. The store
  base's shared expectation checks are built, and this builds on them
  (`winboard/20261016-push_to_100_a/store-base-design.md`, while that file lasts).

* **A test that reads the Postgres README's route recipe.** From #252's review (the Coach took
  the Rec, 2026-10-22): the route recipe in `safebyok-postgres`'s README and the route its tests
  run are hand-kept copies, so the copy a host takes can drift from the one tested. Have the test
  read the README's code blocks and run those.
* **The Postgres README should not offer a hand-written route server.** The Coach (2026-10-22):
  instead of one, point to (a) the GraphQL client (`safebyok-graphql`) and (b) an AI
  prompt that builds a route for the host's own framework.
* **An agent skill set** for integrating safebyok (the Coach, 2026-10-22): skills a host's coding
  agent loads to wire a bank, a VaultDB and the dialogs into an app.
* **`bank.hello()` checks that the DeviceDB responds**, not only that the strength checker
  loads (the Coach, on #258: "scheduling is up to you").
* **The demo triggers the bank when Auth.js gets an identity** (the Coach, on #259): show the
  `BankProvider` keyed on the session's user, made once the identity is known.
* **The demo shows an account-like badge while the vault is unlocked** (the Coach, on #261):
  you can click it to log out with an in-place confirmation.
* **The React demo offers a format helper for the lease's deadline** (the Coach, 2026-10-22):
  `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` in the user's locale for
  `vault.askPassphraseAt`, as a `passphraseDeadlineText` ("Tue, Oct 27, 3:00 PM") and a
  `passphraseUntilText` ("in 2 days"); `askPassphraseAt`'s doc block already hints at them.
* **A forgetful user's start over clears only this device's copy** (the Coach, on #261: "low
  priority, make it a TODO"): without a passphrase, a user may forget the vault on this device
  (`vault.lock()` forgets the lease, which is all a device keeps), but may never delete it from the
  vaultDB: `vault.del()` needs the passphrase.

* **After the restyle (#273 to #283): two later changes.** Each changes a signature or a
  refusal, so each waited for its own PR. `Box.seal` still accepts the two epochs from its caller
  without checking them; reading them from the vault's own record would remove the argument. A
  `damaged_wayin` refusal's meta and a Wayin's JSON still carry the older wayin summary with
  `vault_tok`, whereas the snapshot shows each wayin as its sparse shape.
* **The names' byte-size refusals are unreachable.** Since the restyle (#273) names are short
  labels, so their share of the vault's byte check and of `box_too_large` cannot be reached from
  a vault. The code stays until the box-limit code is next changed; drop it then.

## Soonish

Wanted; each has a design question to settle first, named here.

### Postgres notice channels: long user_ids fail, and the listener never unlistens

The Coach (2026-11-06, the sprint's Open Matters and chat): "one channel per user, use the user_id,
demonstrate the shapes of user_id that fail, with the listener never unlistening ... I do not want
to change anything about how user_ids are handled. if the host hands us user_ids that are too long
they will fail. We will repair this gap soon. TODO it, along with "listener doesn't unlisten" which
are both big but acceptable gaps". Two gaps, both accepted for now:

* **A long user_id fails.** safebyok-postgres sends each notice on a channel named from the
  user_id, and a Postgres channel name is at most 63 bytes (`NAMEDATALEN` - 1). `pg_notify`
  refuses a longer one, so every write for such a user fails; `LISTEN` quietly truncates it. The
  adapter's tests show which user_ids fail (by byte length, multibyte characters counted in bytes).
  The repair is to be decided: a hash, a host-given channel id, or a tighter user_id.
* **The listener never unlistens.** The README's `listen` recipe runs `LISTEN` on a user's channel
  when that user's first watch opens and never `UNLISTEN`s, so one connection holds a channel for
  every user its server has watched since it connected. The repair is a count per channel, or
  unlistening on a schedule.

### Single-row damage moves to `damaged_rows`

The Coach (2026-11-06, the sprint's Open Matters, on the GraphQL schema): "No slot can hold a
damaged row except one named damaged_rows: [JSON!]!" ... "single row damage move to
damaged_rows". Today `listVaults` and `listBoxes` put a row that fails validation in
`damaged_rows`, but a get, put or del that meets such a row refuses with `damaged_row` and only
`meta.fieldnames`. The change: every answer has `damaged_rows`, and a single damaged row is
returned there whole, as plain JSON. The question to settle first is whether meeting a damaged row
is still a refusal (`damaged_row`, with the row in `damaged_rows`), as CLAUDE.md's "a data-integrity
failure met in a consistent state is reported by throwing" asks, or an ok answer that carries the
row. The orchestrator recommends keeping the refusal. The GraphQL schema (vaultdb_cleanup thread 8)
is shaped around it.

### Which wayins a rotation keeps

From [#105](https://github.com/mrflip/safebyok/pull/105) (the rotation design, section 9). The
first matter said rotation "re-wraps the remaining wayins", but it can't: each wayin's key
comes from a passphrase or a passkey touch the vault never keeps, and any shortcut would hand the
new vaultKey to the wayin being removed. So the design keeps only the wayins the user proves
during the rotation and removes the rest -- which is also what locks out a lost phone's passkey,
and signs every other device out until it is asked again. The alternative, a key pair per wayin
so rotation can re-wrap every wayin unasked (HPKE), is a new construction (the design's open
question 1). That design file is gone: the Coach (2026-10-18) removed it, "we will have a different
plan", so the question remains open for the plan that replaces it.

The Coach (2026-10-16): wants to understand this better; land the recommendation for now. **Landed
as recommended**: thread 19 (`rotateVaultKey`, not yet built) keeps only the wayins proven during
the rotation.
Revisit before 1.0 if rotation signing every other device out is too blunt.

`softlock_gone` (2026-10-19) removed the schema that rotation would have written: the vault props'
`prior_vault_key` (the previous vaultKey, wrapped under the current one) and the check that its
epoch was one below the vault props'. `trust_lines` (2026-10-21) removed `vault_key_epoch` from every record, and
storage's comparison of a box's epoch against the vault props', on the Coach's ruling: the vaultKey
never changes until rotation is built, and a vault made anew has a new `vault_tok`, which already
voids every box. Rotation adds an epoch back, with its own format bump, when it is built.

### "tombstone vaults; decide if the vault_tok is a check -- the labels are meant to be the primary key"

The Coach (2026-10-21, sprint contract, on #216's row "Rollback check and del()"): "Add a todo
"tombstone vaults; decide if the vault_tok is a check -- the labels are meant to be the primary
key"". Today a deleted vault leaves nothing behind, and a vault is found by its labels (applabel,
user id, vaultlabel) while `vault_tok` is checked against the device's mark and on each write.
Decide whether a deleted vault leaves a tombstone, and whether `vault_tok`
stays a check or the labels alone identify the vault.

### `del()`'s edge cases

From the Convex sprint ([#18](https://github.com/mrflip/safebyok/pull/18)): a handle that never
saw vault props resolves `del()` without deleting anything, even if a vault has since appeared elsewhere, so
"delete account" can report success while a vault is stored. And after a refused `del()`, an
app's automatic retry deletes the vault that was made again in between. The Coach (2026-10-16):
assess these once the contract is tight and the tests unified -- that is, against
the old design's [`VAULTDB.md`](https://github.com/mrflip/safebyok/blob/100256bb79797b80de9e7a9affd92073b49671f3/packages/safebyok-old/VAULTDB.md) ([#107](https://github.com/mrflip/safebyok/pull/107)) and the
shared battery ([#114](https://github.com/mrflip/safebyok/pull/114)), after the Convex tests settle
in their home ([#111](https://github.com/mrflip/safebyok/pull/111)). First check whether big_feats
changed either.

### Lock timing vs. work in flight: what is left of the policy

`packages/safebyok/tests/models/halpimonfire.test.ts` pins what each verb does when a lock lands: a VaultDB write
that has been sent completes or is refused as storage decides; a call still at a step before its write refuses with
`vault_locked`; a read that would return a whisper refuses; and a lock and an unlock each do their own work, in order,
so a lock that lands during an unlock's proof leaves the vault unlocked. Still open, from the scenarios that
`softlock_gone` (2026-10-19) listed:

* **The DeviceDB throws when a lock revokes the lease** (`lock()` refuses with `storage_blocked` or
  `storage_unavailable`, and the vault is locked in memory): the lease on disk survives, and the next
  birth on this device takes it up. Decide whether a lease a lock failed to revoke is marked, or
  the next birth asks first.
* **A sign-out with an unlock in flight in another tab**: harmless today, because a lease is scoped
  by user id.
* **A call is not refused when a lock lands during its opening hello** (the documentarian's run 2,
  [#312](https://github.com/mrflip/safebyok/pull/312)): the call then finds no lease and prompts
  the user, whereas a lock that lands one step later makes the call refuse with 'vault_locked'.
  Decide whether the opening hello is a step at which a lock makes the call refuse.

### Must the passphrase be asked again once a vault has a passkey?

The Gripefest doc's NOT YET row G530: whether asking for the passphrase again whenever a lease
expires is still the right demand once a vault has a passkey. (The question beside it, whether a
vault should hold several passphrases, was settled by the Coach on 2026-10-19: one passphrase and
at most one passkey, built in `slots`, B4a of the contract sprint.) Decide before the wayin
surface is 1.0.

### A passkey made for a refused `putWayin`

From the contract sprint's B4 (`put_wayin`): `vault.putWayin(passphrase, answer)` accepts a passkey's
answer made before the call, so the core has no UI and calls no host code inside the change. If
the vault then refuses the passphrase (a typo, say), that new passkey stays on the authenticator
and unlocks nothing, and each retry makes another. The earlier `addPasskey(passphrase, makePasskey)`
asked the authenticator only after the passphrase was proven, at the cost of running host code
inside the call. Decide, once the control flow is mature, whether the user experience justifies
checking the passphrase before `createPasskey` (as a separate call, or by passing a maker function
again), or whether the README's note is enough.
`safebyok-react`'s add-passkey dialog asks for the passphrase before `createPasskey` when the field
is empty (the Coach, 2026-11-07); a typo still leaves a passkey behind.

### Identity should not be tied to the backing database

The Coach (2026-10-16), in a note to the push_to_100_a sprint: "Identity should not be tied to the
backing database." No design yet. Today a vault is found by the scope's `user_id`, which each
storage adapter reads from the host's own auth (a Convex subject, a Postgres `userId`, a GraphQL
context); the question is what a vault's identity is, so that a host can change its database
without orphaning vaults.

### Changing a vault's scope means a new vault

The Coach (2026-10-19, sprint contract): "changing scope requires a new vault from scratch:
vault_tok, applabel, user_id, vaultlabel are immutable." A vault's scope fields are fixed for its
life (a test checks that every field its snapshot shows is read-only), so renaming a vault, or
moving it to a new `user_id` (because an auth provider changed, or accounts merged), means making a
new vault and storing each whisper again, which needs the old vault's passphrase. Decide whether
safebyok offers that move as a call, or documents it as the host's job, alongside *Identity should
not be tied to the backing database*.

### A throwing `requestCleartext` is always `unexpected_error`

The Coach (2026-10-19, sprint contract, of `getProof`, which `requestCleartext` replaced): "a
throwing getProof is always unexpected_error: we need to allow more specificity." Today, when the
host's `requestCleartext` throws, every call waiting on the gating is refused with
`unexpected_error`, which carries nothing of what was thrown (it may quote the passphrase: #262).
So a dialog that fails for a reason the host could name (a lost user gesture, a passkey the
platform refused) cannot say so. Decide what a `requestCleartext` may refuse with: a short list of
kinds it may throw as `VaultError`s, which are passed on unchanged, or a `gating.refuse(kind)`
beside `dismiss()`.

The same throw reaches `del()` (the documentarian's run 2,
[#312](https://github.com/mrflip/safebyok/pull/312)): once its write is sent, a `requestCleartext`
that throws becomes the gating's late landing, so a deletion storage then refuses reaches the
caller as 'unexpected_error', not 'vault_locked'.

### "Add "sensitive" and "host" flags to refusals"

The Coach (2026-10-21, sprint contract, on a key deriver's throw being kept as `cause` where the
strength checker's is dropped): "Leave it, we will audit these. Add todo: "Add "sensitive"
and "host" flags to refusals"". Today each wrapper of a host function decides separately: a key
deriver's throw becomes its refusal's `cause`; the strength checker's throw is dropped entirely,
because the checker was given the passphrase; a throw from its `load`, which is given nothing
secret, is kept as `cause`. Decide the two flags (one for a refusal from code that was given secret
material, one for a refusal whose cause is the host's own code) and audit each wrapper against
them.

### Redaction, batteries included

The Coach (2026-10-19, sprint contract): "redact with batteries included opts." A refusal's
`cause` chain carries a storage driver's own errors, which may name the database, a statement or a
parameter: `safebyok-graphql` passes the refusal on as its `GraphQLError`'s `cause`, for the
server's logs, so an in-process GraphQL host logs the whole chain. Offer options that redact it
(drop the `cause`, or cut it down to its class and message, at `vaultResolvers` or the logger), on
by default, so a host gets the safe log without writing a formatter of its own.

### A redacting or wrapped logger for what touches key material

The Coach (2026-10-24, on [#264](https://github.com/mrflip/safebyok/pull/264) dropping a key
deriver's throw as its refusal's `cause`): "It's fine. We will need to add something like redact or
to offer a wrapped logger for anything that touches the derived, cleartext, key or prf". Anything
that handles a derived key, cleartext, a key or a PRF answer -- a key deriver, a passkey's PRF, the
gating's dialogs -- may throw, or log, something that carries it. Decide between a redaction step
and a wrapped logger passed to such code, and what each strips. *"Add "sensitive" and "host" flags
to refusals"*, above, stays open alongside it: the flags say which refusals come from code that was
given secret material, and this item says what a log line about them may carry.

### Call-time work that could be composed once or memoized

The Coach (2026-10-16), on thread 5b: `reportError` is checked at call time, and that stays, but review
the package for other work done on every call that could be composed once when the vault or the
adapter is made, or memoized: a check of an option, a formatter, a validator built per call. Measure
first; maintainability beats speed unless something is shown slow.

### A wayin change racing this handle's own refresh

From thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132), `thread-4-refusals_and_catchup.md`,
*A pre-existing race*): during a change to the wayins, this handle's own bell refresh can read the
new vault props before `reviseWayins` sets it, judge the key `outlived`, drop it and discard the
lease. `grantLease` restores the key in memory, but that discard can land after the
new record, so the next open asks for the passphrase. The direction is safe, and serializing the
refreshes does not cure it. The Coach (2026-10-16): into the TODO, beside the multiple-passphrases
question. The fix, small: do not judge `outlived` against vault props this handle wrote itself.

### Cross-device invalidation, by a token each device authenticates

From the contract sprint's `a_sec2` ([#203](https://github.com/mrflip/safebyok/pull/203)'s second
review): a device learns that another deleted the vault, or changed its ways in, only when it next
reads, so until then it may stay unlocked on vault props that are no longer stored (it fails safe at
that read: the key is dropped and the lease revoked). `a_sec2` closed the only window in which that
could outlast a read: a first unlock that creates the vault while it is being deleted. The Coach (2026-10-19):
"cross device invalidation should be done by a proper mechanism that is coming, where each device
authenticates a token when it joins or creates a vault." Not to be built piecemeal ahead of it: the
design question is the token, what storage checks it against, and how a deletion revokes it.

### A "newer, don't touch" state for boxes

From [#163](https://github.com/mrflip/safebyok/pull/163) (thread 5 and its review): a box has
no format version to read ahead of, so it has no newer-format state. A box in any format but
today's is listed as damaged, and an app on an older safebyok shows a box written by a newer one as
damaged, after which the user may delete it or put over it (only on the user's own action, never by
the vault). The Coach: "Yes add to TODO: version number on box." Give boxes a "newer, don't
touch" state like the vault's `newer_format`, with the format tag read as a version, so that a newer
box is listed as one to leave alone and an older, unreadable box is still listed as damaged.

### Capacity on the Vault object, adopted from storage

The Coach (2026-10-22): make `capacity` an attribute of the Vault object that an app can read, and
have the Vault object adopt storage's capacity when a write is refused with `vault_full` (from the
refusal's `meta.capacity`), so that the next check in this tab counts the way storage does. Decide
how an adopted capacity ages, since a hello's listing recounts it.

### The stamp, not the scope, as a VaultDB request's parameter

The Coach (2026-10-22): each VaultDB verb takes the scope and an expectation beside it; a verb
could instead take the whole stamp (`{ ...scope, vault_tok, vault_epoch, gate_epoch }`). Also send
the authenticated immutable fields with puts and reads, so that a server can refuse early what the
ctx would refuse late. Decide with the wire shapes (`safebyok-graphql`, the Postgres route), since
both are contracts a host's server and browser share.

### Whether `damaged_lease` calls `lock()`

The Coach (2026-10-22): a lease that will not unwrap is dropped and revoked the same way `lock()`
drops and revokes it, but without calling `lock()`. Decide whether that path should call `lock()`
itself (which would end a pending gating and conclude `lockLanded`), taking care that the lock does
not recurse into the call that found the damage.

### The sidecar out of the seal (next)

The Coach (2026-11-10): "the sidecar is not supposed to be sealed, we should handle that next." Today the box's stamp, which both seals are
bound to, holds the sidecar as stable JSON, so a sidecar-only `putBox` must open the whisper and seal it again (`Box.#edit`), and needs
the vault unlocked. Take the sidecar out of the stamp. The core README says a sidecar is "authenticated but never encrypted", and only
the stamp authenticates it: say whether that promise is dropped, or what authenticates the sidecar instead. This replaces the 2026-10-22
question of how a `putBox` that leaves the whisper out is expressed.

### Who keeps the lease's expiry

The Coach (2026-10-22): have only the passphrase proving, or a parent object, hold the lease's
expiry, instead of the Vault object's timer. Thread 8 of the primitives sprint considered it and
kept the Vault object's timer; decide once the gating's chains have settled.

### A policy for asking every time

The Coach (on #261: "figure out how to give that policy"): a host may want the user asked at
every call. `autolockMinutes` has a minimum above zero; today the host calls `lock()` when it is
done. Decide how a host says "ask every time", and what a zero-length lease means for the DeviceDB.

### What "rollback" means

The Coach (2026-10-26): "We have a lot of things surrounding the very muddy meaning of rollback." The device watermark
is gone, and storage that rolls a record back is not detected beyond one session (`notes/wontfix.md`, 2026-11-07). What remains is
`gate_epoch`, `revision_seq` and `stale_write`, each guarding against a different kind of "going backwards". Settle one definition,
say which mechanism guards which case, and name each mechanism for its case.

### An edit is never put to the device cache

The Coach (2026-10-30, the storable sprint, thread 9): "yes, TODO". The models' listing puts an
instance to the device cache in its `align(thing)`, which runs on each delivery and each `build`;
`Storable.edit` aligns only the instance and does not notify the listing, so a staged edit that has
not been sent exists only in memory, and a reload restores the instance from the copy cached before
the edit: the edit is lost. The design question: whether `edit` should pass the thing to the
listing's `align` (the staged record holds the whisper sealed, never in the clear, so the copy is
safe to keep), and what a restored staged edit means when another device may have written a later
revision in the meantime.

### Flush and remake every instance of a vault made anew

The Coach (2026-10-30, the storable sprint, thread 9): "If box receives a record with a different
vault_tok it should throw unexpected error, I'm pretty sure we will want to flush all instances and
remake them". Today a storable's `vault_tok` is fixed at its birth, and a record with a different
`vault_tok` throws 'unexpected_error' from `reconcileCentral`, before any row, to the fetch, put,
del or build that delivered it, or to `onBadNews` from a notice or a refresh the timer launches.
Nothing remakes anything: the host must load the vault again. The design question: who notices that
a vault has been made anew (the vault listing on the vault's own record, or a box listing on its
first box), and how every instance of the old life is released, its listeners notified, and the
listing rebuilt under the new `vault_tok`, with its device cache cleared.

### An extended key structure for the deviceDB

The Coach (2026-11-07, on the devicedb_verbs thread): "I've got concerns about the key structure
(or I can put it more cheerfully: I believe that an extended key structure can ameliorate some
problems) but I'll leave that for later". Today a lease row is keyed by its scope (applabel,
user id, vaultlabel) alone, and its `vault_tok` is a field checked against the query: `peek`
checks it in the base, and `forget` leaves the check to the DeviceDB, which makes it in one atomic
step with its delete. A key that also included the `vault_tok` would make `forget` a delete at a
key, with no check to run. The design question: which fields the key includes, and what it
ameliorates beyond that.

### A cached lease newer than the vault in hand refreshes the vault

The Coach (2026-11-10): "We should not be dumb about loading from the cache." `Lease.buildFromCache` forgets a cached row whose
`gate_epoch` or `vault_tok` differs and asks for a proof, even though the row may be another tab's good lease for a vault of which this
tab has a stale copy; that behaviour is broken, and `lease.ts` marks it so. Write the lease transactionally, so that when a stowed lease
is newer than this tab's copy of the vault, by `vault_tok`, `gate_epoch` or the vault's revision, the vault is refreshed and the lease is
used. A lease carries no revision today.

### A fetch that meets a damaged row, and edge cases generally

A `fetch` that meets a damaged row refuses with `damaged_row` and leaves the listed instance in place, whereas a listing that meets a
damaged row vacates the instance (#618). Making the two agree would put a branch in `deliver`, which takes renames and deletions only. The Coach (2026-11-10): "I hate how much of
our code is given over to these edge cases. TODO it, there's got to be a better way." Look for the design that makes the listing's damaged-row,
absent and gone cases a single case instead of a branch each.

### A wontfix test pool

The Coach (2026-11-10): a pool of tests, each demonstrating that a row of `notes/wontfix.md` is what happens today; a row with no
such test is removed. The file's header says that what it lists is not tested; change that when the pool is added. The test that pinned
a vault row restored from before a passphrase change, deleted in [#617](https://github.com/mrflip/safebyok/pull/617), is the first to
bring back from history.

### Should we offer `getWhisper` and `decryptWhisper`

The old design's `vault.getWhisper` and `vault.useWhisper` returned a whisper in one call; today a host calls `getBox`, then
`box.extractWhisper` or `expose`. Decide whether the one-call forms are worth adding to the vault.

### Should we offer finer-grained timing around lease expiry and timeliness

The old design's `ensureUnlocked({ renewMinutes })` let a call say how much of the lease must remain. Today a host has `autolockMinutes` and
`boxRefreshMinutes` for the whole bank, and nothing per call.

### Other stores: `localVaultDB`, `domStore`, `memoryStore`

The old design ran a vaultDB over any `StringStore`. The new one has `MemoryVaultDB` and `safebyok-indexeddb`. Decide whether to bring
back a key-value vaultDB, likely with the `ShelfVaultDB` side quest above, for a host that has only `localStorage` or a test that wants one.

### The adapter contract, published

The old design's [`VAULTDB.md`](https://github.com/mrflip/safebyok/blob/100256bb79797b80de9e7a9affd92073b49671f3/packages/safebyok-old/VAULTDB.md) (removed with `safebyok-old`; the link is to the last commit that had it) is the only adapter
contract written for readers outside the project, and it describes the old verbs. Write its successor for `AdapterVaultDB` (what each verb promises,
and `describeVaultDBBattery` as its test);
`notes/design-vaultdb.md` is internal, and `safebyok-indexeddb`'s README is a template rather than a contract. The [old README](https://github.com/mrflip/safebyok/blob/100256bb79797b80de9e7a9affd92073b49671f3/packages/safebyok-old/README.md)'s guides on errors, locking,
logging, key derivation and passkey recipes have no new home either, and describe old behaviour, so each needs rewriting, not moving.

### A size budget, when we want one

`size-limit`, its `.size-limit.json` and `pnpm size:budget` were removed on 2026-11-09 as a distraction (the Coach: "we can add it later"). The removal
also took out the CI step and the per-thread budget rule in `PROCESS.md`.

## Potential Optimizations

### A storage read begun before a create can undo it

From the contract sprint's `a_sec2` ([#206](https://github.com/mrflip/safebyok/pull/206)): a
read of the vault props that began before this device's first unlock made the vault can finish
after it, find no vault, and drop the new vault's key as if the vault were gone; the unlock is then
refused with `vault_locked`, though the vault it made is stored, and the next read of the vault
props finds it. The Coach (2026-10-21):

> So: hello, in parallel, asks for props from VaultDB and DeviceDB; this makes sense, as a lot of
> normal conditions have both. There's a known situation -- very common, important and expected --
> where this will go badly. Namely, if the vault is new, one can conjecture that the chance of a
> race successfully completing a healthy vault in both deviceDB and vaultDB is more than
> theoretical, and that it would likely manifest by successfully retrieving the slower ground-truth
> VaultDB record but no DeviceDB record. We can, with certainty, (1) identify this situation; (2)
> guarantee that a re-fetched DeviceDB corresponds beyond doubt to the VaultDB record.

For now: "apologize for bad UX, keep control flow clean". The core's order stays hello, then
unlock, then the operation, with no re-fetch; the refusal says what happened and tells the user to
unlock again.

## Optimizations

### Improve tree shaking

Since the restyle moved the core to classic Zod (#274), small entry points bundle all of Zod for a
handful of checks: the mask entry grew from about 6 to 25 kB brotlied, and fastkey's WASM deriver from 16
to 35 kB. Inside an app that loads the Bank, Zod is shared and costs nothing more. Using
`zod/mini` selectively, in those entries alone, could slim them. The Coach (2026-10-26): if it
raised the standard bundle (an app loading the Bank) overall, it is not worth it.

## The react lifecycle

`BankProvider` makes its bank in an effect and passes it down with `setHeld` from that effect,
under a `react-hooks/set-state-in-effect` suppression (`safebyok-react/src/provider/bank-provider.tsx`);
`useVault` asks for a vault in an effect of its own (thread 7b, 2026-10-22).
Thread A5 of the contract sprint ([#199](https://github.com/mrflip/safebyok/pull/199)) moved the
suppression to `setVault` and closed this section; the Coach (2026-10-19) reopened it: "Leave the
todo, this is a big problem. Don't need a fix, do need the caveat." The caveat for hosts is in
`safebyok-react`'s README (*Use*): the vault arrives one render late, it is `null` on the first
render and on the server, the subtree renders a second time for each vault made, and calls on the
old vault are refused with `vault_closed` when a prop changes. Making the vault in render doubles its side effects under
StrictMode, and deferring a refused `Vault.make` brings back a late handle; a lifecycle redesign
(a store outside React that the provider subscribes to, say) may remove the need. (#166, thread 8
and review; a_fixes)

## Accessibility

The Coach (2026-10-18): "make a todo section for accessability, enter this there."

* **A screen-reader check of the `created_elsewhere` advice.** The dialog writes the advice in an
  alert region and then moves focus to the emptied field; a screen reader may announce the field
  and cut the advice off. Try it with VoiceOver before 1.0; if the advice is cut off, point the
  field's `aria-describedby` at the advice too. (#167 second review)

## RAGEBAIT

Moved to `NOTYET.md`, which holds the shelf.

