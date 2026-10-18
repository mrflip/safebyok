# Thread 10: sweep (2026-10-18)

Branch `20261018-sweep`, PR #PRNUM, stacked on [#167](https://github.com/mrflip/safebyok/pull/167) (line main → #159 → … → #167 → #PRNUM). Justify: green -- core 2161 passed | 35 skipped; react 227; indexeddb 135 | 10; convex 258 | 8; postgres 246 | 14; graphql 239 | 14; fastkey 49; demo 191 | 16; e2e 81 | 89; scripts 258.

* **Built**
  * The sprint's grep run over the repo and its survivors removed or classified (the PR quotes the command and every survivor). Fixed: `TODO.md` ("bundle", "remembered unlock", `takeUpUnlock` → `takeUpVaultKey`), `NOTYET.md` ("remembered unlock", "public bag"), `ctx-bytes.test.ts`'s encoding test (now `'safebyok-lockbox-v5'` and `revision_tok`, text and hex together; the other literals did not move), and a retired option name `unlockId` used as an arbitrary unknown option in a `vault.test.ts` test (now `colour`).
  * The demo's note hint is "(not encrypted: visible without the passphrase; left blank, the note stands)".
  * Core README: a new short section, *The cast, and how it fits together*, after the quick start (the README had no vocabulary or architecture section; the root README is a package list and needed none). The `wrong_passphrase` row of the conditions table points at `created_elsewhere`.
  * `.size-limit.json` rewritten by `pnpm size:budget --write`: `everything` 38 → 39 kB (measure 35.30), `Vault` 31 → 32 kB (28.03), `VaultProvider` 6.8 → 7.2 kB (4.79), `reactEverything` 8.1 → 8.3 kB (5.27). The other eleven did not move.
  * `notes/security.md`: one new entry (through a `sonnet` subagent), the three stored-format tags that changed and that no migration exists.
  * `.changeset/20261018-sweep.md`: the sprint's release note, all seven packages, `minor`: what a host does, the Postgres `ALTER` lines in run order, the Convex clear-tables step, the GraphQL pairing.
* **Decisions taken**
  * The *Old names* table stays, marked "To be deleted at 1.0.0" (the Coach has not ruled otherwise).
  * Old `notes/security.md` entries keep their wording. The entry is new, not folded into the wayin, lockbox and lease entries that already say part of it (the sprint asked for one entry); those three entries still say `damaged_bundle`, `public_json` and the like.
  * Postgres run order is not the threads' order by accident: `RENAME COLUMN unlocks TO wayins` names the old table, so it runs before the table is renamed.
  * "way in" / "ways in" as plain prose (README, doc blocks, a few messages) is left: it is the gloss of the cast's "wayin", not a retired word.
* **Deviations**
  * The grep's allowed list has no row for tests that show an old record failing safe. They name the old tag and old fields on purpose (`lockbox.test.ts`, `vault.test.ts`: `safebyok-lockbox-v4` with `public_json`, `safebyok-unlock-v1` with `local_unlock_key` and `vault_key_local_wrapped`). Kept; the PR lists them. Also kept: `vault_key_wrapped` of `prior_vault_key` (current name, not retired).
* **Discoveries**
  * `.changeset/20261018-ctx.md` and `20261018-vocabulary.md` are empty changesets by design; the summary changeset does not repeat them.
* **For the Coach**
  * Old `notes/security.md` entries that still use retired words are listed in the PR (some seventy; the file's header forbids editing them). A single exception ruling would let a later pass fix them.
  * The *Old names* table: delete at 1.0.0.
