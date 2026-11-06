# Sprint vaultdb_cleanup: done

The core's VaultDB (`packages/safebyok/src/storage/vault-db-new.ts`) and its in-memory store now
read as plain TypeScript, as the Coach's critique asked: each verb's decision tree in front, a
method-wide try/catch, named type-asserting answers, rows classified once by a checker. A battery
any VaultDB runs (`describeVaultDBBattery`, in `safebyok/testing`) replaced the core's VaultDB
tests, and a new entry, `safebyok/storage`, gives an adapter everything it needs. On those, the
four adapters were ported off `safebyok-old`: IndexedDB (the old one kept private as
`safebyok-idb-old` for the demo), Postgres, GraphQL and Convex, each passing the battery. Every
thread compacted at least once; three were large enough to need a second worker or a fold.

Plan, progress and resolutions: `whiteboard/20261106-vaultdb_cleanup/`. The sprint doc, where
open matters wait: https://claude.ai/artifact/LJYRKB5uG4bzR8VWBVti1j

## The PRs, in merge order (after the restack)

1. #555 vaultdb_plain: the plain VaultDB and memory store.
2. #558 vaultdb_battery: the battery and `safebyok/storage`. Stacked on #555.
3. #561 port_postgres and port_graphql: Postgres, then GraphQL, which porting Postgres turned red,
   so it joined this PR (adds `VaultDB.relay`). Stacked on #558.
4. #559 port_convex. Stacked on #558 today; restacked onto #561.
5. #560 port_indexeddb (and private `safebyok-idb-old`). Stacked on #558 today; restacked onto #559.
6. #554 the sprint PR: this note and the whiteboard. The line's top.

The restack is not done: it goes through `/restacker` (not invocable from the orchestrating
session), in that order. Expected conflicts: each port adds lines to
`packages/safebyok/src/storage/index.ts` (all add `Checker, Checkers, objCheck`; keep one of each);
#559 and #561 both edit `e2e/package.json` and the lockfile; the adapters' new throwers
(`storageFull` in #560, `storageFailed` in #559, beside `storageUnavailable`) should be reconciled
into one plain set, and `RefusalMeta.capacity`'s doc squared with `storageFull`.

## YOLO decisions

* The battery split out as thread 2 (the Coach: "love it, yes").
* The demo keeps the old IndexedDB adapter as private `safebyok-idb-old` (the Coach's suggestion).
* The battery's failure case requires `storage_unavailable`; every watch closes at its case's
  end, `unwatch` safe twice; the battery validates its opts; adapter tests import
  `safebyok/testing` as `TH` and `safebyok/storage` as `SX`.
* GraphQL's port joined #561 rather than a PR of its own, so no PR in the line is red alone.
* Convex: the battery drives the component past the auth wrapper (the wrapper tested on its
  own); the watch and tidyGone read a whole bank; the client asks for its box cap.
* The base's method-wide catch stays as the backstop beside the adapters' own triage.

## Still open (the sprint doc's Open Matters tab holds each, with a Rec)

* TOP: Postgres no longer checks who is asking (the route layer does; GraphQL keeps it).
* TOP: Postgres broadcasts every stored row on a NOTIFY channel any role may LISTEN to.
* TOP: `VaultDB.relay`, a public route to the store's raw steps.
* TOP: two full Convex vaults pass Convex's 16 MiB read limit, breaking tidyGone and the watch.
* A documentarian run on `src/storage/` and the four adapters (only the Coach may call one).
* `safebyok/storage` as a new public entry; STYLE.md's line on where validators are exported;
  the `SX` alias for it; who owns an adapter's refusal sentences.
* `pgClientOf`, a hand-rolled transaction helper; Postgres watch failures swallowed; a large
  Postgres notice re-reads its row.
* GraphQL: the gate is user_id equality; rows cross as one JSON value; a live vault row moves
  over the relay without a gate verb's checks; a revoked session keeps hearing its bank.
* Convex: the five calls above; field names Convex refuses; deleted boxes piling up toward its
  documents-read limit.

Follow-ups on the doc's Cleanup tab, *Finally*: export `isPutAllowed` and `isHeardIn` from
`safebyok/storage`; a `Symbol.for` brand on the core VaultDB; Convex's `maxRecordBytes` reserve;
confirm the core lists after a watch starts; Postgres's byte cap; `PostgresVaultDBOpts` as a
documented interface; IndexedDB's tidyGone reading keys only.
