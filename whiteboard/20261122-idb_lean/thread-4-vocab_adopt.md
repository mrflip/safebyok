# Thread 4: vocab_adopt (2026-11-22)

Branch `20261122-vocab_adopt`, PR #833, stacked on #830. Proved: the root `pnpm lint` (green), and every
backticked name the new-core part of VOCABULARY.md gained checked by `rg -F` in `packages/safebyok/src`
(178 names; the misses are values such as `box/anthropic` and `jsonb`, the `VaultTombstone` of an
"in safebyok-big" clause, and the names listed under *For the Coach* below). Docs only, so no changeset
(PROCESS.md, *Releases*: VOCABULARY.md is in no package). `pnpm justify` green after the catch-up onto #830 at 93a2fd12b (14 test runs, 7313 tests), and again after the
rework, on the same base (13 vitest runs, 6991 tests; `pnpm --filter safebyok lint` and `--filter safebyok-postgres lint` green).

* **Built**: VOCABULARY.md describes the new core, and ends with a section headed *safebyok-big's
  vocabulary, until it retires*: an opening paragraph giving big's spellings of the new core's names,
  and a table of big's own terms and of what big adds to a shared term.
  * **Rewritten, old term → new**:
    * *The stamp* paragraph: `BankStamp` (scope, `lifeseq`, `born_at`, `lifetok`), `GateStamp` (scope,
      `labelpath`, `lifeseq`, `born_at`), `LeaseStamp` by reference to **lease record**, `BoxStamp` (every
      Thing field); no `VaultStamp`. The bank's stamp binds first, a wayin's gate's next.
    * **ctx**: a box binds its bank's stamp and its own, with its sealed whisper's tags as the header.
    * **fmt**: one `ThingFormat` (`a010501`, a string), `LeaseFormat` the same.
    * The `_id`/`_tok` paragraph → *An id is a hard identifier. A tok is only compared*: `userid`,
      `credential_id`; `revtok`, `lifetok`, `device_tok`.
    * **revisionTok** → **revtok**, **revseq**. **user_id** → **userid**. **boxlabel** → **labelpath**.
      **scope**: `ThingScope`, `BankScope`. **whisper codec, whisper schema version** → **codectag**,
      **schematag** (`json_v1`, `whisper_v1`).
    * **whisperCiphered**, **boxKeyWrapped**: the `ciphered` and `key_wrapped` of `whisper_sealed`.
    * **deviceTok**: the host passes it to `Device.make`; `bank.device_tok`.
    * **damaged**: a Thing; `damaged_rows` of a list (`DamagedThing`).
    * **timely**: an item's `isTimely`, `queryCacheOpts.staleTime`. **stage**: `BankStage`, no
      `vacated`/`deleted`.
    * **get, put, del**: an ask's `op`, `tryGetThing`/`tryWriteThing`, `putBoxOnce`/`delBoxOnce`; a box
      tombstone seals an empty whisper.
    * **ask**, **Answer**, **act, dbhas**, **parent**, **options, policy**, **storage, datastore**: the
      vaultDB's asks and answers (`world`, `policied`, `parent` on a list's answer only, only a gate's
      write names a policy, no capacity policy).
    * **proved_at**, **autolockMinutes**: the lease ends `leaseMillis` after `proved_at`; the device
      keeps `leaseMillis`. Nothing said of what locks then (the Coach's lease expiry).
    * Smaller fixes: **box** (`labelpath`, sealer `BaseBox`), the seal bullet (bank's stamp, not the
      vault's), **rotation**, **land**, **attach**, **ensure** (no `bank.ensureVault`), **read, write**
      (`tryWriteThing`), **am**, **camped** (no `parent`), **strengthChecker** (`load`), **logger** (the
      device reports), **unencrypted**, **sidecar** (`putBoxOnce()`, a box's record), **ckey**, **mash**
      and **mask** (named `safebyok/utils` again in the rework, below), the Shapes intro and
      **record**, **stamp**, **scope**, **tombstone**, **snapshot**, and in the word lists *slot*, *key,
      alone*, *unlock, as a noun* and the underbar_case line.
  * **Moved whole to the big section**: **vaultTok**, **boxTok**, **bankTok**, **gateTok**,
    **gateRevisionTok** (their *Standard term* column dropped), **vaultlabel**, **gatelabel**,
    **scopepath**, **vault record**, **bank row**, **gate row**, **device row**, **bankDB**,
    **buildBank, delBank**, **bank_void, bank_gone, bank_reborn**, **the bank's listing**, **enlist,
    listed, kept, take down**, **deviceDB**, **pantry**, **dated** (from Shapes), **revoke**.
  * **Big parts kept in the big section**, beside the new-core row: **stamp**, **ask**, **get, put,
    del**, **parent**, **act, dbhas**, **options, policy**, **damaged**, **storage, datastore**,
    **proved_at**, **autolockMinutes**, **strengthChecker**, **timely**, **stage**.
  * **Checked, nothing untrue found**: **vault**, **bank**, **draft**, **lease record**, **visible**,
    **born_at, written_at**, **sealer**, **wayin, as stored**.
* **Decisions made**:
  * **Renamed names**: one paragraph at the top of the big section maps big's spelling to the new
    core's (`user_id` → `userid`, `revision_tok` → `revtok`, numbered `fmt`s → `ThingFormat`, ...),
    in place of a duplicate row each. Set aside: a big copy of every renamed row, which doubles the
    table for no reader.
  * **whisperCiphered, boxKeyWrapped keep their cast names**, as conceptual names like
    **bankKeyWayinWrapped**, and point to the stored `ciphered` and `key_wrapped` of `whisper_sealed`.
  * **The id/tok paragraph** drops the `_id`/`_tok` suffix rule: the new core smushes `userid`,
    `revtok`, `lifetok`, while `device_tok` and `credential_id` keep the underbar.
* **Rework, after the Coach's rulings (2026-11-22)**:
  * **"store" as a noun, in vaultDB comments**: ruled to go, in comments only. Commit `storage: vaultDB
    comments name ...`: 60 comment changes in 11 files, `packages/safebyok/src/storage/` (vault-db.ts 13,
    adapter-vault-db.ts 10, thing-classifier.ts 25), the vaultDB battery and tests (8), and
    safebyok-postgres (postgres-vault-db.ts 3, a SQL comment in vault-functions.ts, bank-helpers.ts 1).
    Each picks **concrete adapter** where any subclass of `AdapterVaultDB` is meant (the thing that
    fetches and reports an `Actual`), **`AdapterVaultDB`** where the base class is (it was "the
    adapter"), **Postgres** inside safebyok-postgres, and **datastore** for the backing database
    generically (what a watch delivers, what runs code of its own). Verbs ("stores", "stored") stay, and
    so do strings: test titles ("as a broken store"), battery case labels ("the store has moved past"),
    `Phrases.BankRootsMissing` ("the store needs mending by hand"). An empty changeset rides along,
    since safebyok-postgres is published and changes nothing a host sees.
  * **Rows drafted** (commit `docs: VOCABULARY gains rows ...`): **vaultDB** (What you handle, after
    **device**), **sealed part** (Encrypted forms), **modelkind**, **root box**, **birth**, **bank
    record**, **gate record**, **world**, **track, tracked**, **bad news** (Names, records and times).
    Backticked names checked by `rg -F`.
  * **storage, datastore** now says **datastore** is the word for a vaultDB's database (or its name,
    Postgres, Convex), and keeps the ban on "store". The **actual** row said "A store reports it to its
    adapter"; it says "A concrete adapter reports it to `AdapterVaultDB`" now, which the storage row
    demands (a row beyond 2 and 4, declared).
  * **mash**, **mask** name `safebyok/utils` again: another thread builds it from main, so until it
    lands those rows name an entry point that does not exist on this branch.
  * **Left alone, as ruled**: vacate, delete, and the leftover old names listed below.
  * **Not landed: the idb-lean "store" sweep, 1b9a2993e** (two comments in
    `packages/safebyok-idb-lean`, a line in thread-2's file). It cannot apply here: #829 merged to main,
    but this branch stacks on #830, which was cut before #829, so `packages/safebyok-idb-lean` and
    thread-2's file do not exist on it (the cherry-pick conflicts as delete/modify on all three). It
    lands once #830 and #833 sit on a main that has #829, or as a commit straight on main.
  * **Seen, outside the ruled scope**: noun "store" in `packages/safebyok/src/shapes/` doc blocks
    (`WriteAsk`: "The store compares"; `ThingCited`: "the only fields the store compares";
    `ThingFieldname`: "which the store reads"), and in the minder's tests, left as ruled
    (`tests/minding/thing-minder/world.ts`, "`vaultDB`'s store"; `thing-minder-listing-orders.test.ts`), where it means the datastore.

* **For the Coach**:
  * **New-core things with no row**: drafted in the rework, above.
  * **vacate and delete**: the **bank**, **device** and **land** rows name them, and the new core
    has neither yet. Left, as the design those rows describe.
  * **`store` as a noun**: ruled, and swept in the rework, above.
  * **Names in rows left unchanged that the new core lacks**: **sidecar**'s `box_too_large` (no record
    size check), **ensure**'s triplet example `demandUnlocked` (big's), **adopt, align**'s "storable"
    (big's word; the new core's `Gate` has `adopt`), **EpochMillis**'s `FarPast`/`FarFuture`, the
    `Ciphered` paragraph (a shape the new core uses but does not export by that name), **mask**'s
    `MaskSchedule`, and the verb lists' `stow`, `peek`, `enlist`.
  * **rotation** still cites `TODO-big.md`, where the epoch design is written.
  * **Discovery**: nothing in the new core calls a strength checker's `load`.

* **Moved** (the Coach, 2026-11-22): the "store" comment sweep left this PR for its own, #845, stacked on #842, with
  the shapes/ and minder-test uses swept too. This PR keeps VOCABULARY alone.

## Takeover for core_first (2026-11-22)

The Coach asked core_first's orchestrator to take #833 over: its commits squashed into one, rebased onto the line's
tip (`20261122-defaults_at_start`, #852), then a second commit for what changed since. Tip before: tag
`20261122-vocab_adopt-pretakeover`.

* **Rebase conflicts**, all in VOCABULARY.md, both sides kept: **device** (the line's wording) beside #833's new
  **vaultDB** row; the line's **signIn** row kept after #833's **stage**; #833's **act, dbhas** with the line's
  "a get's good answer carries it only for a tombstone"; #833's **sparse** with the line's "a listing holds a kids
  value". The line's **world** row (BankMinder, `worldAt`) and #833's (an answer's `WorldRecord`) merged into the
  line's row, which keeps its place.
* **Second commit**: **parent** becomes **parentage, deltas** (`ListedBeside`, as the code now has it); a new
  **persister** row (`DevicePersisters`, `MemoryPersister`, `IdbPersister`); the **entry** ban's example drops
  `ThingCar`, which is gone. Minder, BankMinder, VaultMinder, Kids with `read_tc`, Absent, the dead entry and
  `worldAt` already had rows from the line's threads, which agree with the code.
* **1b9a2993e** (the idb-lean "store" sweep) already landed on main as 0943e46cd; nothing left to apply.
* **For the Coach**: the line's **dead entry** row uses "entry", which *Words safebyok does not use* bans.
