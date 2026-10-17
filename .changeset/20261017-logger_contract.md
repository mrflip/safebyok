---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
"safebyok-react": minor
---

**A `VaultDB` is made with a logger, fixed from then on.** The base class demands `super({ logger })` (the new type `VaultDBInit`), refusing a missing or malformed one as `bad_option`, and keeps it in a private field: `vaultDB.logger` is a read-only getter, so nothing can swap it, and a VaultDB that is logged, spread or compared never shows a host's logger. An adapter's factory still takes an optional `logger` in `VaultDBOpts` and settles it with `parseLogger(opts.logger)`; a VaultDB of your own does the same before `super()`. `safebyok/testing` gains `vaultDBInit(logger?)` for a VaultDB under test.

**Name your logger once.** `VaultDB.adoptLogger` is gone: `openVault`'s `logger` is the vault's alone and is not handed to the adapter, while a vault opened with no `logger` uses its adapter's, guarded. `VaultProvider` and the vault it opens share one logger: its `logger` prop, else its `vaultDB`'s. So a logger given once, to the adapter's factory, is heard by the adapter, the vault and the provider, as one object. The new export `ConsoleLogger`, passed to `openVault` or `VaultProvider`, has the vault log to the console whatever the adapter was given. Everywhere a `logger` is taken, `null` now means none, as `undefined` does, where it was refused before.

**`parseLogger` is idempotent and keeps identity.** A logger it has guarded comes back as itself, and the same host logger always comes back as the same guarded one; with none, it answers `ConsoleLogger`. It knows what it has guarded by a private record, not a property, so no logger can skip the guard by carrying or inheriting one.

**A host's listener outside a vault has a logger too.** What calls a host's listener directly is told (as an `error`) when the listener throws, beside the platform's `reportError`: `memoryStore` and `domStore` take an optional `{ logger }` (the new type `StringStoreOpts`), `ChangeBell.listen` an optional third argument, and `inspectIdbDeviceDB` (the new type `IdbInspectorOpts`) and `inspectIdbVaultDB` a `logger` in their options. Each is the console when none is given, so on Node and Bun such a listener's failure is now printed rather than lost.
