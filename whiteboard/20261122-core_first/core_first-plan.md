# core_first: the sprint's plan

* **Date**: 2026-11-22. **Mode**: YOLO. **Issued by** the Coach, invoking `/sprint` on
  `whiteboard/20261122-react_targets/react_targets-plan.md` with `/turbochat`.
* **Levels** (defaults): review `medium`; worker `thread-worker` on `opus` at its own effort (`thread-worker-400k`
  for a thread marked *L*); reviewer `thread-reviewer` on its `sonnet` pin; style pass on `style-reviewer`'s `sonnet` pin.
  Three threads at once.
* **Sprint doc**: https://claude.ai/artifact/4UuWDQtdM1ArXDYyXiWa8c (doc `1c30dab4-9b62-413f-aecb-39f5fc79b1b5`; tabs Open Matters `7dae936c-8cd1`, Cleanup `b6b9e28d-d826`, Progress `b34a4511-9bc7`, Resolved `4494379e-db5c`; State enum `ecdeb6f5-e69a`).
* **Status**: running (2026-11-22). Filed and out of draft: thread 2 (#844); on it, thread 4 (#846) → thread 6 (#848, `f122dd2e3`) → thread 7 (#849, `80cd1a148`); and thread 3 (#847). Thread 5 (#850, on #847) in review (medium, opus). Then: restack the two branches into one line, and cut thread 8 (misuse_cull) from its tip. Restack note: thread 3 deletes `#seedListing`; thread 6 changed it; thread 3's deletion wins. *Finally*: `list`'s per-call `staleTime: 0`; `useridsSeen`'s data filter (thread 8).

The Coach's request, verbatim:

> work on the core library parts -- see the prs, another sprint put the cart before the horse ; don't do the stuff they
> did, or regard what they did as sacrosance. We'll come back later and make their changes work with yours.
> Work on top of main

My reading: the react_targets workshop ends (its plan, *Building it*) with a list of "core work for a sprint": "the
core's `Device` is made for one user, so 'the device at the Provider's mount' is a holder in the React layer until the
core has a device that exists before its user. That, the BankMinder apart from the VaultMinder, the world query,
persistence (and with it ruling 3), and the vaultDB's answers are core work for a sprint." The cart is the React work
built ahead of that core: the react_free sprint's line (#832 and #833 to #838) and the workshop's provider (#837). This
sprint builds the horse, from `origin/main`, and reads none of the cart.

## Read first

The design this sprint starts from is in the sprint directory, copied so that a worktree cut from main has it:

* `core_first-design.md`: the workshop's rulings on the caches, the feed principle, the customer's contract with our
  cache, ownership and startup, the world query, the cached gate, `lifetok`, persistence. Each thread names its sections.
* `vaultdb_answers-handoff.md`: the vaultDB's answers under the feed principle (threads 3 and 5).
* `where-data-lives-draft.md`: the Coach's uncommitted draft of how a device starts, runs and ends (thread 4).
* `notes/transition.md`, *Exports* and *Using what big has*, before exporting anything or reaching into big.

## Ground rules

* **On main, core only.** Every thread is cut from `origin/main` or from a thread of this sprint. Its subject is
  `packages/safebyok`, and a package building on the core's storage contract (`safebyok-postgres` builds its vaultDB on
  `AdapterVaultDB`) only where a contract change forces it.
* **The cart is not a source.** Do not read, port or build on #832 to #838, #843, #819 or #822. #831 and #837
  merged (2026-11-22) and are code on main, not contracts: change them freely and say where. The React layer on main
  (`safebyok-react-lean`, the demos) changes only as much as a core change forces: no React design, no new hook or
  prop. Where that would take more than a mechanical change, say so and stop. #833 (vocab_adopt) is the Coach's.
* **The new core is not bound to the old interface or its guarantees** (CLAUDE.md): where a thread loosens or drops
  one, it says so in its PR body.
* **End states are out of bounds** (the Coach, 2026-11-22). Every sweep, vacate, bank or gate delete, sign-out and
  lock is, for this sprint, answered by a page reload. A collision with one earns no guard, test, state or open
  matter: a worker writes one line under *End states, for the final report* in its thread file, a reviewer does the
  same in its report, and the orchestrator gathers them in the progress document for the final report.
* **Damaged records are out of bounds** (the Coach, 2026-11-22), as end states are: no new check, test or matter for
  a damaged row.
* **Instance properties are in sync** (the Coach, 2026-11-22). A later thread keeps them synced by subscription.
  Assume every instance property is perfectly synchronized and every state change comes through a front door (every
  lock is a call to `lock()`). A lagging property earns no guard, subscription or test: one line under *For the
  instance-sync thread* in the thread file.
* **The world has one home, read synchronously** (the Coach, 2026-11-22): "having the world centralized in one place
  is good, and I don't mind where it is right now -- if there is code to syndicate it ok but there must be no more
  than one place people read from and it must be sync (i.e. vaultdb-async->home and then it's instantly and perfectly
  everywhere, no crossings shall be reported". The home is the BankMinder's world entry; no reader keeps a copy or
  refetches it asynchronously (the giver's `useGate` reads it through `useSyncExternalStore`).
* **Base case first; no crossing or gap reports** (the Coach, 2026-11-22): get each mechanism working in the base case
  and record where it glitches; a review accepts no finding about a gap or a crossing.
* **Hosts are not the threat model** (the Coach, 2026-11-22): no check that hunts for guessed-at misuse, and no
  preemptive change to what a host is told in an error. The minder's `select` pin goes (thread 2's review); thread 8
  culls the rest.
* **Core models may call minder code** (the Coach, 2026-11-22): until the design is worked out, Bank, Device, Gate and
  the rest may call into the minders directly; relax any rule that says otherwise where it simplifies. The giver stays in
  the React layer.
* **No goodbye without a caller** (the Coach, 2026-11-22): no goodbye method on a bank, a device or anything else
  until it has a caller and a feature need.
* **Architecture first** (the Coach, 2026-11-22). The sprint puts the design's architecture in place. No machinery
  the design does not describe; a design gap is written down, not closed with complexity, which moves the system
  away from working. Never give up a contract or the common case for an edge case: follow-on sprints take those.
  Reviews hold the threads to this, and fix or flag only what breaks it, a contract or the common case.
* **Library first.** A UUID version 7 comes from a library (thread 3), persistence from TanStack's own (thread 6).
  Read PROCESS.md, *Dependencies*, before adding one.
* **No back-compat before 1.0**, Postgres tables included: no migration, no version bump, no shim (the Coach,
  2026-11-22). A stored shape that fails today's checks fails safe, and the changeset says what a host sees.
* **The ordering pins stay** (the Coach): the React layer's stale-time function and the minder's cache-level
  `onSuccess` each settled an ordering problem. A thread that finds one in its way says so; it neither works around it
  nor reopens it.
* **Git and gh on every open PR but the release PR** (the Coach, 2026-11-22): force-push under a lease on a known SHA, draft in and out; never the `queue` label, never a merge.
* **Every Agent call names its model.** Check with your orchestrating agent before fanning out.

## Threads

The line: 1 → 2 → {3, 4} → 5 on 3, 6 on 4 → 7 on 6. Threads 3 and 4 are siblings on 2 (one rewrites the vault
minder's listing and the storage answers, the other the device and the bank minder's wiring), restacked into one line
at the close. Thread 2's world key needs `lifetok`, which is #828 (another session's, ready for the Coach).

### 1. `house_port`: the minder keeps house, on main

> "Where it's trivial, let's start keeping house like we had a spouse, it can help to win one: pin the options that
> need pinning; live in our subtree; examine items in structuralSharing, eliminate the need for select, narrow the
> options the hooks accept; give a listing a real fetch function; etc." (the Coach; built as #827 on the workshop's line)

*Gloss.* Carry #827's core commits (`2900e6c07`, `bbd2eb844`, `fa86a376c`, `472c02420`, `4fe1c3f73`, `f292e9ffc`) onto
main by cherry-pick; #827 stands on React PRs, but the core beneath it differs from main only by `bulletproof.ts`,
`passphrase-strength.ts`, `index.ts` and a few lines of `thing-minder.ts` and `proving.ts`. Resolve conflicts to
main's code, keep the React layer on main green, and leave #827's thread file and plan commits behind. #827's
reviewer's fixes are in those commits. Its open invariant wording ("An operation caches only its own good answer…"):
reword it as `core_first-design.md` proposes. *Touches*: `minding/thing-minder.ts`, `storage/adapter-vault-db.ts`,
`storage/vault-db.ts`, `shapes/shapes-minder.ts`, their tests, `notes/wontfix.md`. *Levels*: worker `opus`, effort
`medium`; review `low` (reviewed once as #827; the review reads only what the port changed from it).
*Depends on*: nothing. *Look-ahead*: threads 2 and 3 rewrite this minder; nothing here should be polished for its own
sake. *Size*: S.

*Status*: filed, [#840](https://github.com/mrflip/safebyok/pull/840), out of draft. *Review* (low): clean; `git range-diff` shows the six cherry-picks identical to #827's, and the reworded invariant matches the code. #827's two open questions carried as Open Matters rows (`list`'s `staleTime: 0`, `select` pinned).

### 2. `bank_minder`: the BankMinder apart from the VaultMinder, and the world query

> "BankMinder: userids ; gates ; leases ; banks / VaultMinder: box kids, item, gone, soon" … "Use a small standalone
> TSQ for gate and bank and anything else internal" … "We can define a world query that is keyed on
> user+bank+banklife+bank.lifetok … holds the bank, gate, root box and root box listing." Ruled: "ok go with the
> simpler plan" (the root box's listing stays in the vault cache). "bank's lifetok is changed on every delete and
> create."

*Gloss.* `core_first-design.md`, *Ownership and startup* (all of it) and *A world query*. A `BankMinder` with a small
TanStack client of its own holds the world: one entry per user and bank, keyed `[userid, banklabel, banklife,
lifetok]`, valued the bank, its main gate and the root box, landed from the `world` and `tracked` every vaultDB answer
carries (the feed), never fetched by its key; found by user and bank (key prefix); an earlier key's entry removed by
prefix when a new life lands. The minder that remains caches boxes only (items, soons, listings, the root listing
included) and becomes the `VaultMinder` (the Coach's name; a rename of `ThingMinder`, with VOCABULARY's *minder*,
*item*, *soon*, *listing* rows brought along). The bank and the device read the bank, gate and root box from the
BankMinder; the stage is a function of the world entry. Leases and the userids seen are not cached yet (persistence,
thread 6, adds the userids). *Touches*: `minding/`, `models/bank.ts`, `models/device.ts`, `models/vault.ts`,
`shapes/shapes-minder.ts`, `index.ts`, the React layer's reads of the minder (mechanically). *Levels*:
`thread-worker-400k` on `opus`, effort `high`; review `high` on `opus` (it moves where the wrapped bankKey is cached:
`notes/guarantees-big.md`'s guarantees, read for substance). *Depends on*: 1, and `lifetok` (#828). Cut from 1's tip
once #828 has merged and 1 has caught up; if #828 has not merged when 1 is ready, cut from 1 and key the world on
`banklife` with `lifetok` added when #828 lands (a *Finally* item). *Look-ahead*: thread 4 makes the BankMinder before
any user is signed in, and has one VaultMinder per signed-in user attach to a client the device made; build the
BankMinder so that it needs no userid to exist and holds many users' worlds. Thread 6 persists both clients. *Size*: L.

*Status*: rework. *The Coach (2026-11-22):* "I didn't imagine there was any code in BankMinder different than ThingMinder at all" … "a bank-side minder made any time is fine, I'd conceived it was made before then and held all users' rows … if it breaks vaultdb then do it with the userid, or just cheat and keep it fed by magic or the idb" … "easier to have them be subclasses even if it's just different names". The paused high review (one fix kept: `useGate` reads the world through `useSyncExternalStore`, `3f44feddc`) left: the `select` pin to remove, the entrykind filter now dead, the world doc's false clause; all in the rework. A fresh high review follows it.

*Review* (high, opus, `e7ae8b445...f5d6f9b3d`): fixed. Kept five fixes: the base's phrases say "minder", not VaultMinder; a giver test that could not fail; `VaultMinder.make`'s rows all refusing for a missing bankMinder; `fetchWorld`'s doc block; a style quote. Left, minor: the IdbMinderBridge no longer copies the roots (threads 6 and 7 replace it); test-title taste; no sloppy-input case for `tryBirthBank`; `GateResult.data`. End states gathered in the progress document, one of them able to corrupt what the bankDB stores (reported there, not fixed).

### 3. `list_answer`: a list's answer under the feed principle, and the listing over it

> "the query function / write / mutaion handles only its return value; inject other records at the feed (they land
> before the record does) and settle consequences in sendToTSQ or onSuccess using the same function" … "Change the
> `val`: `{ modelkind: 'kids', parentpath, parentlife, items: { [label]: { lifeseq } }, gones: { [label]: { lifeseq }
> } }`" … "on the answer: change 'parent' to 'parentage' and make it an array. the parentage records should be
> injected in the feed" … "we should first explore whether invalidating the listing when
> query.state.dataUpdateCount === 1 is sufficient" … Ruled: "but yes uuidv7, via library. add read_tc to answer and kids
> good catch."

*Gloss.* `vaultdb_answers-handoff.md`, all but *A get's answer* and *What reads tombstones today* (thread 5's). The
vaultDB's list answer: `val` is the `kids` value with `read_tc`; `deltas` beside it, injected at the feed; `parentage`,
an array, injected at the feed; `read_tc` on the answer too, a UUID version 7 from a library (STYLE.md gains a line on
`_tc` beside `_at`). Base-32 in our docs means lowercase `0-9a-v`, as `.toString(32)` makes (a STYLE.md line). The
listing's cached value is the `kids` value, replaced whole and never joined to; a later `read_tc` is never replaced by
an earlier one. The rule that invalidates a listing is (A), the first landing (the Coach's `dataUpdateCount === 1`), proved by
tests on the handoff's table rows that are not end states. *Orchestrator (2026-11-22, simplified):* the row (A) was
predicted to miss is a bank's rebirth, an end state and out of bounds: it goes in the thread file's *End states*
list, and neither (C) `known` nor (B) is built. *Touches*: `storage/` (the answer shapes, `AdapterVaultDB`,
`MemoryVaultDB`, the classifier), `safebyok/testing`'s battery, `safebyok-postgres` where its rows feed the answer,
the VaultMinder's listing, STYLE.md. *Levels*: `thread-worker-400k` on `opus`, effort `high`; review `medium`. *Depends
on*: 2. *Look-ahead*: thread 5 changes the get answer and moves tombstones to a `dead` entry; leave the get path alone.
*Size*: L.

*Status*: ready, [#847](https://github.com/mrflip/safebyok/pull/847) at `5c4c2254a`, on #844's `3f44feddc`. `ListThingsAnswer.val` is `Kids` with `read_tc` (uuid v7); `parentage`, `deltas`, `damaged_rows` beside it; the listing caches `Kids`. Rule (A) with two qualifiers in `#isFirstStored` (a first stored record over a shell counts; not while the item or soon already holds one). `list` keeps `staleTime: 0` (a *Finally* item). For its review: delete the obsolete wontfix row about a box joining between the host's listing fetch and `listingAt`. Review held until #844's rework lands and #847 is rebased.

### 4. `device_early`: a device that exists before its user

> "Assume the BankMinder can exist early … I'm happier if VaultMinder is only instantiated after the user exists" …
> Ruled: "lgtm on all three" (the device is made at the Provider's mount and started in an effect; the vault cache's
> client is made with it, empty, and each user's VaultMinder attaches; the stage leaves `'starting'` only once the
> restore from the device's database has landed). On a cached gate: "1. if we have the data, we can use it; 2. we
> require a userid in the context if that's the right word; 3. no unlock until userid".

*Gloss.* `core_first-design.md`, *Ownership and startup* (all of it), and `where-data-lives-draft.md`, *Data retention
lifecycle* and *What the provider's `userid` does*. The core's `Device` is made with no user: its construction does no
I/O, touches no browser global and subscribes to nothing, and makes the BankMinder and an empty vault client.
`hello()` starts it. A verb that tells it who is signed in (named by the thread, after VOCABULARY) makes that user's
bank, on banklabel `'main'`, and a VaultMinder attached to the device's vault client (#831's attach, on main: keep it and its tests, and move the making of the vault client into the device; remove
`VaultMinder.makeClient` and `Device.make`'s `queryClient` option if nothing needs them after). Telling it the same user again is safe; an absent user is no signal. *Orchestrator (2026-11-22, simplified):* a
different user is a sign-out, an end state and out of bounds: the host reloads; no code ends one user's bank to start
another's. The stage: `'signed_out'` with no
user, `'starting'` until the device has what it needs, `'locked'` from a cached world, and an unlock that runs on the
cached gate once a user is signed in, never before. Ruling 3 (the stage waits on the restore) is built by thread 6;
this thread leaves the stage a seam where the restore will land. *Touches*: `models/device.ts`, `models/bank.ts`, the
minders' construction, `core.ts`, `index.ts`, and #837's `makeProviderMount` in safebyok-react-lean, now on main: it makes the device where it now makes the
client, and tells it the user in the effect that now makes the device. Keep `tests/giver/record-hooks.test.tsx` green
(hooks bind the client on first render before any user; StrictMode makes one device; nothing at construction touches
a browser global). *Levels*: `thread-worker-400k` on `opus`, effort `high`; review `high` on `opus` (the unlock on a
cached gate). *Depends on*: 2. *Look-ahead*: thread 6 restores both clients before `hello` speaks to the vaultDB, and
persists the userids seen; thread 2's open matter on the Gate reading its gate from the world lands here if the Coach takes its Rec. *Size*: L.

### 5. `get_answer`: a get's answer, and tombstones in their own entry

> "We could have the api return null on the `val` when `ifAbsent: 'get'`, and make `dbhas` exist on ok true and false."
> … "I'd have VaultDB only return it when it's usefully different." … "I don't like using null or absence as a
> sentinel. We can swap it for a singleton frozen object as long as everyone promises to never use object equality
> (ie. it's an optimization not a contract)."

*Gloss.* `vaultdb_answers-handoff.md`, *A get's answer* and *What reads tombstones today*. A get's `val` is the live
record or the frozen singleton; `dbhas` on good and refused answers alike, only where it is another record than the
`val`; a tombstone lands by the feed in a `dead` entry before the item lands; structural sharing reads the `dead` entry
by scope; the stale-read check compares `dbhas` where there is no live record; `newerThingOf` passes what is no record.
The readers of tombstones follow, in the core, and in the React layer mechanically. *Touches*: `storage/`, the
VaultMinder, `models/vault.ts`, `models/base-thing.ts`, `newer-thing.ts`, `ThingEvent` and `MinderEventFormat`, the
React layer's `liveOf` and `gateShownOf`. *Levels*: worker `opus`, effort `high`; review `medium`. *Depends on*: 3.
*Size*: M to L.

### 6. `persist`: the minders' caches persisted, and the stage waits on the restore

> "the indexeddb and the Minders should be synced: The BankMinder for all user+banks; the VaultMinder all boxes for the
> active user, for all user+bank the root box and listing." … "I'm on board with the persist." … Ruled: the stage
> leaves `'starting'` only once the restore from the device's database has landed. "what stays is the customer's to
> define".

*Gloss.* `core_first-design.md`, *What is synced with the device's database* and *TanStack's persistence, where it is
and its limits*. The device takes a persister (TanStack's `Persister` interface, from
`@tanstack/query-persist-client-core`) as a host plug; the core supplies a memory one for tests. The BankMinder's
client persists every user and bank's world, and the userids seen; the vault client persists the active user's boxes,
and the root listing of each user and bank. The restore lands before the minders say `hello` to the vaultDB, and the
stage leaves `'starting'` only once it has. Our defaults where TanStack's are wrong for us: an item whose last get was
refused is kept; no 24-hour discard; a `buster` from the stored format. What stays for a user not signed in is the host's to
define, later. *The Coach (2026-11-22):* "Choose the most liberal policy for this and for what to cache, do not build
an options engine, that will come later. Do not accept bug reports about this being insecure if they are referring to
intended behavior." So: persist everything named above, keep it, no predicate or option. *Touches*: `models/device.ts`, the minders, a new
`minding/` or `storage/` file for the persister plug, `package.json`. *Levels*: worker `opus`, effort `high`; review
`high` on `opus` (the wrapped bankKey and the gate's headers stay on the device). *Depends on*: 4 (and reads 5's
entry kinds at the restack). *Size*: M.

### 7. `idb_persister`: the persister over IndexedDB

> "An opportunistic process (undesigned) will keep it synced with the local indexeddb"

*Gloss.* A `Persister` over IndexedDB, storing objects without JSON, one snapshot per user and bank, in the device
database's adapter package, not the core: `safebyok-idb-lean` (#829, another session's, ready for the Coach). #829 merged (2026-11-22). *Levels*: worker `sonnet`, effort `medium`; review
`low`. *Depends on*: 6 and #829. *Size*: S.

### 8. `misuse_cull`: checks that hunt for guessed-at misuse, removed

> "don't change users' error messages preemptively. They are not the threat model.. Remove that and anything else that
> hunts for guessed-at misuse" (the Coach, 2026-11-22, on the minder's `select` pin)

*Gloss.* Across `packages/safebyok/src`: remove each check whose only purpose is to catch a host misusing an interface
in a way we guessed at (pinned TanStack options a host might pass, refusals for a call order nobody makes), with its
phrase, thrower and tests. Validation at a module entrypoint of what the interface requires stays (CLAUDE.md). The
thread lists what it removed and what it kept, with a line each, for the Coach. *Levels*: worker `opus`, effort
`medium`; review `medium`. *Depends on*: the line's tip when 3 to 6 are ready (it touches what they touch). *Size*: M.

## For the Coach

* **Merging #828** (`lifetok`) before thread 1 is ready lets thread 2 key the world on `lifetok` from the start; #829
  frees thread 7.
* **Thread 1 carries #827 onto main** rather than rebuilding it: it is core work, already reviewed, and threads 2, 3 and
  5 rewrite it. Its PR on the workshop's line is then superseded for the core; I leave #827 itself alone.
