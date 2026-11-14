# Thread 1 restack notes: thread 5's calls that change (2026-10-31)

For whoever restacks PR #411 (`20261031-tests_models`) onto thread 1's rework. Line numbers as of that branch's tip today.


Every call that bound a vault now binds a stamp or takes the vault at the lease. On that branch: `Gate.build(asVault(vault), …)` → a stamp duck (gate.test.ts 15, 53, 59); `new Gate(asVault(vault), props)` (gate.test.ts 67, 83, 89, 95); `Proving.makeProvingPair(asVault(…), …)` (proving.test.ts 15, 49, 201, 211, 220, 231, 232, 240; loosened/proving.test.ts 57, 59, 67); `PassphraseProving.make`/`PasskeyProving.make(asVault(…), …)` (proving.test.ts 26, 177, 187; loosened/proving.test.ts 18, 26, 33, 40, 48); `proving.makeLease(friend, opts)` → `makeLease(vault, friend, opts)` (proving.test.ts 270, 278, 288, 289, 298; loosened/proving.test.ts 69, 71). A plain record or `duckVaultOf()` ducks as a stamp, so `asVault` may go. `proving.vault`/`gate.vault` → `.stamp`; any `fieldnames` assertion on `provingPairArgs`/`provingMakeArgs` naming `vault` now names `stamp`; `buildGateArgs` is `vaultBuildArgs`.
