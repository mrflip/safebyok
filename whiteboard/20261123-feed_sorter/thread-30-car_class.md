# Thread 30: car_class (2026-11-25)

Branch `20261125-car_class`, PR #TBD, stacked on [#895](https://github.com/mrflip/safebyok/pull/895). Proved: see the PR's
**Tests:** line.

Built by hand (no /sprint), from the orchestrator's brief (M1–M5). The Coach's sketch: `ThingCar.make(recordish, { world })`
calls `world.makeThing`, which stays polymorphic and picks the factory; each kind's static make goes shellOf → `new this`
→ receive; "Make sure all make methods validate".

* **Built**:
  * **M1, `ThingCar` is a class** (`src/minding/thing-car.ts`, exported from `safebyok`). `make(begun, { world })` takes a
    Thing, the shell, or an item event (its record, `read_tc` and `sourcelabel`), whose record the world makes the Thing
    at the shell of and the car then receives. A refused first record leaves the car all the same, the refusal kept as
    `lastErr`; `record_conflict` from the world throws. `receive` keeps the bookkeeping thread 27 had: a refusal sets
    `lastErr` and `erred_at` and is thrown, a record taken clears `lastErr`, and `read_tc` moves only where the Thing
    returned events. The car is frozen with `thing` its one own field; the rest are `#private` behind getters.
  * **The VaultMinder** keeps `#world` (a `CarWorld`, `{ makeThing }`) in place of `#makeThing`, makes a car with
    `ThingCar.make(BaseThing.shellOf(seen), { world })`, puts it in the map, and only then has it receive: thread 23's
    subscriber-hears-the-car test passes unchanged.
  * **M2.** `Thing`'s constructor takes only the shell (`protected constructor(shell, bulletproofCallback)`).
    `BaseThing.shellOf(seen)` gives the shell of any record seen: the void sentinel itself, else `Shell.inParentLivesOf`.
  * **M3.** `Bank.make`, `Gate.make` and `Box.make` take `begun: ShellOf<R> | VaultItemEvent<R>` and `opts: { world }`
    (`ThingMakeOpts`, now in `shapes-bankish`), the gate its `WorldGateFriend` third. Each checks its arguments, checks
    `record_conflict` (bank and gate), constructs at the shell, and receives an item event, throwing where it refuses.
    The Box keeps only `world.bulletproofCallback`. Nothing stamps "read now".
  * **M4.** `world.makeThing(begun)`: overloads by an item event's record kind, then `VoidSentinel | VaultItemEvent`.
    Order kept: check, record_conflict, construct (`thingClass.make(shell, { world: this }, friend)`), subscribe a root,
    receive the event. `World` gains a `device` getter, which Bank and Gate read.
  * **M5.** Every `static make` listed in the PR body with its entry check. `World.make` checked nothing
    (`custom<Device>()`): it is now `instanceof Device`.

* **Decisions made**:
  * **Shape: `make(begun, { world }[, friend])`.** STYLE's `make(recordish, livepropsAndOpts[, friend])`: `{ world }` is
    the live object, second; the gate's friend stays third, a narrow pick of the world, never on a public surface.
  * **`begun` is the shell or a whole item event, never a bare record.** A bare record carries no `read_tc` or
    `sourcelabel`, and making one up would stamp "read now" inside a make. Checked as `SeenChecks.begun`:
    the union of the three strict kind shells and `itemEvent` (`item` plus eventkind, sourcelabel, banktok, ageranks).
  * **The minder uses the shell form**, not the item-event form, so the car is in the map before its first receive and
    the minder gets the events that receive returns. The item-event form drops them; its doc block says so.
  * **The world check is a duck** (`isWorld`, by `WorldMembernames`) in `shapes-bankish`: `instanceof World` there
    would import the model into the shapes and cycle.
  * **Set aside**: a bare-record form of `Thing.make` (stamps a read time); a `ThingCar` that keeps the world (the car
    never needs it after make); passing the friend inside `opts` (puts it on the opts type, a public surface).

* **Deviations**:
  * **`VaultMinderOpts.makeThing` became `world`**, typed `CarWorld`: the brief's "makers take `{ world }`" for the
    minder too. `Device` hands its world.
  * **`recordOrShell` and the `*ThingOrShell` checks are gone** (no reader); `boxRecordOrShell` stays (`BoxChecks.liveOrShell` reads it).
  * **A car is one object for its life.** Thread 27's frozen car was replaced at each change; now `carAt` answers the
    same car, whose getters change. What it holds after a refusal or a clear is unchanged.

* **Discoveries**:
  * `TH.boxShellOf()` is no real shell (`born_at` T0), so the strict `BoxChecks.shell` refuses it; tests use
    `Thing.shellOf(TH.boxThingOf())`.
  * Unchecked makes, left: `PassphraseProving.make` and `PasskeyProving.make` (a fix wants a `ProvingParts` checker,
    security-sensitive, not a line), and `Vault.make(world, vaultTSQ)` (no VaultTSQ check exists, and its shape is not
    record-then-opts).
  * The getOnce `!` stays: nothing here makes it honest.

* **For the Coach**:
  * **ThingCar is exported from `safebyok`.** A devtool reads `carAt`; a host could make one, with any `{ makeThing }`.
  * **The one source cast** is in `BaseThing.shellOf`: `Shell.inParentLivesOf` answers a shell of no particular kind.
