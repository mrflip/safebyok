# Sprint reform: holding for a restack (2026-11-06, 16:15)

Third pause of the day: every planned thread but the last is merged or filed, and the last waits on two merges.
At 16:10 the merge watcher timed out: #557 and #555 were still open. **The stack #550, #552, #553, #557 and the
sprint PR #516 are all DIRTY against main**: #548 and #549 (threads 21 and 22) merged under them and touch the same
kind files, so Mergify cannot take them. The line needs the restacker, which refuses model invocation; the
`/restacker` line is in chat.

## Filed and merged

Threads 1 to 5 and 11 to 22 are merged to main (the Coach merged the 08:30 line between 08:40 and 09:00, #535 at 08:21,
#548 and #549 after). The remaining stack, each PR on the one below, every base `main`:

| Thread | PR | Tip | On |
|---|---|---|---|
| 6 `worlds_picks` | #550 | b6763b9d4 | main |
| 7 `host_branding` | #552 | d12188789 | #550 |
| 8 `checkers_once` | #553 | b2bf857de | #552 |
| 9 `types_ab` | #557 | 2dd896572 | #553 |

Each was reviewed (6 and 8 and 9 at medium, 7 at high) and fixed; the review comments are on the PRs.

## Waiting

Thread 10 `kindvals_smush` renames `RefusalKind`, `refusalKindVals`, `wayinKindVals`, `gatingKindVals`,
`correctableKindVals` and their types across the core, its tests, README and CUSTOMIZATION. It is cut from `main`
once **#557** (the top of our stack) and **#555** (the vaultdb_cleanup sprint's plain VaultDB, which rewrites
`errors.ts`, `throwers.ts`, `phrases.ts`, `shapes-storage.ts` and the vaultDB tests) are both merged. Cutting it
earlier would set two sprints' rewrites of the same files against each other.

## Open for the Coach

* Open Matters: the rest of the unexported surface (a thread after the sprint); `DefaultLogger` and
  `DefaultStrengthChecker` unexported (a two-liner on thread 10 if wanted).
* The Closer Look tab's triage.

## Then

Thread 10 builds (sonnet, low review), files, and the wrap-up follows `wrapup.md`: the Cleanup tab's *Finally* list,
*Resolved* swept into `reform-resolutions.md`, the sprint PR #516 closed.
