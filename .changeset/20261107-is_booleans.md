---
"safebyok-big": minor
"safebyok-react": minor
---

Booleans are named `is…` and a two-valued enumeration is a boolean. **Vault, box and bank**: `vault.lockState()`, `box.lockState()` and `bank.lockState()` are gone; read `vault.isLocked` or `box.isLocked` (true while the vault holds no lease in force), and the exported `LockState` type goes with them. **The vault snapshot**: `lockState` (`'locked' | 'unlocked'`) -> `isLocked` (a boolean), `present` -> `isPresent`. **The box snapshot**: `full` -> `isFull`, `present` -> `isPresent`, `exposed` -> `isExposed`, `veiled` -> `isVeiled`; the listings' snapshots, which are lists of these, follow. No stored shape changes. **safebyok-react**: `VaultLockControl`'s span carries `data-locked` (`"true"` or `"false"`) in place of `data-lock-state` (`"locked"` or `"unlocked"`); a stylesheet that selected on it changes to match.
