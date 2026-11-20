---
---

Empty: the new `safebyok` is private, and `safebyok-big` is untouched. What a caller of the new core will see: **`vault.withWhisper(labelpath, fn)`** now gets the box from the vaultDB as soon as it is called, while the user is still being asked to unlock a locked bank, so the box is fresh once the unlock lands and is not asked for a second time. Its outcomes are unchanged: on a locked bank it still asks the user before it refuses `absent_box` for a box never stored. A refusal met by that early get is told to no one, and the box is got again after the unlock. **Stored format:** unchanged.
