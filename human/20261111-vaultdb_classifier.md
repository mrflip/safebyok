# 2026-11-11: The vaultDB asks -- every adapter and the models moved; nothing waits on you but the restack

Thread `20261111-vaultdb_classifier`, PR #639, stacked on #636. The vaultDB's get, put and del each
take one ask and answer an act per `notes/answer-contract.md`. Memory, IndexedDB, Postgres, Convex
and GraphQL are ported, and the models call the new verbs.

## What needs you

1. **The restack.** The branch conflicts with `main` since #638 landed. I will restack once #636
   is in, or sooner on your word.

## Built on your answers

- **W2 of the receive contract.** `Vault.receiveWorld` hands the vault row a box answer carries to
  the vault listing (`Listing.receiveRow`). A newer row of another life vacates the Vault object at
  once and lists a new one; the caller hears `absent_vault` or `vault_reborn`.
- **The cap counts all rows.** A vault life's box rows, live and tombstone together, in every
  adapter. Only `born` adds, so deleting a box frees no room.
- **Convex tallies** hold `all_count`, `live_count`, `all_size`, `live_size`. Limits stay on the
  `all` figures.
- `listBoxes` that refuses for its vault carries the vault row stored as its world.
- The contract says `bad_record` where it said `bad_op`.
- The battery plants a list of flawed rows. A store either does not hold a row or every verb
  refuses it. No battery case is skipped in any adapter.

## Not built, as you said

- The `stats` report and a per-row size column. `Capacity` keeps its shape.

## Caveats

- **W1 tells no bad news.** Where no vault row is stored, a box answer's world is the sentinel row.
  The vault listing drops it as older, where the receive contract (F6) says to tell the host.
- On Postgres a gate verb is two calls with no transaction: fetch and classify, then the revise
  function stores only over that same revision.
- `safebyok_revise_box` takes `maxboxes` and does not read it, so both box functions are called
  alike. A database made before this commit keeps the index `safebyok_boxes_active`, unused.
- Postgres's table checks reach one level into each `jsonb` field. A row garbled deeper may be
  stored over (`notes/wontfix.md`).
- The doc block of `RefusalMeta.capacity` (`errors.ts`) names a `vault.snapshot.capacity`, which
  does not exist. I left it.
- e2e was typechecked and linted, not run.
