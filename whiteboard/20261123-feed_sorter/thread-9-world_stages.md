# Thread 9: world_stages, the world derives the stage from the root Things (2026-11-24)

Branch `20261124-world_stages`, PR #875, stacked on #874 (`20261124-things_made`). The second half of B2 in
`world-design.md`. Proved before the catch-up: `safebyok` typecheck and lint clean, tests 1951 passed and 149 failed: the
seven `vault-minder` tests (listen 4, writes 2, staleness 1) and 142 rows of `vault-minder-chains.test.ts`, the same 142
rows before and after this thread (diffed by name). `safebyok-idb-lean` 113, `safebyok-postgres` 354,
`safebyok-react-lean` 320, each typecheck, lint and tests clean. `lease.ts`, `proving.ts` and `ctx-bytes.test.ts` are
unchanged. After the catch-up onto #874 at a8786d3dc (whose chain-table fix leaves 11 rows red there): `pnpm justify`
lint, typecheck and build clean, every other package's tests green; `safebyok` 18 failed (the seven and 11 chain rows,
all `bare+soon <- ...`), the same 18 by name as at a8786d3dc itself.

* **Built** (in `packages/safebyok/src/models/`):
  - **`World` derives the stage** (`#stageOf`, first that holds): an end cause, `swept`; nobody signed in,
    `signed_out`; bank, main gate and root box Things all live, `locked`/`unlocked` by the lease; a sign-in refusal
    recorded, `failed`; no bank Thing or a live bank without the other two, `starting`; else (shell or tombstone)
    `unborn`. `#makeSnapshot` returns `SignedOutBank` and `PendingBank` themselves for the first two, a frozen
    `{ ...PendingBank, stage }` for `unborn`/`failed`, and the bank snapshot otherwise; `align` replaces it only when
    `isEqual` says it changed, so a read or an event that changes nothing makes no new object and tells no one.
  - **The world listens** to its SortedVaultDB from `hello` (which also aligns), and realigns on hearing the root box,
    or the bank holding the shell or a tombstone (`#hear`). `onBadNews` is a no-op: the minders already tell the device
    of a record refused.
  - `World.areRootsLive`, `#rootBox`, `isLive(thing)`; `demandRootsLive` rewritten on them.
  - `World.showSignInRefusal(err)` keeps `#lastErr` (the device's sign-in calls it); `showStandIn`, `showBank` and
    `#standIn` are gone. `align` is public (Internal), for the device's `signIn` to call once `userid` is set.
  - `World.birthGating(params)` with a `#birthFriend()`: `leaseByProving(proving, bankStamp, cited)` builds the lease
    on `#leaseGateOf(bankStamp)` citing the gate record, and `attachLease(lease)`. `BirthGatingFriend` changed to that.
  - **`Device`** lost `#bank`, `#attachWorld`, `#attachBank`. `device.bank` is `world.bank` while `areRootsLive`, else
    null. The vault is made in the device's world-subscriber (`#align`) the first time the bank is non-null, which is
    the moment the world tells of `locked`. `birthGating` goes through `world.birthGating`.
  - **Sign-in** (`#bringUp`): after `fetchWorld`, where it answers null, `bankMinder.get(bank, { staleTime: 0 })`, so
    the bank's shell reaches its Thing and the stage reads `unborn`. Otherwise `world.demandRootsLive()`, so a broken
    answer is still reported as `failed`, as `#attachWorld` did. Catch: `device.bank !== null` tells `onBadNews`, else
    `showSignInRefusal`.
  - **Birth** (`gating.ts`): no gate object; the lease is built against the minted stamps and the gate record, held in
    a local, evicted on any refusal, attached by the friend after the revtok check. Stages: `unborn`, `locked` (the
    roots received from `tryBirthBank`'s answer), `unlocked` (the lease attached).
  - `Gate.birthGating` gone; `Bank.birthGating(device, params)` checks the device and delegates to the world (the
    `attachBank` parameter is gone). `world.makeGate`, `GateOpts.bankStamp` and the gate's `#bankStamp` are gone;
    `gate.bankStamp` is `world.bankStamp`.
* **Decisions made**:
  - **`signed_out` reads `device.userid === null`,** not "no SortedVaultDB yet": the SortedVaultDB is made after the
    persisters restore, and `starting` must show from `signIn` on, as today and as two persister tests state.
  - **`failed` holds while a refusal is recorded and the roots are not all live,** not "no bank Thing": with "no bank
    Thing", a refusal after the shell is heard, or a broken answer with a live bank, would show `starting` forever.
    This keeps today's answers, and a later birth still moves the stage on to `locked`/`unlocked`.
  - **The world realigns at the root box, not at every root event:** an answer tells bank, gate, root box in order, so
    a birth from `unborn` would pass through `starting` (bank live, gate not yet) at the bank's event. The bank's shell
    or tombstone comes alone (sign-in's bank get), so that realigns too. A gate event alone changes no stage outside an
    ending.
  - **The vault is made in the device's world-subscriber,** not lazily in the getter: `Vault.make` hosts itself on the
    world, which refuses once swept, so a getter first read after a sweep would throw.
* **Deviations** from the handoff: the three decisions above that word the table differently (`signed_out`, `failed`,
  realign events); `Bank.birthGating` loses `attachBank` and validates its device; `World.align` made public.
* **Scaffolding**:
  - Scaffolding: sign-in's extra `get` of the bank where `fetchWorld` answers null (`device.ts`). The lifecycle
    thread's one-get sign-in removes it.
  - Scaffolding: `receiveRestored` stays (`device.ts`). The LocalBridge thread removes it.
  - Scaffolding: `World.align()` public for `signIn` to call. Goes when sign-in moves onto the world (lifecycle thread).
* **Host-visible consequences** (beyond the birth's added `locked`):
  - A birth that meets a bank born elsewhere (`gate_made_elsewhere`) on a device at `unborn` now leaves the stage
    `locked` on that stored bank, and `device.bank` is it; today it stayed `unborn` with no bank. Forced by the roots
    being received before the revtok check (handoff item 3). No test states either.
  - `Bank.birthGating` without `attachBank`: the bank is now the device's. A non-Device refuses `bad_record` at once.
  - After a sign-in `failed`, roots going live by any route (a birth, a watch notice) show the bank; today only a
    birth did.
  - `world.sweep()` called on a device with no bank shows `swept`; today the stand-in stayed (ending; not designed for).
* **Tests changed** (promise before -> after):
  - `device.test` "asks its vaultDB nothing ... until it signs in": after sign-in, one get and one watch -> two gets
    (the root box, then the bank, none being stored) and one watch.
  - `device.test` "shows its bank unborn where none is stored, and the bank born on it after" -> "... after, locked and
    then unlocked": stages `signed_out, starting, unborn, unlocked` -> `signed_out, starting, unborn, locked, unlocked`,
    and `device.bank` is the born bank when `locked` is told.
  - `gating.test` x7 "... making no bank" / "before it makes a bank" (vaultDB refusal, weak passphrase, five cleartext
    cases): `Bank.make` never called -> the device has no bank and its world's bank Thing still holds the shell its
    sign-in found (`expectNoBankBorn`).
  - `gating.test` "makes a gate to seal the root box, and the bank's main gate is the one its device's world keeps" ->
    "makes no gate before the bank's main gate, the one its device's world keeps, unlocked" (`Gate.make` once).
  - `gating.test` "hands `attachBank` the bank it births" and "births a bank its device does not show, where no
    `attachBank` is given" -> one case, "births the bank its device then shows, unlocked"; "refuses an `attachBank` that
    is not a function" -> "refuses a device that is not one". `gatingOf` drops `attachNothing`.
  - `gate.test`: the helper makes a gate alone with `Gate.make(record, { device }, AloneFriend)` (a stub friend no
    case builds a lease on) in place of `world.makeGate(record, bankStamp)`. "has the bank's stamp, the device ... and
    its own stamp" -> "... and refuses its bank's stamp while its world has no bank"; added "has its bank's stamp from
    its world, once a bank is there" (born bank). Shell case drops "bank stamp" from its name and line. "refuses a
    bankStamp that is not a stamp, no opts at all, or no friend" -> "refuses no opts at all, or no friend".
  - `proving.test` `gateOf`: the altered gate is made by the born gate's world (`makeThing`) in place of
    `world.makeGate(record, WorldBankStamp)`; same promise.
  - `world.test` "are null, and the stamp refuses, until the world hears of a bank" -> "are null until the world hears
    of each, and the stamp refuses until it hears of a live bank": signed in with none stored, `world.bank` holds the
    shell.
* **Approaches set aside**:
  - Deferring the world's align to a microtask so an answer's three roots land together: async machinery in the
    snapshot path; tests reading the snapshot right after a sync receive would break.
  - `unborn` for "bank live, gate or root not": moves the transient to sign-in, which would flash `unborn`.
  - Making the SortedVaultDB at `signIn` (so "no SortedVaultDB" reads `signed_out`): starts its watch before the
    minders hello, so a notice in the restore window would reach no minder.
  - Keeping `world.makeGate(record)` without the stamp for `gate.test`: a world member for tests alone.
* **For the Coach**: the `gate_made_elsewhere` consequence above; whether the realign-at-the-root-box rule is the shape
  he wants until the one-get sign-in delivers the world in one tell.
