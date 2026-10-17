# 2026-10-17: Logger contract -- PR up for review, after its review's fixes

Branch `20261017-logger_contract`, cut from `origin/main`; the PR carries the same list.

* **Built**: a `VaultDB` is made with a logger (the base class demands `super({ logger })`) and keeps it
  in a private field behind a read-only getter; a vault opened with no `logger` uses its storage's,
  guarded; `openVault`'s `logger` is not pushed into a store (`adoptLogger` is gone); `VaultProvider`
  and its vault share one logger, its prop or else its `vaultDB`'s. `null` means none everywhere.
* **One default, set once**: `setDefaultLogger(telemetry)` sends everything safebyok would have said
  to the console to the app's logger, for every adapter, vault, provider, store, inspector and bell
  given no logger of its own, made before the call or after. `DefaultLogger` is that default: one
  guarded object that forwards at call time. The per-site `logger` options outside a vault are gone.
* **Guarding**: `parseLogger` knows what it has guarded through a private `WeakSet`, and maps each
  host logger to one guarded form through a `WeakMap`: idempotent, identity kept, and no logger can
  skip the guard. The `_safebyok_modded` mark and its opt-out are gone.
* **Open question**: the base constructor could take `VaultDBOpts` (a required argument with an
  optional `logger`) and run `parseLogger` itself, so an adapter writes `super(opts)`; `VaultDBInit`,
  `TH.vaultDBInit`, and the `parseLogger` import in every adapter would go away. Not done; awaiting
  a yes.
