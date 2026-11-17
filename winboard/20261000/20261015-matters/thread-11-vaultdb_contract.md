# Thread 11: vaultdb_contract (2026-10-16)

Branch `20261016-vaultdb_contract`, PR [#107](https://github.com/mrflip/safebyok/pull/107),
stacked on [#106](https://github.com/mrflip/safebyok/pull/106) (the line main -> #98 -> #97 ->
#105 -> #106), rebased at filing onto `ad435db`. Justify: green -- safebyok 1231 passed, 18
skipped; postgres 192/9; graphql 188/9; convex 311/14; indexeddb 118/9; react 97; argon2-wasm
44; demo 141/9; root 123. `pnpm size` green. The skips are lines run only over an adapter given
`makeCappedVaultDB` (4.2 to 4.5, and 5.3's full half) or `makeVaultDBFor` (5.4).

**Thread 12 reads `thread-11-postgres_verdict.md`, beside this file, first.**

* **Built**:
  - `packages/safebyok/VAULTDB.md`, the VaultDB contract: who does what, the baseline the Coach
    asked for, and 26 numbered lines in seven sections (records, reads, versioned writes, the
    lockbox limit, errors, push, declarations). Shipped in the package (`files`); linked from the
    core README's *Your own storage adapter* and from `VaultDB`'s doc block.
  - `describeVaultDB` regrouped: one `describe` per testable line, titled
    `<adapter>, as a VaultDB, 3.3: <the line's title>`. New tests for lines that lacked one: 2.1
    (a write seen by the next read), 2.2 and 2.3 (25 lockboxes read and listed whole; the same
    listing twice), 3.1 (two creates at once settle), 3.6 (each refusal leaves the whole vault as
    it stood), 3.7 (writes to different lockboxes at once all land), 4.1 (declares
    `maxLockboxes`), 4.2 to 4.5 (the limit, given a capped adapter), 5.3 (a stale or full
    refusal quotes nothing).
  - `describeVaultDB(title, make, { makeCappedVaultDB })`: an optional factory for an adapter held
    to a given limit; without it, 4.2 to 4.5 and the full half of 5.3 are skipped
    (`describe.runIf`). Wired for postgres, graphql, and the core's smallest honest adapter
    (`MapVaultDB`, now taking a `maxLockboxes`).
  - `TH.VaultDBContract`: the lines by number and title. A test in `test-helpers.test.ts` reads
    `VAULTDB.md`'s bold lines and fails if the two disagree, so the doc and the battery's titles
    cannot drift.
  - `VaultDB.maxLockboxes`'s doc says best effort. A `notes/security.md` entry. Changeset (minor).
* **Decisions taken** (YOLO):
  - **Which layer owns the versioned update** (the Coach's inline question): the adapter owns the
    atomic compare-and-write; the base class turns `false` into `stale_write`; the vault owns the
    read before and the retry after, which is where "last write wins" lives. *Who does what*.
  - **Listings take no limit** (the Coach's "exactly LIMIT records"): `listBoxes` has none, and
    the contract says a listing is whole; the "which ones" question is moot until one exists.
    Past the declared limits, a backend that cannot list everything refuses rather than return
    part (Convex's read budget), and erases restore wholeness.
  - **No count returned from a write.** See *Deviations*.
  - **Group per line**, rather than per section: the Coach's "align group titles with lines".
    Lines no battery test can reach (1.3, 4.6, 5.2, 5.4) say in the doc where they are proven.
  - **The transactionless question** (the Coach: "can it be satisfied in full even with a
    transactionless backing store?"): no for a backend with no atomic step at all; a store with
    single-record compare-and-set keeps 3.1, 3.2, 3.5, but 3.3 and 3.4 span the bundle and the
    lockbox and are not yet designed for it. Every adapter here has a vault-spanning atomic step.
  - `VAULTDB.md` at the package root, not a README section: it is long, and adapter authors want
    it on its own; the README section points at it.
* **Deviations**:
  - **The Coach's "a write returns success and a best-effort updated count" is not in the
    contract.** The vault already learns the count from the listing it reads after every write;
    returning one would change every adapter's `updateBox` and the GraphQL wire, and put a count
    in every write path. The contract instead asks an enforcing adapter's README to say what its
    count is as of. A Coach's yes reverses it, in a later thread.
  - **6.1 is looser than "calls only after writes"**: `localVaultDB` rings on every write to its
    store, and #106 has a failing watch call `onChange`; a spurious call costs only a read.
* **Discoveries**:
  - **Postgres on main does not meet the baseline** (a trigger and a counter column, `FOR UPDATE`,
    two statements on the full path): thread 12's job. Its notify trigger also counts as a
    trigger: the baseline makes push that needs one opt-in.
  - **The verdict for thread 12: yes**, at READ COMMITTED, if the insert reports why it missed in
    the same statement, maps a foreign-key violation (`23503`) to stale, and the README names the
    isolation. Rotation (#105) will later need a `FOR SHARE` read of the bundle, or similar, for
    `vault_key_epoch`. Details in the verdict file.
  - Convex declares a finite limit (8000) the battery cannot fill cheaply, so its 4.2 to 4.5 run
    skipped; its own tests prove its limit. Thread 5 decides whether to give it a capped factory
    (a test-only smaller limit) or leave it.
  - The battery's race tests (3.1, 3.7, 4.5) pass on every in-tree backend, but PGlite,
    convex-test and fake-indexeddb all serialize: they prove the outcome, not the race. Thread 6's
    honest race helper is what proves the race.
  - 2.1 says "on any device"; the battery checks it through one adapter. Thread 6 again.
* **#106's `identity_revoked` lines, written in at filing** (this thread lands second): 5.4 now
  says another user, or no one, is refused every verb as `identity_revoked`, reading and writing
  nothing; 5.5 that kind only when the user is really gone; 5.6 `not_permitted` refuses one call
  and locks nothing; 5.7 an adapter with no identity says neither; and #106's fifth, a failing
  watch calls `onChange`, as **6.2**, beside `subscribe`'s other line rather than among the
  errors. 5.4 has battery tests, run over a new option, `makeVaultDBFor` (a fresh backend as a
  way to sign in as anyone, or no one), wired for postgres, graphql, convex (both clients) and the
  core's `servingOnly` fake; 5.5 to 5.7 and 6.2 say they are tested per adapter.
* **For thread 13/14 (#105)**: rotation's new line (`LockboxExpectation.vault_key_epoch`, compared
  atomically) fits 3.3 as written; nothing here rules it out. It becomes a clause of 3.3 and a
  battery test when thread 14 builds it.
* **Review** (`thread-reviewer`, verdict `fixed`): its one fix, `28b1ea2` -- the 4.2 test now
  compares the whole standing vault around a `vault_full` refusal. It checked the Postgres verdict
  as reasoning and found it holds, with one correction made in the verdict file (REPEATABLE READ's
  count-then-insert racers overshoot rather than fail; its `40001`s come from `ON CONFLICT` and
  the foreign key's cross-check), and confirmed `eraseVault` racing an insert is safe. At the
  orchestrator's word: 4.4 retitled "Under the limit, a new lockbox lands" (the old title was
  untrue once racers overshoot), the `VAULTDB.md` comment marker dropped, and the
  transactionless paragraph said plainly. Minor, left: 5.3's two same-titled groups (now merged
  into one, its full half `it.runIf`); Postgres's README and code still promise a hard limit
  until thread 12; the battery's race tests prove outcomes, not races (thread 6); the capped and
  sign-in factories omit `listen`, so they exercise no push.
* **For the Coach**:
  - The write-returns-a-count deviation above.
  - Whether `VAULTDB.md` should ship in the npm tarball (it does now) or live only on GitHub.
