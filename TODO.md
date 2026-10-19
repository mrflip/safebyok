# TODO

Three shelves. **Roadmapped**: the order we build in, in flight or next, each a sprint or a thread.
**Side quests**: straightforward, likely to be done, not needed yet; pick one up when the roadmap
is blocked. **Soonish**: wanted, but a design question stands in the way; the note says which.
What is reasonable but deferred is in `NOTYET.md`: do not anticipate it in your implementation.

## Sand in the sandals

Small irritants, each a few lines, picked up by whoever is nearby.

* **Postgres `InsertBoxOutcome` typed loosely.** From the reform2 sprint
  ([#177](https://github.com/mrflip/safebyok/pull/177)'s review; the Coach: "add as todo"):
  `insertBox` in `safebyok-postgres/src/postgres-vault-db.ts` casts its row to a type naming only
  the four flags, its box columns untyped beside them. Type them, or return the box as
  one `row_to_json` column, next time Postgres is touched.
* **GraphQL's `'plain'` field class.** From the reform2 sprint
  ([#176](https://github.com/mrflip/safebyok/pull/176); the Coach: "yes", leave it for a later
  sweep): `safebyok-graphql/src/fields.ts` classes `sidecar_json` as `'plain'`, a code name that
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
one epoch below theirs. `vault_key_epoch` stays on every record, reserved at 1, with storage's
comparison of a box's epoch against the vault props'.

### `del()`'s edge cases

From the Convex sprint ([#18](https://github.com/mrflip/safebyok/pull/18)): a handle that never
saw vault props resolves `del()` without retiring anything, even if a vault has since appeared elsewhere, so
"delete account" can report success while a vault stands. And after a refused `del()`, an
app's automatic retry retires the vault that was made again in between. The Coach (2026-10-16):
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
   lease likewise: the hello takes it up.
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

### Are we doing anyone a favor by accepting multiple passphrases?

From [#126](https://github.com/mrflip/safebyok/pull/126) (thread 6): `changePassphrase` takes any
proof, a passkey's included, and when a vault has several passphrases and the proof is a passkey,
the caller must name which to replace (`wayinId`), or the call is refused rather than guessing.
The Coach (2026-10-16): "keep as built, but this is too complicated for a user to tolerate or a
customer to implement UX for." Decide whether a vault should hold more than one passphrase at
all, or exactly one, with passkeys the other wayins. The Gripefest doc's NOT YET row G530 asks the
deeper question beside it: whether asking for the passphrase again whenever a lease expires is still the right demand once a
vault has a passkey. Decide both before the wayin surface is 1.0.

### Identity should not be tied to the backing database

The Coach (2026-10-16), in a note to the push_to_100_a sprint: "Identity should not be tied to the
backing database." No design yet. Today a vault is found by the scope's `user_id`, which each
storage adapter reads from the host's own auth (a Convex subject, a Postgres `userId`, a GraphQL
context); the question is what a vault's identity is, so that a host can change its database
without orphaning vaults.

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

### A "newer, don't touch" state for boxes

From [#163](https://github.com/mrflip/safebyok/pull/163) (thread 5 and its review): a box has
no format version to read ahead of, so it has no newer-format state. A box in any format but
today's lists as damaged, and an app on an older safebyok shows a box written by a newer one as
damaged, where the user may retire it or store over it (only on the user's own action, never by
the vault). The Coach: "Yes add to TODO: version number on box." Give boxes a "newer, don't
touch" state like the vault's `newer_format`: the format tag read as a version, so that a newer
box lists as one to leave alone and an older, unreadable one still lists as damaged.

## hello, make and the react lifecycle

The Coach (2026-10-18), on the make_hello sprint's review: "This sounds like a design issue, sweep
to a todo section for all of the below, hello and make and react lifecycle." Four behaviours that
came with `Vault.make` and `hello()` ([#166](https://github.com/mrflip/safebyok/pull/166)); each
works as built, and a redesign of the lifecycle may change all four.

* **`lock()` and `close()` don't wait for `hello()`.** Every other method waits for storage to
  answer first; these two act at once. A lock made while `hello()` runs no longer wins over taking
  up the lease (*Lock timing vs. work in flight*, scenario 1). `del()` waits. (#166, thread 8)
* **A failed `hello()` keeps the handle alive.** A refused `hello()` no longer closes the storage
  watch, so the same handle can retry; after an untrusted-storage refusal the next call meets that
  refusal again rather than `vault_locked`. (#166, thread 8)
* **React's vault is non-null while opening.** `VaultProvider` hands down the handle at once, in
  state `opening`; `openError` comes from the snapshot's trouble, and `retryOpen()` no longer clears
  it while the retry runs. A host checking `vault !== null` for "ready" must check the state
  instead. (#166, thread 8)
* **The `react-hooks/set-state-in-effect` suppression in `vault-provider.tsx`.** `VaultProvider`
  makes the vault in an effect, and `Vault.make` throws synchronously (`bad_option`, for one), so
  the failure is set in the effect body. Making the vault in render doubles its side effects under
  StrictMode, and deferring the failure brings back a late handle. A lifecycle redesign may remove
  the need for the suppression. (#166, thread 8 and review)

## Accessibility

The Coach (2026-10-18): "make a todo section for accessability, enter this there."

* **A screen-reader check of the `created_elsewhere` advice.** The dialog writes the advice in an
  alert region and then moves focus to the emptied field; a screen reader may announce the field
  and cut the advice off. Try it with VoiceOver before 1.0; if the advice is cut off, point the
  field's `aria-describedby` at the advice too. (#167 second review)

## RAGEBAIT

Moved to `NOTYET.md`, which holds the shelf.

