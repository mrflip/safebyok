# TODO

Three shelves. **Roadmapped**: the order we build in, in flight or next, each a sprint or a thread.
**Side quests**: straightforward, likely to be done, not needed yet; pick one up when the roadmap
is blocked. **Soonish**: wanted, but a design question stands in the way; the note says which.
What is reasonable but deferred is in `NOTYET.md`: do not anticipate it in your implementation.
**Potential Optimizations**: a user-facing rough edge the core leaves alone for now, to keep its
control flow simple (STYLE.md, *Control flow and refusals*), with the argument for smoothing it.

## Loud

What every adapter author and reviewer should have in front of them, and not lose in a shelf below.

* **The vaultDB closest to the database owns validation and consistency.** The Coach, 2026-10-22
  (the primitives sprint, on keeping both the checked `getVault` / `ensureVault` and the relaying
  `getVaultRecords` / `ensureVaultRecords` pairs): "the vaultdb closest to the database should
  handle validation and consistency checks. I don't mind if graphql does checks as well. But
  every vaultDB relies on the consistency guarantees of its backing store -- in the case that
  you're a facade on another vaultDB this is particularly easy." Today the base class checks every
  record each verb hands up, whichever layer it is: a facade (`safebyok-graphql`'s client, the
  Postgres route recipe's, the demo's outage adapter) re-checks what its inner VaultDB already
  checked, and the records pair relays it unchecked to be checked again in the browser. Settle
  where the one check lives (the adapter next to the storage, with the others trusting it), and
  strip the rest, once the stores' verbs have settled.

## Sand in the sandals

Small irritants, each a few lines, picked up by whoever is nearby.

* **Postgres `InsertBoxOutcome` typed loosely.** From the reform2 sprint
  ([#177](https://github.com/mrflip/safebyok/pull/177)'s review; the Coach: "add as todo"):
  `insertBox` in `safebyok-postgres/src/postgres-vault-db.ts` casts its row to a type naming only
  the four flags, its box columns untyped beside them. Type them, or return the box as
  one `row_to_json` column, next time Postgres is touched.
* **GraphQL's `'plain'` field class.** From the reform2 sprint
  ([#176](https://github.com/mrflip/safebyok/pull/176); the Coach: "yes", leave it for a later
  sweep): `safebyok-graphql/src/fields.ts` classes `sidecar` as `'plain'`, a code name that
  disagrees with VOCABULARY.md's *visible* (which notes the exception). Rename the class with
  the next GraphQL change.
* **`postgres` a required check, once it has run a while.** Ruled 2026-10-16
  ([#131](https://github.com/mrflip/safebyok/pull/131), the Postgres container): CI's `postgres`
  job runs the VaultDB battery, its races and the `23503` case over a real server, and is not
  required by the main ruleset until it has a record. The ruleset is the Coach's to change.
* **`node-compat (22)` a required check.** Ruled 2026-10-16
  ([#130](https://github.com/mrflip/safebyok/pull/130)): the job gates on Node 22, the platform
  floor (`engines`), and only reports on the newest Node. A workflow cannot make a check
  required; the ruleset is the Coach's to change.

## Roadmapped

In order. A later item that depends on an earlier one says so.

## Side quests

Straightforward, likely to be done, not needed yet. Each is a thread cut from `main`.

* **One test container for every backend.** The Coach (2026-10-16): a big container serving
  Convex (its local backend), Postgres, and each backend added later, used by CI as a service
  container and by a contributor locally. It is what the race battery
  ([#119](https://github.com/mrflip/safebyok/pull/119)) cannot do in-process: Postgres's
  one-statement writes under concurrent connections (one `pg` pool per device) are reasoned in
  sprint matters' thread 11 (`whiteboard/20261015-matters/thread-11-postgres_verdict.md`), not
  tested, and Convex runs against `convex-test`, not a real deployment. Decide: one image or a
  compose file of services; whether `e2e/` owns it; which suites run against it in CI and which
  stay in-process so `pnpm justify` needs no Docker.
* **A schema snapshot test for `format`.** Ruled 2026-10-16
  ([#115](https://github.com/mrflip/safebyok/pull/115)): any change to what a stored record may
  hold -- a field, a shape, or a range a check accepts -- bumps `format`. A test renders each
  stored schema with Zod's own `toJSONSchema`, keyed by its `format` literal, and fails with
  "bump `format`" when a schema changes under the same literal, so a loosened check (`.min(1)`
  to `.min(0)`) cannot ship unmarked.

* **`ShelfVaultDB`, a base for key-value stores.** Declined for the store-base sprint, ruled
  2026-10-16 ("agree, add as a TODO"; thread 5b, [#137](https://github.com/mrflip/safebyok/pull/137)).
  A connector over a list/get/put shelf writes one atomic step, and the base writes every verb on
  top of it, folding `localVaultDB` and `idbVaultDB` into it. It needs a short promise chain we
  would hand-roll, so it waits for a later design; the shared expectation checks of the store base
  are built, and this builds on them (`whiteboard/20261016-push_to_100_a/store-base-design.md`,
  while it stands).

* **A test that reads the Postgres README's route recipe.** From #252's review (the Coach took
  the Rec, 2026-10-22): the route recipe in `safebyok-postgres`'s README and the route its tests
  run are hand-kept copies, so the copy a host takes can drift from the one tested. Have the test
  read the README's code blocks and run those.
* **The Postgres README points past a server nobody wants.** The Coach (2026-10-22): rather than
  a hand-written route server, point to (a) the GraphQL client (`safebyok-graphql`) and (b) an AI
  prompt that builds a route for the host's own framework.
* **An agent skill set** for integrating safebyok (the Coach, 2026-10-22): skills a host's coding
  agent loads to wire a bank, a VaultDB and the dialogs into an app.
* **`bank.hello()` checks that the device store answers**, not only that the strength checker
  loads (the Coach, on #258: "scheduling is up to you").
* **The demo triggers the bank when Auth.js gets an identity** (the Coach, on #259): show the
  `BankProvider` keyed on the session's user, made once the identity is known.
* **The demo shows an account-like badge while the vault is unlocked** (the Coach, on #261):
  clicking it locks and signs out, with an in-place confirmation.
* **The React demo offers a format helper for the lease's deadline** (the Coach, 2026-10-22):
  `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` in the user's locale for
  `vault.askPassphraseAt`, as a `passphraseDeadlineText` ("Tue, Oct 27, 3:00 PM") and a
  `passphraseUntilText` ("in 2 days"); `askPassphraseAt`'s doc block already hints at them.
* **A forgetful user's start over clears only this device's copy** (the Coach, on #261: "low
  priority, make it a TODO"): without a passphrase, a user may forget the vault on this device
  (`bank.clearCachedVault` is that clear), never delete it from the vaultDB, which needs the
  passphrase (`vault.del()`).

## Soonish

Wanted; each has a design question to settle first, named here.

### Which wayins a rotation keeps

From [#105](https://github.com/mrflip/safebyok/pull/105) (the rotation design, section 9). The
first matter said rotation "re-wraps the remaining wayins", but it can't: each wayin's key
comes from a passphrase or a passkey touch the vault never keeps, and any shortcut would hand the
new vaultKey to the wayin being removed. So the design keeps only the wayins the user proves
during the rotation and removes the rest -- which is also what locks out a lost phone's passkey,
and signs every other device out until it is asked again. The alternative, a key pair per wayin
so rotation can re-wrap every wayin unasked (HPKE), is a new construction (the design's open
question 1). That design file is gone: the Coach (2026-10-18) removed it, "we will have a different
plan", so the question stands for the plan that replaces it.

The Coach (2026-10-16): wants to understand this better; land the recommendation for now. **Landed
as recommended**: thread 19 (`rotateVaultKey`, not yet built) keeps only the wayins proven during
the rotation.
Revisit before 1.0 if rotation signing every other device out is too blunt.

`softlock_gone` (2026-10-19) removed the schema rotation would have written: the vault props'
`prior_vault_key` (the vaultKey before, wrapped under the current one) and the check that it sat
one epoch below theirs. `trust_lines` (2026-10-21) removed `vault_key_epoch` from every record, and
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
"delete account" can report success while a vault stands. And after a refused `del()`, an
app's automatic retry deletes the vault that was made again in between. The Coach (2026-10-16):
assess these once the contract is tight and the tests unified -- that is, against
`packages/safebyok/VAULTDB.md` ([#107](https://github.com/mrflip/safebyok/pull/107)) and the
shared battery ([#114](https://github.com/mrflip/safebyok/pull/114)), after the Convex tests settle
in their home ([#111](https://github.com/mrflip/safebyok/pull/111)). First check whether big_feats
changed either.

### Lock timing vs. work in flight: what is left of the policy

The primitives sprint (2026-10-22 and 23) wrote the policy as a per-method contract: **a lock
spares only the transactional part.** A VaultDB write once sent completes or refuses as storage
decides; every step before it refuses `vault_locked`; a stale write refuses `stale_write`, never
`vault_locked`. The core README's *Locking* and the Contract tab's *A lock landing mid-call* say
it per call. What it leaves open, from the scenarios `softlock_gone` (2026-10-19) listed:

* **The device store throws when a lock erases the lease** (`lock()` refuses `storage_blocked` or
  `storage_unavailable`, the vault locked in memory): the lease on disk survives, and the next
  birth on this device takes it up. Decide whether a lease a lock failed to erase is marked, or
  the next birth asks first.
* **A sign-out with an unlock in flight in another tab**: harmless today, a lease being scoped by
  user id; confirm with a test once the React dialogs (thread 10) settle.

### Must the passphrase be asked again once a vault has a passkey?

The Gripefest doc's NOT YET row G530: whether asking for the passphrase again whenever a lease
expires is still the right demand once a vault has a passkey. (The question beside it, whether a
vault should hold several passphrases, was settled by the Coach on 2026-10-19: one passphrase and
at most one passkey, built in `slots`, B4a of the contract sprint.) Decide before the wayin
surface is 1.0.

### A passkey made for a refused `putWayin`

From the contract sprint's B4 (`put_wayin`): `vault.putWayin(passphrase, answer)` takes a passkey's
answer made before the call, so the core holds no UI and calls no host code inside the change. A
passphrase the vault then refuses -- a typo -- leaves that new passkey on the authenticator, a way
into nothing, and each retry makes another. The earlier `addPasskey(passphrase, makePasskey)` asked
the authenticator only once the proof held, at the cost of host code inside the call. Decide, once
the control flow is mature, whether the user experience earns a check of the passphrase ahead of
`createPasskey` (a separate call, or a maker again), or whether the README's note is enough.

### Identity should not be tied to the backing database

The Coach (2026-10-16), in a note to the push_to_100_a sprint: "Identity should not be tied to the
backing database." No design yet. Today a vault is found by the scope's `user_id`, which each
storage adapter reads from the host's own auth (a Convex subject, a Postgres `userId`, a GraphQL
context); the question is what a vault's identity is, so that a host can change its database
without orphaning vaults.

### Changing a vault's scope means a new vault

The Coach (2026-10-19, sprint contract): "changing scope requires a new vault from scratch:
vault_tok, applabel, user_id, vaultlabel are immutable." A vault's scope fields are fixed for its
life (a test holds every field its snapshot shows read-only), so renaming a vault, or moving it to
a new `user_id` -- an auth provider changed, accounts merged -- means making a new vault and
storing each whisper again, the old one's passphrase in hand. Decide whether safebyok offers that
move as a call, or documents it as the host's, alongside *Identity should not be tied to the
backing database*.

### A throwing `requestCleartext` is always `unexpected_error`

The Coach (2026-10-19, sprint contract, of `getProof`, which `requestCleartext` replaced): "a
throwing getProof is always unexpected_error: we need to allow more specificity." Today a throw
from the host's `requestCleartext` refuses every call waiting on the gating `unexpected_error`,
carrying nothing of what it threw (it may quote the passphrase: #262), so a dialog that fails for
a reason the host could name -- a lost user gesture, a passkey the platform refused -- cannot say
so. Decide what a `requestCleartext` may refuse with: a short list of kinds it may throw as
`VaultError`s, kept as they came, or a `gating.refuse(kind)` beside `decline()`.

### "Add "sensitive" and "host" flags to refusals"

The Coach (2026-10-21, sprint contract, on a key deriver's throw riding as `cause` where the
strength checker's carries nothing): "Leave it, we will audit these. Add todo: "Add "sensitive"
and "host" flags to refusals"". Today each wrap of a host function decides alone: a key deriver's
throw is its refusal's `cause`; the strength checker's, which heard the passphrase, is dropped
whole; its `load`'s, which heard nothing, rides as `cause`. Decide the two flags -- a refusal
that heard secret material, one whose cause is the host's own code -- and audit each wrap
against them.

### Redaction, batteries included

The Coach (2026-10-19, sprint contract): "redact with batteries included opts." A refusal's
`cause` chain carries a storage driver's own errors, which may name the database, a statement or a
parameter: `safebyok-graphql` hands the refusal on as its `GraphQLError`'s `cause`, for the
server's logs, so an in-process GraphQL host logs the chain whole. Offer options that redact it
-- a `cause` dropped, or cut to its class and message, at `vaultResolvers` or the logger -- on by
default, so a host gets the safe log without writing a formatter of its own.

### Call-time work that could be composed once or memoized

The Coach (2026-10-16), on thread 5b: `reportError` is checked at call time and stands, but review
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
reads, so until then it may stay unlocked on vault props that no longer stand (it fails safe at
that read: the key is dropped and the lease erased). `a_sec2` closed the one window where that
could outlast a read, a first unlock creating the vault as it is deleted. The Coach (2026-10-19):
"cross device invalidation should be done by a proper mechanism that is coming, where each device
authenticates a token when it joins or creates a vault." Not to be built piecemeal ahead of it: the
design question is the token, what storage checks it against, and how a deletion revokes it.

### A "newer, don't touch" state for boxes

From [#163](https://github.com/mrflip/safebyok/pull/163) (thread 5 and its review): a box has
no format version to read ahead of, so it has no newer-format state. A box in any format but
today's lists as damaged, and an app on an older safebyok shows a box written by a newer one as
damaged, where the user may delete it or store over it (only on the user's own action, never by
the vault). The Coach: "Yes add to TODO: version number on box." Give boxes a "newer, don't
touch" state like the vault's `newer_format`: the format tag read as a version, so that a newer
box lists as one to leave alone and an older, unreadable one still lists as damaged.

### Capacity on the Vault object, adopted from storage

The Coach (2026-10-22): `capacity` as an attribute of the Vault object an app reads, and the
Vault object adopting storage's capacity when a write refuses `vault_full` (the refusal's
`meta.capacity`), so the next check in this tab counts as storage does. Decide how an adopted
capacity ages, since a hello's listing recounts it.

### The stamp, not the scope, as a VaultDB request's parameter

The Coach (2026-10-22): each VaultDB verb takes the scope and an expectation beside it; a verb
could take the stamp (`{ ...scope, vault_tok, vault_epoch, gate_epoch }`) whole. And send the
authenticated immutable fields with puts and reads, so a server can refuse early what the ctx
would refuse late. Decide with the wire shapes (`safebyok-graphql`, the Postgres route), since
both are contracts a host's server and browser share.

### Whether `damaged_lease` calls `lock()`

The Coach (2026-10-22): a lease that will not unwrap is dropped and erased as `lock()` drops and
erases it, without calling `lock()`. Decide whether it calls `lock()` itself (ending a gating
standing, settling `lockLanded`), taking care that the lock does not recurse into the call that
met the damage.

### "Whisper unchanged" in `putBox`

The Coach (2026-10-22): a store that keeps the whisper reads and opens the box first
(`putBox({ boxlabel, sidecar })`, a whisper left out). Decide whether an active sentinel, or a
tighter entry point for a sidecar-only change, says so more plainly than an argument left out.

### Who holds the lease's expiry

The Coach (2026-10-22): only the passphrase proving, or a parent object, holding the lease's
expiry, rather than the Vault object's timer. Thread 8 of the primitives sprint weighed it and
kept the Vault object's; decide once the gating's chains settle.

### A policy for asking every time

The Coach (on #261: "figure out how to give that policy"): a host may want the user asked at
every call. `leaseHours` keeps its floor above zero, and a `renewMinutes` as long as the lease
refuses `bad_option`; today the host calls `lock()` once done. Decide how a host says "ask every
time", and what a lease of no length means for the device store.

## Potential Optimizations

### A storage read begun before a create can undo it

From the contract sprint's `a_sec2` ([#206](https://github.com/mrflip/safebyok/pull/206)): a
read of the vault props that began before this device's first unlock made the vault can land after
it, find no vault, and stand the new one down; the unlock then refuses `vault_locked`, though the
vault it made stands, and the next read takes it up. The Coach (2026-10-21):

> So: hello, in parallel, asks for props from VaultDB and DeviceDB; this makes sense, as a lot of
> normal conditions have both. There's a known situation -- very common, important and expected --
> where this will go badly. Namely, if the vault is new, one can conjecture that the chance of a
> race successfully completing a healthy vault in both deviceDB and vaultDB is more than
> theoretical, and that it would likely manifest by successfully retrieving the slower ground-truth
> VaultDB record but no DeviceDB record. We can, with certainty, (1) identify this situation; (2)
> guarantee that a re-fetched DeviceDB corresponds beyond doubt to the VaultDB record.

For now: "apologize for bad UX, keep control flow clean". The core stays hello, then unlock, then
the operation, with no re-fetch; the refusal says what happened and to unlock again.

## The react lifecycle

`BankProvider` makes its bank in an effect and hands it down with `setHeld` from that effect,
under a `react-hooks/set-state-in-effect` suppression (`safebyok-react/src/bank-provider.tsx`);
`useVault` asks for a vault in an effect of its own (thread 7b, 2026-10-22).
Thread A5 of the contract sprint ([#199](https://github.com/mrflip/safebyok/pull/199)) moved the
suppression to `setVault` and closed this section; the Coach (2026-10-19) reopened it: "Leave the
todo, this is a big problem. Don't need a fix, do need the caveat." The caveat for hosts is in
`safebyok-react`'s README (*Use*): the vault one render late, `null` on the first render and on the
server, a second render of the subtree per vault made, and calls on the old vault refused
`vault_closed` as a prop changes. Making the vault in render doubles its side effects under
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

