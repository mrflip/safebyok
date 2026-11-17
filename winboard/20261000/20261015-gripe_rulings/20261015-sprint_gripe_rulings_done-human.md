# 2026-10-15: Sprint gripe_rulings done -- four PRs and this sprint PR, one merge line

The Coach ruled on what gripe_followups left, and four threads built the rulings. A damaged
lockbox now lists as damaged and is removable instead of locking the vault out. The dialog words
its unlock window through `Intl.RelativeTimeFormat`. Storage keys encode the name tuple as JSON
instead of joining with `:`. A host can replace any name validator outright, with no floor, so
labels may be any text in any script. This sprint PR carries `TODO.md`'s three new entries and the
sprint's records; it was a draft from planning and is squashed on top of the line.

## The PRs, in the order to merge them

One linear line on the gripe_followups line (#87 → #85 → #83): merging the top,
[#90](https://github.com/mrflip/safebyok/pull/90), merges them all.

1. [#92](https://github.com/mrflip/safebyok/pull/92) `tuple_ckeys`: ckeys are
   `JSON.stringify([kind, applabel, user_id, vaultlabel(, boxlabel)])`, from a public `Ckeys`
   module. About 12 bytes more per ckey, listing no slower. **Stored-format change**: vaults
   under `idbVaultDB` or `localVaultDB` read as absent after upgrade. Old remembered unlocks are
   swept unread. Stacked on #83. Reviews: `flagged`, then `fixed`.
2. [#95](https://github.com/mrflip/safebyok/pull/95) `replaceable_validators`:
   `openVault({ validators })` and `VaultProvider` take host schemas that replace ours, check
   only, never transform; one seam (`names.ts`); a `safebyok/validators` entry; records weighed
   against `maxRecordBytes` (new kind `lockbox_too_large`) and the vault against `maxVaultBytes`.
   Stacked on #92. Review: `fixed`.
3. [#93](https://github.com/mrflip/safebyok/pull/93) `damaged_boxes`: a bad lockbox lists as
   `{ boxlabel, damaged: true }`; `erase()` removes it; `store()` overwrites it, except under a
   name today's validators refuse. **Breaking for adapter authors**: `doListBoxes` returns
   `{ boxlabel, lockbox }` pairs. Stacked on #95. Reviews: `fixed`, then (after the restack)
   `fixed`.
4. [#91](https://github.com/mrflip/safebyok/pull/91) `dialog_wording`: "Locks on this device in
   7 days" while creating, "Locks again on this device in 7 days" otherwise. Stacked on #93.
   Reviews: `flagged`, then `fixed`.
5. [#90](https://github.com/mrflip/safebyok/pull/90): this sprint PR, squashed. Stacked on #91.
   Its unsquashed history is at the tag `sprint/20261015-gripe_rulings`.

Size budgets, raised under the Coach's standing approval: `everything` 24.5 → 26 kB,
`openVault` 17 → 17.5 kB (17.45 used: almost no headroom).

## YOLO decisions

- **#91's fallback dropped.** Where `Intl.RelativeTimeFormat` is missing, the planned fallback
  used `NumberFormat`'s unit style, which every engine got later, so it could never run. The
  dialog is DOM-only. An engine without RTF throws to the error boundary, as before.
- **#92 sweeps old remembered unlocks.** An old row held the vaultKey wrapped under the device
  key, out of `lock()`'s reach. Deleting non-unlock rows, unread, fails safe; it is not a
  migration.
- **#95's throwing host schema carries no `cause`**: a refine quoting its input would have
  carried a pasted key out on the error.
- **A box under a name today's validators refuse is damaged and only erasable** (#93's restack).
  `store()` there refuses `bad_label`; damage of any other kind keeps the store-over ruling.

## Open questions, gathered

**Needs your word**

- **Refused text reaches the snapshot** (#93): a box stored under a name your validators now
  refuse lists as damaged *with that name*, so whoever can write storage can put any text into
  `snapshot.boxes`. Documented (render it as text). Closing it means capping or hiding such
  labels, or an opaque erase handle. Recommendation: keep.
- **`Ckeys` public?** It is now a documented encoding contract for adapter authors, with
  `boxlabelOf` and `isUnlock`. Recommendation: keep public.
- **The old-unlock sweep** (#92): it runs at an open that finds the vault or at any lock, not
  at the first open; should `writeUnlock` sweep too? It costs a `keys()` call per read and
  erase, evicts unlocks of an older version open in another tab, and is permanent code for an
  old shape.
- **`lockbox_too_large`** (#95): a new kind, or folded into `vault_full`?
- **Lone surrogates** (#95): Convex refuses them as `storage_unavailable`. Should
  `AnyTextValidators` refuse them?

**Minor, on the PRs**

- #93: storing over a damaged box can race another device's write (closing it needs a
  revision-guarded erase in the adapter contract); a JS adapter on the old `doListBoxes`
  contract lists every box as damaged; erase of a refused name reads twice; the host's check
  can run four times per verb.
- #95: a third-party wrapper that forgets the `validators` bag falls back to the defaults; the
  provider quietly drops a misspelt `validators` field; JSON escapes can trip `vault_full`
  early under exactly tight limits; Convex weighs a record about 11 bytes heavier; the
  validators entry re-exports `Whisper` and `EpochMillis`.
- #91: an absurd window just under `ForeverMs` reads "in 288,000,000,000 minutes".

**Housekeeping**

- Leftover directories, unregistered and fully pushed: `/workspace/byok-vault_amendments`,
  `/workspace/byok-replaceable_validators`.
- [#66](https://github.com/mrflip/safebyok/pull/66) is still open with nothing to merge.
