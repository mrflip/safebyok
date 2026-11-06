---
"safebyok": minor
---

**A new entry point, `safebyok/utils`, holds `mash(text)`.** It answers the SHA-256 of the text as 64 lowercase hex characters, so a host can pass `user_id: await mash(email)` where it would rather not hand over the email itself. It is unsalted, takes no options and refuses `bad_option` for a value that is not a string. The 64 characters pass the `user_id` rule, but not the `label` rule, so a mashed id is no `applabel`, `vaultlabel` or `boxlabel`. The entry pulls in none of the vault.
