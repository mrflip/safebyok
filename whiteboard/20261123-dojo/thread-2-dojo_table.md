# Thread 2: dojo_table (2026-11-23)

Branch `20261123-dojo_table`, PR #860, stacked on #858 (`20261123-dojo`, cut at 071d626ca). Proved: the core's tests
(1446) and the dojo's (14), lint and typecheck of both, while building; `pnpm justify` after the catch-up.

The Coach's three requests after seeing the dojo: the dojo's own strength meter, the Inspect tab as tables, and the
Thing's natural field order.

* **Built**:
  * **The Thing's field order** (`packages/safebyok/src/shapes/shapes-thing.ts`, `GenericChecks`). A checked record's
    keys come out in the order of the zod shape it is parsed by, and every kind's record shape spreads `sparse.shape`
    first, so `revisioned` and `sparse` fix the order. Before: `userid, banklabel, labelpath, label, fmt, revtok,
    revseq, am, lifeseq, lifepath, born_at, written_at`, then the body. After: `userid, banklabel, labelpath, label, am,
    lifepath, lifeseq, revtok, revseq, written_at, born_at, fmt`, then the body as before (bank: `lifetok`; gate:
    `wayins, auth, sigs, meta`; box: `sidecar, whisper_sealed`). The shell's check (`ShellChecks.shell`) now spreads
    `sparse.shape` as `boxShell` already did, so a shell lists its fields in the same order: it had its own
    (`... label, fmt, lifepath, revtok, ...`). Same fields, same checkers.
  * **The strength checker** (`demos/safebyok-demo-dojo/src/lib/switchable-checker.ts`): strong at four characters or
    more (`typed.length`), weak below with a reason; the Weak buttons' forced-weak switch is unchanged. The fixture's
    passphrases needed no change. A test, `tests/lib/switchable-checker.test.ts`.
  * **The Inspect tab** (`src/components/InspectTab.tsx`): each panel is a `<table>`, a `<tbody>` per modelkind group.
    The group's first row is header cells: `-- Box (4) --`, then each field its rows have, in the order the rows have
    them (first seen, so a shell's fewer fields do not reorder a group). Each row below is body cells: its ckey, then
    a cell per field; a value with no fields (no data, null) is one cell across. `scope`, `userid`, `banklabel` and
    `modelkind` are left out. Truncation is as before (`shownText`). The mutations list is a panel too, one group
    `Mutation`.
  * The fixture written again (its rows change order, and every token and ciphertext with them); the README, the
    chunk-size note in `vite.config.ts` (zxcvbn's dictionaries no longer reach the bundle: about 600 kB, where the old note said zxcvbn alone made a chunk of about a megabyte).
* **Decisions made**:
  * **The ckey column stays**, the first body cell of every row, under the group's title cell. The vault panel holds
    Hero's and Thierry's rows together, and with `userid` left out the ckey is all that tells them apart; a TSQ row
    with no data is nothing but its ckey. It does repeat the userid and banklabel inside it. The Coach can strike it.
  * **The nine fields sit right after the scope** (`userid, banklabel, labelpath`), before the body: the plainest
    place, since the scope is the row's address and the body its kind's own.
  * **Characters are UTF-16 code units** (`typed.length`): an emoji counts two. Plain over exact, for a dojo.
* **Checked, no stop held**:
  * **Ctx**: every ctx is `Crypto.cipherCtx`, which serializes with `stableJsonify` (safe-stable-stringify, keys
    sorted); stamps are their own shapes. A whisper's text is `stableJsonify` too.
  * **Equality and hashes**: `isEqual` (es-toolkit, key-order blind) in `device.ts`, `bank.ts`, `policies.ts`; query
    keys hash by `TSQ.hashKey`, which sorts keys, and carry no record. No `JSON.stringify` compare in `src/`.
    `BaseThing.sparseOf` picks `Object.keys(sparse.shape)`: only its output's order follows.
  * **Big**: the shape is the new core's own; `shapes-thing.ts` is not named in `notes/guarantees-big.md`.
  * No test compared key order; the core's 1446 tests passed unchanged.
* **Discoveries**: the old `chunkSizeWarningLimit: 1500` was for zxcvbn, which the dojo's bundle no longer carries;
  `scripts/make-fixture.ts` still passes `zxcvbnStrengthChecker` (left alone: under Node it costs nothing, and its
  passphrases are strong under both checkers).
* **For the Coach**: the ckey column (above), and the full field order (above) to correct. Not run in a real browser:
  none in this container. The tables were rendered under jsdom and read back, row by row.
