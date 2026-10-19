---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

**One kind of lock: `vault.lockSoon()` is gone.** Call `vault.lock()` where you called `lockSoon()` (a hidden tab, a sign-out): it drops the key at once and revokes this device's lease. The vault still locks of itself when the lease ends: at `askPassphraseAt` a timer drops the key, with no minute's grace for work in hand.

**A lock no longer stops an unlock under way.** A `lock()` that lands while an `unlock()` or `changePassphrase()` is under way, in this tab or another on the device, lets it finish: the vault ends unlocked. Call `lock()` again after it resolves if it must end locked. A `readBox()` or `useBox()` still hands back nothing once the key is gone. A retired or remade vault, a change of wayins elsewhere, or a `close()` still leaves an unlock under way with nothing taken up.

**A DeviceDB of your own: `writeLease(lease)` takes no second argument**, and `LeaseExpectation` is no longer exported. `writeLease` and `writeMark` simply replace what the scope held; `retire()` now calls `eraseMark`. The device mark is `safebyok-mark-v4`, holding only the vault it has seen; a `safebyok-mark-v3` record reads as no mark, so the device checks the vault from what storage holds now. `describeDeviceDB` from `safebyok/testing` drops its lock-generation cases.

**The vault props move to `safebyok-vault-v4`, without `prior_vault_key`.** A vault written under `safebyok-vault-v3` now opens as `damaged_vault`, which `retireDamagedVault` clears; there is no migration before 1.0. `vault_key_epoch` stays on every record, always 1. A Postgres host recreates `safebyok_vaults` from the new `vault-tables.sql` (a table of the old shape keeps working, its `prior_vault_key` column unused, but its v3 rows read as damaged). A GraphQL host regenerates its schema: `SafebyokPriorVaultKey` and both `prior_vault_key` fields are gone. A Convex host redeploys the component. `safebyok/testing`'s `rotatedVaultPropsOf` is now `vaultPropsAtEpochOf(userId, vaultKeyEpoch)`.
