# 2026-10-17: Logger contract -- PR up for review, after its review's fixes

Branch `20261017-logger_contract`, cut from `origin/main`; the PR carries the same list.

* **Built**: a `VaultDB` is made with a logger (the base class demands `super({ logger })`) and keeps it
  in a private field behind a read-only getter; a vault opened with no `logger` uses its storage's,
  guarded; `openVault`'s `logger` is not pushed into a store (`adoptLogger` is gone); `VaultProvider`
  and its vault share one logger, its prop or else its `vaultDB`'s. `null` means none everywhere.
  `ConsoleLogger` is exported, for a vault that should log to the console whatever its adapter was
  given.
* **Guarding**: `parseLogger` knows what it has guarded through a private `WeakSet`, and maps each
  host logger to one guarded form through a `WeakMap`: idempotent, identity kept, and no logger can
  skip the guard. The `_safebyok_modded` mark and its opt-out are gone.
* **Listeners outside a vault**: `Global.logger` is gone. `ChangeBell.listen`, `memoryStore`,
  `domStore` and both inspectors take an optional `logger`, told when the host's listener throws,
  beside `reportError`. With none given, the console: on Node and Bun such a failure is now printed.
* **Open question**: the base constructor could take `VaultDBOpts` (a required argument with an
  optional `logger`) and run `parseLogger` itself, so an adapter writes `super(opts)`; `VaultDBInit`,
  `TH.vaultDBInit`, and the `parseLogger` import in every adapter would go away. Not done; awaiting
  a yes.
