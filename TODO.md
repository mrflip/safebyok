# TODO

Three shelves. **Roadmapped**: the order we build in, in flight or next, each a sprint or a thread.
**Side quests**: straightforward, likely to be done, not needed yet; pick one up when the roadmap
is blocked. **Soonish**: wanted, but a design question stands in the way; the note says which.
What is reasonable but deferred is in `NOTYET.md`: do not anticipate it in your implementation.
**Potential Optimizations**: a user-facing rough edge the core leaves alone for now, to keep its
control flow simple (STYLE.md, *Control flow and refusals*), with the argument for smoothing it.

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

## Things that are buggiing coach

* "misuse" -> "halting"
* consolidate crypto-related code into Pantry

## Audits

* where are errors thrown? Are we maintaining good hygeine of "always succeed and report" vs
  "look at reports and panic accordingly"?

* Sidecar data isn't "Public", it's "server accessible". We currently have too loose a treatment of it in our documentation and
  that is, in places, leaking into the design

* VaultDB implementations are encouraged to store sidecar data as readable ('jsonb' not json-encoded-by-us text)

* revisiontoks - signed?

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
never changes until rotation is built, and a vault made anew has a new `vault_id`, which already
voids every box. Rotation adds an epoch back, with its own format bump, when it is built.

### "tombstone vaults; decide if the vault_id is a check -- the labels are meant to be the primary key"

The Coach (2026-10-21, sprint contract, on #216's row "Rollback check and del()"): "Add a todo
"tombstone vaults; decide if the vault_id is a check -- the labels are meant to be the primary
key"". Today a deleted vault leaves nothing behind, and a vault is found by its labels (applabel,
user id, vaultlabel) while `vault_id` is checked against the device's mark and on each write.
Decide whether a deleted vault leaves a tombstone, and whether `vault_id`
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

### Lock timing vs. work in flight: a policy is owed before 1.0

**`softlock_gone` (2026-10-19) removed the soft lock (`lockSoon()`), the minute past
`askPassphraseAt`, the in-handle lock counters and the device mark's lock generation.** Each decided
who wins when a lock lands while something is in flight. Today nothing decides: the last writer
wins, and the user may be surprised. The Coach's ruling: let these be annoyances until the store
reform is done, then write one defensible policy and tests to it, rather than re-deriving a
mechanism per case now. The scenarios, each with today's outcome:

1. `lock()` lands during an unlock's derivation or its lease write, same handle: the unlock
   finishes; the vault is unlocked and a lease written. A `lock()` while a `hello()` reads the
   lease is the exception: since the contract sprint's A3 (a stale hello re-reads the lease, so
   this became routine) a key dropped or replaced during a lease take-up aborts it, and the hello
   takes nothing up.
2. The same, the lock in another tab on this device: as 1; the lease write is no longer refused.
3. A read's fetch or decipher straddles a lock: refused `vault_locked` if no key is in hand when
   the whisper is ready; handed back if another unlock has put a key in hand meanwhile.
4. A store sealed before a lock lands after it: it lands (it needs no key after sealing).
5. The lease ends at `askPassphraseAt` mid-operation: as 3 and 4, with no grace; a store not yet
   sealed is refused.
6. The device store throws when a lock erases the lease: the lease survives; the next hello that
   reads afresh, or the next page load, takes it up.
7. A sign-out with an unlock in flight in another tab: as 2; harmless, since a lease is scoped by
   user id.

The policy session decides, for each, what the vault promises, and writes the test first. The
tests this removal deleted, verbatim and by theme, each with the lesson it carried, are its
checklist: `softlock_gone-removed-tests.md` in the thread's folder (`20261019-softlock_gone/`,
under `whiteboard/` or, once closed, `winboard/`). It also
answers the question this entry replaces (*Lock NOW vs soft lock*, from
[#106](https://github.com/mrflip/safebyok/pull/106)): whether `lock()` claws back a store already in
flight.

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
vault_id, applabel, user_id, vaultlabel are immutable." A vault's scope fields are fixed for its
life (a test holds every field its snapshot shows read-only), so renaming a vault, or moving it to
a new `user_id` -- an auth provider changed, accounts merged -- means making a new vault and
storing each whisper again, the old one's passphrase in hand. Decide whether safebyok offers that
move as a call, or documents it as the host's, alongside *Identity should not be tied to the
backing database*.

### A throwing `getProof` is always `unexpected_error`

The Coach (2026-10-19, sprint contract): "a throwing getProof is always unexpected_error: we need
to allow more specificity." Today the answer is checked once, as the vault raises each ask (`src/ask.ts`): a
throw from the host's `getProof` becomes `unexpected_error` (misuse), whatever it threw, so a
dialog that fails for a reason the host could name -- a lost user gesture, a passkey the platform
refused -- cannot say so. Decide what a `getProof` may refuse with: a `VaultError` it throws kept
as it came (as `outcomeOf` keeps one elsewhere), a fourth answer, or a short list of kinds.

### "Add "sensitive" and "host" flags to refusals"

The Coach (2026-10-21, sprint contract, on a key deriver's throw riding as `cause` where the
strength checker's carries nothing): "Leave it, we will audit these. Add todo: "Add "sensitive"
and "host" flags to refusals"". Today each wrap of a host function decides alone: a key deriver's
throw is its refusal's `cause`; the strength checker's, which heard the passphrase, is dropped
whole; its `load`'s, which heard nothing, rides as `cause`. Decide the two flags -- a refusal
that heard secret material, one whose cause is the host's own code -- and audit each wrap
against them.

### Should `tryClose` be a promise?

The Coach (2026-10-19, sprint contract): "should tryClose really be a promise." Every `try` form
resolves its `Outcome`, but `tryClose()` answers one at once, because `close()` stays synchronous
for React's effect cleanup (thread A4). Decide with phase C's close (C5): whether `tryClose`
resolves, as its twins do, and whether a close waits for the calls it refuses.

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

`VaultProvider` makes its vault in an effect and hands it down with `setVault` from that effect,
under a `react-hooks/set-state-in-effect` suppression (`safebyok-react/src/vault-provider.tsx`).
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

