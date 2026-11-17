# Sprint gripe_rulings -- plan

* **Date**: 2026-10-15
* **Mode**: YOLO
* **Review level**: medium
* **At once**: 3 threads
* **Issued by**: flip (the Coach), ruling on what gripe_followups left
  (`winboard/20261015-gripe_followups/20261015-sprint_gripe_followups_done-human.md`)
* **Status**: done -- one merge line #83 → #92 → #95 → #93 → #91 → #90; see `winboard/20261015-gripe_rulings/20261015-sprint_gripe_rulings_done-human.md`

## Read first

* `winboard/20261015-gripe_followups/20261015-sprint_gripe_followups_done-human.md` -- the questions these rulings answer.
* `winboard/20261015-gripe_followups/validation-overrides.md` -- today's validation, the ckeys,
  the cipher binding and the size allowance, with file:line (threads 3 and 4). The Coach chose
  its option (c), full replacement, and rejected the floor.
* `TODO.md`, *Soonish*: *Pluggable label validator*, *Validating the user id*, *A lockbox row
  that breaks the listing locks the vault out*. This sprint settles all three.

## Ground rules

* Every branch is cut from the top of the gripe_followups line, `20261015-gripe_followups`
  (#83, which stands on #85 and #87, none merged yet). This sprint's line goes on top of it.
* Until 1.0 nothing binds backward. A stored-format change (thread 3's ckeys) needs no
  migration: the changeset says what a host will see (existing local rows read as absent).
* Threads do not edit this sprint's plan, progress, `human/` entry or `TODO.md`.

## Threads

### 1. damaged_boxes

The Coach, verbatim:

> * Mark a bad lockbox as removeable.
> * "store overwriting a borked box" -- allow the overwrite.

*Gloss.* #87's review found that a lockbox row failing the listing's check (not JSON, a
malformed note or timestamp) makes `listBoxes`, so every `refresh()` and every `openVault`,
throw `corrupt_record`, locking the vault out; and that `erase()` can report `corrupt_record`
after its own delete lands. Instead:

* The listing tolerates a bad row: it lists it, marked damaged (a snapshot field the worker
  names, e.g. `damaged: true`, with whatever of its label is known), rather than throwing.
  `openVault` and `refresh()` succeed over a vault with damaged boxes.
* `erase()` removes a damaged box (#87 did this for a readable listing; now for any row).
* `store()` over a damaged box overwrites it, as a fresh store (it can't carry
  `registered_at` forward from a record it can't read).
* `read()` and `use()` on a damaged box still refuse `corrupt_record`.
* The React demo, and `safebyok-react` if it lists boxes, show a damaged box as removable.

Touches `vault-db.ts` (`listBoxes`, `fromStorage`), `vault.ts` (`refresh`, `erase`, `store`),
`types.ts` (the snapshot's box summary), tests, both READMEs, `notes/security.md` (a tampered
row now shows as damaged rather than locking the vault: say what an attacker who can write
storage gains or doesn't). Depends on nothing unmerged beyond the base.

### 2. dialog_wording

The Coach, verbatim:

> Yes on Intl.RelativeTimeFormat.

*Gloss.* `PassphraseModal`'s window line moves to `Intl.RelativeTimeFormat`: "Locks again on
this device in 7 days" (the unit picked as today: whole days, else hours, else minutes), and
"Stays unlocked on this device until you lock it" for `ForeverMs`. Locale `'en'` for now (an
i18n thread is in TODO). Guard: where `Intl.RelativeTimeFormat` is missing, fall back to
today's wording. `reentryWindowMs` comes from the vault (#87). Model: `sonnet`. Touches
`packages/safebyok-react/src/passphrase-modal.tsx`, its tests, the react README.

### 3. tuple_ckeys

The Coach, verbatim:

> I'm not the biggest fan of the `:` tbh, and wonder if json-parsing the tuple would be that
> much worse.

*Gloss.* Thread 4 lets a host admit any label, colons and all, so the `:`-joined ckeys must go.
Replace them with an unambiguous encoding of the tuple: `JSON.stringify([applabel, user_id,
vaultlabel, boxlabel])` or, where the store takes them, native array keys (IndexedDB does). A
scope prefix for listing must stay unambiguous (a JSON array's prefix up to the last comma, or
an array-key range). Covers `vault-db.ts`'s `scopePath`/`bundleCkey`/`boxCkey`/`isBoxCkeyOf`,
`device-db.ts`'s and `idb.ts`'s `unlockCkey`, and any adapter in this branch that joins with
`:` (Convex keeps columns and should need nothing). Measure the cost honestly (key bytes,
listing speed in the memory and IndexedDB stores) and say it in the PR. Stored-format change:
the changeset says existing rows under the old ckeys read as absent. Depends on nothing
unmerged beyond the base. **Thread 4 is cut from this thread's tip.**

### 4. replaceable_validators

The Coach, verbatim:

> * Full replacement, no floor.
>   - The core use case -- storing api keys -- implies mostly-text labels, small oftent-single-line
>     mostly-ascii secrets, etc. But it would be silly to limit this library from use as a
>     1password replacement, with arbitrary labels in mixed Hebrew, Arabic, Thai and English, with
>     unbounded sizes
> * Export things that other libraries will find uesful

*Gloss.* `openVault({ validators: { applabel?, vaultlabel?, boxlabel?, userId?, note? } })`
(and `VaultProvider`), each a host schema (`Z.core.$ZodType<string>`) that **replaces** ours
outright. Ours stay the defaults. No floor: once thread 3's ckeys take any string, nothing in
the ckeys or the cipher binding needs one. What must still hold, from #85's write-up:

* **Check, never transform**: the host's input is what is stored and bound, never the schema's
  output.
* **Refusals are ours** (`bad_label`, `bad_option`) and never quote the input or the host
  schema's issues.
* **Validators run everywhere a name is checked**, reads included, so the VaultDB and DeviceDB
  verbs need the bag too (or the check moves to the vault). The Convex server never sees the
  bag: it must accept any string (check what its validators assume).
* **Sizes**: "unbounded sizes" breaks `LockboxFieldsBytes`, the static 2 KiB allowance that
  `ensureLimitsFit` uses. Replace the static allowance with something honest for unbounded
  names: e.g. measure each record at write time against the adapter's `maxRecordBytes`, and
  account the vault's total from real record sizes. The worker's design call; record it. Keep
  `maxWhisperBytes` and `maxLockboxes` as host options.
* **Exports**: a `safebyok/validators` entry with the default schemas and the constants other
  libraries want (`MaxUserIdChars` and the label and note bounds, the default `Label`,
  `UserId`, `LockboxNote`), also exported from the main entry where they are today. No `z`
  re-export. Standard Schema later.
* React: build the bag once; say so in the docs, or have the provider depend on each field.

Depends on thread 3 (cut from its tip once it files). Touches `types.ts`, `vault.ts`,
`vault-db.ts`, `device-db.ts`, `idb.ts`, the Convex component's validators, `tsdown.config.ts`,
`.size-limit.json`, both READMEs, VOCABULARY.md ("a label is lowercase words" becomes "by
default"), `notes/security.md`. Size: expect a budget bump; say how much.

## Merge line

The gripe_followups line (#87 → #85 → #83) → [#92](https://github.com/mrflip/safebyok/pull/92) (3) →
[#95](https://github.com/mrflip/safebyok/pull/95) (4) → [#93](https://github.com/mrflip/safebyok/pull/93) (1) →
[#91](https://github.com/mrflip/safebyok/pull/91) (2) → [#90](https://github.com/mrflip/safebyok/pull/90), squashed on top. Peers biggest first; thread 1 will conflict with threads 3 and 4
in `vault-db.ts` and `vault.ts`, resolved by its worker at the restack.

## Decisions taken in YOLO

* **Thread 2's fallback dropped** (flagged review of #91): the fallback for engines without
  `Intl.RelativeTimeFormat` used `Intl.NumberFormat`'s `style: 'unit'`, which every engine got
  *after* RTF, so it would throw on exactly the engines it was for; and the dialog's DOM markup
  never runs on React Native. (A syntax target such as es2022 guarantees no Intl API: an engine
  without RTF now throws to the host's error boundary, as before the thread.) The plan's guard was the
  orchestrator's addition, not the Coach's. Also: "Locks on this device in ..." when creating a
  vault, "Locks again ..." on an ordinary unlock.
* **Thread 3 sweeps old unlock rows** (flagged review of #92): after the ckey change an old
  `unlock:…` row, holding the localUnlockKey handle and the vaultKey wrapped under it, would
  outlive `lock()`. CLAUDE.md asks an old record to fail safe; deleting non-tuple rows on the
  device shelf at the first `readUnlock` reads nothing old, so it is a fail-safe, not a migration.
* **A box under a name today's validators refuse is damaged, and only erasable** (#93's restack
  onto #95): a host that narrows its validators after storing would otherwise have the listing
  throw and lock the vault out. Such a box lists as damaged; `erase()` reaches it by its stored
  name; `store()` over it refuses `bad_label` (a box stored there would still be unreadable).
  Damage of any other kind keeps the Coach's store-over ruling.

## For the Coach

* Answered in chat: `Intl.RelativeTimeFormat` across the target platforms.
* **Refused text reaches the snapshot** (#93's second review): a box stored under a name the
  host's validators now refuse lists as damaged *with that name*, so whoever can write storage
  can put any text (huge, control characters, markup) into `snapshot.boxes`, text a host's check
  may exist to keep out. Documented; closing it means capping or omitting such labels, or an
  opaque erase handle. Recommendation: keep, documented.
