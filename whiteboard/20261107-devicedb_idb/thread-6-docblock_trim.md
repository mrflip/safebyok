# Thread 6: docblock_trim (2026-11-07)

Branch `20261107-docblock_trim`, PR #580, stacked on #571 (base main). Justify: green (lint, typecheck, tests, build, size budget; no size moved).

* **Built**
  - Doc blocks in `packages/safebyok/src/storage/`, and `src/` of `safebyok-postgres`, `safebyok-convex` (component included, `_generated` left) and `safebyok-indexeddb`, cut to one or two lines of purpose, none over 120 characters. Four `@example` blocks stay (the host's `convex.config`, `getUserId`, `SafebyokComponent`, `defineTestApp`) under short headlines. No documentarian ran; blocks were trimmed by hand, behaviour and names untouched. `safebyok-graphql` left alone.
  - Convex README: *How big a bank can be*, naming the 16 MiB read limit on `tidyGone` and the bank-wide watch. No scoping code.
  - `safebyok` exports `Patterns`, `MaxLabelChars`, `MaxUserIdChars` (`src/index.ts`, test in `tests/index.test.ts`); changeset `.changeset/20261107-docblock_trim.md`, `minor`.
  - `guardKeyDeriver`'s `deriveKeyBytes` (`src/models/proving.ts`) passes a `VaultError` through as itself, the same as the guard's `load` does; anything else is still `unexpected_error` with no cause. Two tests in `tests/models/proving.test.ts`: `argon2idDeriver`'s `bad_option` for a 15-byte salt arrives as itself; a `TypeError` quoting the passphrase is replaced.
  - `_cheat_forgetShelf(dbname)` in `src/storage/idb-shelf.ts`, exported through `safebyok/testing` only (beside `_cheat_clock`). The IndexedDB battery's `makeTwin` calls it before constructing the twin, so the twin holds a connection of its own again. Test in `tests/storage/idb-shelf.test.ts`.
  - `safebyok-graphql` README: a watch that has ended starts again on `goodbye()` then `hello()`.
  - `notes/guarantees.md` G10: `safebyok/browser` exports both Argon2id derivers; the front door exports neither; `tests/browser.test.ts` runs them (the old "no test calls them" was false too).
  - `TODO.md`: the shelf bullet on validation now names `GraphQLVaultDB` and the server's `try*` calls, not a relaying records pair; the line on the server's `getVaultRecords` is gone, "three later changes" now "two".
  - `notes/security.md`: a `sonnet` subagent amended the 2026-10-22 wire_meta entry, the 2026-10-15 `maxBoxes` entry and the 2026-10-17 G285 entry in place (I did not open the file).

* **Decisions taken**
  - A `VaultError` of any kind passes `deriveKeyBytes`, not only the salt refusal: one rule, as `load` has it, and the Coach's "leave it to the deriver".
  - The shelf cheat forgets the page's shelf for a name rather than returning a second one, since `IdbVaultDB` builds its shelf in its constructor; keyed by the full database name so the core need not know the adapter's spec.
  - Single-line blocks were rewritten to a purpose phrase only where they ran over 120 characters or read the body aloud (machinery, atomicity, deletes); the many short ones were left.

* **Discoveries**
  - `notes/gallant-docblocks.md` carries unresolved merge conflict markers (`<<<<<<< HEAD` ... `>>>>>>> 32d3abf71`) at lines 17-23 and 188-753, committed on main in 80d2f6f26 ("the gallant bestiaries as the Coach left them"). Not touched here.
  - The subagent left two spots in `notes/security.md` alone as out of its brief: entries near lines 1644, 2316 and 2841 cross-reference wire_meta and still name `box_stored` / `capacity` as `safebyokPutBox` answer fields, and the 2026-10-15 entry near line 2489 says the box count is "capped on the client".
  - The wire_meta entry cites the graphql README as stating the response-logging residual; the README has no such text. The subagent's edit says so.

* **For the Coach**
  - Confirm the two leftover security.md spots (above) are worth another pass.
  - The size limits Convex README names are as the code has them (8,000 box rows, 7 MiB less 1 KiB per life); the Coach said they will be adjusted once the sprint ends, so the README will need that edit then.

## Rework after review (2026-11-07)

Directives from the review on #580 and the Coach's chat on lease keys. Justify green at each commit (safebyok 2414 tests).

* **Built**
  - `listRawLeases()` answers `RawLease[]`, `{ scopepath, row }`: every stored row, unchecked (the old filter to bags is gone).
    `delRawLease(scopepath: LeaseScopepath)` takes the triple as listed, checked by `SX.leaseScopepath` (three strings,
    `bad_scope`), not by label rules. `doListLeases` answers `RawLease[]`: IndexedDB reads `getAllKeys` beside `getAll` in
    one `inOneStep`; memory holds `{ scopepath, row }` under its ckey, which is never parsed back. `listLeases` still reads
    everything and parses, filters and sorts in the base. Types in `shapes-storage.ts`, exported from `safebyok` and
    `safebyok/storage` (the check from `safebyok/storage`). Battery: scopepaths come from `listRawLeases`; a new case
    deletes a row under vaultlabel 'Bad Label' and a row stripped of its scope fields, over memory and IndexedDB.
    G4 and the wontfix entry name the scopepath; G4 still holds (a row under a refused label is reached only by
    `delRawLease`, which G4 already names). Changeset says what a host sees.
  - `Patterns.user_id` and `Patterns.b64url` escape `-` and `|` in their classes; a test compiles every `source` with the
    `v` flag and compares matches.
  - `DeviceDB` and `VaultDB` class headers: "writing only the generic `do*` calls, each one atomic step"; `doPutVault`
    names its `ifPresent` 'repl' / `ifAbsent` 'add' condition, `doDelVault` is "In one step". `VaultDBVerbs.watch`:
    "Nothing may count on a notice arriving." Mood of the touched `do*` and `watch` lines made third person.
  - Changeset names `_cheat_forgetShelf` on `safebyok/testing`.
  - `makeTwin` (safebyok-indexeddb) is async and asserts, by spying `IDBDatabase.prototype.transaction`'s `this`, that the
    twin's connection is not the original's; the shelf test compares `store.transaction.db`. Checked: misnaming the
    forgotten shelf fails 12 cases.

* **Decisions taken**
  - Names `LeaseScopepath` (labelled triple) and `RawLease`, pairing with `listRawLeases`/`delRawLease`.
  - Front door also exports the `LeaseDated`, `LeaseQuery` and `LeaseRow` types `DeviceDB`'s signatures name.
  - Set aside: having `_cheat_forgetShelf` answer whether it forgot a shelf; the directive asked for the connection itself.
  - The test cheats `_cheat_leaseRows()` (memory) now hold `RawLease`s; `bank-world` and `vault-world` read `.row`.

* **Suppressions**: two `eslint-disable-line no-useless-escape` in `src/shapes/primitives.ts`: the escapes are
  needed under the `v` flag, which the rule does not know of here. A `\x2D`/`\x7C` spelling would pass lint unreadably.

* **For the Coach**
  - VOCABULARY.md says a scopepath has its kind first, joined on `^`; the lease triple has neither (IndexedDB keys it as an
    array, memory by ckey). Left as stored; say whether a `'lease'` kind or a vocabulary note is wanted.

