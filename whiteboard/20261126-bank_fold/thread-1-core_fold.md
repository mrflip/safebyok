# Thread 1: core_fold (2026-11-26)

Branch `claude/bank-table-refactor-fr1ycq`, local only (no PR, by the handoff), on `1323380`. Proved:
`pnpm --filter safebyok` lint, typecheck, build green; test 40 files, 2418 passed, 1 skipped. Every
other package is red, as the handoff expected (they build on the old roots and on `World`).

* **Built**: the bank is no stored Thing. `thingkindVals` is `['gate', 'box']`; the main gate is
  stored at labelpath = banklabel, carries the bank's `lifetok`, and may be a tombstone (the bank's
  end). A labelpath is a label, `box` or `box/<label>`; the banklabel `box` refuses `bad_record`
  (`Phrases.BanklabelOfRootBox`), and a gate elsewhere than its banklabel refuses too
  (`Phrases.GateNotAtBanklabel`). Two roots everywhere: `BirthPuts` is `[gatePut, rootPut]`,
  `RootRows`/`WorldRoots` are `{ gate, root }`, `Track` keys `gate`/`box`, `isBirthWritable` reads
  two nulls, `bankRootsMissing` fires for a live gate without its root box. `lifetok_cmp` and the
  lifetok clause of `isWritable` apply to a gate over a live gate; `banktokOf` reads the gate row.
  `World` is now `Bank` (`src/models/bank.ts`, by `git mv`), with the old Bank's host members
  (`gate`, `rootBox`, `stamp`, `lifetok`, `scope`, `birth`, `birthGating`, `ensureUnlocked`,
  `dismissUnlock`, `lock`, guards). `Gate` gained a `lifetok` getter. `device.bank` is that Bank
  from `Device.make`, never null; `device.world` is gone. `isMainGateLive` and
  `Phrases.MainGateDeleted` are gone. `notes/vault-adapter-contract.md` describes two roots.
* **Tests**: `tests/models/world.test.ts` became `bank.test.ts` (old `bank.test.ts` folded in:
  mintStamps, lock/hostVault, disabled, gate verb, tellBadNews). New: the gate's labelpath is its
  banklabel; banklabel `box` refused (record, shell, ask, device record, stamps); `GateChecks.record`
  admits a gate tombstone. The vaultDB battery is rewritten for two roots.

* **Decisions made**:
  - `isGateAtBanklabel` refines get and list asks as well as records and shells, so an ask for a
    gate at another labelpath refuses before the datastore is asked.
  - `Bank.gate` throws `absent_thing` before signin; `rootBox` throws until a live gate is heard
    (the old `World.gate`/`rootBox` returned null; the old `Bank.stamp`/`rootBox` threw
    `thingNotLive('bank')`).
  - The VaultMinder carries the void banktok over a gate tombstone, while the vaultDB's
    `banktokOf` gives the tombstone's lifetok. Both read as the bank's end; I left them unaligned
    rather than guess which a later delete wants.
  - `ThingFormat` is unchanged: an old `bank`/`gate` row reads as incompatible (pre-1.0, fails safe).
  - A shelf value of the old shape (four entries) reads as nothing.
* **Deviations**: none from the plan. ctx-bytes moved only where `gateStamp.labelpath` moved:
  `"labelpath":"gate"` to `"labelpath":"acme"` in the gate stamp text, and
  `"gate_labelpath":"gate"` to `"gate_labelpath":"acme"` in the lease text.
* **Discoveries**:
  - Lease shells and lease records do not refine `isGateAtBanklabel` on their `gate_labelpath`.
  - The storage battery still lets a gate be reborn over its tombstone through a put; nothing in
    the core writes a gate tombstone, so no rule says otherwise yet.
  - `bank.test.ts` keeps the local alias `world` (`{ bank: world }`) to keep the diff legible;
    thread 6 can rename it with the other World names.
* **Left for later threads**: every other `World` name (`GetWorldAsk`, `WorldRoots`,
  `WorldSnapshot`, `CarWorld`, `doGetWorld`, the VaultMinder's `world` option): thread 6. Adapters:
  threads 2 to 5. VOCABULARY, READMEs, wontfix, security note, changeset: thread 7.
* **For the Coach**:
  - OPEN: the banklabel `box` refusing `bad_record` (the orchestrator's call).
  - OPEN: should a gate tombstone's banktok be its lifetok (vaultDB) or void (VaultMinder)?
  - OPEN: should the lease's `gate_labelpath` be checked against its banklabel?
