---
"safebyok-big": patch
---

**A box row answered under another `vault_tok` than its listing's vault refuses `storage_issue`.** It refused `record_conflict`. A box is fetched by its vault's `vault_tok`, so such a row says the store or its adapter is not working, and a retry will not mend it.
