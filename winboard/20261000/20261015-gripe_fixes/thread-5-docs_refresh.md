# Thread 5: docs_refresh (2026-10-15)

Branch `20261015-docs_refresh`, PR #69, stacked on #66. Not put through a thread review (documents and two comments). Justify: green (core 705,
convex 265, react 28, demo 61, root 105 tests).

* **Built**: `notes/security.md` checked entry by entry against the code on #66's tip;
  `VOCABULARY.md` checked against every published entry point's exports and every stored field;
  the two "pretending" comments in `packages/safebyok/src/vault.ts` reworded.
* **Decisions taken**:
  * security.md: only claims that had gone stale changed. The `VaultDB` entry said the Convex
    adapter "is planned" to check inside its transaction; it now points at the entry that
    describes it as built. The `safebyok/testing` entry described one export, `testDeriver`; it
    now says the entry is the `TH` helper module, `testDeriver` among them, and lists the
    entry points that never import it. The unlock-window entry keeps `rememberForMs` as a
    history note ("named ... until its rename on 2026-10-15") rather than dropping the old name,
    since the date is history. The stable-stringify entry now says it also backs `changed_at`.
    Every other entry was read against the code (the epoch-ms bounds and `FarFuture - FarPast`
    window, `ask_passphrase_at`, the four logger call sites, zod/mini and its lint rule, the
    nine Convex functions, the tally constants, `MaxWriteAttempts`, `lockSoon`'s 60 s cap, the
    IndexedDB transactions) and found true. Dates stay; no entry was removed. Long lines in
    entries I touched, and the others over 100 columns, were rewrapped (reflow, no wording).
  * VOCABULARY.md: it is the cast, not an index of exports, so I did not list functions like
    `openVault` or `localVaultDB`. I added a section, *Names, records and times*, for the nouns
    the code and stored records use that the page used in passing and never defined: applabel,
    vaultlabel, boxlabel, userId, scope, note, bundle, device unlock (also: remembered unlock),
    vaultDB, deviceDB, registeredAt / changedAt, askPassphraseAt, forcePassphraseReentryHours,
    EpochMillis, format, clock and logger. The cipherAdditionalData row now says what the code
    binds: the format, the epoch for a key wrap, and which field it is.
  * Removed the `whisperSchemaVersion` row: nothing exports or stores it (TODO.md plans a
    `whisper_schema_version`). This is the "definition naming nothing" case.
  * "pretending": `vault.ts` `destroy()`'s doc now says requiring unlock "would only look like
    protection"; `refresh()`'s comment says "passing as current invites confusion".
  * An empty changeset: documents and two comments only.
* **Left to #68 (kdf_configs)**: in VOCABULARY the rows passphraseSalt, keyDeriverSpec,
  keyDeriverLabel (on this base) and the new key deriver row; in security.md everything from the
  end, including the 2026-10-14 entry on the key-deriver seam and the 2026-10-15 entry on
  `openVault` having no default deriver, which #68's entry partly supersedes. My new VOCABULARY
  section sits above *Other credentials*, away from those rows; the cipherAdditionalData row is
  two lines below #68's last row, so the merge should be mechanical.
* **Discoveries**: VOCABULARY's tables are wider than 100 columns and cannot be wrapped; thread 8
  should exempt table rows in Markdown (or skip Markdown).
* **For the Coach**: no name in the code was found wrong against VOCABULARY. One gap to know:
  the Vault interface and options use `userId` while records use `user_id`; VOCABULARY lists
  both under userId, as it does for every camelCase/underbar pair.
