# Sprint gripe_rulings -- progress

Newer than the plan wherever they disagree. Each thread's own notes are in its
`thread-<N>-<label>.md`, on its own branch.

## Status

| # | Thread                 | Base       | Status   |
| - | ---------------------- | ---------- | -------- |
| 1 | damaged_boxes          | #95 (restacked) | filed [#93](https://github.com/mrflip/safebyok/pull/93) |
| 2 | dialog_wording         | #93 (restacked) | filed [#91](https://github.com/mrflip/safebyok/pull/91) |
| 3 | tuple_ckeys            | #83 tip    | filed [#92](https://github.com/mrflip/safebyok/pull/92) |
| 4 | replaceable_validators | #92 `9218318` | filed [#95](https://github.com/mrflip/safebyok/pull/95) |

## What the threads have taught

*Orchestrator:* thread 2, dialog_wording, filed as [#91](https://github.com/mrflip/safebyok/pull/91):
the dialog reads "Locks on this device in 7 days" while creating the vault, and "Locks again on
this device in 7 days" otherwise, through `Intl.RelativeTimeFormat('en')` (one `Locale`
constant); `ForeverMs` reads "Stays unlocked on this device until you lock it". *Review:*
`flagged` -- the planned fallback for engines without RTF relied on `NumberFormat`'s unit style,
which no such engine has; dropped as a YOLO decision (see the plan). Second review `fixed` (the
doc block and README gave only the "again" wording). Left: an engine without RTF throws to the
error boundary, as before; the unit matrix tests only the creating wording. **Commit prefix for
`safebyok-react` is `client:`** (PROCESS.md), not `react:`.

*Orchestrator:* thread 1, damaged_boxes, filed as [#93](https://github.com/mrflip/safebyok/pull/93):
a lockbox whose record fails its check lists as `{ boxlabel, damaged: true }`, named by the ckey
it sits under (so a row that isn't JSON can still be removed); `openVault` and `refresh()` no
longer refuse over one; `erase()` removes it from any handle; `store()` erases then writes it
afresh; `read()`/`use()` still refuse. **Breaking for adapter authors**: `doListBoxes` returns
`{ boxlabel, lockbox }` pairs. *Review:* `fixed` -- the demo's Enter key knocked past the
button's gate; the security note names the two store-over-damaged races; the worker then
corrected the docs' "fails verification" wording (ed42ce5). Left, minor: those races (closing
them needs a revision-guarded erase in the adapter contract); a JS adapter on the old contract
lists every box as damaged. **For the restack**: `boxlabelOfCkey` and both string/IndexedDB
listings conflict with thread 3 (the boxlabel becomes the tuple's last element);
`NameableLockbox` and `listedOrDamaged` should take thread 4's validators. Size: `everything`
24.45 of 24.5 kB.

*Orchestrator:* thread 3, tuple_ckeys, filed as [#92](https://github.com/mrflip/safebyok/pull/92):
the string-keyed adapters file rows under `JSON.stringify([kind, applabel, user_id, vaultlabel(,
boxlabel)])`, from one public module, `Ckeys` (`bundle`, `box`, `unlock`, `boxPrefix`, `isBoxIn`,
`isUnlock`). The Coach's question answered: about 12 bytes more per ckey, listing no slower;
JSON text chosen over IndexedDB array keys (one encoding). Old rows read as absent. *Review:*
`flagged` -- an old `unlock:…` row (wrapped vaultKey) outlived `lock()`; swept unread, as a YOLO
decision. Second review `fixed` -- `eraseUnlock` deletes the scope's own unlock before sweeping;
the sweep rings the bell; the docs say when the sweep really runs (an open that finds the vault,
or any lock). Left for the Coach: a sweep in `writeUnlock` too; a `keys()` call per read; two
versions open at once evict each other's unlocks; the sweep as permanent code; `Ckeys` public.
**For thread 4**: no floor is needed in the ckeys; names are encoded as given, never normalized,
so validators check, never transform; add label cases to `describeVaultDB`'s separator test.
`everything` is at 24.47 of 24.5 kB.

*Orchestrator:* thread 4, replaceable_validators, filed as [#95](https://github.com/mrflip/safebyok/pull/95):
`openVault({ validators: { applabel?, vaultlabel?, boxlabel?, userId?, note? } })` and
`VaultProvider` take any Zod 4 schema that replaces ours outright, no floor; check, never
transform; one seam, `src/names.ts`, used by the vault and every `VaultDB` verb (each takes
`validators?`). New entry `safebyok/validators` (`Label`, `UserId`, `LockboxNote`,
`DefaultValidators`, `AnyTextValidators`, the bounds and `LabelPattern`), also from the main
entry. Sizes: the static allowance gives way to weighing each record against `maxRecordBytes`
(new kind `lockbox_too_large`) and each store's vault against `maxVaultBytes`. Budgets raised to
25.5 kB (everything) and 17.5 kB (`openVault`). *Review:* `fixed` -- `absent_box` no longer
quotes the boxlabel; the orchestrator also had a throwing host schema's error dropped from the
refusal's `cause` (a side door). Left, minor: wrappers that forget the bag; the provider's quiet
misspelt field; JSON escapes tripping `vault_full` early under tight limits; Convex weighing
~11 bytes heavier; the entry re-exporting `Whisper`/`EpochMillis`. **For thread 1's restack**:
a box whose name or note today's validators refuse must list as damaged and stay erasable.

*Orchestrator:* **restacked** into one line: #83 → #92 → #95 → #93 → #91 → #90. #92 and #95
already stood in a line. #93's worker rebased it onto #95 (conflicts in the listings, the
ckey helpers and the name checks, resolved by folding #93's damage into #95's seam: the listing
names a row by `Ckeys.boxlabelOf`, and `listedOrDamaged` checks through `Names`), then added
the YOLO decision that a box under a name today's validators refuse lists as damaged and is
only erasable (`store()` there is `bad_label`); `everything`'s budget rose to 26 kB. Its second
review fixed `Ckeys.boxlabelOf` (a planted row spelled unlike `Ckeys.box`'s output listed but
could never be erased) and left the Coach one question: refused text now reaches the snapshot.
#91 rebased onto #93 without a conflict; `pnpm justify` and `pnpm size` ran once, at the top.
