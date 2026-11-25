# Thread 28: get_world (2026-11-25)

Branch `20261124-get_world`, PR #NNN, stacked on [#893](https://github.com/mrflip/safebyok/pull/893). Proved: see the
PR's **Tests:** line (`pnpm justify` in full; idb-lean, postgres and react-lean by hand).

Built by hand (no /sprint), from the orchestrator's brief (G1–G7). The Coach: "May we have a call, modelled on the
birthBank, called getWorld()?"; "Atomically retrieve the starting records. Make no transition to a partially-working
state"; the shelf's seeding lives in the World; the vault is made "as the last thing when everything is constructed";
the shelf keeps the times each root was read; the void revision in a track is "a bad sentinel" with no use case.

* **Built**:
  * **G1, `tryGetWorld`.** `GetWorldAsk` (`op: 'getworld'`, any banktok, a track), answered `Answer<WorldRoots, 'got'>`:
    `{ bank, gate, root }`, each live, a tombstone, or the shell where none is stored. One atomic step in each adapter:
    memory synchronously, IndexedDB in one `inOneStep`, Postgres in one statement (`GetWorldSql`, over the existing
    `world`, `root_box` and `tracked` functions). `classifyGetWorld` reuses `storedOf` and `Shell.under`. The
    VaultMinder tells the three roots of `val` in root order, not `world` or `tracked`, which come from the same step.
  * **G2, sign-in is one get.** `Device.#doSignin` makes the minder, the TSQ, signs the world in, makes the vault, then
    awaits `tryGetWorldOnce()`. A refusal throws; roots neither all live nor unborn throw `bank_roots_missing`. A root
    its Thing refuses reaches the host once, through the TSQ's `onBadNews`, never again from sign-in.
  * **G3, the seed path is in the World.** `World.signin(vaultMinder, shelf)` seeds the Things from `peekRoots`, then
    keeps them with `stowRoots`. The device lost `#receiveShelved`, `#listenShelf` and their helpers.
  * **G4, read times.** `ThingCar.read_tc`: `VacantReadTc` until the Thing takes news, then that news's read_tc. The
    shelf's value is `[roots-tc-<fmt>, {record, read_tc} ×3]`, so a restored root claims no freshness storage never gave.
  * **G5, the vault is made last.** `Vault.make(world, vaultTSQ)`; its bank is `world.demandRootsLive()`. Made at
    sign-in after the world, before the await; its verbs refuse `absent_thing` while the bank is not live.
  * **G6, `onBadNews(news, labelpath)`.** The listener is told the refused record's labelpath, or null. The vault TSQ
    invalidates that box's item query (`exact`, `cancelRefetch: false`), so it refetches and shows the refusal.
  * **G7, the void revision is a revision.** `trackedEntryOf` answers `'same'` where the raw row has the tracked
    revision, or where none is stored and the pair is at the void revision; otherwise the stored root, whole and checked.
    Memory and IndexedDB share it; Postgres's `tracked` SQL never had the special case.

* **Decisions made**:
  * **Unborn vs failed (G2)**: unborn where no live bank, no gate and no root box are stored; locked where all three are
    live; anything else `failed` with `bank_roots_missing`. A gate stored alone was `unborn` and is now `failed`.
  * **Report once (G2)**: `tryGetWorldOnce` answers the vaultDB's answer unchanged; a getWorld has no labelpath of its
    own, so a refused root is the listener's alone, matching the once verbs' contract.
  * **The car's read_tc moves on news only** (`events.length > 0`), not on every record taken: a repeat in the same
    tcchunk leaves it.
  * **`WorldRoots`, not `BankRoots`**: BankRoots holds live records only.
  * **Set aside**: telling getWorld's `world` and `tracked` roots as well as `val`'s, which reported a refused gate
    twice (once unmangled from `world` first); seeding in the device, which the Coach wanted inside the World.
  * **G7's tests**: a test whose subject was not tracking now gives its ask the track it means (`trackOf()`); one
    whose subject is what the minder tells counts the root box it now hears.

* **Deviations**:
  * `device.vault` is a Vault from sign-in on (at `starting`, `unborn`, `failed`), not null; its verbs refuse
    `absent_thing` until the bank is live. react-lean's `demandVault` refuses as `demandBank` does.
  * `carAt`'s doc no longer calls the whole car devtool-only: the World reads `read_tc` for the shelf; `lastErr` stays
    devtool-only.
  * The dojo demo's Inspect tab reads the new shelf shape; its fixture is regenerated.

* **Discoveries**:
  * Postgres cannot plant a root with a bad lifepath, so the battery's damaged-root getWorld case mangles a gate's wayins.
  * Shells emit `life died` beside `item void`; the minder tests' `voidSeen` names the pair.
  * `classifyWriteThing` computes `tracked` from the pre-write rows; memory overwrites it after the write. Under G7 a
    write over a damaged root with a void track refuses before storing. Not changed here.
  * `Bank.hostVault` has no caller in `src/` now; left for the thread that moves the delegations.
  * Postgres's `tracked` keeps `WHERE track IS NOT NULL`: G7 touched no SQL function, so it stays, per the brief.

* **For the Coach**:
  * **G7, what a host sees**: nothing changes in the working case. Sign-in's getWorld tells the roots from `val`, and
    afterwards every ask tracks the revisions the Things hold. "The minder hears every root on a first get" shows only
    to a VaultMinder asked before sign-in. A damaged bank at sign-in refuses `damaged_row` (from G2, not G7). New: an
    ask tracking the void revision while a root is stored damaged refuses `damaged_row` (a stale track already did).
  * **Rule B** (unborn/locked/failed) and **report once** are my calls, unreviewed.
  * The car's `read_tc` on news only, vs the brief's "successfully received".
