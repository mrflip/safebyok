---
"safebyok": minor
---

`vault.boxListing.hello()` no longer takes a list of boxes: it starts the box listing's watch and nothing more, and a host's type check refuses an argument. `vault.hello()` is still how a vault's boxes are listed.
