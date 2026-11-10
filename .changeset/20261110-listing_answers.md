---
"safebyok": minor
---

**A vault listing tracks damaged rows as a box listing does, and a listing's store verbs answer the vaultDB's answer.** `bank.vaultListing.damaged_rows` lists the vault rows found damaged at the last listing, and a vault listed under one is vacated. A damaged box row is now told to `onBadNews`, as a damaged vault row was. A listing's `tryList`, `tryDel` and `tryGet` answer the vaultDB's own answer, the instances as `val`; `tryGet` answers the act `timely` where the instance listed served it, and `get` serves either listing. A listing's `del` takes a record. The vault listing's `tryReplacePassphrase`, `tryAddPasskey` and `tryRevokePasskey` answer the vaultDB's answer.
