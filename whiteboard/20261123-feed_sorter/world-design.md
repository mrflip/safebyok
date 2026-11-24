# World facade: a design for the Coach to rule on

Drawn up 2026-11-24 by a read-only agent from the code on `20261124-things_ring` (#871), condensed here. Nothing is built.
Paths are under `packages/safebyok/src/`. Two rulings arrived after the agent read the code and are applied below:
a Thing always holds a record (the shell until a whole one is adopted; a soon is a `citable` over the shell), and the
`SortedVaultDB` is listened to (`listen`, tell, hear) and takes records at `receive`.

## 1. The world is its own object, not the bank

Recommended: a `World` (`models/world.ts`), made in `Device`'s constructor, reached as `device.world`, handed the
`SortedVaultDB` at sign-in. Reasons, from the code:

* **Birth needs a lease before any bank record exists.** `birthBank` seals the root box under the lease before
  `tryBirthBank`. A bank that is the world has nowhere to put that lease.
* **Lifetime.** The snapshot must exist from `Device.make` (`signed_out`, `starting`, `unborn`, `failed`). `Device`
  juggles `#bank`, `#banklessSnapshot` and `#attachBank` today because a `Bank` cannot exist early; a world that lives
  as long as the device removes all three.
* **A Thing holds no secret.** With the lease on the world, the map holds only what the database stores.
* **One Thing across lives.** A lease, an unlock wait or an end cause on the bank Thing would carry from one life to the next.
* **Lock is the first thing dropped,** and touches nothing in the map.

What merging would buy: one object fewer. `Bank` keeps one-line delegations so its callers do not change.

## 2. Where each member goes

**World holds:** the lease (private, no getter), the unlock wait (`ensureUnlocked`, `dismissUnlock`, `isUnlockWanted`),
the end cause and `isEnabled`, `lock`, `sweep`, `seal`, `unseal`, `leaseEndsAt`, `leaseLoggable`, `isLocked`,
`isUnlocked`, the vaults it sweeps, the snapshot and its subscribers, the stand-in stages, the ask builders
(`makeGetAsk`, `makeListAsk`, `makePutAsk`, `makeDelAsk`), `rootBox`, `track`, `birthGating`, and the maker of Things.
It reads the bank, the main gate and the root box from `sortedVaultDB.thingAt(...)`.

**Device keeps:** its config, its two minders, `#userid`, `signIn`, `hello`, `judgeStrength`, `tellBadNews`,
`maskedView` (reading the lease view from the world), and `getSnapshot`/`subscribe` with the world as their one source.
`bank`, `vault`, `lock`, `sweep`, `birthGating` and the ask builders delegate to the world. `#bank`, `#vault`,
`#attachWorld`, `#attachBank` and `#banklessSnapshot` go.

**Bank (a Thing in the map) keeps:** `lifetok`, `scope`, `stamp`, `mintStamps`, `makeRecord`, `put`, and
`sealBox`/`unsealBox` and their `try` forms ("bank scopes it"), which check the box against the root box and call
`world.seal`/`world.unseal`. `#device` and `#gate` go; it holds `#world`. For this line it keeps one-line delegations
to the world for `gate`, `lock`, `ensureUnlocked`, `isLocked`, `isUnlocked`, `getSnapshot`, `subscribe`, `rootBox`,
`track`, so `Vault`, the React giver and most tests do not change.

**Gate (a Thing in the map) keeps:** its wayins, `scope`, `stamp`, `makeRecord`, `makeNextRecord`, the twelve form
verbs and their gatings, `#putGate`, `demandPasskeyAddable`. It **makes** the lease (`buildLease`) and hands it to the
world through a friend the world gives it. `bankStamp` becomes a getter returning `world.bankStamp`: the gate holds a
reference to the world, never to its bank. `#lease`, the unlock wait, `lock`, `seal`, `unseal` and the end cause move
to the world.

**Lease, Proving, Vault:** no line of `lease.ts` or `proving.ts` changes. `LeaseGate` (what a lease reads back:
`bankStamp`, `lock`, `isEnabled`, `demandEnabled`) becomes a plain interface that the world supplies, with the bank
stamp pinned per lease exactly as the gate pinned it.

## 3. What Bank and Gate need to be made from one record

* **A maker by kind:** `world.makeThing(seen)` makes a `Bank` at `bank`, a `Gate` at a gate's labelpath, a
  `PlainThing` otherwise. `Device` passes it to the `SortedVaultDB`.
* **Each constructor dependency is met through the world:** the device, the main gate (looked up when needed), the
  bank's stamp (`world.bankStamp`), and the check that all three roots are live, which becomes the world's "present" test.
* **A Bank or Gate may hold the shell, a tombstone or a live record.** For the bank, the shell is the `unborn` stage.
  Members that need a live record (`lifetok`, `stamp`, the wayins, every gating) refuse otherwise. `device.bank` stays
  null until all three roots are live and whole, so a host never sees such a Thing.
* **`Bank` stops freezing itself.** A frozen object cannot adopt. One test asserts `Object.isFrozen(bank)`; it goes.
* **`Gate` rebuilds its wayins on adopt, statelessly.** `Thing`'s constructor calls `adopt` inside `super()`, before
  the gate's private fields exist, and the field initializers then overwrite whatever it set. So `main` and `passkey0`
  become getters derived from the record, and the override sets no private state.
* **A found defect to fix on the way:** a Thing's `receive` raises its agerank before it adopts. If an `adopt`
  override threw, the Thing would be left raised with no record. Adopt first, or make the two one step.
* **`#putGate` stops adopting by hand:** the written record is received by the same `Gate` before the write resolves.

## 4. The lease on the world

| Event | Today | Proposed |
|---|---|---|
| Made | `Gate.#unlockByProving` builds it; birth builds it on a `Gate` made before its record | the gate's gatings build it against `world.leaseGateOf(bankStamp)`; birth builds it against the minted stamp |
| Kept | `Gate.#lease` | `World.#lease`, private |
| Read | `isLocked`, `leaseEndsAt`, `leaseLoggable`, seal, unseal, the snapshot, the masked view | the same members on the world |
| Renewed | the old lease is passed so its `born_at` is kept | the world passes the current lease's `born_at`, which is not secret |
| Dropped | `gate.lock`, `gate.sweep`, a failed unwrap, a refused birth | `world.lock`, `world.sweep`, a failed unwrap, a refused birth evicts the lease |

**No cryptographic construction changes.** `buildLease` binds the same stamp values; the lease's contexts read the
stamp pinned for that lease; the wayin context and the root seal are untouched. The one difference is a source: the
gate's bank stamp was pinned when the gate was made and is now read from the bank Thing at each gating. Within a life
the values are identical.

## 5. Snapshot and stages

The world builds the snapshot from: sign-in, the bring-up's outcome (`unborn`, `failed`), whether the three root
Things are live and whole (`locked`, `unlocked`), the lease, the unlock wait, and the end cause. The world listens to
the `SortedVaultDB` beside the two minders and realigns on an event at `bank`, `gate` or `box`. The device subscribes
to the world once. The hooks do not change. `useGate` keeps reading the gate record through the BankMinder in this line.

## 6. The BankMinder stays for now

It still minds the three roots in their own query client, persists them (the source of the cached start), fetches the
world, births the bank, and serves `useGate`. `Bank`, `Gate` and `Device.#attachWorld` stop reading it. It can go only
after the roots' persistence, `useGate` and the masked view have new homes: a later thread.

## 7. Build order

| Thread | Scope | Main risk |
|---|---|---|
| **A. The world, behaviour unchanged** | Add `World`. Move the lease, the wait, the end cause, the vaults and the snapshot onto it; the gate hands its lease over through a friend; `Bank` and `Gate` delegate. `#attachWorld` still makes them from the BankMinder's world. | subscriber-count and snapshot-identity tests; an import cycle among world, bank and gate |
| **B1. Things ready for the map** | `Bank` stops freezing; the gate's stateless adopt and derived wayins; record-needing members refuse until live; the gate's `bankStamp` from the world; the `receive`-before-`adopt` fix | the adopt-during-`super()` trap |
| **B2. The maker makes them** | `world.makeThing`; the world listens; the "present" test from Things; birth with no gate made before its record; restored roots received before the minders start; `#attachWorld` and `#attachBank` removed | the cached start; the birth's stages |
| **C. Tidy** (optional) | `useGate` onto the gate Thing; `worldAt` renamed; VOCABULARY rows | hook identity |

Each thread leaves the seven deliberately failing `Minder` tests as they are and adds none.

## 7a. Addendum: with a Thing always holding a record

The agent revised its plan for the ruling that a Thing always holds a record. What it adds:

**What each member does by what the Thing holds.** "Refuses" means through one private `#demandLive()`.

| `Bank` member | Shell (unborn) | Tombstone | Live |
|---|---|---|---|
| Thing fields, `citable`, `agerank`, `read_at`, `receive`, `pickle`, `scope` | works | works | works |
| `lifetok`, `stamp`, `put` | refuses | refuses | works |
| `sealBox`, `unsealBox` and their `try` forms | refuses | refuses | works, needs the world unlocked |
| `rootBox` | refuses | refuses | works if the root box Thing is live |
| delegations to the world, `gate` | works | works | works |

| `Gate` member | Shell | Tombstone | Live |
|---|---|---|---|
| Thing fields, `citable`, `agerank`, `read_at`, `receive`, `pickle`, `scope`, `adopt` | works | works | works |
| `stamp`, the wayins, `main`, `passkey0`, `demandPasskeyAddable` | refuses | refuses | works |
| `bankStamp` | depends only on the world's bank Thing being live | same | same |
| the twelve form-verb makers | callable | callable | callable |
| the gating bodies, `#unlockByProving`, `#putGate` | refuse | refuse | work |

The form-verb makers stay callable in every state so that each gating still takes in and then vacates the host's
cleartexts (G2); only the body refuses, and the attempt still vacates.

**The stage, derived by the world, first match wins:**

| Condition | Stage |
|---|---|
| the world has an end cause | `swept` |
| no `SortedVaultDB` yet | `signed_out` |
| the bring-up was refused and there is no bank Thing | `failed`, with `lastErr` |
| no bank Thing yet, or the bank is live but the gate or root box is not | `starting` |
| the bank Thing holds the shell or a tombstone | `unborn` |
| bank, main gate and root box all live | `locked` or `unlocked`, by the lease |

The device's `#banklessSnapshot` and its separate "unborn" flag both go; the world keeps only the last error.

**The bank's shell must actually be received.** Today the bring-up asks for the root box only. When nothing is
stored, that answer carries the shell at `box` and no world, so nothing reaches `bank` and the stage would stay
`starting`. See point 7 below.

## 8. For the Coach to rule on

1. **The world is its own object** (section 1). Recommended.
2. **Birth's stages become `unborn`, `locked`, `unlocked`.** Today they go `unborn` to `unlocked`. The roots are
   received, making the bank and gate, before the lease can be attached, because the lease is attached only after
   checking the bank was not born elsewhere. Attaching earlier would keep today's sequence but would, where another
   device birthed the bank first, briefly show that bank unlocked under a lease whose key no stored wayin wraps; a
   subscriber acting in that instant could store a box nothing can unseal. Recommended: accept the extra `locked`.
3. **The cached start.** Today a bank comes up `locked` from its restored roots before the vaultDB answers. To keep
   that, the restored roots are handed to the `SortedVaultDB`'s `receive` before the minders start, with a `read_tc`
   made from when they were cached. The alternative drops the guarantee until the LocalBridge exists. Recommended: keep it.
4. **The lease's bank stamp** is pinned per lease by the world, with no change to `lease.ts`. Recommended; the
   alternative edits the crypto path for the same bytes.
5. **Names.** Keep `world` for the facade; rename `bankMinder.worldAt()` to `rootsAt()`; leave an answer's `world`
   field alone. VOCABULARY's **world** row is rewritten.
6. **`Bank`'s delegations** to the world stay for this line (`lock`, `ensureUnlocked`, `isLocked`, `getSnapshot`,
   `subscribe`, `gate`), and `Bank` is slimmed to its record and its boxes later. Cost: two homes for each verb for a while.
7. **The bring-up asks for `bank` and `box` together,** in parallel, so that a bank not yet born is received as its
   shell and `unborn` reads off the bank Thing. Cost: one extra get per bring-up. The alternative keeps a separate
   flag that says `unborn` when the world fetch answers nothing, so the stage is not derived from the Thing alone.
   Recommended: the two gets.
8. **Which refusal a member throws when its Thing is not live.** Recommended: one new thrower of kind `absent_vault`,
   the kind used today when there is no bank. The alternative reuses `worldNotHeard()` (`record_conflict`).
9. **Who births.** With a main gate that can hold the shell, "the main gate births a bank" is now possible, at the
   cost of a third get, of `gate`, at bring-up. Recommended for this line: keep birth as a static reached through the world.

## 9. Rulings (the Coach, 2026-11-24)

| Point | Ruling |
|---|---|
| 1. The world is its own object | "yes. I'd make it an instance of a class" |
| 2. Birth's stages `unborn`, `locked`, `unlocked` | "sounds right" |
| 3. The cached start | scaffolding: "whatever keeps the ship afloat til then is great" |
| 6. `Bank`'s delegations to the world | scaffolding, as 3 |
| 7. The bring-up asks for `bank` and `box` together | allowed as scaffolding, with the startup study below |
| 4, 5, 8, 9 | not ruled; built as recommended above, and named in the thread's report |

**The name.** The Coach: "is 'bringup' what we do once there's a userid? Can we call it .onSignin ?" It is: `#bringUp` runs
only from `Device.signIn(userid)`. Proposed instead of `onSignin`: the front door stays `signIn`, its private half becomes
`#doSignIn`, and the world's part is `world.signIn()`. The words "bring-up" and "brought up" leave the code and its docs.
`onFoo` here names a handler a caller supplies (`onNotice`, `onBadNews`), so `device.onSignin(userid)` would read as
registering one.

**The startup study.** The Coach: "The old bringup was really complicated. If it still is when this is finished, can you
have an agent look at the entire startup process, note what we have for ensure bank that runs as one query, -- then forget
about how we do it now and outline what's needed?" Queued after thread C, read-only, on Opus.

## 10. A Thing duck types as its record (the Coach, 2026-11-24)

"I support keeping .record as an immutable object, but would like the { ...this } loggable props inscribed on the object
as own props; others should be private variables with getters, or non-enumerable own props -- all configurable
non-writable (adorn/tattoo/decorate) or non-configurable non-writable if set at construction time. A Thing should duck
type as its Record."

As built today, `adopt` tattoos the Thing fields alone, and a subclass adds a getter for whatever else it wants read.
The change, in `Thing.adopt`:

* **Every field of the adopted record is readable on the Thing.** The loggable ones are enumerable own props, so
  `{ ...thing }` and `JSON.stringify(thing)` show them alone. The rest are own props that are not enumerable.
* **Loggable means the Thing fields,** unless a subclass names more. Nothing opaque (a box's `val`, a wrapped key) is
  loggable.
* **All are non-writable.** The scope fields (`userid`, `banklabel`, `labelpath`) are set once at construction and are
  not configurable. Every other is configurable, because the next `adopt` sets it again.
* **A field the last record had and the new one lacks is removed.** A Thing that adopts a tombstone or the shell
  stops answering its last live record's fields.
* **A getter that only answers a record field goes,** since the field is now on the Thing: `Gate.wayins` and
  `Bank.lifetok` today. A class may not declare a member with a record field's name that answers anything else.
* **`pickle()` stays the way to the whole frozen record.** No `record` getter is added beside it.

Costs:

* **The types are looser than the runtime.** A class cannot be a union, so a kind's own fields read as possibly
  undefined on the Thing (they are absent over a tombstone or the shell). Code that wants them narrowed narrows `thing.pickle()`.
* **`adorn` and `decorate` make writable props today.** They live in `safebyok-big`; they take an option for a
  non-writable prop, which is a broadening of big's helper.
* **`Bank`, `Gate` and every box (`BaseBox`) extend `Thing` already,** so they gain their record's fields the moment this lands, before thread B1.
