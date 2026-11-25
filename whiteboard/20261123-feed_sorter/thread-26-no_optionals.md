# Thread 26: no_optionals (2026-11-24)

Branch `20261124-no_optionals`, PR [#892](https://github.com/mrflip/safebyok/pull/892), stacked on [#891](https://github.com/mrflip/safebyok/pull/891). Proved: see the
PR's **Tests:** line (`pnpm justify` in full; idb-lean, postgres, react-lean and the three lean demos by hand).

Built by hand (no /sprint), from section A of [thread-24-whole_records-inventory.md](thread-24-whole_records-inventory.md).
The Coach: "When it's done there should be no "optional" fields anywhere except Box's two body fields"; sentinels, not
null; "go ahead with the changes as you proposed, and we'll tweak later". Six pieces, one `api:` commit.

* **Built**:
  * **O1, track.** `AskChecks.track` is required on every ask; a pair may be at the void revision (`thingCited`'s revseq
    and lifepath). `VoidTrack` (shapes-asks.ts, exported from `safebyok/storage` and `safebyok`) tracks all three roots
    there. `VaultMinder.knownRoots` always answers, a root with no Thing kept (or only its shell) at the void revision
    (`#trackPairAt`); `isStored` and `RootLabelpaths` go. Gating's birth carries `vaultMinder.knownRoots`;
    `birthPutsOf` passes the birth's track and banktok to each put. The drafts require `track` and `banktok`;
    `optionalsGiven` goes. Postgres's `trackParam` always sends JSON, and its notice fetch sends `VoidTrack`.
  * **O2, tracked.** Required on every answer. A vaultDB answers `'same'` for every root an ask tracks at the void
    revision, stored or not (`trackedEntryOf`): that is how an ask says it tracks nothing of a root, as an ask without a
    track did. An answer made from a throw (`answerForThrown`, `refusedAnswerOf`) has `tracked: 'unread'`, a new
    literal in `BadAnswer`; `rootsOf` reads it as none. `classifyBirthBank`'s born actual computes tracked from the puts'
    records (the concrete adapter replaces it with what it reads after the write, as before).
  * **O3, read_tc** is required on an event; the minder's `?? readTcNow()` goes.
  * **O4, banktok.** big's `SX.VoidLifeTok` (all zeros), re-exported as `VoidLifeTok` from `safebyok/storage`. Only a
    get may carry it (`AskChecks.anyBanktok`); a list, a write and a birth refuse it `bad_record`
    (`Phrases.BanktokVoid`). An answer's and an event's banktok is the void lifetok where none is known;
    `#newestBanktok` starts there, and `#banktokOr` stands the newest in for a notice's or a rung's void one.
  * **O5, the vacant agerank.** `VacantAgerank = '(vacant)|-000000001|-000000001|00000000'`: `(` sorts below every
    base-32 digit and `-`, so below every lifepath, and no lifepath is `(vacant)`. `agekindOf(VacantAgerank)` is the
    new agekind `'vacant'`; `seenAgekindOf` keeps the old answer for `eventsOf`. `nextAgerankOf` and `eventsOf` lose
    their undefined branches; `Thing.agerank` starts vacant, `Thing.agekind` loses its branch. Raw notices, the
    minder's proposed events and the shelf's events carry the vacant agerank for both.
  * **O6, sourcelabel** is required: the raw adapter's notices name `VaultDBSourcelabel` (`'vault_db'`), the same
    label the minder stamps.
* **Decisions made**:
  * **Void-tracked roots answer `'same'`.** Set aside: answering the stored root, which is truthful, but changes what
    the minder tells (a first get now told of every root) and the refusal a damaged root gives (a track at the void
    revision reaches `writtenOf` and throws `damaged_row`, where the world swallowed it: device.test's damaged-bank
    sign-in went `storage_issue` → `damaged_row`). The brief forbids behaviour change, so the void revision means
    "not tracked". The wontfix row on `tracked` of a missing or damaged record still stands as written.
  * The void banktok is admitted on gets only, not on a birth: gating always gives a birth its new bank's lifetok.
    Gets that may not know the bank: sign-in's two, a box get at stage `unborn`, postgres's notice fetch, and any get
    over a bank tombstone.
  * `tracked: 'unread'` for an answer made from a throw: all `'same'` would claim a read that never happened.
  * The vacant agerank's agekind is `'vacant'`, not `'bare'`: nothing reads it but a compare with `'here'` or `'bare'`.
* **Deviations**: none in what a host sees in the working case. A list or write carrying the void banktok now refuses
  `bad_record`; no path of ours sends one but a list over a bank tombstone (an ending). A minder that knows the bank
  and gate but not the root box now tracks the two: it hears of either changed, and a damaged one there refuses
  `damaged_row` as it would once all three were known.
* **Discoveries**:
  * No vaultDB compares `ask.banktok` with the bank stored, so O4's "policy checks" needed nothing.
  * Postgres's SQL `tracked` function keeps `WHERE track IS NOT NULL`, now dead: left for a SQL thread.
  * `safebyok-big` is untouched.
* **Tables**: feed_sorter's (`thing.test.ts`), 79 of 190 rows respelled (the life event's `null` was → `"vacant"`, the
  aged event's `null` agekindWas → `"vacant"`); `gen.py` changed to match. The minder_matrix chains table: 0 rows.
* **Test promises changed**: listed before → after in the PR body; 28 tests respell only.
