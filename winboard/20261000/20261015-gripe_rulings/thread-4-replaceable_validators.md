# Thread 4: replaceable_validators (2026-10-15)

Branch `20261015-replaceable_validators`, PR [#95](https://github.com/mrflip/safebyok/pull/95),
stacked on [#92](https://github.com/mrflip/safebyok/pull/92). Justify: green (root 123, safebyok
971, safebyok-react 52, safebyok-convex 274, demo 127). `pnpm size` within the raised budgets.

* **Built**
  - `openVault({ validators })` and `VaultProvider` take a `VaultValidators` bag (`applabel`,
    `vaultlabel`, `boxlabel`, `userId`, `note`). Each field is any Zod 4 schema and replaces
    ours outright. A field left out keeps `DefaultValidators`. A bag with an unknown field or a
    non-schema is `bad_option`.
  - `src/validators.ts` is the new `safebyok/validators` entry. It holds `Label`, `UserId` and
    `LockboxNote` (moved from `types.ts`), `DefaultValidators`, `AnyTextValidators`,
    `MaxLabelChars`, `LabelPattern`, `MaxUserIdChars`, `MaxNoteChars`, and re-exports
    `Whisper` and `EpochMillis`. All are in the main entry too.
  - `src/names.ts` (internal) is the one seam: `rulesOf`, `admits`, `check` and `checkScope`.
    A check only checks: the input is kept, never the schema's output. Refusals are ours and
    quote nothing.
  - The records (`VaultScope`, `Lockbox`, `LockboxSummary`, `VaultBundle`, `DeviceUnlock`) check
    names and notes as text only.
  - Every public `VaultDB` verb takes `validators?` last. `readBox` and `listBoxes` pass records
    through `checkStoredBox(rules, schema, raw)` in `vault-db.ts`.
  - **Sizes.** `updateBox` weighs a record with its scope (`jsonBytes`) against
    `maxRecordBytes`, and refuses with the new kind `lockbox_too_large`. `store()` weighs the vault
    against `maxVaultBytes` through `lockboxWeight` and `ensureRoomFor` in `vault.ts`
    (`LockboxFixedBytes` = 512). The PR body sets out this design.
  - `describeVaultDB` has two `OddLabels` cases, run against every adapter. Convex's test
    wrapper and the demo's `OutageVaultDB` forward the bag.
  - Docs: the READMEs, VOCABULARY, a `notes/security.md` entry and a changeset.
  - The size budget rises in its own commit: `everything` to 25.5 kB and `openVault` to
    17.5 kB. New rows: `validators` and `DefaultValidators`.
* **Decisions taken**
  - **The seam is an optional trailing argument on the `VaultDB` verbs**, as the orchestrator
    asked, and not a check moved into the vault. `DeviceDB` needs none: the vault compares the
    unlock's scope for equality with the scope it already checked.
  - **`AnyTextValidators` is public.** Without it a delegating adapter (the demo's) had no way to
    reach an inner VaultDB, and it is the natural starting point for a 1Password-style host.
  - **`lockbox_too_large` is a new kind** (a condition) and does not reuse `vault_full`, whose
    remedy doesn't fit a single oversized record.
  - **The open-time check stays** as a plan at the default checks' largest (`LockboxFieldsBytes`),
    and the write-time weighing is what actually holds the line.
  - **A replacement no heavier than what it replaces always lands**, mirroring the Convex
    server's rule.
  - **`validators` is a `strictObject`**, so a typo such as `boxLabel` is refused rather than
    silently keeping the defaults.
* **For thread 1 (damaged_boxes), at the restack**
  - `NameableLockbox` should check a stored-under boxlabel with
    `Names.admits(rules, 'boxlabel', ...)`, where `rules = Names.rulesOf(validators)` is taken
    from `listBoxes`'s argument.
  - `listedOrDamaged` should replace `checkStoredBox(rules, ListedLockbox, raw)` in `listBoxes`,
    keeping its name and note checks.
  - The `vault.ts` calls pass `rules` to every verb.
  - `erase()` of a damaged box still runs `Names.check(rules, 'boxlabel', ...)`. A box stored
    under a name the current checks refuse cannot be erased by name. Decide whether that is
    right.
* **Discoveries**
  - Convex refuses strings that are not valid Unicode (an unpaired surrogate). The Convex README
    says so. `AnyTextValidators` admits them; whether it should refuse them is open.
  - A wrapper that calls another VaultDB's *public* verbs (the demo's, Convex's test `perUser`)
    loses the bag unless it forwards it.
  - `String.raw` with a backslash before the closing backtick is a parse error. Twice.
* **Review** (`fixed`): bbd20c3 stops `absent_box` from quoting the boxlabel. a5428ba refuses a
  throwing host schema with no `cause`, since a refine may quote a pasted key. The reviewer's
  minor findings are in the PR's open questions. Sizes after: `everything` 25.31 kB, `openVault`
  17.36 kB.
* **For the Coach** (also in the PR's *Open questions*)
  - `lockbox_too_large` as a new kind, or fold it into `vault_full`?
  - Narrowing the checks later strands boxes as `corrupt_record`. A listing that throws locks the
    vault out until #93 lands.
  - Should `AnyTextValidators` refuse lone surrogates, for Convex's sake?
  - Surface beyond the plan: `AnyTextValidators`, `LabelPattern`, `MaxLabelChars`,
    `MaxNoteChars`.
  - Size: +0.84 kB `everything`, +0.73 kB `openVault`.
