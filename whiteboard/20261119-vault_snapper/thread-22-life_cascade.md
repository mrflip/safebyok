# Thread 22: life_cascade (2026-11-20)

Branch `20261120-life_cascade`, PR #788, stacked on #786. Proved: `pnpm justify` green after the catch-up (safebyok
1329 after the review rework (device sweeps every bank), safebyok-big 2946, safebyok-react 348, e2e 576, the rest green).

The Coach (2026-11-20): "device should stay but everything else should be disabled and device has dropped refs after
sweep, delete, or vacate ... stop watches, unset minder, vaultdb, bank, any other refs, stop notifications. cache
empties itself delivers notifications".

* **Built**:
  - `bank.sweep()` now goes through one private path, `#end(endCause)` (`packages/safebyok/src/models/bank.ts`), which
    `delete` and `vacate` will call later. It slams shut first and synchronously: it sets the end cause, sweeps and drops
    the lease, and rejects the `ensureUnlocked` wait. Then it aligns, so subscribers hear the end once. Then it sweeps
    each hosted vault, clears its vault set and its subscribers, and calls `device.cheatDropBank(this)`.
  - `Vault.make` registers the vault with `bank.hostVault(vault)`. The bank keeps a `Set<HostedVault>`.
  - `vault.sweep()` calls `minder.goodbye()`, which stops the watch and clears the TanStack cache. The clear tells each
    listener `'removed'`.
  - `device.cheatDropBank(bank)` unsubscribes from that bank, drops it and shows `PendingBank`. It ignores a bank the
    device does not hold.
  - `device.sweep()` sweeps every bank made on the device and not yet swept (the device keeps them in `#madeBanks`,
    added by `cheatHoldBank`, removed by `cheatDropBank`; `#thisIsTemporaryBank` stays the one its snapshot shows and
    `device.lock()` locks). Making a bank sweeps nothing. The device stays enabled, still judges strength, and holds
    the next bank made or born on it. (Reworked after review, with the Coach's ruling "yes the device should sweep".)
  - New export: `type HostedVault` (`{ sweep(): unknown }`, `shapes-bankish.ts`), with the phrase `HostedVaultExpected`.
  - Tests:
    - `tests/models/vault.test.ts`: the cascade under both sweeps, with two vaults (cache emptied, removal told, both
      watches stopped); the minder restarting at `hello`; subscribers told once and nothing after; `Vault.make`
      refusing a swept bank.
    - `tests/models/bank.test.ts`: `hostVault`'s checks, and a hosted vault swept once.
    - `tests/models/device.test.ts`: `device.sweep()` rewritten; the snapshot showing `PendingBank`; an earlier bank's
      sweep leaving the later one shown; two banks on one device, the earlier unlocked, both swept by `device.sweep()`
      (both leases swept, both refusing `disabled`); a second bank leaving the first working.
* **Decisions made**:
  - **How the bank reaches its vaults: registration.** The vault registers itself in `Vault.make`. `safebyok/core`
    carries no caching, so `bank.ts` cannot import `Vault` or the minder. A `Set`, not the last vault, because a bank
    can have several vaults (tests make two) and each must be swept. I set aside the device or the host holding the
    vaults: that would put the cascade outside the bank, which owns its own end.
  - **`vault.sweep()` calls `minder.goodbye()` directly.** I added no `minder.sweep()`. The minder's code has the Coach's
    consensus, and `goodbye` is already its end, in the same way `lease.sweep` ends in `lease.evict`. The minder stays
    restartable: a `hello` after a bank's sweep starts it again, and `goodbye`'s contract ("A later `hello` starts
    minding again") is unchanged.
  - **The order in `#end`:** shut, align, sweep the vaults, drop. A subscriber told of the end, or a vault as it is
    swept, finds every call refusing.
  - **The device's end state is kept, though nothing reaches it.** `device.#endCause`, `isEnabled`, `endCause` and
    `demandEnabled` stay, because `gating.ts` calls `device.demandEnabled()` (that is thread 21's file) and because a
    later goodbye or sign-out will set them. The bank's `?? this.#device.endCause` stays for the same reason.
* **Deviations**:
  - **`Vault.make` on a swept bank now refuses `disabled`;** before, it succeeded. This touches only an ended bank, never
    a working case.
  - **Refs not dropped, against the Coach's literal "unset ... vaultdb ... any other refs":**
    - The bank's `#vaultDB` is the host's object, which the device still holds.
    - The bank's `#maingate` and `#rootBox` are sealed records.
    - The vault's `#bank` and `#minder`, and the minder's `#bank`, `#vaultDB` and `#tsq`, are readonly fields on every
      common path. Making them nullable would reshape exemplar code. Once the device and bank let go, the graph is
      unreachable from the device, and every verb on it refuses `disabled` or `minderNotStarted`.
  - **A vault's put by labelpath after a sweep now refuses with the minder's `disabled`, not the bank's end cause.** Its
    `#newestAt` reaches the stopped minder first. The kind is the same.
  - **Tests removed:** `gating.test.ts` "refuses on a swept device ...": nothing ends a device now. The device-ending
    tests in `device.test.ts` and `bank.test.ts` were rewritten for a device that stays.
* **Discoveries**:
  - **A bank made earlier on the device** was not reached by `device.sweep()`, and stayed enabled (the review's
    significant finding). Fixed: the device sweeps every bank made on it. One drift remains, in
    `notes/guarantees-drift.md`: `device.lock()` locks only the last bank made.
  - **Crossings, written into `notes/wontfix.md`:**
    - A birth in flight across `device.sweep()` now resolves a bank, which the device holds. This widens the "A lock, a
      sweep or a second form verb" entry.
    - A minder's answer crossing a bank's sweep is the existing `goodbye` entry.
    - Neither can corrupt the bankDB or move secret material.
  - **Device subscribers hear a bank's sweep twice:** first the swept bank's snapshot, then `PendingBank`.
  - **A subscriber added to a swept bank is kept**, though nothing ever calls it.
  - **`notes/security.md`:** the sonnet subagent added two entries rather than one (06335cb09). It did not amend the
    older `device.sweep` lines in place, which the file's header asks for where an entry already names the mechanism,
    because CLAUDE.md says never to rewrite old entries.
* **For the Coach**: the refs left in place, and the device's unreachable end state (see the PR's *Open questions*).
