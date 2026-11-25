# Thread 29: world_off (2026-11-25)

Branch `20261125-world_off` (the brief named `20261124-world_off`; `cut-thread` cut it under today's date), PR #NNN,
stacked on [#894](https://github.com/mrflip/safebyok/pull/894). Proved: `pnpm justify` green in full, nothing skipped:
safebyok 1924, react-lean 338, idb-lean 115, postgres 365, dojo 111, knockknock 26, envman 24, e2e 576.

Built by hand (no /sprint), from the orchestrator's brief (W1, W2). The Coach: "May we have a call, modelled on the
birthBank, called getWorld()? I think we can then get rid of `world` on the answer type". **W2 was withdrawn** mid-build
(the Coach: `world.makeThing` is "a perfectly useful thing", left as it is); nothing of it had been built.

* **Built** (W1):
  * **No `world` on an answer.** `GoodAnswer` and `BadAnswer` carry `ask, act, banktok, tracked, read_tc` and `val` or
    `dbhas`, `err`. A concrete adapter's report (`ActualBeside`) carries `banktok` in place of `world`, checked as a
    lifetok; `Received` (a watch's change) carries `{ record, banktok }`. `WorldRecord` had no reader left and is gone,
    with its exports from `safebyok/core` and `safebyok/storage`.
  * **The classifier's `worldOf` is `banktokOf(scope, rawBank)`**: the bank's lifetok, or the void lifetok where none
    is stored or it fails its checks (the old catch-all kept). `WorldFetched` is `BankFetched` (`bank, tracked, read_tc`):
    the main gate is still fetched, for `tracked`, but the classifier reads only the bank. A birth answers the lifetok of
    the bank it wrote or found.
  * **Adapters.** Memory: `#rootsOf` fetches the three roots; `#notify(thing, banktok)`. IndexedDB: `bankFetchedIn`,
    `besideAfterIn`; a rung carries the banktok. Postgres: get, list and write statements select `world->'bank' AS bank`,
    getWorld selects `bank` and `gate`; `tell_thing(thing, bank)` puts the bank row in a notice in place of the world;
    `tracked` loses its dead `WHERE track IS NOT NULL`. The SQL `world` function stays: `tracked` and getWorld read it.
  * **VaultMinder.** `rootsOf({ tracked })`: each root `tracked` reports other than `'same'`; `bankOfWorld` is gone.
  * **Docs.** VOCABULARY.md's **world** loses its second meaning; **Answer** names the `banktok`. The wontfix row on a
    missing or damaged root says what the code does now.

* **Decisions made**:
  * **The banktok is the bank's alone.** It was void wherever the world was null, a missing or damaged main gate
    included; now only the bank bears on it. That differs only where storage is broken (a bank with no main gate, or a
    damaged one).
  * **A Postgres notice carries the bank row**, not just its lifetok, so the listener checks the bank as a get does.
    It also leaves the main gate's wayins out of a notice, which Postgres caps at 8000 bytes.
  * **Two minder tests' asks** tracked all three roots that minder had never heard of; the bank and main gate reached
    it through `world` alone. Each ask now tracks only the root box (`RootOnlyTrack`), so the bank and main gate come back
    in `tracked`; every expected event is unchanged.

* **Discoveries**:
  * `notes/security.md`'s older entries speak of "every vaultDB answer's `world`" (the bank_minder entry, the
    vaultdb_classifier one). Left alone: old entries are not rewritten.
  * TODO.md still has "Give `AskChecks` a `world` check" and "If a request has any kind of `world` error…", both
    about the field now gone. Left for the Coach.

* **For the Coach**:
  * **What a host sees**: nothing in the working case. Two new device tests pin it: an unborn device learns of a bank
    born on another device from an ordinary get with its watch muted, and from its watch alone.
  * **Broken states**: a damaged or missing main gate no longer voids the banktok; a damaged bank still does, and the
    answer stands where the ask tracks the damaged row's own revision. One new battery case pins the damaged bank.
