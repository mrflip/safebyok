# v6bank scratchpad: side notes for the sprint pre-plan

Notes from the Coach's review of the bank, gating and deriver sketch (2026-11-01). Nothing here
is built yet; each is a candidate thread or a rule for the threads.

## Rename surveys

* **`kept`.** Survey every use in the codebase. Where it means *cached* (the deviceDB's copy of
  a lease, a record), rename to `cached`. Report the other senses and recommend a name for each.
* **`raiseX`.** Survey every use. An error: `refuseX`. An increment: `incrementX`. A making:
  `makeX` when sync, `buildX` or `launchX` when async. Any other sense: report it.

## Refusal factories

* Move every error factory the new code uses (`leaseOfOtherHolder`, `gateMovedUnderChange`,
  `unlockFirst`, ...), even those the old code shares, into `helpers/refusal-funcs.ts`.
* A factory's name says it is a refusal and states what was observed, never a guess at the cause
  or the remedy: `gateMovedUnderChange` is good; `unlockFirst` becomes `needVaultUnlocked`.

## Bank

* **`VaultListing.ensure(dna, cleartexts)`**, put-first: build the record (draft plus gate) without
  holding a Vault, put it, hold the result on success, adopt the stored row on `stale_write`. No
  never-stored draft is ever held, so `receive` has nothing to refuse. `Bank.ensureVault`
  delegates to it; `build` becomes the listing's private step. (Coach: lgtm.)
* **`requestCleartext` is required.** One path through the bank; the proof-closure parameter on
  `ensureVault` was a stub for the bankless sketch and goes. A test passes a `requestCleartext`
  that calls `attempt` at once.
* **The clock** leaves `BankOpts`. The bank makes its world with `wallClock`; tests pass a
  `_cheat_clock` as a second constructor parameter, outside `make` and the public options type.
* **The bank is not a Storable.** Its device record (`device_id`, the highest epoch seen per
  vault) lives in the deviceDB only, through a `load`/`save` pair like `Cache`; its snapshot is
  the small one the sketch has.
* **`Listing.evict(scope)`**: `try { thing.evict() }`, then remove the thing from the listing and
  remake the snapshot. `closeVault` calls it after the lock; `closeVaults` for each.
* **`zxcvbnStrengthChecker`** must be exported from the v06 entry point: the
  `NoStrengthChecker` refusal and `notes/configuration.md` point hosts at it.
* Secure-context check kept (refuses only an explicit `isSecureContext === false`).

## Gating

* **Entry points live on the vault and the bank**, not on `Gating` statics:
  `vault.ensureUnlocked()`, `replacePassphrase()`, `addPasskey()`, `revokePasskey()` and
  `bank.ensureVault()` each raise a `Gating` when they need the user, hand it to the world's
  `requestCleartext`, and await settlement. The host's dialog calls `attempt` and `decline`.
  `gating.ts` keeps the `Gating` class and the ask loop. The `Gate` makes no gatings: it is
  stored wayins and proof math, and `build_vault` has no gate yet. (Coach: lgtm.)
* **Drop the closures from the model verbs.** `ensureUnlocked`, the gate verbs and `Proving`
  take cleartext values, not `ProofClosure`s; the verb decides whether to ask before it raises a
  gating, so the closure buys nothing. **The Coach's constraint:** the cleartext (passphrase or
  PRF answer) takes the straightest path from the user's fingertips to the one method in
  `Proving` that handles it, and the surface area touching it stays as small as can be: it should
  be question-free, not merely safe. Each hop that holds it must be named and zero or drop it.
* Gating kinds are the verbs' names: `build_vault`, `unlock_vault`, `replace_passphrase`,
  `add_passkey`, `revoke_passkey`.
* A hand-rolled deferred in `Gating.#ask`: `Promise.withResolvers` is ES2024 and the target is
  ES2022, so a tiny `deferred()` helper or a library one.

## Deriver

* Noble's argon2 is imported statically (done in the sketch, 2026-11-01); the memoized dynamic
  import added a chunk for nothing. `load()` stays on the `KeyDeriver` interface for wasm
  derivers. `keyDeriver` stays a required option with no noble default, or the tree-shake is lost.

## Review findings on storable, listing, box and vault (2026-11-01, not yet ruled)

The Trigger and the other FIXME marks are with another agent and are left out here.

Safety:
* **'ouch' re-revisions a sealed box without re-sealing.** The box seal binds every sparse field,
  revision included, so `reconcileStaged`'s 'ouch' row (`{ ...staged, ...nextRevision }`) leaves a
  box no lease can open. Rec: drop the staged on 'ouch' as 'adopt' and 'gone' do. The binding is
  wider than VOCABULARY's *stamp* (fields fixed for a life): name it apart, or widen the definition.
* **Damage as a fate.** A record failing today's checks becomes a 'd' tombstone, reads as absent,
  and an edit over it is a birthday under a fresh `box_tok`. Rec: no 'd' in `am`; a record that
  fails its check leaves central as it was, tells bad news, and marks the snapshot troubled. The
  'ouch' rows, the ouchstone and the "double edge" note go with it.
* An exposed whisper survives `lock()` in memory; only the getter hides it. Rec: lock forgets it
  (a `disarm` on Box, called by the vault's lock and by evict); the host re-exposes.
* No received gate change locks the vault or voids the lease (item 4 of the five): the gap with
  the widest blast radius.

Design:
* **Ducking as the record.** Own props kept in sync by `assign`, tattoo/adorn, `Object.seal`, the
  no-private-fields-before-super rule, every listing verb typed `duck: unknown`, and a host spread
  yielding half a record. Rec: a storable *has* `record` and `sparse`; listing verbs take records
  or scopes; tattoo and adorn leave storable.ts.
* **The staged record.** Most of the reconcile table exists so an unsent edit outlives a receive,
  is cached, and is dropped silently by any newer record. Coach to rule: is an offline edit queue a
  feature? If not, `edit` is protected, the staged lives only for the span of a `send`, and
  `reconcileStaged` collapses to set-on-edit, clear-on-receive.
* A storable's listeners are called in a plain loop at settle: one that throws aborts the settle
  and the verb. Rec: isolate each call as `tellBadNews` does.

Smaller:
* `VaultListing.draftOf` is dead once `build` bypasses it; put-first `ensure` reshapes this.
* The comment in `send` about a locked thing's getters hiding what it holds is stale: no record
  getter on Box depends on the lock, only `whisper` does.
* The box listing's `vault_tok` check throws `unexpected_error` for good once a vault is remade
  elsewhere: depends on evict.
* A never-stored thing holds a synthetic tombstone at seq -1 under a random tok; a null central
  with a never-stored state would read plainer.
* `storedInStaleRefusal` takes a sparse record for a box and only a full one for a vault.

## Rulings on the review (the Coach, 2026-11-01)

* **'ouch' and damage: just fail.** A record that fails its check is a refusal, not a fate; no 'd'
  in `am`, no ouchstone, no staged carried over damage. Customers can direct a better solution.
* **Exposed whisper across lock: kept.** The justification, in the Coach's words: if we don't
  offer it in some form, customers will. It is the customer saying they want the server-side
  security and accept the client-side risk for the large upgrade in convenience.
* **Ducking stays; the need behind it:** as a customer of a library I want objects that give
  pleasant, informative, safe debugging information in `console.log`, and that spread. A spread
  yielding the sparse fields is by design: they are the fields meaningful to log. The CLAUDE.md line
  against spreading was an agent's misinterpretation and goes. Getters poking through to `combined`
  are rejected: two more arm's lengths from the value. If state is duplicated, unduplicate it
  *onto the instance*: the own props are the one copy. (With the staged gone, that is natural:
  the instance's props are the record in hand, and `#central` holds nothing the props do not.)
* **No virtual calls from the base constructor.** The "no private fields before super returns"
  rule is JavaScript's: a subclass's `#fields` are installed only after `super()` returns, so a
  base constructor that calls `assignInitialProps`/`settle`/`makeSnapshot` runs subclass overrides
  against fields that do not exist yet (hence Vault's lazily made `#gate`). Fix: the constructor
  stores its arguments; the listing settles a thing after constructing it.
* **The staged record is the shaky pillar.** The need, in the Coach's words: the smaller
  justification is accepting edits without waiting for the network, and optimistic update; the
  bigger is that decoupling the edit timeline from the send timeline simplified the old rat king
  of braided code paths. Test for the baseline: if a send without a staged record needs any
  concurrency primitive negotiating `lock()`, `receive()` and edit-seal-send-receive, or a re-seal
  retry when an update lands, then a tray is needed and it looks like the current code. Analysis
  (2026-11-01): it does not. An in-flight send is a local value; a newer record received
  meanwhile makes the put refuse `stale_write` carrying the winner, and the host retries, as the
  current `edit` already does when central moves under `makeStaged`; a lock mid-seal makes the
  lease refuse `vault_locked`; two sends on one thing either let storage refuse the second or sit
  behind a per-thing one-at-a-time. Nothing restarts or re-seals inside. What is lost: the
  optimistic snapshot and the cached carry across reload, neither of which the current code
  finishes (nothing sends a revived staged). Rec: cut the staged; own props become the one copy;
  `reconcileStaged`, `StagedForms`, the staged in the cache and 'fill' go; optimistic UI is built
  atop by the host, or later by a `pending` field on the snapshot. Coach to rule.
* **Null sentinels: no.** The never-stored tombstone at seq -1 under a random tok stays: it buys
  the invariants `revision_seq = prior + 1` and `revision_tok` always a random unique string.
* **Listeners isolated** at settle, each call caught and reported: yes.
* **Dead code scrubbed:** `VaultListing.draftOf`, the stale comment in `send`.
* **Trigger: hold.** Just rewritten by another agent; reviewed separately. The per-box refresh
  timer is conceded as a real cost given a record's days-to-years cadence. The vault refresh is
  the stronger case for polling: standing up subscriptions across graphql, urql, express, aws
  firewall and same-origin headers is a barrier to adoption. The Coach is reflecting.
* **Two pillars with smells, not shaky:** how much the listing does on behalf of the storable;
  box and vault forced to share a base class. Thoughts (2026-11-01): give the storable its own
  storage verbs for its scope (`get`/`put`/`del` → its own `receive`), and keep the listing to the
  registry, the watch dispatch and the cache load; `scopeOf`/`sparseOf`/`recordOf` become the
  kind's checker functions, not listing methods. Once the staged is gone the shared protocol
  (revision, versioned put, receive, snapshot, cache save) is small enough to hold as an object
  (`Row`) each of Box and Vault owns, rather than a five-parameter base class.

## Addenda (the Coach, 2026-11-01, later)

* **Damage handling, one more factor.** Leaving a damaged record unhandled, so that it surfaces as
  a bare exception, is a huge distraction for agents: they read every exception as a flaw to
  remediate, not as a control-flow primitive. So "just fail" means fail *by name*: a damaged record
  is a named refusal kind, told as bad news, shown as the snapshot's trouble, and documented as
  expected control flow, so that an agent meeting it in a test or a log knows it is the design.
* **The big changes wait for supervision.** The staged cut, the own-props unduplication (where the
  variables are inscribed), the listing/storable split and the shared base class stay as they are
  until the Coach can supervise them slowly. The sprint pre-plan (`preplan.md`) carries only the
  non-controversial items.
