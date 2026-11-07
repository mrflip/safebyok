# Sprint devicedb_idb: the plan

* **Date:** 2026-11-07. **Mode:** normal (two-way calls made and recorded as Open Matters rows).
* **Levels:** review `medium`; worker and reviewer at their agents' own model and effort; style
  pass at `style-reviewer`'s pin. Two threads, stacked, so one runs at a time.
* **Issued by:** the Coach (flip), in the vaultdb_cleanup session, after the vaultdb line merged
  (#565 at 495cc5d6e). Orchestrated from that session, which keeps this sprint's doc.
* **Sprint doc:** https://claude.ai/artifact/3qMSEQH3GzntNHvP5GnmXF (doc 16f29261-f869-4306-8e3f-0835488a0882; State enum 09b04c79-a30a; Open Matters body cac87088-f7d9, matters table mkdddhqd5bk.252; Cleanup body 5120dd02-4bc2; Progress body a81cd5bc-baaf; Resolved body 8f975549-eb13; bookmark rev 2).
* **Status:** thread 1 in review (#567); then thread 3, thread 2, thread 4, each stacked on the last.

## The Coach's request, verbatim

> change mash, as described.
> change the verbs to stow, peek, forget, listLeases; implement listleases as described.
> 4. I've got concerns about the key structure (or I can put it more cheerfully: I believe that an
> extended key structure can ameliorate some problems) but I'll leave that for later
>
> Leave deviceDB in the core for now, but it's worth thinking on. It's dependency free and right
> now you can get everything working on the dom from just that one package.
> That said: if you would like to move code from safebyok-idb back into the core, or if it's going
> to be a notable amount of duplicated code, I will reconsider.
> How much of a hassle will it be?
>
> No change bell yet
> Another app is doing the react stuff.
>
> You do not need to have any back-compat layers, the app has not been publicly released. Just say
> so in the changeset. Put a version indicator in the database name so that we would be able to
> unambiguously identify an old or fatally insecure db and wipe it. Delete anything matching the
> old pattern.

**"As described"** refers to the orchestrator's message just before, quoted here:

> * **Rec [mash]:** have `mash` return base64url [43 characters, unpadded; `toB64`, the codec of
>   every stored `_b64` field]. That closes the TOP row without touching how user_ids are handled.
> 3. `doLeasesProvedBefore` asks every store for a sorted range scan "by index". `idb-keyval`
>    can't make indexes, and a device holds only a handful of leases. Rec: make the hook
>    `doListLeases()` (every lease row, unsorted) and have the base do the cutoff filter and the
>    sort. That leaves every adapter with four plain steps: get, put, delete-if-`vault_tok`-matches,
>    list.
> 4. The `vault_tok` check sits in two places. `peek` checks it in the base. `vacate` leaves it to
>    each store, because it has to happen in the same atomic step as the delete. Keep that split,
>    but say so in a `//` comment.
> 2. `adapted(call, thunk)` is the wrapper VaultDB dropped. Rec: a try/catch around each method
>    body, so the two classes read alike.

The Coach's "4." is item 4 above: keep the split with its comment for now; the extended key (say,
a key holding the `vault_tok`, so `forget` is a delete at a key) is for later, a TODO entry.

## Read first

* `packages/safebyok/src/storage/device-db-new.ts` and `memory-device-db.ts` (whole: small).
* `packages/safebyok/src/storage/vault-db-new.ts`, a public verb or two, for the try/catch shape.
* `notes/guarantees.md`, *The guarantees*: the leaseKey row and the IndexedDB bullet (the leaseKey
  is a non-extractable `CryptoKey`, kept by structured clone, never bytes).
* The battery pattern: `packages/safebyok/tests/test-helpers/vault-db-battery.ts` (its opts and
  how `memory-vault-db.test.ts` runs it), for `describeDeviceDBBattery`.

## Ground rules

* Never change `packages/safebyok-old/`. No React work (another app owns it).
* No back-compat: the package has not been publicly released. Changesets say so, and say what a
  host sees.
* No change bell, no inspector, no device records: the deviceDB holds leases and nothing else.
* The deviceDB stays in the core (the Coach, above).

## Threads

### 1. devicedb_verbs

*Review:* fixed (medium): three test fixes (a `fresh` helper, ten one-clause titles, a leftover
`scan` spy name). Left minor: a damaged lease row outlives a vacate (→ thread 2, Open Matters);
doc blocks of the renamed verbs (→ a documentarian row); the `tellBadNews` doc's "cache put";
older two-outcome lease test titles; guarantees prose; `stowAsStowCan` (Open Matters); the
battery exporting `notGiven`.

*The Coach's text:* "change mash, as described. change the verbs to stow, peek, forget,
listLeases; implement listleases as described." and item 4 of the quote above.

*Gloss.*
* **mash:** `safebyok/utils`' `mash(text)` answers the SHA-256 as unpadded base64url (43
  characters, through the core's `toB64`), not hex. Its doc block's second sentence and
  `@example` follow; VOCABULARY.md's **mash** row too. The changeset: a host that stored mashed
  ids gets different ones (the package is unreleased; no back-compat).
* **DeviceDB verbs:** `cache` → `stow`, `vacate` → `forget`, `leasesProvedBefore` → `listLeases`,
  `peek` stays; the `try*` twins follow (`tryStow`, `tryForget`, `tryListLeases`); hooks
  `doStow`, `doPeek`, `doForget`, `doListLeases`. `doListLeases()` answers every row, unsorted;
  the base checks each as `leaseDated` and sorts oldest first.
  *Orchestrator's call (row on Open Matters):* `listLeases()` takes no cutoff and answers every
  cached lease, oldest first; `Bank`'s sweep filters `proved_at < cutoff` itself. A verb named
  `listLeases` that filters by time would need the old name back.
* **Callers follow:** the lease friend's `tryCacheLease` / `tryUncacheLease` become
  `tryStowLease` / `tryForgetLease` (`shapes-gateish.ts`, `models/vault.ts`, `models/lease.ts`);
  `Lease`'s own `cache` / `uncache` verbs follow to `stow` / `forget` where they are the same act.
  `Bank.#scanOwnLeasesProvedBefore` keeps its job under `listLeases`.
* **adapted → try/catch:** each DeviceDB verb catches in its own body, as the VaultDB verbs do; the
  `storeFailed` thrower stays the one it calls.
* **The vault_tok split** stays, with a `//` comment saying why `forget` checks in the store.
* **A battery:** `describeDeviceDBBattery(name, { makeDeviceDB, _cheat_rowsOf?,
  _cheat_failNextCall? })` on `safebyok/testing`, built from today's `device-db-new.test.ts` cases
  (keeping: calls land in the order made; a peeked row is a copy; a row failing its check reads as
  none; the store-failure case), run over `MemoryDeviceDB`. Thread 2 runs it over IndexedDB.
* **TODO.md**, one entry under *Later*: the Coach's extended key structure for the deviceDB,
  quoted.
* `notes/guarantees.md` names `DeviceDB.cache` and `lease.cache`: rename them there.
* **Touches:** `utils.ts`, `storage/device-db-new.ts`, `storage/memory-device-db.ts`,
  `models/{bank,vault,lease}.ts`, `shapes/shapes-gateish.ts`, `shapes/shapes-storage.ts` (the
  cutoff checker may go), tests, `testing` entry, VOCABULARY.md, guarantees, TODO, a changeset.
* **Look-ahead:** thread 2 implements the four hooks over IndexedDB and runs the battery; the
  battery's opts should need nothing a raw store cannot give.
* **Size:** M. **Depends on:** nothing (cut from main).

### 2. idb_devicedb

*The Coach's text:* "Leave deviceDB in the core for now ... How much of a hassle will it be? No
change bell yet ... Put a version indicator in the database name so that we would be able to
unambiguously identify an old or fatally insecure db and wipe it. Delete anything matching the old
pattern."

*Gloss.*
* `IdbDeviceDB` (and `idbDeviceDB(opts)`, `IdbDeviceDBOpts { dbName? }`, default 'safebyok') in
  the core, exported from `safebyok/browser` (what a browser app hands `Bank.make`).
* Its own database, named with a version: `${dbName}:device-v1`, one object store of lease rows
  keyed `[applabel, user_id, vaultlabel]`. Each hook is one transaction; `doForget` reads and
  deletes in one readwrite transaction. `lease_key` kept by structured clone, never bytes.
* **Wipes the old:** the old pattern is `${dbName}:device_db` (safebyok-old's `idbDeviceDB`), and
  any `${dbName}:device-v<N>` older than the current version. Delete them, unread, on first use.
  The worker proposes how (a `deleteDatabase` per known name; `indexedDB.databases()` where a
  browser offers it, for every name matching the pattern), simply: a stale tab holding the old
  database open gets a documented row, not machinery.
* **Where the transaction plumbing lives: ruled (a).** The Coach: "did the old code have an idb
  dependency? I'll go with whichever the old code did, as we talked it out and there was a reason we
  did it that way". The old core depended on `idb-keyval` ^6.3.0, so the core gains `idb-keyval` as
  a runtime dependency, and `safebyok-indexeddb/src/shelf.ts`'s `inOneStep`, `abortOf`,
  `workOrAbandon` and `troubleOf` move into the core, shared by both stores (`safebyok-indexeddb`
  imports them through `safebyok/storage` and keeps only its scopepaths and ranges). `troubleOf`'s
  sentences name the store they speak for (vault or device). Check the current `idb-keyval`
  release before pinning (PROCESS.md, *Dependencies*).
* **A damaged lease row outlives a vacate** (#567 review; Open Matters, TOP, the orchestrator's
  Rec pending): `forget` deletes only a row that passes its check, and `listLeases` leaves damaged
  rows out, so a damaged row with a live `lease_key` survives an `identity_revoked` vacate
  (against G4). Unless the Coach rules otherwise, fix it in the base: `forget` also erases a row at
  its scope that fails its check, the Bank's sweep reaches damaged rows too, and the battery gains
  a case, so both stores inherit it.
* **Ride-along (the Coach, 2026-11-07, on "Lease's stowAsStowCan reads oddly"):** "yeah you've
  talked me into having it be .cache, not .stow, or at least that one method should remain. Your
  call to have .hold, .holdFoo and cacheAsCacheCan, or .cache, .cacheFoo and cacheAsCacheCan".
  *Orchestrator's call:* `Lease`'s verbs go back to `cache`, `tryCache` and `cacheAsCacheCan` (and
  the lease friend's `tryStowLease` to `tryCacheLease`, `notes/guarantees.md` following); the
  DeviceDB's own verbs stay `stow`, `peek`, `forget`, `listLeases`.
* Tests: the thread 1 battery over `fake-indexeddb` (a core devDependency), first checking a
  `CryptoKey` survives its structured clone; the wipe; a size-limit line for `idbDeviceDB`.
* `notes/guarantees.md`: the IndexedDB bullet's "The core ships no IndexedDB DeviceDB" goes.
* Changeset: new store; not publicly released, so no back-compat; old device databases are deleted.
* **Levels:** `high` review (leaseKey at rest). **Size:** M. **Depends on:** thread 3 (stacked
  on it, so the line stays linear).

### 3. storage_door (carried from sprint vaultdb_cleanup, its thread 7)

*The Coach's text and rulings:* verbatim in
`whiteboard/20261106-vaultdb_cleanup/vaultdb_cleanup-plan.md`, section "7. storage_door", on branch
20261106-vaultdb_cleanup (PR #554), including the 2026-11-07 rulings (Convex tombstone-full vault
publicized in its README and `notes/wontfix.md`; `vaultChannelOf` checks its user_id).

*Gloss.* As there: `safebyok/storage` aliased `DB` everywhere; STYLE.md says the storage validators
live there; adapters' phrases move to the core's Phrases; shared-bank and `mayReach` mentions
struck; two wontfix entries; best-effort box cap wording everywhere it is stated or implied exact;
CLAUDE.md's whizbang sentence gains "a lock where none was needed before is a last resort";
`MaxSaltBytes` 65,536 -> 32 and stored `salt_b64` at most 32 bytes (fastkey's cases to 32 and 33);
the Postgres README on roles, RLS and LISTEN; `e2e/package.json` drops `safebyok-old` if nothing
there imports it; PROCESS.md's peers line. The restack is merged, so it is cut now.
**Levels:** `sonnet` worker, `low` review. **Size:** S-M, mechanical. **Depends on:** thread 1
(stacked on it: thread 1's battery tests take the `DB` alias too).

### 4. graphql_schema (carried from sprint vaultdb_cleanup, its thread 8)

*The Coach's text and rulings:* verbatim in the same plan, section "8. graphql_schema", with the
consensus of 2026-11-06 and the 2026-11-07 rulings: relay retired, "This is good, go for it";
"graphql should expose exactly (and pretty much only) the front-end verbs that VaultDB does,
including those three" (replacePassphrase, addPasskey, revokePasskey); a stream revoked mid-way
ends with identity_revoked.

*Gloss.* Rewrite safebyok-graphql once: a typed schema mirroring the try* answers (err a field,
never a GraphQL error; EpochMillis; damaged_rows as JSON; live/tombstone union; a drift test); the
server calls its hosted VaultDB's public verbs, gate verbs included, one operation each, returning
the whole try* answer; the client its own class implementing an exported VaultDB interface (Bank,
Listing and their opts typed by it; the duck check gains the try* verbs); answer checkers exported
from the core; `VaultDB.relay` and `VaultDBRelay` removed. **Levels:** `high` review (the refusal
surface and the server's checks). **Size:** L: hand it the milestones and the continue-on-blocked
pattern from the start. **Depends on:** thread 2 (stacked; linear line).

## For the Coach

* Nothing open beyond the doc.
