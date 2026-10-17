---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

**A `VaultDB` is made with a logger, fixed from then on.** The base class demands `super({ logger })` (the new type `VaultDBInit`), refusing a missing or malformed one as `bad_option`, and keeps it as a non-enumerable, writable, configurable own property, so a VaultDB that is logged, spread or compared never shows a host's logger. An adapter's factory still takes an optional `logger` in `VaultDBOpts` and settles it with `parseLogger(opts.logger)`; a VaultDB of your own does the same before `super()`. `VaultDB.adoptLogger` is gone: `openVault`'s `logger` is the vault's alone and is no longer handed to the adapter, so give the adapter's factory the same `logger` to have one hear both (an adapter made with none uses the console). `parseLogger` is idempotent -- a logger it has guarded comes back as itself, marked with a non-enumerable `_safebyok_modded` property, and one you mark yourself is taken unguarded -- and answers the one console logger, made once, when given none. `safebyok/testing` gains `vaultDBInit(logger?)` for a VaultDB under test. Listener failures in `ChangeBell` and the string stores now go through an internal, replaceable `Global.logger`, which still hands them to the platform's `reportError` (a thrown value that is not an `Error` goes as an Error holding it as its `cause`).
