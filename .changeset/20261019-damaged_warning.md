---
"safebyok": minor
---

The warning a retirement gives when it removed another revision than the one it showed now says when the lockbox the vault showed was a damaged one. `Vault.retireBox()` logs it through the host's logger with `damaged: true` in the story beside `call`, and its message says the lockbox shown was damaged, so a host can tell a lost write over a damaged record from one over a sound one. It names no revision, boxlabel or secret. A retirement over a sound lockbox warns as before, with no `damaged` field. Nothing stored changes.
