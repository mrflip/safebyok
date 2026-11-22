# Thread 6: draft_truth (2026-11-22)

Branch `20261122-draft_truth`, PR #824, stacked on #821. Proved: `pnpm --filter safebyok-react-lean test` 17 files, 272
tests, typecheck and lint clean; `pnpm justify` at the tip of the branch above (`20261122-error_wraps`), which covers this one.

At the Coach's direction, the thread's second change, making the errors a host is handed `Error`s, is a thin PR of its
own on `20261122-error_wraps`, stacked on this one. Its PR body has the change and its count of call sites.

* **Built**: `useDraft` (`packages/safebyok-react-lean/src/giver/use-draft.ts`) reacts to a form reset with
  `forgetTyped` rather than `discard`.
  - **With a sidecar edit pending** (`isSidecarDirty`: the draft's sidecar differs from its base's), it empties the
    inputs, forgets the fields typed into and masks the field shown. `pinned` and `sidecarSet` stay as they were, so
    `base`, `isBehind` and the revision `put` cites do not move.
  - **With no sidecar edit pending**, it calls `discard()`: the draft ends clean, based on the box stored.
  - `discard()` itself is unchanged and still drops everything.
  - The hook's doc block, and `notes/wontfix.md`'s row on a cancelled form reset (its title, first sentence and the
    sentence on what the draft forgets), say this.
* **Decisions made**:
  - **The base after a reset.** A pending sidecar edit keeps its pin: the edit was made against that revision, so a
    second Save must still refuse `stale_write` if the box moved in the meantime. With nothing left, the draft is a
    `discard()`: a clean draft that kept its pin could read "behind" with nothing to write.
  - **What counts as pending.** The sidecar must differ from the base's sidecar; being set is not enough. A sidecar
    set back to the base's value counts as nothing left.
  - **Why the effect calls `discard()` inside `forgetTyped`, not its own copy of the steps:** "nothing left" is meant
    to read exactly as an Undo would.
* **Tests** (`tests/giver/use-draft.test.tsx`):
  - **New** ("forgets only what was typed when its form's action refuses the put..."): a sidecar edit and a typed
    field, then a Save refused by a dismissed unlock. Afterwards the typed field is gone and not counted, and the
    draft is still dirty by the sidecar, not behind, at the same base revision. A second Save, once unlocked, writes
    the sidecar and leaves the stored key as it was. Before the change it failed: the draft read clean.
  - **The typed-only reset test** passes unchanged, apart from "discards" becoming "forgets" in its title.
  - **The reset of a form elsewhere on the page** passes unchanged.
* **Discoveries**: React's reset handler runs from the last committed render's effect. A `setSidecar` landing while
  the form's action is pending could be judged against the sidecar of the render before it. That is a crossing of
  milliseconds, unexamined.
