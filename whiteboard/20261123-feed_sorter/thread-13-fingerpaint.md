# Thread 13: fingerpaint (2026-11-24)

Branch `20261124-fingerpaint`, PR [#879](https://github.com/mrflip/safebyok/pull/879), stacked on #877, beside #878
(thread 12, same base). Red on purpose: the stretch's 18 `vault-minder` tests, the same 18 by name as at 5d67f663a
(diffed). Proved: see the PR's **Tests:** line.

Each of the Coach's sixteen notes, quoted and answered, is in
[thread-13-fingerpaint-notes.md](thread-13-fingerpaint-notes.md): read it to review a note's answer.

* **Built**:
  - `Thing.adopt` writes out the nine Thing fields (`tattoo`) and deep-freezes the record (es-toolkit `deepFreeze`);
    the constructor writes the scope fields once, non-configurable. `Bank`, `Gate` and `BaseBox` override `adopt` to
    write out their body as hidden read-only props (`decorate`), and remove it for the shell or a sparse tombstone.
    `BaseBox` declares `sidecar?` and `whisper_sealed?`, `Gate` `auth?`, `sigs?`, `meta?`. `loggableFieldnames` is gone.
  - `Box.make`, `Bank`'s constructor and `Gate.make` check their record and begin from that very object, so `pickle()`
    is the record handed in, first and later alike. `Gate.adopt` checks the wayins (`GateChecks.wayins`) and keeps the
    record, where it used to put Wayin-parsed copies in a new one. A test per class says so (Box, Bank, Gate,
    PlainThing).
  - The agerank is one string. `nextAgerankOf(agerankWas, seen, read_tc, isWhole)` replaces `raisedOf`, takes
    `UnseenAgerank` (`''`) for a Thing's first record, and compares padded revseqs and the tcchunk as text; `fieldsOf`
    splits on `|`. `time` is `tcchunk` throughout, generator included.
  - Checks moved to the shapes: `SeenChecks` (`seenCited`, `readTc`, `event`, `item`) and `ReadTcPattern` to
    shapes-vault-event; a box's seal-input checks to `SealerChecks` (shapes-sealers) and `PerKindChecks.boxLiveSealable`,
    read through `BoxChecks`; base-thing's guard checks to `ThingChecks.scopedLive` and `scopedTombstone`.
  - `Box.stamp` parses the box itself; `nextLifeOf` is `BaseThing.nextLifeOf`; `anteOf` in gating.ts parses the gate.
* **Decisions made**:
  - A field a record lacks is no prop, never a prop set to undefined: zod's `exactOptional` refuses a present
    undefined key, own or inherited, and `BoxChecks.sealable` is handed Boxes. Getters on the prototype were set aside
    for the same reason; a generic body loop in `Thing` (destructure the Thing fields, decorate `...body`, delete the
    last body's names) was set aside as the over-DRY form the note named.
  - The events keep `agerankWas: undefined` after a first record (held: it is what a listener is told). `eventsOf`
    turns `UnseenAgerank` back into undefined for them. So `FeedCases` is unchanged but for one blurb's word.
  - Bodies kept on one line where they were, save the four the Coach opened (the clarification: only high-prominence
    members open). None opened elsewhere.
* **Deviations**: none. `sorted-vault-db.ts` changes only in three import lines, since `SeenChecks` and
  `ReadTcPattern` moved (`git show 283eff366 -- packages/safebyok/src/storage/sorted-vault-db.ts`).
* **Discoveries**:
  - `Bank` and `Gate` each have the same private `#demandLive()`, and `Box` and `Gate` the same `get scope()`; a
    base-owned version needs a cast in the generic `Thing`. Listed, not built.
  - #877's deep-freeze ruling says the adapter freezes "never the ask or a caller's record"; this thread's ruling has
    `adopt` deep-freeze what reaches a Thing another way, which includes a host's record handed to `Box.make`, and
    `receive`'s `val` (shallow-frozen before).
* **The same issues elsewhere, left** (file, snippet, note it resembles, what I would do):
  - `storage/sorted-vault-db.ts`, `rungEvent:         obj({`: checks in the module (notes 7, 10), and
    `read_tc: str.regex(ReadTcPattern, ...)` restates `SeenChecks.readTc`. Thread 12's file: move to shapes-vault-event
    once the two threads are stacked.
  - `models/vault.ts`, `boxLabelpath: BoxChecks.labelpath.refine`: checks in the module; vault.ts is likely rewritten
    on VaultTSQ, so move them then (to `BankishChecks`).
  - `models/device.ts`, `const Checks = Validator.Checkers('bad_record', ({ obj, arr, fn, custom })`: names `Device`,
    the exception world, bank and gate state in a comment it lacks. Add the comment.
  - `models/device.ts`, `maskedViewLeaseOf(this.bank === null ? undefined : this.#world)`: a function bent by
    undefined its caller knows (note 13). Take a `World`, and the caller picks `EmptyMaskedView.lease`. Left because
    thread 12 may rewrite that line (`#minder.maskedRows()`).
  - `models/bank.ts` and `models/gate.ts`, `#demandLive(): BankRecord {`: one member per subclass (note 3). A protected
    `Thing.demandLive(): RecordT`, with a cast.
  - `models/box.ts` and `models/gate.ts`, `get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }`: the
    same (note 3); `Bank`'s differs, so a base default needs a cast or an override. Leave.
* **For the Coach**: the open matters in the PR body; each is also here.
  - **Events after a first record**: carry `agerankWas: ''` (`UnseenAgerank`) rather than undefined? Recommended, firmly:
    it compares naturally for a listener too, and `isNewer` loses its undefined case. Undefined would stay for a raw
    vaultDB's notice. It changes what a listener is told, so held.
  - **Deep-freezing a host's record**: `Box.make(record)` now freezes the host's object deeply. Recommended: accept, as
    the price of `pickle()` being the object handed in; or have `make` freeze only what came from an adapter.
  - **A shared next-revision helper** (note 5): recommended not yet; revisit when a second kind writes a next life.
  - **VOCABULARY.md's `agerank` row** says "raises the agerank": suggest "leaves the agerank greater". Not edited.
