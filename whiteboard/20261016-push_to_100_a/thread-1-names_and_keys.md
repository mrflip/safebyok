# Thread 1: names_and_keys (2026-10-16)

Branch `20261016-names_and_keys`, PR [#128](https://github.com/mrflip/safebyok/pull/128), from `main`
(`f63bd915`). Justify: green -- core 1711 passed (33 skipped), indexeddb 159, postgres 237,
graphql 224, convex 286, react 111, fastkey 44, demo 168, e2e 91, root scripts 155.

* **Built**:
  - `.size-limit.json`: the five sprint budgets, first commit, no other line touched.
  - `validators.ts`: the floor, `NameFloor`/`NoteFloor` (+ `NameFloorBytes` 1024, `NoteFloorBytes`
    4096): well-formed, NFC, no control characters (tab and newline in a note). `UserId` is
    `UserIdPattern` (`[A-Za-z0-9_.:@+|-]`, 1 to 100). `AnyTextValidators` *is* the floor. The
    `VaultValidators` doc block carries the four-jobs table, the NFC and upgrade-first cautions,
    and "userId is the provider's stable opaque id".
  - `names.ts`: `check` runs the floor, then the host's check once; `checkFloor`; `admits` gone.
  - `types.ts`: every name and note field of every record schema is the floor, so failing it on
    read is damage.
  - `vault-db.ts`: the validators argument is gone from all ten verbs. Every verb holds each name
    to the floor and to two new abstract facts, `maxNameBytes` and `reservedNameChars`
    (`heldScope`, `heldBoxlabel`, `heldName`: module functions over the base class's facts). The
    listing marks only integrity failures damaged, drops rows stored under a name below the
    floor, and sorts by code unit. `localVaultDB(store, { ckeyDelimiter })`.
  - `ckeys.ts`: `Ckeys.joiner(delimiter = '^')` returns `bundle/box/unlock/mark/boxPrefix/
    isBoxIn/boxlabelOf/isUnlock/isMark`; each composer refuses a part holding the delimiter.
    `idbVaultDB`, `idbDeviceDB`, `memoryDeviceDB` take `ckeyDelimiter`; `safebyok-indexeddb`'s
    `boxRange(joiner, scope)`.
  - `vault.ts`: host checks at entry only (openVault scope, store boxlabel and note, add*
    unlocklabel); read/use/erase check the floor, and the host's check only to word a refusal
    when nothing stands under the name. `standingRules` gone.
  - Adapters declare the facts: Postgres 640 bytes (btree entry, see Discoveries), GraphQL
    client 640 (its server's), Convex and IndexedDB `Infinity`; KV stores reserve their delimiter.
  - VAULTDB.md: a *Names* section, lines 7.3 and 7.4, 1.2 restated, the server's job in *Who
    does what*. The battery: 7.3/7.4 tests, 5.1 on the floor, 1.1/1.2 NFC cases.
  - READMEs (core, postgres, graphql, indexeddb, convex), VOCABULARY, `notes/security.md` (two
    entries), changeset (minor, five packages).

* **Decisions taken**:
  - Canary refusals at read()/erase() with nothing stored: `bad_label` (as before), so a typo'd
    name still says what is wrong; with a box stored under it, read and erase work (P7).
  - The floor requires one character (an empty name is refused everywhere, `AnyTextValidators`
    included).
  - A stored unlocklabel below the floor makes the bundle damaged (it is in the envelope schema);
    one the host's check refuses still opens and lists (G061's rule).
  - The ckey refusal is `bad_label`, its message naming the part and the character.

* **Deviations** (pushback, for the Coach):
  - **No `bindValidators`.** Once canaries run at entry only (P7, P9) and the VaultDB's verbs run
    only checks nothing turns off, a bound bag has no work: the verbs would never consult it, and
    the "refused if bound to another bag" rule would forbid two vaults with different validators
    on one adapter for no gain. G173's complaint was a bag passed per verb; now no verb takes one.
    Adding `bindValidators` later is additive. Thread 5's base class inherits the delimiter and
    name-byte checks, not a binding.
  - **The joiner is one delimiter character**, `{ ckeyDelimiter }`, not `{ ckey: { join, split } }`.
    A prefix scan and IndexedDB's key range need "join(head) + delimiter begins every ckey under
    head and no other", which a JSON or hash joiner breaks; one reserved character makes it a
    proof. NUL, which the floor bars from every name, gives any-text hosts a safe joiner.
  - **No record `format` bump for the ckey.** A ckey is where a record lives, not what it holds:
    old rows are never found, so they read as absent (the changeset says so). Thread 2 builds the
    format snapshot and bumps the lockbox.
  - **`validators` did not shrink**: 4106 B (main 3867), `DefaultValidators` 3981 B against its
    4 kB budget (main 3748). NFC and byte checks are the floor's cost; `LockboxNote` carries them
    so a form using it alone agrees with the vault. Thread 2's removal of the note slot frees most
    of it. Other measures: everything 31224, openVault 22030, idbDeviceDB 10160, browserOpts 15064.
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
  - G185 closed: the joiner refuses a part holding its delimiter.
  - G476 closed: the host's check runs once per verb.
  - G289 closed: VAULTDB.md and the Postgres README say what the server checks.
  - G232 closed, as built: drop every foreign cause (no code).
  - G474, G475 closed: confirmed as built (no code).
  - T02 closed: canary failures list sound; the floor bounds `snapshot.boxes`.
  - T03 closed: the table's store-limit row; README *Sizes follow the names*.

* **For the Coach**:
  - Opened: is `-_.:@+|` the `user_id` set you want? Built so.
  - Opened: G497 (Standard Schema) would now land only in `Names.rulesOf`, the vault's one
    entry; no VaultDB takes a schema.
  - `bindValidators` dropped and the joiner narrowed: the two deviations above.
