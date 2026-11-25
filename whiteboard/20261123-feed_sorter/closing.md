# The feed_sorter line: closing note (2026-11-25)

The line rebuilt the new core's minding layer, by hand with the Coach, in 32 threads: PRs #867 to #899, all merged, and
#904, the valedictory. Each thread's decisions are in its `thread-<N>-<label>.md` here. This note is for whoever works
on this code next: what stands, which of the Coach's rulings shaped it, and what was left open. A ruling settles the
question it answered; each is quoted beside that question.

## What stands

* **Thing** (`src/models/thing.ts`): one per labelpath across lives. It reads as the record it holds, the shell until
  it adopts one, and knows nothing else. `receive(event)` is `take` (adopt a whole record newer than the one held) then
  `publish` (tell its subscribers).
* **ThingCar** (`src/minding/thing-car.ts`): what the VaultMinder keeps at each labelpath. It holds the Thing, how far
  it has been seen (`citable`, `agerank`, `agekind`, `read_tc`) and the refusal it last raised (`lastErr`, display
  state). It decides which records are news and returns their events. It is kept before its first record and never dropped.
* **VaultMinder** (`src/minding/vault-minder.ts`): the map of cars, the raw verbs, the once verbs, `tryGetWorld`.
* **VaultTSQ** (`src/minding/vault-tsq.ts`): TanStack Query over the minder, default structural sharing, `retry: false`.
* **World** (`src/models/world.ts`): subscribes to its three root Things, seeds from and keeps the root shelf, makes
  every Thing (`makeThing`). **Device** signs in: minder, vault TSQ, `world.signin`, vault, `tryGetWorldOnce`, then
  aligns the world.
* **safebyok-react-lean**: `useWorld` served by the world, `useGate` by the gate Thing.

## Rulings that shaped it

* **No optional fields between layers.** "I'd prefer to send a sentinel value" (an ask's banktok); "a sentinel that
  sorts correctly and behaves sensibly but is inspectably the distinct 'bare'/'vacant' case" (the agerank). The
  exceptions he named: a sparse live box's two body fields ("missing or undefined ... for duck typing"), "certain
  draft/dna builders we might not yet have", and "'duckish' validators".
* **Only a live box has a sparse form.** "The bank, gate, and tombstone forms all have bounded sizes: there's no good
  argument for the hassle that sparse forms bring on any of those." A list of a parent that is not live refuses
  `absent_thing`.
* **The void revision is compared like any citation.** Of a root tracked at the void revision as a special case:
  "That's a bad sentinel and there' no use case for it".
* **The world subscribes to its roots as ordinary Things.** "I hold the world should subscribe to them as ordinary
  Things, getting a snapshot."
* **A car beside the Thing, not the Thing as the car.** "pretty strong opinion that the cost is lower than one thinks
  to have Car and leads to design friction without it".
* **`lastErr` is cleared by any record taken**, and a once verb answers only the refusal its own answer's record
  raised. Of a refused record: "the thing can't be permitted to remain. I'd apply the same or similar policy TSQ does
  for an errored record".
* **`world.makeThing` makes every kind in every shape.** "it's a perfectly useful thing and an agent will just doodle
  it on whatever surface is nearby otherwise".
* **An error is thrown where it is detected.** "I don't hold it to be a good idea to detect an error in one place and
  trust it will be thrown elsewhere".
* **Start-up's make-do stays inside the world**, and sign-in builds everything before it asks: "Having a clean
  'everything is here' state is best".
* **The root shelf is plain JSON with read times.** "At the sizes you quoted just JSON them all and keep it easy";
  "Root shelf should have times it was taken from vaultdb and so too anything cached outside TSQ. No timers at this moment".
* **A devtool's view is the last member of the class closest to the concern.**
* **Every `make` validates.** "Make sure all make methods validate".
* **Endings (lock, sweep, sign-out, delete) were out of bounds for this line**; the lease_shelf line takes them up.

## Left open, none approved

* **How the world hears of an unborn bank** (#904): the device aligns its world once the roots answer, (C); the other
  remedy, (A), a void-over-void tell inside `Thing.receive`. Awaiting the Coach's confirmation.
* **A bare-record form of `make`**: the Coach's own to build (`TODO.md`).
* **The world making the minder, and the Gate shedding its delegations** (a fresh look's changes 2 and 4);
  `Bank.hostVault` and `Device.#endCause`, dead (`TODO.md`, "Pass-throughs to drop?").
* **The devtool view's field names**: `bankTSQ` names no TSQ, and a car's row states TanStack fields it does not have.
* **Four `TODO.md` entries the curation could not judge**: void and gone separate in the minder; a query key whose
  subtree is one prefix; hashing the userid; `vaultDB.vacate` clearing an adapter's client cache.
* **Small**: `ThingCar.receive`'s doc block wants a documentarian pass; four harness helpers are defined in both
  `thing.test.ts` and `thing-car.test.ts`; `Vault.#donorAt` keeps its own "no Thing after the get" check, unjudged.
