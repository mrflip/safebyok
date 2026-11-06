---
"safebyok": minor
---

`vault.boxListing.hello(listed)` no longer checks `listed`, which `vault.hello` has checked already: a malformed listing handed to it directly no longer refuses `damaged_row`. Four checks of values safebyok built itself, which only a bug in safebyok can fail, change kind: a box's stamp (on unseal and seal) and a wayin made by `vault.replacePassphrasePrompt()` or `vault.addPasskeyPrompt()` now refuse `bad_option` where they refused `bad_record`; and the scope of a new vault's passphrase is no longer checked apart from its strength check, so its `bad_scope` refusal is gone.
