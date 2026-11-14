---
"safebyok-big": patch
---

**A fraction of a minute** given as `autolockMinutes`, `vaultRefreshMinutes` or `boxRefreshMinutes` is taken to the nearest whole millisecond (`autolockMinutes: 1 / 7` leases for 8571 ms), where it made a fractional millisecond count. `Infinity` stays `Infinity`. **Stored format:** unchanged.
