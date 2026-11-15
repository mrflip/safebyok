# Thread 1: box_store (2026-11-15)

Branch `20261115-box_store`, PR [#701](https://github.com/mrflip/safebyok/pull/701), base `main` (the box_ops plan commits ride in it). Proved: see the
PR's **Tests:** line (the rework: storage tests, tsc and eslint clean, then `pnpm justify`).

* **Built** (`packages/safebyok/src/storage/`, design-boxops.md *Building it* item 1):
  * Roots: the bank at `bank`, the main gate at `gate`, the root box at `box`; further gates at
    `gate/<label>`; boxes at any depth. Lifepaths have no leading `/` and one lifeseq per labelpath
    segment; `ShellCited.lifepath` is `-1`, and `childShellCited(p)` gives `p/-1`.
  * Kinds and their checks in `shapes-thing.ts`: bank (3101, no body), gate (4101), box (5103: live
    is `sidecar` + `whisper_sealed`, a tombstone `whisper_sealed` with no sidecar). Each kind names
    its policies; the main gate's tombstone is refused.
  * Asks: get, list, put, del, each with a `modelkind` that must be its labelpath's. A del's
    `ifAbsent: 'fail'` and `ifPresent: 'repl'` are fixed. `WriteThingAsk` is the union
    `BankWriteAsk | GateWriteAsk | BoxWriteAsk`; `WriteAskOf<RecordT>` extracts one.
  * Builders `getAsk`, `listAsk`, `putAsk`, `delAsk` (over `getAskOf` and the rest) fill the
    defaults and never throw: what will not parse goes through, for the verb to refuse in its answer.
    `delAsk` accepts `{ cited, record }` only and writes the fixed flags.
  * Write checks (`checkWriteInvariants`) are one-line ifs, each throwing a named thrower from the
    `[Write throwers]` section of `shapes-thing.ts`, its meta carrying the loggable ask.
  * A del citing a tombstone throws `absent_vault` with `act: 'dubdel'` in its meta;
    `answerForThrown` answers with the meta's act, else `unclassified_storing`, as big's `badAnswerOf` does.
  * Gate storage policies in `policies.ts` (`demandPolicies`); no import cycle.
  * `tryListThings`: direct children of the parent's live lifepath. Under a parent gone or void it
    reads no child: `dbhas` `[]`, `damaged_rows: []`. A damaged child of a live parent is set
    aside by a `safeParse` (`listedThingOf`, after big's `listedRowOf`), whatever its own life.
  * `tryBirthBank`: the bank's put has `ifPresent: 'get'`, so the put table answers `passed` over
    a live bank (still `storage_issue` if its gate or root is missing); the gate's and root's puts
    refuse over anything left behind. The adapter makes the puts once and passes them to
    `doBirthBank(ask, puts)` and `classifyBirthBank(puts, fetched)`; `writtenRootsOf` checks what
    the store reports writing. Exported, with `writtenThingOf`, for a store subclass.
  * Tests: `tests/storage/shapes-thing.test.ts`, `memory-vault-db.test.ts`, `adapter-vault-db.test.ts`;
    helpers in `tests/test-helpers/vaultdb-world.ts` build every ask through the builders.
  * design-vaultdb.md's labelpaths, lifepaths, invariants, gate CHECKs and asks brought up to date.
* **Decisions taken**:
  * Throwers live in `shapes-thing.ts`, not `src/throwers.ts`: the lean core has no throwers
    module of its own (it uses big's `Throwers`, frozen), and one would cycle through `loggableAskOf`.
  * Get/list builders strip fields; put/del pass strays through to the strict check, though a
    stray `op`, scope or `modelkind` is overwritten by the builder's own.
  * Impossible branches are one-line `unexpected_error` throws (new phrase `ReplacedThingAmiss`).
  * Kind-typed reads (`storedOf`/`writtenOf` accept a kind's `StoredCheck`) replace the casts on
    the birth's roots and the stored gate.
* **Casts left in `src/storage`** (seven): four in the builders (`as GetThingAsk`, `as ListThingsAsk`,
  `as unknown as WriteAskOf<RecordT>` twice), as what was given passes through unparsed; `modelkindOf`'s
  `as Thingkind` (of a sound labelpath); `Object.keys` in `ThingFieldnames`, `Object.fromEntries` in
  `exactPartialOf` (both lose fieldnames). Removed: `as WriteThingAsk`, `as BirthBankAsk`,
  `as BankRoots`, `written as typeof actual.things`, `stored as GateThing`, `stored!`, the four
  non-bag `args as unknown as`, and two in the test helpers.
* **Deviations**:
  * A del refuses any `options` as well as changed flags (`DelFlagsFixed`): a del has no policies.
  * `ThingkindNotStored` and `LifepathNotOwn` gave way to per-kind and lifepath-depth checks.
  * The changeset is empty with a body: `safebyok` is private.
  * Exports added beyond the design: `childShellCited`, `modelkindOf`, `isLabelpathOfKind`, `CitedOf`,
    `sparseOf`, `sealed`, the three write asks, `WriteAskOf`, `BirthPuts`, `writtenThingOf`, `writtenRootsOf`.
  * Vocabulary: stores/holds became stored, take became accept, apply became check, map key ckey.
* **Mechanism differences from big** (each forced by the one Thing shape for every kind):
  * The act tables run over `ThingCited`, the lifepath standing for big's life tok.
  * `dubdel` is found from the ask before any fetch, so the del table's `dubdel` row cannot be
    reached (kept, per the Coach).
  * One reader parameterized by a kind's check (`storedOf`), where big has one per row kind.
  * Storage policies drop big's `registered_at` row: every live-over-live write keeps its born_at.
* **Approaches set aside**: a listing that walks the whole subtree (the Coach ruled children only);
  the parentage check on a write (TODO in design-boxops.md); a `src/throwers.ts` (cycle); builders
  that throw (the Coach: the verb refuses); a hand-built `passed` for birth (the put table owns it);
  a cast or overloads to narrow a kind's stored Thing (a check by `fmt`, or a kind-typed read).
* **Discoveries**:
  * The same birth again answers `retcon`, by the put table; a birth with another revtok, `passed`.
  * A void vault's refusal kind is `absent_vault`.
  * `MemoryVaultDB.#thingsOf` creates an empty bank map on a read: harmless, left alone.
  * Labels are 2+ characters, so test paths use `box/aa/bb/cc`.
* **For the Coach**:
  * Stored gate Things at `gate/main` with a `/`-led lifepath now fail safe: the main gate at `gate`
    reads as absent, and the old row refuses as `damaged_row` in a listing.
  * Vocabulary left as is: "the policy that applies" (the put table's opflag), "Start a watch",
    "adds a passkey wayin" (the policy's name), "the store" as a noun, "starts with" a prefix.
