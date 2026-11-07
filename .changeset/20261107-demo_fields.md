---
"safebyok-react": patch
---

A whisper field's Show resets to hidden whenever its field hides (a lock, a veil, an unexpose), so an unlock never shows the whisper unasked. VaultLockControl's Unlock now unlocks the vault in hand and never asks the bank to build one.
