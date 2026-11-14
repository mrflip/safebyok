---
"safebyok-big": minor
---

A listing's world is now its own argument, and its type is the class it stands for: a vault's world is a Pick of Bank, a box's a Pick of Vault, so an editor's go-to-definition lands on the bank or vault member. The exported Vault and Box constructors no longer take an options bag beside the world, the listing and the record: each reads its refresh horizon from its listing. A host that makes its vaults and boxes through a bank sees no change.
