---
---

Empty: the new `safebyok` is private, and the giver in `safebyok-react` that reads a car's liveness is not yet exported. What a caller of `ThingMinder` will see:

- **`bhnd`, not `behind`.** The liveness of a car whose fullest is an older revision is spelled `bhnd`, so that every liveness is four letters and they sort `void > gone > full > bhnd > bare`. `carLivenessVals` follows.
- **`agerank`.** Every `ThingCar` carries `agerank`, a string that compares as the car's age: of two cars of one Thing, the newer has the greater, and two cars of the same revisions and liveness have the same one. It joins with `~` the newest's lifepath and revseq, the liveness, and the revseq of `fullest ?? newest`, each of fixed width. A car whose agerank is not its own fails `isThingCar`.
- **Frozen through.** A car's records are deep-frozen as they land in it, where they lie: a record a vaultDB answers with can no longer be changed once the minder caches it, and nor can any object it shares with one.
- **`Revseq.padded`.** A revseq spelled as a lifeseq is, base-32 and padded to ten, exported beside `Lifeseq`.
- **After goodbye.** A get whose fetch had settled when `goodbye` came, and that resumes after a fresh `hello`, refuses `disabled` and joins nothing to the new listing, as `goodbye` already promised.

Nothing stored changes.
