---
"safebyok-big": minor
---

`vault.demandEnabled()` now refuses only a vault swept or vacated, as on every other model; a vault deleted passes it. To refuse a deleted vault too, call `vault.demandPresent()` after it, or the guard for the entrypoint: `vault.demandPromptable()`, `vault.demandAttachable()` or `vault.demandHelloable()`. `vault.ensureAttachable()` is gone: call `vault.ensureTimely()`.
