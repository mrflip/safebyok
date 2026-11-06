---
"safebyok": minor
---

**`BoxSnapshot` drops `lockState`:** the lock is the vault's, on `VaultSnapshot`, so a box's snapshot holds only the box's own facts, and keeps its identity through a lock and an unlock. A box listing's rows now agree with `box.getSnapshot()` after a lock, where they used to keep the old `lockState`. Read the lock from `vault.getSnapshot().lockState` or `box.lockState()`. `box.subscribe` still hears of a lock, as `box.whisper` changes: a component reading `box.whisper` subscribes over `() => box.whisper` or the vault's snapshot, since the box's no longer moves. **Stored format:** unchanged.
