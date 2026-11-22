# Thread 9: wontfix_demos (2026-11-22)

Branch `20261122-wontfix_demos`, PR #826, stacked on #825. Proved: `pnpm --filter safebyok-react-lean lint`, `typecheck`, `test` (21 files, 278 tests, 4 new); `pnpm justify` once at the end.

* **Built**: one demonstration test for each row of `notes/wontfix.md`'s `## React`, in `packages/safebyok-react-lean/tests/wontfix/`, each asserting what the row leaves as it is and failing with a message that names the row. Each row's *To reproduce* now names its test.
  - `form-reset-cancelled.test.tsx`: mocks nothing. A draft's field and a plain input in a form whose `onReset` calls `preventDefault()`; after the reset button the plain input keeps its text and the draft's field is empty.
  - `form-reset-split-draft.test.tsx`: mocks nothing. One draft, `apiKey` in a form and `orgId` outside it; the form's reset empties both.
  - `stage-change-suspends.test.tsx`: mocks nothing, but casts the query factory's `queryFn` for `useSuspenseQuery` (types only). A `Suspense` above the stage switch wraps a `useSuspenseQuery` of the box at `'unlocked'`; the fallback is committed (counted in a layout effect, since a transition renders a fallback it never commits) before the box shows.
  - `action-refusal-after-undo.test.tsx`: mocks nothing, but is the test's own host (no demo on this branch has the row's form). A `useActionState` form Action over `draft.put`, refused with `stale_write` (a sidecar edit pending, another device wrote since); Undo makes the draft clean and the alert stays.
* **Decisions made**: row 4 is shown in the package, not in `demos/safebyok-demo-envman`, because that demo's row on this branch is a `useMutation` whose Undo calls `save.reset()`: the row's own claim does not hold of it here (see below).
* **Deviations**: the one cast in the suspense test; no row's ruling or `src/` touched. `STYLE.md` untouched.
* **Discoveries**:
  - **Row 4 describes `20261122-envman_actions` (#819), not this branch.** On this stack envman's Save is `useMutation`, Undo resets it, and the message does not outlive Undo.
  - **Even on #819 the row's story needs a pending sidecar edit.** There a refused Save resets the form, so a draft with only a typed value is clean again at once and Undo is disabled; the message stands but not "outliving an Undo". The test uses a sidecar edit so Undo has something to discard.
  - **A bank lock in the row** is envman's own `useStageChange` calling `draft.discard`; the library leaves a draft alone on a lock. The test shows Undo only.
  - **`useSuspenseQuery(sok.acme.box(path))` does not typecheck**: the factory's `queryFn` may be `skipToken` (until the bank is up), which `useSuspenseQuery` refuses under `exactOptionalPropertyTypes`. Row 3's *Workaround* does not mention it, and a host who wants a suspending read hits it at once. A host also gets no `useSuspenseBox`.
* **For the Coach**: whether row 4 should be reworded to say what it needs (a draft still dirty after the refusal), and whether the `skipToken` finding wants a row or a fix of its own.
