# Thread 7: The dna at `build`'s door (2026-10-30)

Branch `20261030-box_dna`, PR #377, stacked on #370 (restacked onto #374; the restack's push is
pending). Justify: green (safebyok 3847 passed, 37 skipped; every package green, size budgets
unmoved).

* **Built**:
  * `MSX.boxDna` in `src/models/models-shapes.ts`, in the box's section beside `boxRecord`: an
    `Checker` refusing `bad_option`. The scope is required; `sidecar`, `whisper_codec` and
    `whisper_schema_version` are optional and take their defaults (`{}`, `'json_v1'`, `1`) where
    missing *or undefined*; the sealed parts are optional and kept where given; `whisper` is
    optional; the factory's props (`fmt`, `am`, `vault_tok`, `revision_tok`, `revision_seq`,
    `registered_at`, `written_at`) are optional, checked where given, and stripped by a
    `.transform` that destructures them out (`_`-prefixed, as the eslint config's comment on
    `sonarjs/no-unused-vars` describes). Unknown fields refuse (strict). `MSX.BoxDnaFilled` is its
    output type.
  * `BoxListing.build`: first line `if (hasRevision(input)) { return super.build(input) }`, then
    `const { whisper, ...dna } = boxDna.parse(input)`, build, and seal only where a whisper was
    given. `hasRevision` is the test `Listing.build` already used (`'revision_seq' in input`), now
    exported from `listing.ts` with a doc block, so the two tell a dna from a record the same way.
  * `BoxListing.draftOf` takes `Omit<BoxDnaFilled, 'whisper'> & Revision & Times` and is
    `{ ...dna, fmt, am: 'a', vault_tok }`: the defaults live in `boxDna` alone, and the factory's
    props are laid *over* the dna. Before, the dna was spread last, so a dna's `am: 'x'` or a
    foreign `vault_tok` overrode the factory, and a `sidecar: undefined` overwrote the `{}`.
  * `MSX.Dna` admits `undefined` for each record prop
    (`{ [Prop in keyof RecordT]?: RecordT[Prop] | undefined }`), as VOCABULARY's duckish says a
    prop may be given as undefined; Zod's output for an optional field is typed that way.
  * Tests: `describe("MSX.boxDna")` at the end of `tests/models/models-shapes.test.ts` (a table of
    23 cases, and the round-trips, each `@example` tied by title); `describe("BoxListing: build
    holds a dna to boxDna at its door")` at the end of `tests/models/box-listing.test.ts` (8 cases:
    the refusal and its fieldname, nothing held or called; strict; a bad whisper refused before the
    build; the factory's props ignored; a bad factory prop refused; undefined props filled; a
    record keeping its own check; a dna carrying `revision_seq` taken for a record).
  * An empty changeset, `.changeset/20261030-box_dna.md`: `src/models/` is not exported.
* **Decisions taken**:
  * **Telling a dna from a record**: by `revision_seq`, as `Listing.build` already does, so a
    record never meets `boxDna` and keeps `recordOf`/`sparseOf` (via `receive`).
  * **Strict on unknown fields**: a dna is a bag a person typed (STYLE.md *Validation*), so a
    misspelt `sidcar` refuses rather than vanishing.
  * **Defaults in the checker**: VOCABULARY's duckish fills defaults for a prop missing or
    explicitly undefined, which Zod's `.default()` does and a spread in `draftOf` cannot.
  * **`draftOf`'s narrower parameter** rests on method bivariance: true at runtime, as every box
    dna enters through `BoxListing.build`. The alternative, an abstract `dnaOf` on `Listing`, adds
    a method; the sprint adds a validator, not a method.
  * **`models-shapes.test.ts` keeps its module-level world**: the `boxDna` cases read only the
    module-level `scope` and `full`, never `mw.calls` or anything that piles up.
* **Approaches set aside**: `given.pipe(filled)` (one strict schema with the factory's props piped
  into one without, stripping them). Zod's `pipe` types the second schema's input against the
  first's output, and the branded `box_key_wrapped` and the defaults would not line up without a
  cast. The destructuring transform says the same with no fight.
* **Discoveries**:
  * The handoff said a one-letter boxlabel refused `bad_record`; on the base it refused
    `bad_scope` (`boxscope.parse` in `listing.scopeOf`, from Storable's constructor). It now
    refuses `bad_option` at the door. A *record* with a one-letter boxlabel still refuses
    `bad_scope`, from the same place.
  * A dna carrying a `revision_seq` is taken for a record: `build({ ...scope, revision_seq: 3 })`
    refuses `bad_record` at the sparse check. So `boxDna`'s allowance for the revision is reachable
    only through `revision_tok` or the times alone; a spread of a record round-trips as a record.
* **For the Coach**: the *Open questions* in the PR, one line each:
  * **dna with a revision_seq**: taken for a record (today's `Listing.build` rule). Recommend keep.
  * **bad_option for every fault in a dna**: a bad boxlabel was `bad_scope`, and the old `putBox`
    refused a bad whisper `bad_whisper`; one input, one validator, one kind. Recommend keep.
  * **sealed parts in a dna**: kept where given (the record's props are optional), though no seal
    of this box made them. Recommend keep until the seal thread says otherwise.
