# Thread 12: one_stamp (2026-11-27)

Branch `20261127-one_stamp`, cut at `604f0cc6f` (the bank_fold line's tip, PR #949); no PR of its own, carried onto
#949 by the orchestrator. Proved: `pnpm justify` green, alone on the machine: safebyok 2507, postgres 192, convex 242,
graphql 331, indexeddb 141, react 339, fastkey 43, e2e 576, dojo 111, demo-react 99, knockknock 26, envman 24, and the
frozen big packages unchanged (big 2952, idb-big 215, react-big 277, postgres-big 246, convex-big 334, graphql-big 448).
Every ctx-bytes expectation, old and new: `thread-12-one_stamp-ctx-bytes.md`, beside this file (for the reviewer).

## Built

* **banktok** (the gate's `lifetok`, renamed: type `Banktok`, phrase `BanktokShape`, refusal `BanktokMoved`, tag
  `banktok_cmp`, `VoidBanktok`) is a field of every Thing (`ThingChecks.sparse`): a gate's is minted at each birth; a
  box's is the sealing lease's, so its gate's when sealed (`Lease.seal` stamps the revision); a shell's is void.
  Postgres has it in `ThingColumns`, Convex in `thingFields`; GraphQL carries Things whole, so nothing there.
* **Stamps** (`shapes-stamps.ts`), one per ctx, `cipherCtx(stamp, purpose, header?)`:
  * gate and box: `modelkind, userid, banklabel, labelpath, banktok, fmt, am, lifepath, revtok, revseq, born_at,
    written_at` (sparse minus `label`, `lifeseq`);
  * wayin: `{ modelkind: 'wayin', userid, banklabel, labelpath, lifepath, born_at, banktok }` (the gate's life,
    `GateLife`) plus its own `label`; ctx `[stamp, purpose, header minus label]` (`wayinCtxOf(gateLife, header)`);
  * lease: `modelkind: 'lease', userid, banklabel, banktok, gate_labelpath, gate_lifepath, gate_born_at, gate_revtok,
    fmt, born_at, proved_at, wayinkind`;
  * `BankLife` (`bank.life`): `userid, banklabel, lifeseq, born_at, banktok`, a view bound into nothing.
* **Lease**: scope `{ modelkind: 'lease', userid, banklabel, labelpath }`; the record states its modelkind; deviceDB keys
  kind first (`['lease', userid, banklabel, labelpath]`), so `LeaseDBVersion` is `002-001-001`. `Lease.make` checks the
  record's whole gate life against its gate's (`damaged_lease`).
* **Postgres notice**: `tell_thing(thing, gate)` sends `bank: { banktok, labelpath, lifepath, revseq, revtok }` of the
  gate, JSON nulls for none, never wayins; over 8000 bytes it drops the Thing and the bank part. The watch reads
  `bank.banktok` (`notifications.ts`).
* **Format**: `ThingFormat`, `LeaseFormat`, `TableVersion` `'a010502'`; root shelf follows; dojo fixture remade.
* **Leftovers**: VaultTSQ's dead `setMutationDefaults` gone; wontfix row reworded; security note (sonnet subagent);
  guarantees drift; VOCABULARY; contract note; Postgres README; the line's changeset.

## Decisions made

* Softlock (marked decision iii): **confirmed**. `Lease.makeNextRecord` is `{ ...live, ...nextRevisionOf(live),
  ends_at }`: it keeps `lease_key`, `bank_key_lease_wrapped` and `proved_at`, so the lease's own revseq/revtok stay off
  its stamp; `lease.test.ts` "still unseals what the lease it revises sealed" shows it.
* `gate_` prefix and `gate_revtok` bound (marked i, ii): kept; `buildLease` checks the cited stamp's life and revision
  against the proving's gate life.
* Wayin stamp carries the gate's `lifepath` (marked): kept. Its `born_at` is the gate's; the wayin's own stays in its
  header.
* A shell's banktok is fixed void only in `ShellChecks.shell`, not `shellScoped`: `Shell.of` reads an ask, whose banktok
  is its sender's.
* A VaultMinder rung event holds its record to the event's scope only: a box's banktok is no event's.
* `noticeOf` takes a gate's own banktok; a box's notice keeps the received (gate's) one.
* IndexedDB `VaultDBVersion` stays `002-001-001`: its key layout did not change (precedent: 81394b415 moved fmt alone).
  `LeaseDBVersion` moved, which deletes the old lease database, the old leases' keys with it, and the devicetok it kept:
  each user is minted a new one.
* A `QueryClient` is no longer checked for `setMutationDefaults`, which nothing calls now.

## Deviations

* None from the end state. Names chosen where it named none: `BankLife`/`bank.life` (was `BankStamp`/`bank.stamp`),
  `GateLife`/`gate.life`, `ProvableGate`, `WayinStamp`, `Bank.mintLife` (was `mintStamps`).

## Discoveries

* The `Wayin` model's own `labelpath` getter (`wayin/main`) is not its stamp's `labelpath`, which is its gate's.
* No ctx binds a gate's stamp today (a gate seals nothing), so its fields have no per-field test; its list is pinned.
* A box binds only its `banktok` for its bank's life; the bank's `born_at` is bound only in a wayin's and a lease's
  stamp, through the gate's. Both follow from the rulings.

## For the Coach

* `gate_made_elsewhere`'s remedy is an unlock (wontfix row); `stale` there is still "offer the birth again".
