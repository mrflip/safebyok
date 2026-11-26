---
"safebyok-postgres": minor
---

VaultFunctionsSql's write functions name a failed storage policy's refusal by its tag in PolicyPhrases, { ok: false, refusaltag: 'PasskeyStored' }, where they carried its message, { ok: false, message }; the vaultDB makes the message from the tag, so a host sees the same refusal and message as before. The functions' arguments and results keep their types, so CREATE OR REPLACE takes the change; a host that already dropped every safebyok_a010501_r000_* function for this release, as its write functions' changeset says, need do nothing more. For an adapter author (notes/vault-adapter-contract.md): a datastore's policies tag is now { ok: true } | { ok: false, refusaltag }, the refusaltag a key of PolicyPhrases, and a verdict carrying anything else refuses storage_issue.
