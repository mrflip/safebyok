# 2026-10-17: Logger contract -- PR up for review, three small questions

Branch `20261017-logger_contract`, cut from `origin/main`; the PR carries the same list.

* **Built**: a `VaultDB` is made with a logger (the base class demands `super({ logger })`) and keeps it
  from then on; a vault opened with no `logger` uses its storage's; `openVault`'s `logger` is not
  pushed into a store (`adoptLogger` is gone); `parseLogger` is idempotent and answers one shared
  console logger; the change bell and string stores say failures through a replaceable
  `Global.logger`.
* **Question 1**: `vaultDB.logger` is public and `readonly` in types (the vault reads it), writable
  at run time. Keep it public, or give the vault a narrower read?
* **Question 2**: a logger carrying `_safebyok_modded: true` is taken unguarded. It is undocumented
  to hosts (code comment and `notes/security.md` only). Keep, or drop the early return?
* **Question 3**: `VaultProvider`'s own warnings still use its `logger` prop, not the store's,
  because the provider runs them before `openVault` has checked `vaultDB`. Worth a guarded read?
