---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
"safebyok-react": minor
---

**One default logger, set once.** The new `setDefaultLogger(logger)` sends everything safebyok would have said to the console to the app's own logger: every storage adapter, vault, `VaultProvider`, string store, inspector and change bell given no logger of its own, made before the call or after. The new export `DefaultLogger` is that default, one object that hands each call on to the console (tagged `safebyok:`) or to the logger last handed `setDefaultLogger`; passed to `openVault` or `VaultProvider`, it has the vault use the default whatever its adapter was given. Everywhere a `logger` is taken, `null` now means none, as `undefined` does, where it was refused before. A host's listener that throws in `ChangeBell` or a string store (`memoryStore`, `domStore`) now goes to the default logger as an `error`, beside the platform's `reportError` -- so on Node and Bun, with no `reportError`, it is printed rather than lost.

**A `VaultDB` is made with a logger, fixed from then on.** The base class demands `super({ logger })` (the new type `VaultDBInit`), refusing a missing or malformed one as `bad_option`, and keeps it in a private field: `vaultDB.logger` is a read-only getter, so nothing can swap it, and a VaultDB that is logged, spread or compared never shows a host's logger. An adapter's factory still takes an optional `logger` in `VaultDBOpts` and settles it with `parseLogger(opts.logger)`; a VaultDB of your own does the same before `super()`. `safebyok/testing` gains `vaultDBInit(logger?)` for a VaultDB under test.

**A logger given once, to the adapter, is heard by the vault and the provider too.** `VaultDB.adoptLogger` is gone: `openVault`'s `logger` is the vault's alone and is not handed to the adapter, while a vault opened with no `logger` uses its adapter's, guarded. `VaultProvider` and the vault it opens share one logger: its `logger` prop, else its `vaultDB`'s.

**`parseLogger` is idempotent and keeps identity.** A logger it has guarded comes back as itself, and the same host logger always comes back as the same guarded one; with none, it answers `DefaultLogger`. It knows what it has guarded by a private record, not a property, so no logger can skip the guard by carrying or inheriting one.
