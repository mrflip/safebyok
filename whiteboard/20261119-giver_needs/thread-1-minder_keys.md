# Thread 1: minder_keys (2026-11-19)

Branch `20261119-minder_keys`, PR #753, stacked on #751. Proved: `pnpm --filter safebyok exec vitest run tests/minding tests/shapes tests/index.test.ts` (304 pass), eslint on `safebyok` src and tests and on `safebyok-react` src, `tsc --noEmit` on `safebyok`. `pnpm justify` not yet run.

* **Built**
  * M1, in `packages/safebyok/src/minding/thing-minder.ts`: `queryKey(scoped)` is `['safebyok', userid, banklabel, ...labels with '/' between, '!']`. New public siblings `listingQueryKey(scoped)` (`..., '#', 'kids'`) and `subtreeQueryKey(scoped)` (`..., '/'`), both over a private `#keyHeadOf`. `#scopeOfQueryKey` reads the labels up to the first `'!'` or `'#'` and drops the `'/'` segments, so it reads a car's key and a listing's key alike. The root box's `gcTime: Infinity` default is still set on `queryKey(root)`, and no other key starts with it.
  * Tests (`tests/minding/thing-minder.test.ts`, "ThingMinder keys"): the three shapes, and a `TSQ.partialMatchKey` check that a subtree prefix matches every car and listing key under a Thing and neither of its own (root, box, a deeper made-up labelpath, a sibling `box/openai2`, a gate). The key-shape test replaced the old `'.'` one; no behaviour test changed.
  * M7: `BoxLabelpath` and `isBoxLabelpath` in `shapes/shapes-thing.ts`, exported from `safebyok`'s `index.ts`; `ThingAt` reads `BoxLabelpath`, so `CarAt` agrees. The giver (`safebyok-react/src/giver/minder-bank.ts`) imports both and drops its own and its `safebyok/storage` import.
* **Decisions made**
  * The key builders are public methods like `queryKey`, because the subtree test needs them and thread 3 and 5 call them from inside the minder either way.
  * No `kind`-telling key reader yet: it would be code nothing reaches. Thread 2 can read the mark itself (`'!'` car, `'#'` listing); `#scopeOfQueryKey` already stops at either.
  * M7 was needed: the modelkind work gave `ThingAt` a literal `'box' | \`box/${string}\``, and `isLabelpathOfKind` returns a boolean, not a guard, so the giver still had its own type and guard.
* **Deviations**: none. Empty changeset (`.changeset/20261119-minder_keys.md`), with what a caller sees.
* **Discoveries**: `pnpm --filter safebyok-big build` is needed in a fresh worktree before `safebyok` tests resolve `safebyok-big/internals`.
