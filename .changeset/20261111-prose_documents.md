---
"safebyok-big": patch
"safebyok-react": patch
"safebyok-fastkey": patch
"safebyok-indexeddb": patch
---

The READMEs are reworded in plain English. The fastkey README's `Bank.make` sample passes the required `device_id`, and it no longer says the vault logs a key deriver's refusal kind: a throwing deriver refuses `unexpected_error`, carrying neither its message nor its kind. No code changes.
