# Thread 5: one_sanitizer (2026-10-28)

Branch `20261028-one_sanitizer`, PR #324, stacked on nothing (base main at f2af68e4). Justify: green; safebyok 3451 passed / 37 skipped, react 310, convex 367, graphql 344, postgres 322, indexeddb 167, fastkey 49, root 266, e2e 107.

* **Built**: the three core guards around a host function that hears the passphrase go through
  `Sanitizer.refusalFor` (`packages/safebyok/src/sanitizer.ts`): `deriverThrewRefusal` in
  `proving.ts` (both branches), the catch in `guardStrengthChecker` in `passphrase-strength.ts`,
  and `requestThrewRefusal` in `vault-opts.ts`. With `safebyok-react`'s `adviceFailed` and
  `forBoundary` and `safebyok-convex`'s `refusing`, which already called it, that is all six
  sites. `refusalFor`'s doc block now states its contract (nothing of the throw is read; what may be
  said of it is decided before the call from safebyok's closed lists) and gives the keyDeriver as
  its first example; `tests/sanitizer.test.ts` gains a test per example and a Proxy-trap test
  pinning "reads nothing". `notes/guarantees.md` names the sanitizer in *Where the guarantees are
  kept* and G8. Empty changeset.
* **Decisions taken**:
  - `Sanitizer.refusalFor(foreign, kind, message)` keeps its signature: `Sanitizer` is exported
    from `safebyok`'s index, and nothing needed the shape to change. The two sites that log
    (`deriverThrewRefusal`, `guardRequestCleartext`) keep their `logger.error` beside the call,
    with `listedKindOf` as the one inspection of the throw; a logging sanitizer would be a second
    export, a contract addition, for two callers.
  - The core imports it whole, `import * as Sanitizer from './sanitizer'`, as `Refusals` is.
  - `requestThrewError()` renamed `requestThrewRefusal(thrown)`, private: STYLE.md's `fooRefusal`
    for a pure refusal builder, and the pair now reads like `deriverThrewRefusal`.
  - `guardStrengthChecker`'s try still holds `passphraseVerdict.safeParse(await hostChecker(...))`,
    two calls, by design (the verdict's getters are the checker's and may throw as read; a running
    comment says so). Behaviour kept; not reshaped.
* **Deviations**: none from the plan. `notes/guarantees.md` is edited beyond the plan's list, for
  the names only: it had `parseRequestCleartext`, which does not exist (`guardRequestCleartext`
  does). No guarantee's text changes.
* **Discoveries**:
  - The plan's line numbers predate #301: `requestThrewError` was at l.136, not l.348, and thread 4's
    `checkBankVaultOpts` at l.55. The `vault-opts.ts` import for the sanitizer sits after the
    `./logger` import, outside every hunk #317 touches (it removes the `./options` import; a line
    added beside it would conflict at the catch-up rebase).
  - `packages/safebyok-react/tests/bank-provider/bank-provider-dialog.test.tsx` ("a dialog that
    meets misuse keeps the app in place...") failed once in a full `pnpm justify` and passed 4/4
    alone and on the next full run: a timing flake under load, not this thread's. A first full run
    also exited 1 after the size-limit output with no failure printed; it did not recur.
  - The secret-adjacent decision "keep nothing of the throw" now lives in `sanitizer.ts`, outside
    the six files `notes/guarantees.md` lists. It touches no key and reads nothing of what it is
    handed, so I named it in the paragraph beneath the table rather than add a row.
* **For the Coach**:
  - Should `sanitizer.ts` join the *Where the guarantees are kept* table? I left it in the
    paragraph beneath (recommendation: leave it there).
  - The react dialog flake, above, for a watch.
