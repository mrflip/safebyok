# Thread 5: the public bag is the sidecar (2026-10-18)

Branch `20261018-sidecar`, PR #TBD, stacked on
[#162](https://github.com/mrflip/safebyok/pull/162) (line main → #159 → #160 → #161 → #162 → this).
Justify: green (core 2114 passed / 35 skipped, four tests new; indexeddb 135/10, postgres 246/14, convex 258/8, graphql 239/14, react 218, fastkey 49, scripts 258, demo 190/16, e2e 81/89 skipped; size check green).

* **Built**:
  - Core: `PublicBag` → `Sidecar` (exported), `public_json` → `sidecar_json` on the `Lockbox`
    record, `store(..., { public })` → `{ sidecar }`, `LockboxSummary.public` → `.sidecar`,
    `publicJsonOf` → `sidecarJsonOf` (private in `vault.ts`; also `TH.sidecarJsonOf`),
    `EmptyPublicJson` → `EmptySidecarJson`. Lockbox format `safebyok-lockbox-v5`; its JSON-schema
    snapshot rewritten under the new tag, the v4 one dropped as obsolete. The option's parse stays
    in one place: `checkStoreOpts` and `sidecarJsonOf` in `vault.ts`.
  - `tests/ctx-bytes.test.ts`: the lockbox literals follow the v5 tag and the renamed field, in the
    rename's commit. Nothing else in the file moved.
  - Adapters: postgres (`columns.ts`, `vault-tables.ts`, `vault-tables.sql`: column
    `sidecar_json`), graphql (`fields.ts`, `vault-schema.ts`), convex component validators
    (`LockboxFormat` v5, `sidecar_json`). indexeddb and react needed only a README line (react had
    nothing passing `{ public }`). Demo, e2e, READMEs, `VAULTDB.md`, `notes/wontfix.md` follow.
  - Tests: a v4 lockbox (with `public_json`) is refused by `Lockbox` and lists as damaged in a
    vault; "a future format" moved from `-v5` to `-v6`.
  - `notes/security.md`: a sonnet subagent folded the ctx fact into the 2026-10-16 lockbox entry
    (the header says to fold where an entry already covers the mechanism).
  - Changeset `.changeset/20261018-sidecar.md`, minor for safebyok, convex, graphql, postgres,
    with the Postgres `ALTER TABLE safebyok_lockboxes RENAME COLUMN public_json TO sidecar_json`
    and the Convex clear-the-tables line.
* **Decisions taken**:
  - Local and test names in the sidecar sense of "bag" follow too (`bagless` → `sidecarless`,
    `LiteralBag` → `LiteralSidecar`, `misbagged` → `withSidecarNotText`, the demo's `noteOf`
    parameter). "bag" in its STYLE.md sense, an options bag, is left alone.
  - The misspelling example `pubilc` → `sidcar`.
  - README: the sidecar's bullets now read **It is not encrypted** and **It is authenticated**,
    matching the brief's "authenticated but not encrypted".
* **Deviations**:
  - **No lockbox older-formats list.** The handoff asked to add `safebyok-lockbox-v4` to "the
    lockbox's list of known-older formats" so a v4 box reads damaged rather than `newer_format`.
    There is no such list: only the vault record (`OlderBundleFormats`) tells newer from older. A
    lockbox in any format but the current one already lists as damaged (`v9` and `v3` rows in
    `DamagedListings` show it). So I added the tests (a v4 row in `lockbox.test.ts` and in
    `DamagedListings`) and no list.
  - `ctx-bytes.test.ts`'s first test, which pins `cipherCtx`'s own encoding (text and hex), still
    passes `'safebyok-lockbox-v4'` as an arbitrary string: it is not the lockbox's ctx, and the
    handoff said nothing else in the file should move. A grep survivor, classified in the PR.
* **Discoveries**:
  - The header in `boxCtx` is key-sorted JSON, so `sidecar_json` now sorts after `revision_id`
    (where `public_json` sorted after `boxlabel`). Same parts, same order; the key moved by the
    sort. Thread 7's `revision_tok` sorts in the same place as `revision_id`, before `sidecar_json`.
  - Postgres' 14 skipped are its container suites, skipped locally as before: CI runs them.
  - `scratchpad/sidecar/realign.py` (not committed) restored column alignment after the rename by
    pairing each changed line with its old version.
* **For the Coach**:
  - The lockbox has no newer-vs-older format distinction; every unknown lockbox format is damage.
    The handoff assumed a list like `OlderBundleFormats`. Recommend leaving it so: a lockbox from a
    newer safebyok listing as damaged is safe (nothing is written over it unless the user stores
    over it), and a newer safebyok means a newer vault record too, which already refuses as
    `newer_format` first.
