# Guarantees: drift in the new core

`notes/guarantees-big.md` states where secret material lives in `safebyok-big`, as numbered guarantees, and is not
edited. The new core (`packages/safebyok`) may cite a guarantee by number where it keeps it in substance. Where it
drops, loosens, changes or adds one, the change is written here, one entry each, until the guarantees are rebuilt for
the new core.

An entry gives the date, the thread or PR, the guarantee's number (or *new*), the files of the new core concerned, and
what differs from big, in a sentence or two.

## Added

* 2026-11-15 (lean_buttonup), *new*: **No remote subscription protocol.** The design never depends on change
  notices that arrive over a protocol of their own, apart from the store's answers. A store with a watch of its own
  (memory, Postgres) notifies from the device's side, and a hosted vaultDB, such as GraphQL's, turns that off and
  notifies by itself.

## Drifted

* 2026-11-18 (namespaces, PR #740; found by an export survey, the method itself predates it), G9: **A public Bank
  method accepts a proving.** `Bank.unlockByProving(proved, cited?)` is public
  (`packages/safebyok/src/models/bank.ts`), and so is `Proving.buildLease` (`src/models/proving.ts`), where big has no
  public `Device`, `Bank` or `Gate` method that accepts one. A host still cannot hold a proving: they are built only
  inside a gating's attempt (`src/models/gating.ts`) and handed straight to `Bank.birth` or `unlockByProving`, and the
  Proving classes are exported from no entry point but as types (`safebyok/core`). G9 now rests on that export, not on
  the method's visibility.
