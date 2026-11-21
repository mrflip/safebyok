---
---

safebyok, private, gains `Vault.withUnlockedWhisper`, which unseals a box on a bank already unlocked and refuses `bank_locked` on a locked one, never waiting; `withWhisper` waits for the unlock first, then gets the box. safebyok-react-lean, private, fetches its boxes, gate and listing only once the bank is brought up, and its verbs refuse rather than wait while it is starting: `withLockableWhisper` unseals at unlocked through `withUnlockedWhisper`, and a bring-up that failed refuses with its own phrase. Its bridge delivers the minder's events a microtask later. Nothing published changes.
