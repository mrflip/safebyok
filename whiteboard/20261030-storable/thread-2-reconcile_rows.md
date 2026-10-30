# Thread 2: reconcile_rows (2026-10-30)

Branch `20261030-reconcile_rows`, PR #373, stacked on #370 (its base is `20261030-models_world`).
Justify: green; safebyok 3888 passed, 37 skipped, 3 todo.

* **Built**
  * `record_conflict`, a condition, in `src/errors.ts` (the doc block, `refusalKindVals`,
    `RefusalFamilyForKind`), `tests/errors.test.ts` FamilyCases, and the README Conditions table.
    `cmpRevisions` and the two one-revision-two-fates throws in `reconcileCentral` use it now.
    `corrupt_record` is left for adapter answers in shapes the protocol does not allow. The old
    `src/vault.ts` and `src/box.ts` have no revision compare, so they are untouched. Changeset
    `.changeset/20261030-reconcile_rows.md`, minor.
  * `tests/models/storable.test.ts`: `cmpRevisions` tested directly, then `receive` tested through
    `SpiedBox`, a file-local `Box` subclass that logs each policy `reconcileCentral` returns.
    Every row of both tables is covered, each test titled with its row (`age | rcvd | central`).
    The cases run over each central shape (full, sparse, gone, ouch) at revision 2 'rev-c2',
    with and without a staged edit at 3 'rev-s3'. Edit and del are driven through a box from
    `listing.build`. Also covered: `receive(null)`, both for a thing never stored and for a held
    one.
  * `tests/models/listing.test.ts` (new): **pulled in from thread 3**. `listing.fetch` of
    nothing stored for a box held alive refuses `record_conflict`. Thread 3 appends its own
    describes there.
  * `tests/loosened/loosened.test.ts` (new): the describe "the staged edit reconcileStaged drops
    or carries".
  * Comments only, fixed in `storable.ts` as I went: "two puts landed"; the snapshot comments
    name the `snapshot` getter rather than "the first read"; "saves to the device cache". I also
    folded the duplicated reasoning in `reconcileStaged`'s doc into one paragraph. Its
    "successful write! Unstage it" line is gone: adopt drops the staged whatever its tok.

* **Decisions taken**
  * The tests watch the policy through a subclass rather than inferring it from state, because
    'older', 'same' and 'skip' leave the same state behind. A storable seals itself, so the log
    is a module-level array cleared before each test.
  * Where the code differs from the table read one way, I pinned today's behaviour with a passing
    test and added an `it.todo` written to the table. When the Coach rules, the pinned test
    breaks, which is the signal to update it.
  * The changeset says no exported call refuses with the new kind yet. That is true: only the
    unexported models do.

* **Rows unreachable or differing from the table** (for thread 6)
  1. **"alive" is read two ways.** `amVals` defines alive as am 'a'. `reconcileCentral` treats it
     as "not gone", so ouch counts as alive. Two consequences:
     * same | ouch | gone refuses `record_conflict`, but the row same | ouch | any says 'skip'.
     * same | gone | ouch refuses `record_conflict`. Under the am reading no row matches it.
       This case includes `receive(null)` and a listing's fetch of nothing stored for a box
       held damaged.
     Both are pinned, with `it.todo`.
  2. **same | full | ouch matches no row.** A healthy record delivered at the revision held
     damaged falls through and refuses `unexpected_error` ("a bug in Storable"). It is reachable
     with one healthy fetch after an ouch. Pinned, with `it.todo`.
  3. **older | gone | any** repeats older | any | any, with the same result.
  4. **The edit row over a sparse central** cannot be reached until the seal is written:
     `makeStaged` refuses 'bad_option' without a whisper and 'unexpected_error' with one. The
     edit row is tested over a full central.
  5. **Every other row matches the code**, including fill keeping the staged as it was, adopt
     and gone dropping it under either tok, and the ouch carry (`{...staged, ...nextRevision}`,
     the staged's own `written_at` kept).

* **Discoveries**
  * Any older full or gone record marks the thing timely (`noteSuccessNow` runs before the
    policy is consulted), though it confirms nothing. `receive`'s doc says "even one that only
    confirms central". A test pins this as today's behaviour.
  * `build(damaged)` for a thing not held makes its ouchstone from the damaged record's own
    sparse props, because the never-stored central `#makeThingFor` builds comes from them. The
    table's note "nothing of the delivered one is kept" holds only for a thing already held.
  * Nothing stored for a box held alive refuses `record_conflict` on every fetch, as the
    handoff expects, so reading again never mends it. I worded the README row's remedy to say
    that and to point at the storage adapter. How the box gets unstuck (for example by dropping
    the cached copy) is the listing pipeline's question.

* **For the Coach**
  * **alive**: does the table mean am 'a', or not gone? I recommend am 'a': same | ouch | any
    skips in every case, and same | gone | ouch takes 'gone'.
  * **same | full | ouch**: I recommend 'fill' (central becomes the healthy record, the staged
    left as it was), as same | full | sparse does.
  * **older and timely**: should only full or gone records that are not older mark the thing
    timely? I recommend yes.
  * The ouch carry gives the staged a new `revision_tok` while keeping the sealed parts the old
    tok was stamped into. That waits on the seal, and is pinned in the loosened file.

Set aside: asserting the policy from state alone, which cannot tell 'older', 'same' and 'skip'
apart; a `SpiedListing` whose `makeThing` builds `SpiedBox`, which cannot easily hold a box with
an arbitrary staged edit. Boxes built directly are not held by a listing, so the del test uses
`listing.build`.
