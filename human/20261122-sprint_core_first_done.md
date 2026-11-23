# Sprint core_first: done (2026-11-22)

The core work the react_targets workshop had built the React layer ahead of, done on main. There is now one `Minder`
base class with `BankMinder` (bank, main gate and root box as ordinary items, read synchronously through `worldAt()`)
and `VaultMinder` (boxes). A device exists before its user and `signIn(userid)` attaches the minders. A list answers
`Kids` (with `read_tc`), a get answers the live record or null, and tombstones live in their own dead entry. Both
caches persist through TanStack's `Persister` (`MemoryPersister`, and `IdbPersister` in safebyok-idb-lean). The checks
that hunted guessed-at misuse are gone, and the minder's query defaults are set when its client is made. Plan, threads,
reviews: `whiteboard/20261122-core_first/core_first-plan.md`. Rulings: `core_first-resolutions.md` beside it.

## The line, in merge order

Every PR's base is `main`. **Merge the top, #839, with a merge commit, and the whole line lands.**

1. [#844](https://github.com/mrflip/safebyok/pull/844) bank_minder: `Minder`, `BankMinder`, `VaultMinder`; the world
   query.
2. [#847](https://github.com/mrflip/safebyok/pull/847) list_answer: a list answers `Kids`; the listing caches it.
3. [#850](https://github.com/mrflip/safebyok/pull/850) get_answer: a get answers the record or `Absent`; the dead
   entry.
4. [#846](https://github.com/mrflip/safebyok/pull/846) device_early: a device before its user.
5. [#848](https://github.com/mrflip/safebyok/pull/848) persist: both caches persisted; the stage waits on the restore.
6. [#849](https://github.com/mrflip/safebyok/pull/849) idb_persister: `IdbPersister`; the bridge removed.
7. [#851](https://github.com/mrflip/safebyok/pull/851) misuse_cull: checks hunting guessed-at misuse removed;
   `eqeqeq` added to the lint configs.
8. [#852](https://github.com/mrflip/safebyok/pull/852) defaults_at_start: query defaults at `makeClient`.
9. [#833](https://github.com/mrflip/safebyok/pull/833) vocab_adopt (draft, as you left it): taken over as you asked;
   its seven commits squashed into one, rebased onto #852, and a second commit naming `parentage`/`deltas` and the
   persisters.
10. [#853](https://github.com/mrflip/safebyok/pull/853) absent_null: a get with nothing stored answers null; `Absent` gone.
11. [#854](https://github.com/mrflip/safebyok/pull/854) dead_record: "dead entry" becomes "dead record".
12. [#855](https://github.com/mrflip/safebyok/pull/855) item_refetch: the minder refetches an observed item that falls behind.
13. [#856](https://github.com/mrflip/safebyok/pull/856) box_persist: boxes one snapshot per user and bank.
14. [#857](https://github.com/mrflip/safebyok/pull/857) one_client: one minder, one QueryClient; both persisters per bank.
15. [#839](https://github.com/mrflip/safebyok/pull/839) the sprint PR: this note, the plan and the resolutions.

#833 is a draft inside the line. Merge #852 to land the threads without it, or take #833 out of draft and merge #839.

## My calls in YOLO

* Thread 9's flagged review: `useBoxList` passes `staleTime: Infinity`, so a mounted box list asks vaultDB again only
  on evidence, never on remount, focus or reconnect; `list()` keeps 0.
* Thread 8's flagged review: Vault refuses the root box `'box'` as a box scope (`Phrases.VaultBoxIsRoot`).
* The rest are in the resolutions file, under the calls left to me.

## End states, out of bounds, gathered as you asked

* The BankMinder's items (the main gate's wrapped bankKey among them) outlive sweep, vacate and the VaultMinder's
  goodbye; nothing empties them. G3's drift is recorded. (#844)
* A bank born again elsewhere lands item by item, so `worldAt()` may mix lives until all three roots land. (#844)
* **Could corrupt what the bankDB stores** (reported, not fixed): `Bank.rootBox` and `Bank.track` read the device's
  world, not the life the Bank was made with. An old Bank, still unlocked when the watch lands a bank's new life, can
  seal a box under its old bankKey into the new life: a box nobody in the new life can unseal. The reviewer's rec: in
  the end-states work, a Bank refuses once the world's life differs from its own. (#844)
* A live bank stored with neither gate nor root box reads `'unborn'` (was `'failed'`); a tombstoned bank with a void
  root refuses `bank_roots_missing` (was `'unborn'`). (#844)
* #831's review left three findings at endings (react_targets burndown, *Out of bounds*). Known, not repaired.
* The world is not keyed on `lifetok` (#828 merged after thread 2 began; a *Finally* item). Keying it guards against
  mixing lives, which is an end-state case, so I left it for the end-states work rather than build it here.

## Waiting on your word

In the sprint doc's Open Matters tab, all `drafting`, each explained:

* the WeakMap memo (read the gate as a box is read, with a stripping `select`);
* what `#minders` are for (thread 14 removed them);
* the silent failed save (pass the same handler to each persister, in the docs);
* a host select's own null reading as nothing stored (#853, my YOLO call to accept it).

Also: the Coach's proposal for the Gate's stale copy (centralize in the gate minder; the Gate instance observes its
query and adopts each new value) waits for the instance-sync thread.
