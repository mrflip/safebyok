# Thread 4: no_clear (2026-10-19)

Branch `20261019-no_clear`, PR [#185](https://github.com/mrflip/safebyok/pull/185), stacked on [#184](https://github.com/mrflip/safebyok/pull/184), in the line main -> #177 -> #178 -> #179 -> #176 -> #182 -> #183 -> #184. Justify: green (core 2225 passed, 35 skipped; indexeddb 142; postgres 260; convex 267; graphql 250; react 230; fastkey 49; demo 197; e2e 86). No size line moved (`pnpm size:budget` matches the rule on every line).

Brought back by the Coach after the #176 review's lost write (A retires, A writes, B retires A's write, B writes; neither throws).

* **Built**:
  * `storeBox()` (`packages/safebyok/src/vault.ts`) is one `updateBox`, always. `clearsFirst` and the retire inside `writeOver` are gone, and with them `writeOver`'s `retired_other` warning (`{ call: 'storeBox', damaged: true }`). A lockbox listed damaged that names a revision is still written over in that one write, carrying nothing forward.
  * A lockbox listed damaged naming no revision, and still damaged as storage reads it, is refused with kind `damaged_lockbox` (`damagedBeyondNaming()`), before the room check and before anything is sealed: "That lockbox is damaged beyond naming: its stored record does not say which revision it is, so nothing can be written over it safely. Nothing was written. Remove it with retireBox() first, then store its whisper again." It quotes no boxlabel.
  * `damaged_lockbox` already existed (family `condition`): no new kind, no family-map change. Its comment in `errors.ts` and its README refusal-table row say a store refuses so.
  * Doc blocks: `storeBox()`'s damaged paragraph (the clear-then-write and its warning sentence, added by 330871ca, are gone), `VaultSnapshot.boxes`, `writeOver`. README: the logger bullet now names only `retireBox()`; *Damaged lockboxes* and its code comment; the honor-and-warn paragraph. `VAULTDB.md` (the paragraph after the no-retry rule). `safebyok-react/README.md`, one clause.
  * Tests (`tests/vault.test.ts`): the two-step test and the #176 lost-write test ("retires that write, warns, and stores its own", which held the "first retired" wording) are deleted. New: the refusal (kind, message, no boxlabel, no write verb called, record unchanged, then retire and store land); the store over a damaged box naming a revision counts every write verb of the adapter (`WriteVerbs`): one `updateBox`, nothing else. The per-spoil "writes it afresh" loop skips the not-JSON spoil (it names no revision); the full-vault test uses a spoil that keeps a revision; the retireBox-over-damaged race has the other device retire before it stores.
  * `notes/security.md`, by a `sonnet` subagent: the 2026-10-19 retire-revision entry says the residual is closed and why; the two older retire-first entries carry an amendment.
  * Minor changeset `.changeset/20261019-no_clear.md`.
* **Pulled forward / beyond the letter**:
  * The demo (`demos/safebyok-demo-react`): `VaultDashboard` offers "replace" on a damaged row only when it names a revision; `KnockKnock`'s key slot offers "remove it" for a key damaged beyond naming, then "add your key". Two demo tests used a not-JSON spoil for "replace"; they now use a sidecar that is not JSON (revision kept), and a new test covers removal. Without this, justify was red.
  * Thread 2's and thread 9's changesets (`20261019-retire_revision.md`, `20261019-damaged_warning.md`) said a `storeBox()` retire-first warns; that sentence is now `retireBox()` only, since they release together with this one.
* **Decisions taken**:
  * The refusal needs all three: storage reads the record as damaged, the listing shows it damaged, and the listing names no revision. A damaged record the listing does not show yet is written as over none, refused as stale, and the catch-up lists it (unchanged; the existing test's title no longer says "never retires it first").
  * The refusal comes before `ensureRoomFor` and the key work: nothing to seal for a store that cannot land.
* **Discoveries**:
  * `readBox()`'s generic damaged message still says "remove it, or store its whisper again over it", which for a box damaged beyond naming leads to the store's refusal (whose message then says to retire it). Left as is; see Open matters.
  * Thread 11 (`refusal_rulings`): this thread touches the README refusal table's `damaged_lockbox` row, not `bad_record`'s, and nothing in storeBox's entry validation or `checkOutgoing`.

## Open matters

* **`damaged_lockbox` reused, family `condition`**: the kind existed; the refusal is a stored condition the user resolves (retire it), not a host bug. Recommendation: keep.
* **`readBox()`'s damaged message offers "store its whisper again over it" even for a box damaged beyond naming.** Recommendation: leave it; the store's own refusal redirects, and the store mechanics are changing (the Coach's tombstones).
* **The demo and the two earlier changesets were edited here** (see above). Recommendation: keep; they were made false by this thread.
