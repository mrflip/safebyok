# TODO

Three shelves. **Roadmapped**: the order we build in, in flight or next, each a sprint or a thread.
**Side quests**: straightforward, likely to be done, not needed yet; pick one up when the roadmap
is blocked. **Soonish**: wanted, but a design question stands in the way; the note says which.
What is reasonable but deferred is in `NOTYET.md`: do not anticipate it in your implementation.

## Sand in the sandals

Small irritants, each a few lines, picked up by whoever is nearby.

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

### Which ways in a rotation keeps

From [#105](https://github.com/mrflip/safebyok/pull/105) (the rotation design, section 9). The
first matter said rotation "re-wraps the remaining wayins", but it can't: each way in's key
comes from a passphrase or a passkey touch the vault never keeps, and any shortcut would hand the
new vaultKey to the way in being removed. So the design keeps only the ways in the user proves
during the rotation and removes the rest -- which is also what locks out a lost phone's passkey,
and signs every other device out until it is asked again. The alternative, a key pair per way in
so rotation can re-wrap every wayin unasked (HPKE), is a new construction (the design's open
question 1).

The Coach (2026-10-16): wants to understand this better; land the recommendation for now. **Landed
as recommended**: thread 19 (`rotateVaultKey`, not yet built) keeps only the ways in proven during
the rotation.
Revisit before 1.0 if rotation signing every other device out is too blunt.

### `destroy()`'s edge cases

From the Convex sprint ([#18](https://github.com/mrflip/safebyok/pull/18)): a handle that never
saw vault props resolves `destroy()` without erasing, even if a vault has since appeared elsewhere, so
"delete account" can report success while a vault stands. And after a refused `destroy()`, an
app's automatic retry erases the vault that was made again in between. The Coach (2026-10-16):
assess these once the contract is tight and the tests unified -- that is, against
`packages/safebyok/VAULTDB.md` ([#107](https://github.com/mrflip/safebyok/pull/107)) and the
shared battery ([#114](https://github.com/mrflip/safebyok/pull/114)), after the Convex tests settle
in their home ([#111](https://github.com/mrflip/safebyok/pull/111)). First check whether big_feats
changed either.

### Lock NOW vs soft lock

From [#106](https://github.com/mrflip/safebyok/pull/106): a `read()` or `use()` that started
while the vault was unlocked still hands back its whisper if the vault locks (a sign-out, or
`lock()`) while it waits on storage. It has always been so for `lock()`; a sign-out makes it
likelier. The orchestrator proposed that reads check again after storage answers and refuse with
`vault_locked`.

The Coach (2026-10-16), holding it: there should be a distinction between *lock the phone, the
goons are here* and *it's time for a password refresh*. The proposal sounds like its own race
condition; decide what guarantee we offer, and why, before writing more code.

Where it stands today: the expiry ruling (*5. Expiry and the unlock window*, now in
`winboard/20261016-todo/20261016-todo-open.md`) says "in-flight work is never clawed back",
and `lockSoon()` already gives a grace in which work started before it finishes -- the soft lock.
`lock()` and a sign-out have no separate meaning yet. Decide: does `lock()` mean "now" (nothing
started before it hands back a whisper after it), and if so, is a re-check after storage enough,
or does the whisper's decryption also need to be refused once the key is gone?

### Are we doing anyone a favor by accepting multiple passphrases?

From [#126](https://github.com/mrflip/safebyok/pull/126) (thread 6): `changePassphrase` takes any
proof, a passkey's included, and when a vault has several passphrases and the proof is a passkey,
the caller must name which to replace (`wayinId`), or the call is refused rather than guessing.
The Coach (2026-10-16): "keep as built, but this is too complicated for a user to tolerate or a
customer to implement UX for." Decide whether a vault should hold more than one passphrase at
all, or exactly one, with passkeys the other ways in. The Gripefest doc's NOT YET row G530 asks the
deeper question beside it: whether a periodic passphrase re-entry is still the right demand once a
vault has a passkey. Decide both before the ways-in surface is 1.0.

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

### A ways-in change racing this handle's own refresh

From thread 4 ([#132](https://github.com/mrflip/safebyok/pull/132), `thread-4-refusals_and_catchup.md`,
*A pre-existing race*): during a change to the ways in, this handle's own bell refresh can read the
new vault props before `reviseWayins` sets it, judge the key `outlived`, drop it and erase the
lease. `takeUpVaultKey` restores the key in memory, but that erase can land after the
new record, so the next open asks for the passphrase. The direction is safe, and serializing the
refreshes does not cure it. The Coach (2026-10-16): into the TODO, beside the multiple-passphrases
question. The fix, small: do not judge `outlived` against vault props this handle wrote itself.

## RAGEBAIT

Moved to `NOTYET.md`, which holds the shelf.

