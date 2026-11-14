---
"safebyok-big": minor
---

**A deleted Vault stays enabled, as a deleted Box does, and its calls answer what storage has.** `vault.get`, `hydrate` and `ensureTimely` fetch: they find the tombstone (`get` refuses `vault_gone`, or resolves the Vault, absent, under `ifAbsent: 'nil'`; `hydrate` and `ensureTimely` resolve it, absent), or a new life made on another device, which the Vault takes on. `vault.boxListing` hands out a listing of the tombstone's life, which has no boxes: storage refuses its gets, lists and deletes as `absent_vault` (`meta.act` is `vault_gone`), and `vault.putBox` refuses `vault_gone`, as a whisper is sealed only under a vault present. `vault.del` refuses as storage does, `absent_vault`. `vault.beginWatch()` still refuses `vault_gone`; a watch begun by hand on the tombstone's box listing ends when the vault takes on its next life. Stored format: unchanged.
