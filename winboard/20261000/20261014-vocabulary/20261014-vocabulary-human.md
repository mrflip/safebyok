# 2026-10-14: VOCABULARY.md lands -- three naming questions still open

VOCABULARY.md names the cast (whisper, lockbox, vault, passphrase, the four keys by role, their
Wrapped and Ciphered forms) and is applied across src, tests, the demo, STYLE.md, CLAUDE.md,
SECURITY.md, the lint messages and both whiteboard threads. `KdfProfile` is now `KeyDeriverSpec`,
labelled `argon2id_web_v1`.

Open:

* **Stored-field casing.** Underbar_case is meant to keep database field names lowercase, but
  records pass through several facades before a database. Undecided whether the rule should
  apply at the facades (`key_deriver_label`) or only at the adapter.
* **`keyDeriverLabel` vs the smush rule.** STYLE.md smushes `label` into one word
  (`vaultlabel`), which would make it `keyderiverlabel`. The Coach's spelling is used for now.
* **`user_id` vs `userlabel`.** The vault is named by applabel, vaultlabel and userlabel, but the
  code carries `user_id` / `userId`, not validated as a label (auth providers' ids often contain
  capitals). Left as is.

Tests: safebyok 106, safebyok-react 6, demo 24; all three justifies green.
