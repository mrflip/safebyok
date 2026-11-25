# Thread 13: the Coach's sixteen notes, answered (2026-11-24)

For the Coach, and for whoever reviews #879: each note quoted, the answer, and what was done. Every note's comment is
gone from the code.

## `models/box.ts`

1. **"don't #bury-the-lede -- putting `.make` on one line doesn't let me see where the magic is made"** -- Kept as he
   opened it. `Box.make` now checks and then hands the constructor the very record (the ruling that `pickle()` is the
   object handed in), so its two lines say both steps.
2. **"this can also be a method on Thing, calling this.constructor.recordOrShell.parse(record)"** -- No. Checked with
   tsc today: a static `make<T>(this: new (record) => T, ...)` on the base refuses a subclass whose constructor is
   private, and equally one that is protected ("Cannot assign a 'private' constructor type to a 'public' constructor
   type"). It would cost a public constructor, which anyone could call with an unchecked record, or a cast; and only
   `Box` (and the tests' `PlainThing`) could use it, since `Bank.make` and `Gate.make` take opts and a friend.
3. **"BoxChecks.stamp.parse(this.pickle()) don't need the pickle, things duck as themselves" / "this should be a method
   on Thing, calling this.constructor.stamp.parse(this)"** -- First half done: `get stamp() { return
   BoxChecks.stamp.parse(this) }`, the same value (`ctx-bytes.test.ts` passes unchanged). Second half: no. The three
   stamps differ in what they refuse: `Bank` and `Gate` refuse `absent_thing` over a tombstone or the shell, which a
   stamp check alone would pass for a whole tombstone; `Box` stamps a tombstone (its empty whisper is sealed to it) and
   refuses only the shell, as `bad_record`. A shared getter would need a static check per kind, a cast to reach it
   through `this.constructor`, and an override in two of three kinds. His reworded doc line kept in substance: "Refuses
   the shell, whose lifeseq is the void one."

## `models/base-box.ts`

4. **Three statics opened onto three lines** -- Kept as he opened them.
5. **"would this simplify at all with a call to super and then mixing in the body? #earnest-question"** -- A little,
   but not by `super`. `nextRevisionOf` is a static of a sealer the lease is handed as a class; `Thing` has no static to
   call, and a `Thing.nextRevisionOf` of another signature would break the static side of `BaseBox extends Thing`. What
   could be shared is a `BaseThing` helper giving the Thing fields of the next revision (new revtok, revseq + 1,
   written_at, am, the next life where am flips, born_at on a birth), with each kind mixing in its body: box revisions
   and tombstones would lose two lines each, and `Gate.makeNextRecord` could use it. Not built: a generic return type
   for three callers is not clearly simpler. Left as an open matter.
6. **"why is this on Box not Thing? #earnest-question"** -- No reason: only a box starts a new life by a write today,
   but `nextLifeOf` is a pure function of a lifeseq and lifepath. Moved to `BaseThing.nextLifeOf`.
7. **"Why are these here and not in the shapes? #earnest-question"** -- No good reason; the CLAUDE.md rule applies.
   Moved: `liveBoxSealable` is `PerKindChecks.boxLiveSealable` (shapes-thing); the public props, tombstone props and
   cleartexts checks are `SealerChecks` in shapes-sealers, beside their types. Callers read them through `BoxChecks`
   (`liveSealable`, `publicProps`, `tombstonePublicProps`, `cleartexts`).

## `models/thing.ts`

8. **"just write out the fields, this is over-DRY"** -- Done, with one correction to his sketch: "The record will have
   all the fields" holds of a whole record, not of the shell or a sparse tombstone, which have no body. A field a record
   lacks must be no prop at all, not a prop set to undefined: `exactOptional` checks (for one, `BoxChecks.sealable` in
   `donorPropsOf`, handed a Box of the shell) refuse a key that is present and undefined, own or inherited (tried).
   So: the constructor writes the scope fields once, non-configurable; `Thing.adopt` deep-freezes and writes out the
   nine other Thing fields with `tattoo`; `Bank`, `Gate` and `BaseBox` each override `adopt` to write out their body
   with `decorate` (hidden, read-only), or remove it for a record without one. `was` and `loggableFieldnames` are gone.
   The cost: four places instead of one loop, about 35 lines for 12.
9. **"Documentarian needed on these comments, not readable"** -- Rewritten where they moved (shapes-vault-event,
   above `SeenChecks`): one sentence on why the lifepath's depth matters to the agerank. The note on the pattern's load
   order is gone with the cause: `ReadTcPattern` now sits above the check in the same module.
10. **"move these to the shapes"** -- Done: `SeenChecks` (now with `event` and `item` beside `seenCited` and
    `readTc`) and `ReadTcPattern` live in shapes-vault-event. The cost: `item` refines with `BaseThing.haveSameScope`
    and `itemSeenOf`, so a shapes module imports a model and the agerank module at runtime, where world, bank and gate
    keep theirs in the module for that reason ("they name a model class").

## `storage/agerank.ts`

11. **"you have three representations of the same thing ... the object has revseq as numbers"** -- Down to one: the
    string. `AgerankParts`, `agerankOf`, `partsOf` and `revseqOf` are gone. Where a field is wanted the string is split
    (`fieldsOf`, a typed tuple of strings), revseqs stay padded text and compare as text, and the record's revseq is
    padded once on the way in.
12. **"please rename everywhere "time" to tcchunk"** -- Done: `TcchunkDigits`, `tcchunkOf`, `tcchunkAfter`, the docs of
    `Agerank` and `VaultItemEvent`, Thing's comments, the test harness, and the generator.
13. **"this method is dying under the weight of allowing undefined" / ""raise" is on our list of words to avoid"** --
    The list is VOCABULARY.md's "Avoid these" ("raise: deprecated. Say increment, throw or start."). `raisedOf` is
    `nextAgerankOf(agerankWas, seen, read_tc, isWhole)`: it takes `UnseenAgerank` (`''`), never undefined, reads the
    record's lifepath and revseq straight off it, and makes the tcchunk itself. Renamed: `raisedOf` to `nextAgerankOf`,
    `timeRaisedOf` to `tcchunkAfter`, the tests' `isRaised` to `isNewer`; "raise" is out of every doc block and test
    title in the new core but VOCABULARY.md's own `agerank` row ("raises the agerank"), left as an open matter.
14. **"where is this called from that doesn't know whether it's alive or dead?"** -- Every caller is handed a record
    whose liveness it has not judged: `AdapterVaultDB`'s notice of a row it read, the SortedVaultDB's `receive` of what
    a device database rang, the device's restore of persisted roots, and the event check that an event's `liveness`
    matches its `val`. No change.
15. **"don't let agerankWas be undefined: substitute a value that compares naturally"** -- Inside the rule, done:
    `UnseenAgerank = ''` sorts below every agerank, so `nextAgerankOf`'s comparison and `eventsOf`'s life test need no
    case for it. The events still carry `agerankWas: undefined` (and `agekindWas: undefined`) after a first record:
    that is what a listener is told today, and the handoff holds a change to it. So the table did not change. A raw
    vaultDB's notice keeps both undefined: it keeps no agerank, and `''` would claim nothing was seen before.
16. **"agerank has been zod validated to its shape (convince yourself of this)" / "just split it on the pipe."** --
    Split on the pipe. Strictly it is never parsed by zod: an agerank is only ever made by `nextAgerankOf`, from a
    lifepath that `SeenChecks.seenCited` checked (base-32 digits, `-` and `/`), two `Revseq.padded` strings, and the
    tcchunk of a `read_tc` that `SeenChecks.readTc` checked; none has a `|`, and `#agerank` is private. A comment above
    `fieldsOf` says so.
