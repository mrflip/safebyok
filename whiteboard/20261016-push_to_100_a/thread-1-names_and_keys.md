# Thread 1: names_and_keys (2026-10-16)

Branch `20261016-names_and_keys`, PR [#128](https://github.com/mrflip/safebyok/pull/128), from `main`
(`f63bd915`). Justify: green -- core 1697 passed (33 skipped), indexeddb 156, postgres 237,
graphql 222, convex 285, react 111, fastkey 44, demo 167, e2e 90, root scripts 155. Reviewed
once (its fixes `37c3d8b4`, `2f4a383b`, the second reworked away by the ruling below).

* **Built**:
  - `.size-limit.json`: the five sprint budgets, first commit, no other line touched.
  - `validators.ts`: the floor, `NameFloor`/`NoteFloor` (+ `NameFloorBytes` 1024, `NoteFloorBytes`
    4096): well-formed, NFC, no control characters (tab and newline in a note), and no `^` in a
    name (YOLO, orchestrator: see Deviations). `UserId` is
    `UserIdPattern` (`[A-Za-z0-9_.:@+|-]`, 1 to 100). `AnyTextValidators` *is* the floor. The
    `VaultValidators` doc block carries the four-jobs table, the NFC and upgrade-first cautions,
    and "userId is the provider's stable opaque id".
  - `names.ts`: `check` runs the floor, then the host's check once; `checkFloor`; `admits` gone.
  - `types.ts`: every name and note field of every record schema is the floor, so failing it on
    read is damage.
  - `vault-db.ts`: the validators argument is gone from all ten verbs. Every verb holds each name
    to the floor and to one new abstract fact, `maxNameBytes` (`heldScope`, `heldBoxlabel`,
    `heldName`: module functions over the base class's fact). The listing marks only integrity
    failures damaged, drops rows stored under a name below the floor, and sorts by code unit.
  - `ckeys.ts`: `Ckeys.bundle/box/unlock/mark/boxPrefix/isBoxIn/boxlabelOf/isUnlock/isMark` join
    on the fixed `Ckeys.Delimiter`, `^`, each composer refusing a part holding it. No option sets
    another anywhere (the Coach's ruling). `safebyok-indexeddb`'s `boxRange(scope)` is exact: it
    stops short of the prefix with its `^` raised by one (the review's `37c3d8b4`).
  - `vault.ts`: host checks at entry only (openVault scope, store boxlabel and note, add*
    unlocklabel); read/use/erase check the floor, and the host's check only to word a refusal
    when nothing stands under the name. `standingRules` gone.
  - Adapters declare the facts: Postgres 640 bytes (btree entry, see Discoveries), GraphQL
    client 640 (its server's), Convex and IndexedDB `Infinity`. Postgres' `listBoxRecords` holds
    the scope to the floor and 640 bytes too, with a refusal that says so.
  - VAULTDB.md: a *Names* section, line 7.3, 1.2 restated, the server's job in *Who does what*.
    The battery: 7.3 tests, 5.1 on the floor and on `^`, 1.1/1.2 NFC cases.
  - `validators.ts`'s floor schemas carry `/* @__PURE__ */`, so `DefaultValidators` alone no
    longer ships the floor: 3844 B against its 4 kB budget.
  - READMEs (core, postgres, graphql, indexeddb, convex), VOCABULARY, `notes/security.md` (two
    entries), changeset (minor, five packages).

* **Decisions taken**:
  - Canary refusals at read()/erase() with nothing stored: `bad_label` (as before), so a typo'd
    name still says what is wrong; with a box stored under it, read and erase work (P7).
  - The floor requires one character (an empty name is refused everywhere, `AnyTextValidators`
    included).
  - A stored unlocklabel below the floor makes the bundle damaged (it is in the envelope schema);
    one the host's check refuses still opens and lists (G061's rule).
  - The `^` refusal is `bad_label`, its message naming the field and the rule.

* **Deviations**:
  - **No `bindValidators`** -- settled: the Coach said "yes", accept as built. Once canaries run at entry only (P7, P9) and the VaultDB's verbs run
    only checks nothing turns off, a bound bag has no work: the verbs would never consult it, and
    the "refused if bound to another bag" rule would forbid two vaults with different validators
    on one adapter for no gain. G173's complaint was a bag passed per verb; now no verb takes one.
    Adding `bindValidators` later is additive. Thread 5's base class inherits the name-byte check,
    not a binding.
  - **The delimiter is fixed at `^`**, by the Coach's ruling on this row ("don't let a host set the
    key join and split, or specify a different character"): no `ckeyDelimiter` anywhere, and no
    `reservedNameChars` fact. The review's `2f4a383b` (browserOpts passing the delimiter on) went
    with it; `browserOpts` keeps its one bag per `dbName`, which a React render still needs.
  - **`^` is in the name floor, for every store** -- YOLO, orchestrator. Were it reserved only by
    the key-value stores, a Convex, Postgres or GraphQL host whose names hold `^` would meet
    `bad_label` only from the browser's device shelf, at openVault, with no remedy now that the
    delimiter cannot change. In the floor, every store refuses it alike, at entry, with one
    refusal; the default `UserId` already left it out.
  - **No record `format` bump for the ckey.** A ckey is where a record lives, not what it holds:
    old rows are never found, so they read as absent (the changeset says so). Thread 2 builds the
    format snapshot and bumps the lockbox.
  - **`validators` did not shrink**: 4148 B (main 3867). NFC, byte and `^` checks are the floor's
    cost. `DefaultValidators` is 3844 B (main 3748) thanks to the pure annotations. Other
    measures: everything 31022, openVault 22072, idbDeviceDB 9801, browserOpts 14699.
  - `listBoxes` sorts by UTF-16 code unit (JS `<`), not code point: identical but for astral
    characters against U+E000..U+FFFF; deterministic and locale-free, a comparator of our own
    being the hand-rolling CLAUDE.md warns against.

* **Discoveries**:
  - Postgres refuses a btree entry over 2704 bytes; a lockbox's primary key is its four names,
    so 1 KiB names would fail at INSERT. Hence `maxNameBytes = 640`. Its trigger's empty-payload
    fallback can no longer fire through the API; its test now sends `pg_notify` by hand.
  - For thread 2: `NoteFloor`, `NoteFloorBytes`, `LockboxNote` and `Lockbox.note`'s floor go with
    the note; the `note` row of the four-jobs table too.
  - For thread 5: `heldScope`/`heldBoxlabel` (vault-db.ts) are the base-class checks to keep;
    `listBoxRecords` in Postgres parses `VaultScope`, which now carries the floor.
  - Convex's real limits on index keys are unverified; it declares `Infinity` and the floor bounds
    each name to 1 KiB.

* **Rows (Closes)**: every one closed.
  - G172 closed: the table in the `VaultValidators` doc block; VAULTDB.md *Names*.
  - G061 closed: entry-only is the rule for every canary (doc block, README, code).
  - G074 closed, as built: the salt check stays at unlock (no code).
  - G118 closed, as built: no grouping; README says each refusal names the first failure.
  - G123 closed: intended; README line.
  - G173 closed: no verb takes a bag (deviation above: no binding).
  - G174 closed: floor beneath any host schema (names.ts, types.ts, vault-db.ts).
  - G175 closed: `AnyTextValidators` is the floor; no control characters in a name.
  - G176 closed: VAULTDB.md *Who does what*; Postgres and GraphQL READMEs.
  - G177 (control-character half) closed: in the floor, on every client and server verb and on read.
  - G179 closed: written in VAULTDB.md and the adapter READMEs.
  - G181 closed: code-unit sort (note above).
  - G182 closed: doc block and README.
  - G183 closed, as built: fails safe.
  - G184 closed: `rulesOf` no longer runs per verb; `VaultProvider`'s per-render check left, unmeasured.
  - G185 closed: `Ckeys` refuses a part holding `^`.
  - G476 closed: the host's check runs once per verb.
  - G289 closed: VAULTDB.md and the Postgres README say what the server checks.
  - G232 closed, as built: drop every foreign cause (no code).
  - G474, G475 closed: confirmed as built (no code).
  - T02 closed: canary failures list sound; the floor bounds `snapshot.boxes`.
  - T03 closed: the table's store-limit row; README *Sizes follow the names*.

* **Left, for the record** (from the second review):
  - Postgres' `listBoxRecords` gives one catch-all refusal, and its local `heldScope` repeats the
    core's check: thread 5's base class is where to share it.
  - `JoinChar` (validators.ts) copies `Ckeys.Delimiter`; a test keeps them equal.
  - `memoryDeviceDB` throws synchronously on a `^` scope, and `idbDeviceDB.readUnlock` sweeps
    strays before it refuses one; the vault, whose entry refuses `^` first, reaches neither.

* **For the Coach**:
  - Settled: the `user_id` characters are letters, digits and `-_.:@+|`, 1 to 100 (the Coach: yes).
  - Settled: dropping `bindValidators` (the Coach: yes, as built).
  - Opened: G497 (Standard Schema) would now land only in `Names.rulesOf`, the vault's one
    entry; no VaultDB takes a schema.
  - `^` in the floor for every store stays the orchestrator's YOLO call, above.
