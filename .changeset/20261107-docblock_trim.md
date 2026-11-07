---
"safebyok": minor
---

**`safebyok` exports `Patterns`, `MaxLabelChars` and `MaxUserIdChars`**, so an input can check a label or a `user_id` by the same pattern and length the vault does (`<input pattern={Patterns.label.source} maxLength={MaxLabelChars} />`). **A key deriver's own refusal passes through as itself:** a `VaultError` a deriver throws from `deriveKeyBytes`, such as `argon2idDeriver`'s `bad_option` for a salt of the wrong length, reaches the host as that refusal; anything else a deriver throws is still `unexpected_error`, naming nothing it said. `safebyok-convex`'s README names the limit on a bank (past Convex's 16 MiB read, `tidyGone` throws and the watch goes quiet), and doc blocks in the storage packages are shortened. Not publicly released, so nothing migrates. **Stored format:** unchanged.
