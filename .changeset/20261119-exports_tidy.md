---
---

Empty: the new `safebyok` is private, and nothing published reaches what changed. What a host of the new core will find:

- **`Device.make` takes the bag of `browserOpts()` spread in.** Its options refused the bag's `deviceDB`; they now accept it and ignore it, since the new core keeps no device database. `DeviceOpts` has the optional `deviceDB` field, typed `unknown`.
- **`safebyok/browser` types its own `BrowserOpts`**, whose `strengthChecker` is `safebyok`'s `StrengthChecker`, where it re-exported safebyok-big's type. `browserOpts` is the same function as before, typed to answer that bag.
- **A box tombstone refuses `am: 'a'`.** `tombstoneOf` took `am` as `'a'` or `'x'` and ignored it; it now takes only `'x'`, a tombstone's own, and refuses `'a'` as `bad_record`.
- **`Gating.make` refuses an `askUser` that `guardRequestCleartext` did not make**, as `bad_record`, as it refuses every malformed argument. It took any function; a gating a device makes is unchanged, since the device wraps the host's dialog itself.
- **`isVoidSentinel` holds only of the shell itself**: a tombstone at revseq -1 whose revtok and lifeseq are also the void ones. A tombstone at revseq -1 with any other revtok or lifeseq is no void sentinel, and `isGone` now holds of it.
- **`Modelkind` is the new core's own**: `'bank' | 'gate' | 'box' | 'device' | 'gating' | 'wayin' | 'lease' | 'proving'`, the answers of its models' `modelkind` getters, exported from `safebyok`, `safebyok/core` and `safebyok/storage` in place of safebyok-big's.
- **Newly exported:** `HostErrorSanitizer` and the `RefusalRows` type, safebyok-big's, from `safebyok/core` and `safebyok`; the `Watcher` type `MemoryVaultDB` names, from `safebyok/storage` and `safebyok`; and `WriteCmpAsk` within `Classifier`.

Nothing stored changes.
