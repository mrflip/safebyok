# 2026-10-18: Sprint reform done -- ten PRs in one line on today's main; a few rows wait on you

The sprint ran the Coach's preplan (`whiteboard/20261018-reform/reform-preplan.md`) as ten threads in
one session, YOLO, review at medium. Every thread is built, reviewed by its own `thread-reviewer`,
and filed, in one line on today's `main` (`2946a499`, unmoved since the sprint began), each PR's base
`main`: merging the top, the sprint PR #158, merges them all. Three threads came back `flagged`
(8, 9, 10); each was fixed by its builder on a directive and passed a second review. The plan
(`whiteboard/20261018-reform/reform-plan.md`) has every gloss, ruling and *Review:* line; the
progress document the lessons; each thread's file its build. The sprint doc mirrors them:
https://claude.ai/code/artifact/b7fd117e-7a03-4f68-b2fa-b2c1e70e118b

## The line, in merge order

Each PR's first line says "Stacked on #<the one below>, in the line main → ... ".

1. [#159](https://github.com/mrflip/safebyok/pull/159) vocabulary (1) -- the bottom, on `main`; documents only
2. [#160](https://github.com/mrflip/safebyok/pull/160) no_retry (2) -- `store()` makes one attempt
3. [#161](https://github.com/mrflip/safebyok/pull/161) wayin (3) -- envelope → wayin; `safebyok-vault-v3`
4. [#162](https://github.com/mrflip/safebyok/pull/162) ctx (4) -- binding → ctx; no byte moved, pinned by `ctx-bytes.test.ts`
5. [#163](https://github.com/mrflip/safebyok/pull/163) sidecar (5) -- public bag → sidecar; `safebyok-lockbox-v5`
6. [#164](https://github.com/mrflip/safebyok/pull/164) lease (6) -- device unlock → lease; `safebyok-lease-v1`
7. [#165](https://github.com/mrflip/safebyok/pull/165) vaultprops (7) -- bundle → vault props, erase → retire, `revision_tok`
8. [#166](https://github.com/mrflip/safebyok/pull/166) make_hello (8) -- `Vault.make` + `hello()`, `trouble`, unknown options refused
9. [#167](https://github.com/mrflip/safebyok/pull/167) created_elsewhere (9) -- the new refusal kind
10. [#168](https://github.com/mrflip/safebyok/pull/168) sweep (10) -- survivors removed, README cast, size budgets, the release-note changeset
11. [#158](https://github.com/mrflip/safebyok/pull/158) the sprint PR, squashed to one `plan:` commit -- **the top**

## YOLO decisions

Each is a row in the sprint doc's *Open Matters* (flip it to `proceed` with an answer to change
it). The ones with the most weight:

* **A ctx's bytes follow its record's renamed stored fields and bumped tag** (thread 3, applied in
  5, 6, 7): same construction, new inputs, as in the v1 → v2 bump; no old record is read. A
  security note for each.
* **`Vault.make` refuses unknown options** (from thread 6's review): a host still passing the
  retired `forcePassphraseReentryHours` would otherwise get the 7-day default silently.
* **Thread 8's lease rule** (from its flagged review): a handle takes up a lease only while it has
  never forgotten one, so a lock whose lease erase failed is never undone on the same page.
* **Thread 9's dialog** (from its flagged review): the `created_elsewhere` advice stays until the
  next submit; the field is emptied and focused.
* **The release note's Postgres path starts from 0.3.0** (from thread 10's flagged review): drop the
  lockbox table, rename three vault-table names, run the new SQL. Worth reading before #150.
* Name calls beyond the map: `wayinkind`, `takeUpVaultKey`, `readBox` (your ruling) over the text's
  `viewBox`, `useBox`, `leaseMillis`, `wayinId`, the adapters' storage names (`safebyok_vaults`,
  Convex `vault_row_id`), `Ckeys.lease`/`Ckeys.vaultProps`, and internals. Thread 1 sits at the
  bottom of the line so every rename worktree had the new VOCABULARY.md.

## Open, needing your word

* **The `react-hooks/set-state-in-effect` suppression** in `safebyok-react/src/vault-provider.tsx`
  (#166): CLAUDE.md pre-approves only `no-param-reassign`/`no-explicit-any`; no clean alternative
  was found.
* **Old `notes/security.md` entries** (about 78) still use retired words, the only ones left; the
  header forbids editing them. Rec: an exception, in a small PR after the merge.
* **Refusal wording**: `vault_full` says "retire a lockbox", and reaches end users through
  `showGripe` (#165).
* **For you**: a screen-reader check of the `created_elsewhere` advice (#167).
* **#138** (KeyDeriver class) collides with the reform throughout; rebase it as its own thread after
  this line merges. **#156** touches the passphrase-modal tests.
* `scripts/file-thread` exits 255 after pushing whenever a `.DS_Store` reappears mid-delete (most
  filings this sprint); a second `rm -rf` clears it. Rec: a small fix PR.
* **Five earlier changesets still give their own Postgres steps** (`public_bag`, `written_at`,
  `wayin`, `sidecar`, `vaultprops`), contradicting the summary's one 0.3.0 path in ways a host
  would act on. Rec: cut each to a pointer before the release.
* `notes/old_vocabulary.md` (the old names table) stays, marked for 1.0.0.

No row was ruled during the sprint, so `whiteboard/20261018-reform/reform-resolutions.md` records
only that; every matter is still in *Open Matters*, born `drafting`, each with its Rec.
