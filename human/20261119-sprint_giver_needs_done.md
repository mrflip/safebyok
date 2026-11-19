# Sprint giver_needs: done (2026-11-19)

The sprint built Part 1 of `whiteboard/20261116-react_backwards/giver_needs.md`, what the React giver needs of the
minder. The minder's query keys now select a Thing's subtree by one prefix, and `BoxLabelpath` is exported. `listen`
tells a tagged union of events: thing, listing and invalidation. The minder keeps listings of a Thing's children, fed
from every source. It writes, with `tryWrite`, landing the written record before it answers, box deletes included. It
invalidates listings without fetching. Rulings during the sprint added two threads. The root box's listing is seeded
bare at `hello`, so a box heard of before the first `list` is not lost. The last thread was reworked to the Coach and
Fable's settled notify plan: a verb's caller lands only its good answer, and the vaultDB notifies a refusal's `dbhas`
and each changed tracked Thing before the verb answers, one Thing per notice. M5 (dropping a gone parent's subtree) and all of Part 2 were left out,
as the plan said.

## The line, in merge order

Every PR's base is `main`; each body opens with its stack line. Merge the top, the sprint PR, with a merge commit,
and the whole line lands.

| # | PR | Thread | Stacked on |
|---|---|---|---|
| 1 | #753 | minder_keys: M1 the key grammar, M7 `BoxLabelpath` | main |
| 2 | #756 | minder_events: M6 `listen`'s tagged union | #753 |
| 3 | #757 | minder_listings: M2 listings | #756 |
| 4 | #758 | minder_writes: M3 `tryWrite`, box deletes | #757 |
| 5 | #759 | minder_invalidate: M4 `invalidate`; the test file split | #758 |
| 6 | #765 | minder_seed: the root listing seeded bare; `tryWrite` lands only its record; VOCABULARY | #759 |
| 7 | #766 | notice_split: a notice carries one Thing | #765 |
| top | #752 | the sprint's plan, progress, resolutions and this note | #766 |

#753 through #765 merged on 2026-11-19. #766 was then reworked (`whiteboard/20261119-giver_needs/notify-plan.md`),
reviewed, and rebased onto main (one import conflict in `postgres-vault-db.ts`; rollback tag
`20261119-notice_split-prerebase-*`); `pnpm justify` green at its tip. #752 sits on it.

The line was restacked onto main once #751 merged (rollback tags `*-prerestack-20261119T071526`). There was one
conflict, a union of two export lines in `storage.ts`. Every thread proved `pnpm justify` green when it filed, and CI
is green on each.

No YOLO decisions: the sprint ran in normal mode.

## Still open, for the Coach

These rows are still open in the sprint doc's *Open Matters*. The Coach's rulings are in
`whiteboard/20261119-giver_needs/giver_needs-resolutions.md`.

* **The bare root listing is visible** (#765). `listingAt(root)` answers from `hello` on, and `isListingBareAt` tells
  bare from complete. `ListingEvent` carries no flag. Rec: keep it visible, and add a flag when a listener needs one.
* **`hello` does not fetch the root listing** (#765). The worker judged it a can of worms: a `list` before birth
  refuses, a list in flight across `goodbye` and `hello` would mark the new seed listed, and every listen and order
  test would change. Rec: leave it to the giver.
* **A `list` in flight across `goodbye` and `hello`** lands in the new session's cache (#765). It predates the sprint.
  Rec: a `notes/wontfix.md` row.
* **The orchestrator's wording changes to *Settled*** (#766): four, plus the two calibrated `VaultDB.watch` bullets
  and the narrowed handler bullet, each listed in `notify-plan.md`. Built as worded there; to be confirmed.

## Left for later

* VOCABULARY's "the bank's listing" and "enlist, listed, kept" rows still use "listing" for safebyok-big: reword them
  when big's rows retire.
* Stores still fetch a `world` the watch ignores: `Received` keeps it, and Postgres queries again for it when a NOTIFY
  lacks it (#766's review).
* A damaged bank or main gate in a store's `world` no longer reaches `onBadNews`; it is reported when that Thing is read
  (#766's review, *Settled* Q4).
* Answers keep `world`; dropping it is a later question (*Settled* Q5).
* A `documentarian` pass on the `VaultDB.watch` doc block once its bullets are confirmed (#766's review).
* A shared `isListingKey` helper, and the `shapes-minder.ts` option block's alignment (#759's review).
