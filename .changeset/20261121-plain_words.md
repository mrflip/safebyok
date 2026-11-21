---
---

A caller of the private core (`safebyok`) and of `safebyok-react`'s giver now passes the form verbs' cleartexts as `passphraseCleartext`, `passkeyCleartext`, `nextPassphraseCleartext` and `nextPasskeyCleartext`, to `cloak` and to each form verb; the old `…Clear` fields are refused as unknown. safebyok-big keeps its own fields. **Stored format:** unchanged.
