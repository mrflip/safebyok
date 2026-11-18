---
---

Empty: safebyok-big is private. What a caller of `mask` (from `safebyok-big/utils`) will see: only the visible ASCII characters of the text's first line count, and how much of them shows follows the new exported `MaskSchedule`, by how many there are. A text of 12 characters or fewer shows only stars, twelve of them; 13 to 20 shows its last 2, padded to 20; 21 to 32 shows 2 and 3, and over 32 shows 3 and 4, both always 24 characters long. The options are `head`, `tail`, `minLen` and `maxLen`, each overriding its row of the schedule, and none defaulted: `minStars` is gone, and so is the `***...***` collapse. `MaskRow` is exported beside `MaskOpts`.
