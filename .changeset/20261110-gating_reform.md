---
"safebyok": minor
---

**`safebyok` exports `Gating` as a type only.** A host that used `Gating` as a value, with `instanceof` or by calling `Gating.launch`, has nothing to call: a gating reaches the host through `requestCleartext` or the bank's `openGating`, and its type stays exported. Within the package, each kind of gating is one function that proves the user's clears and then makes its change, and a vault launches it with `Gating.launchOn`, a birth with `Gating.launchBirth`. What a gating asks, refuses and answers is unchanged. **`ClearsForGatingkind` is renamed `CleartextsForGatingkind`**, as VOCABULARY.md names what the user hands an attempt: a host that imports the type renames it. **Stored format:** unchanged.
