# Thread 4: refusals_and_catchup (2026-10-16)

Branch `20261016-refusals_and_catchup`, PR [#132](https://github.com/mrflip/safebyok/pull/132),
stacked on [#127](https://github.com/mrflip/safebyok/pull/127), in the line main → #128 → #133 →
#127 → #132 (restacked 2026-10-16). Justify: green; core 1761 passed / 33 skipped, React 111,
demo 168, indexeddb 156, postgres 237, convex 284, graphql 223, fastkey 44, e2e 90, root scripts
155. `pnpm size`: openVault 24.99 kB, everything 32.1 kB, both within thread 1's budgets (30 kB,
40 kB). The openVault overrun was only the base: thread 1's 30 kB covers it, and the raise this
thread once made to `.size-limit.json` was dropped at the restack.

The per-row ledger the orchestrator sweeps by is beside this file:
`thread-4-refusals_and_catchup-ledger.md` (every G### closed or not, and where).

* **Built**:
  - **Refresh, one at a time** (`refresh`, `readStorageAlone`, `refreshAfterThat` in `vault.ts`):
    one in flight, every request meanwhile sharing one more run after it.
  - **One catch-up before a kind is named**: `refreshOnStale`/`catchUp` after a stale refusal;
    `decipherOrCatchUp` before `damaged_lockbox`. A failed catch-up is `stale_write` with its
    cause, never retried blind (`isCaughtUpStale`). `VaultSnapshot.syncing`.
  - The storage watch (`watchRefresh`) warns once per failing streak and `log`s once on recovery.
  - `newer_format` (errors.ts; `newerBundle()` in vault-db.ts, its own constructor), thrown by
    `readBundle`/`createBundle`'s `checkBundle` and by `eraseDamagedVault`.
  - `DamagedLockbox.revision_id` (`listedOrDamaged`); `store()` over a damaged box writes over the
    listed revision (`listedRevisionOf`), erasing first only when there is none.
  - A lockbox under an epoch neither the bundle's nor the prior's lists damaged (`isUnderHeldKey`).
  - `openVault`/`eraseDamagedVault` take only `instanceof VaultDB`. `destroy()` on a handle that
    saw no vault refreshes first. After a change to the ways in has landed, a failed mark write
    or remembered-unlock write is logged, not thrown (`raiseMarkAfter`).
  - **The Coach's rulings, mid-build**: `lockSoon()` is soft (an unlock or change under way
    finishes; no generation raised); a hard lock refuses a `read()`/`use()` in flight after its
    last await (G119, part two); `whenIdentityRevoked` is gone, from core and `VaultProvider`
    (G119, part one); `rolled_back` locks as `identity_revoked` does, one rule in
    `RefusalPolicy.decide` (G516, first bullet).
  - **Thread 3's leftovers, all six**: (1) the drop timer waits `dueAt - clockNow()` after a late
    ring, and the timed test world now fakes `Date` so clock and timers move together; (2) and (3)
    the device mark is `safebyok-mark-v3` with a nullable `seen`, so `destroy()` keeps the lock
    generation and a lock with no mark writes one at generation 1; (5) `store()`'s stale catch uses
    `keyInHand()`; (6) every device-store verb is wrapped (`deviceTroubleAsConditions`), not just
    the remembered-unlock read; (7) `keptMark(call)` tags its warning with the caller.
  - Docs: README (two locks, untrusted storage, damaged lockboxes, `newer_format`, logging),
    VAULTDB.md (*Who does what*, 3.5, 5.5), VOCABULARY, errors.ts, React and Convex READMEs,
    `notes/security.md` (five entries at the end, three older ones marked revised), the changeset.

* **Decisions taken**:
  - **The mark's shape, not `eraseMark`-skipping**, fixes (2) and (3): a lock before any vault is
    seen must persist a generation somewhere, so the mark can stand with `seen: null`.
  - **Every device-store failure is `storage_unavailable`** (leftover 6 asked for the open only):
    a kind for every condition is a non-negotiable, and `lock()` now tells the snapshot `locked`
    even when the device store fails.
    - → *Coach (2026-10-16):* Keep the kind; each message as fine-grained as reasonable, groupings later if needed (thread 13).
  - **`store()` over a damaged box takes its revision from the snapshot's listing**, not a fresh
    read: no new VaultDB verb (thread 5's base is next), and storage arbitrates, so a stale
    listing costs one refusal and retry, never a record.
  - **Who hears `vault_locked` after a catch-up relocks**: `store()`, `read()`, `use()`. `erase()`,
    `destroy()` and the ways-in changes stay `stale_write` (strawman: news the user must hear).
    - erase() into a reborn vault says stale_write: → *Coach (2026-10-16):* Keep the kind, as long as the message says what happened (thread 17).
  - **A `read()` whose catch-up fails throws the catch-up's own refusal**: whether the box is
    damaged is unknown, so neither `damaged_lockbox` ("erase it") nor `stale_write` fits.
  - `syncing` goes false on any failed refresh, foreground ones too; recovery is said at `log`.
  - Soft `lockSoon()` still forgets the remembered unlock at once (thread 3's choice), and with no
    key held it is soft too; only a failed clock read makes it hard.
    - → *Coach (2026-10-16):* Kept as built: no, a soft lock.
  - `rolled_back` at open forgets the remembered unlock, as `identity_revoked` at open does.
  - Logger story calls: `untrustedStorage` (was `whenIdentityRevoked`), `expiry` (new).

* **Deviations**:
  - **The single-flight refresh queue is hand-rolled** (about 20 lines). Library-first says find
    one: `p-limit` and kin serialize but do not coalesce, the debounce family is time-based, and
    a runtime dependency is no two-way door this sprint. Raised for the Coach below.
    - → *Coach (2026-10-16):* Yes, kept, but out of vault.ts: thread 13 moves it to a module of its own.
  - Touched `safebyok-react` (the `whenIdentityRevoked` prop, `syncing` in its empty snapshot, a
    README line) and the demo's dashboard test, which now waits for its read before locking: a
    lock landing mid-read now refuses it, correctly. G333 untouched, as struck.

* **Restack onto threads 1 to 3** (all conflicts mechanical; none needed a call on which
  behaviour wins):
  - The VaultDB verbs lost their validators argument (thread 1): my calls dropped `rules`.
  - The device mark takes thread 1's `NameFloor` scope fields at `safebyok-mark-v3`; the format
    snapshot was rewritten for v3 within the commit that bumps it, and only that test.
  - Thread 2's `store()` (the public bag, `openedWhisperOf`, lockbox v3) kept whole; my damaged
    revision and catch-up woven in. Its write step moved into `writeOver` to stay under the
    linter's complexity limit. Under thread 2's rule a record that will not open vouches for
    nothing, so a store over a box listed damaged by its epoch alone now carries no public bag
    forward (its test says so), where it once kept the note.
  - Thread 1 made canaries entry-only: my edits to its removed canary tests were dropped, and
    thread 2's damaged-listing literals gained `revision_id`.
  - `whenIdentityRevoked` removed again from thread 1's new `index.ts` exports and the provider.
  - The `.size-limit.json` raise (`312bcd50`) dropped, as above.
* **Discoveries**:
  - **A pre-existing race**: during a ways-in change, this handle's own bell refresh can read the
    new bundle before `reviseUnlocks` sets it, judge the key `outlived`, drop it and erase the
    remembered unlock. `takeUpUnlock` restores the key in memory, but that erase can land after
    the new record, so the next open asks for the passphrase. Safe direction; serialization does
    not cure it. A small later thread: don't judge `outlived` against a bundle this handle wrote.
    - → *Coach (2026-10-16):* Into TODO.md (Soonish), beside "Are we doing anyone a favor by accepting multiple passphrases?".
  - Thread 2: the format snapshot lists `safebyok-mark-v3`, and `DamagedLockbox` has a field.
  - Thread 5: `listedOrDamaged` returns `revision_id`; `eraseDamagedVault` checks `mayBeNewer`
    before soundness; `newer_format`'s constructor is `newerBundle()`.
  - Restack with thread 7: three lines of `vault-provider.tsx` (the dropped prop), mechanical.
  - `vi.setSystemTime` shifts pending fake timers, so `advance` (clock alone) makes them ring
    late: what the late-ring test relies on.

* **Review** (`fixed`, `3c7631de`): `store()` over a box the listing did not yet show as damaged
  no longer erases first; only a box listed damaged with no revision is (`isListedDamaged`), with a
  test. Left open, minor, not built:
  1. `close()`, an outlived relock, a clock failure and `lockSoon()` past its shut time drop the
     key without counting a shut, so a read in flight still returns (none is a hard lock by
     `lock()`'s doc).
     - → *Coach (2026-10-16):* Yes: close() and the outlived key count as hard locks; lock()'s doc says the clock and soft cases do not (thread 13).
  2. `catchUp` wraps `rolled_back`, `identity_revoked`, `newer_format` and `damaged_bundle` as
     `stale_write`, where `read()` passes the catch-up's kind through.
     - → *Coach (2026-10-16):* Rec taken: pass the kinds through (thread 17, unless 13 did).
  3. `isCaughtUpStale` reads the shared `syncing` flag (fails safe both ways).
  4. A box under the prior vaultKey epoch lists sound but reads `damaged_lockbox`: latent until
     rotation lands.
  5. A hard lock does not stop a `store()` already past its last `keyInHand()` (P3: a write sent
     lands).
  6. The hand-rolled refresh queue needs the Coach's yes (now an Open Matters row; the reviewer
     found it correct and found no library for it).

* **For the Coach**: the *Open matters* list in the PR body and the report: the hand-rolled
  queue, the pre-existing race, and five calls above that a reviewer may want to see.
  - G499, the conflict hook: → *Coach (2026-10-16):* G499 stays on the NOT YET shelf (NOTYET.md).
  - store() deciphers the old whisper to compare: → *Coach (2026-10-16):* Drop the compare; changed_at becomes written_at, with no claim of change (thread 17).
