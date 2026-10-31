# Thread 25: Life toks, and `makeStaged` makes the whole staged record (2026-10-31)

Branch `20261031-life_tok`, PR [#407](https://github.com/mrflip/safebyok/pull/407) (merged 2026-10-31 06:45,
before the second rework landed); the second rework is on the same branch past it, awaiting a follow-up PR. Justify:
green at the rework (safebyok 4522 passed, 37 skipped; every package and the size budget green, no budget
moved). Changeset `minor`.

* **Built**:
  * *`staleMetaOf` is gone* from Listing, BoxListing and VaultListing, with their `as unknown as`
    casts and `RefusalMeta` imports. `edit`'s moved-central refusal builds its meta in place,
    `{ stored_revision, staged_revision }`, each taken by `MSX.revision.parse`. `RefusalMeta`
    (src/errors.ts) gains both as optional `{ revision_tok, revision_seq }` fields.
    `Phrases.MovedUnderEdit` no longer says the refusal carries the record.
  * *`makeStaged(patch, opts)` makes the whole staged record.* The base lives in Storable as
    `protected makeStagedBase(): { base, isBirthday }`, in the *Receiving* section beside
    `nextRevision`: the record in hand under the next revision, `am: 'a'`, written now;
    registered at its own `written_at` at a birthday (combined a tombstone, 'x', 'd' or the
    never-stored shim), else carried over. `edit` keeps the guard, `ante`, the moved-central
    check and the reconcile; `nextRevision` for `reconcileStaged` is parsed off the staged record.
  * *Birthday gifts.* `makeLifeTok()` in src/crypto.ts beside `randomId`. Box gains a stored
    `box_tok` (fields.ts `box_tok`/`BoxTok`, `boxSparse`, factory-controlled in `boxDna`, a
    `box.box_tok` getter so the box still ducks as its record). `Box.makeStaged` gives a fresh one
    at a birthday; `BoxListing.draftOf` gives one; `VaultListing.draftOf` uses `makeLifeTok`.
  * *`lifeTokPathOf` and `#sameLife`.* Protected abstract `lifeTokPathOf(record)`: Vault's
    `vault_tok`, Box's `` `${vault_tok}-${box_tok}` ``. Private `#sameLife(record, held = central)`.
    `reconcileCentral`'s precheck is now the life rows (below). `assign` sets `registered_at`
    when the record about to be in hand is of another life than the one in hand until now.
  * *VOCABULARY*: a **boxTok** row (and "life toks"), and `box_tok` in the `_tok` paragraph.
  * *Tests*: birthday gifts on rebirth (box.test), `box_tok` at the dna door (box-listing.test),
    another-life rows of the reconcileCentral table (storable.test), the moved-central meta, the
    new phrase in the phrases loop.

* **Decisions taken** (YOLO calls; each is an open matter):
  * *(a) A received record of another life*, as rows heading the `reconcileCentral` table, with a
    new `life` column. Under another `vault_tok`: throw 'unexpected_error' (the tattoo), whatever
    its age. Another life at the revision held: throw 'record_conflict', new
    `Phrases.OneRevisionTwoLives` (another tok there is still cmpRevisions' `OneRevisionTwoToks`).
    Damage comes first (since the rework): a damaged record at or before the revision held skips
    before its life is weighed, as the Coach's damage NOTE rules ("skips, whatever central is").
    Otherwise by age, as any record: seq order holds across lives under versioned replace. Newer
    is a birthday elsewhere (adopt/gone/ouch), older is a past life's ('older'/'skip'). Over the
    never-stored shim of a draft, a newer life is adopted: the box storage holds wins.
  * *(b) The vault's birthday*: none. `Vault.makeStaged` keeps `vault_tok`, as
    `Vault.demandReadyToEdit` refuses a vault not present, so no edit-birthday reaches it; a new
    life of a vault is a new instance, as the class doc already said.
  * *`assign` compares with the record in hand, not central.* The handoff said `#sameLife`
    compares with the held central; that is right for `reconcileCentral`, but `assign` judges
    `staged ?? central`, and comparing with central would leave the own `registered_at` on a
    dropped staged birthday's time. The old "central is a tombstone" condition goes: it is
    subsumed (a rebirth over a tombstone is always another life now).
  * *`FakeSealBox`* now calls `super.makeStaged` and overrides the sealed parts, so
    `duringMakeStaged` runs once the staged record is made, not at the top. The moved-central
    tests rely on the base being laid over the ante central, as before.

* **Deviations**:
  * *Behaviour change pinned in another thread's describe.* tests/loosened/loosened.test.ts,
    "a store that answers a rebirth with the buried record's registered_at": the own
    `registered_at` now keeps the rebirth's time (same life), where it took the store's. Edited in
    place, titled "(thread 25)", since the file's rule is that each `it` pins today's behaviour.
  * *box.test* "keeps the own registered_at over an edit made while a del is in flight" is now
    "makes a birthday of an edit made while a del is in flight": the own props take the staged
    record's new `box_tok` and `registered_at`.
  * *Changeset `minor`*, not the handoff's guess `--empty`: `RefusalMeta` is exported.
  * *PR first line* is the handoff's stacked line; the public-surface line comes second.

* **Discoveries**:
  * No test exercises the models' Vault or VaultListing (only models-shapes); the vault's
    `makeStaged`/`lifeTokPathOf` are covered by typecheck alone. A vault harness belongs to a
    later thread.
  * `lifeTokPathOf` joins with `-`, so 'a-b' + 'c' and 'a' + 'b-c' collide (the fixtures' toks
    did). The reviewer's fix checks `vault_tok` first, whatever the life; within one `vault_tok`,
    equal paths mean equal `box_tok`s.
  * The 'ouch' row over another life builds its ouchstone from the sparse props held, so the
    central becomes a tombstone of the old life; the next edit is a birthday either way.
    The second review found that this ouchstone, of the old life, then refused the healthy copy
    of its own revision; see *Rework after second review*.
  * For thread 24: `makeStaged`'s result is the staged record whole, revision included; the
    'edit' row can take it as made, and `nextRevision` is parsed off it.

* **Rework after review** (the reviewer's comment on #407, 5008624d):
  * *Significant: damage before life.* `reconcileCentral` took the other-life row
    (`OneRevisionTwoLives`) before the damage rows, so a damaged record at the revision held
    refused 'record_conflict' when its recovered `box_tok` differed. Now `(age !== 'newer') && ouch → 'skip'` runs right after the
    `vault_tok` check, folding the old 'older | ouch' and 'same | ouch' skips into one line.
    The table's two damage rows move up beside 'other vault', and the life NOTE says why.
    storable.test's 'other | same | ouch | full' expects 'skip'. The `vault_tok`-first check is
    untouched: a damaged record of another vault still throws 'unexpected_error'.
  * *Minor 3.* VOCABULARY's `registered_at` is when this life of a box began, a birthday (first
    stored, or remade over a tombstone), as models-shapes says. The thread's own loosened test
    cites the new line, VOCABULARY.md:155; the three others citing the old text are another
    thread's, which the file's rule leaves alone.
  * *Minor 7.* The changeset's **Stored format** line: the models' box gains `box_tok`; no host
    sees a change. Minor 1 goes to the sprint's Cleanup; 2, 4, 5 and 6 stay.

* **Rework after second review** (the second reviewer's comment on #407, over 5008624d...d92931a6;
  the Coach ruled option (a), 2026-10-31):
  * *Significant: damage before life on the central too.* An ouchstone is made of the sparse props
    held (`tombstoneFor`), so it keeps the life held when the damaged record arrived. Held at rev 2
    under `box_tok` A, rev 3 remade elsewhere under B received damaged ('newer | ouch') left an
    ouchstone at rev 3 under A, and rev 3 received intact then threw `OneRevisionTwoLives`. Now
    `classifyRecordShape(central)` is taken before the other-life row, which fires only when the
    central is not an ouchstone; the 'gone' and 'fill' rows take over (and 'sparse' → 'same').
    The `vault_tok` check stays first, the received-damage skip second.
  * *Set aside*: giving the ouchstone the received record's `box_tok`. It would trust a damaged
    record's `box_tok` and undo the recorded choice that the ouchstone is of the props held.
  * *Doc block*: the life NOTE says damage on either side comes first, and why; the table's
    other-life row reads central `! ouch`, and the same-revision rows it lets through read life
    `any`. Each inline comment names only the row it governs (minor 1).
  * *Tests*: storable.test 'other | same | full | ouch' → 'fill' (`box_tok`, `registered_at`
    follow) and 'other | same | gone | ouch' → 'gone'; box.test follows the review's trace. All
    three fail without the fix.
  * *Minor 4*: the changeset's **Stored format** line is a paragraph of its own.
  * Minor 3 (loosened.test's VOCABULARY cites) is another thread's, on the sprint's Cleanup.
  * *Untested, by the brief's scope*: 'other | same | sparse | ouch' → 'same', as the table says.
  * *Discovery*: a staged edit carried past the damaged rev 3 ('ouch' keeps it, under rev 4) is
    of life A; 'fill' keeps it, so a later `send` puts life A's `box_tok` at rev 4 over life B's
    rev 3. An open matter for the Coach, not acted on.

* **For the Coach**:
  * Rule on (a): another life, older, is 'older' (a past life), not the "another thing came
    along" case; rollback detection is thread 19's `box_behind`.
  * Rule on (b): the vault keeps its `vault_tok`, no gift.
  * `BoxSnapshot` does not carry `box_tok`. Add it?
  * A staged edit of the old life, kept by 'ouch' and then by 'fill' over a central of another
    life: should 'fill' drop a staged of another life than the record filled? Recommend yes,
    in a later thread (it is `reconcileStaged`'s, and outside this ruling).
