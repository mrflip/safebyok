---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-convex": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

**A `VaultDB` is always made with a logger.** The base class now demands `super({ logger })` (the new type `VaultDBInit`), refusing a missing or malformed one as `bad_option`, and keeps it as a non-enumerable, writable, configurable own property, so a VaultDB that is logged, spread or compared never shows a host's logger. An adapter's factory still takes an optional `logger` in `VaultDBOpts` and settles it with `parseLogger(opts.logger)`, the console when the host gave none; a VaultDB of your own does the same before `super()`. `openVault`, when given a `logger`, now *replaces* the adapter's own with it (before, an adapter made with a logger kept it): to keep an adapter's messages apart, give `openVault` no `logger`. `safebyok/testing` gains `vaultDBInit(logger?)` for a VaultDB under test. Listener failures in `ChangeBell` and the string stores now go through an internal `GlobalLogger`, with no change in where they land.
