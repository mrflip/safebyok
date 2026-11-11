# The good Bank options are in `safebyok/browser`, on purpose

`Bank.make` takes its `keyDeriver`, `deviceDB` and `strengthChecker` from the host, and gives none
of them a working default. The strength checker's default refuses every passphrase. The good
answers for a browser, a pinned Argon2id deriver, an IndexedDB device store and the zxcvbn checker,
come from a subpath of the core, `safebyok/browser`, as one bag: `...browserOpts()`.

This looks like an oversight in three ways, and agents keep trying to "fix" it. It isn't one. Don't
change it without a Coach's say.

## Why not a default in `Bank.make`

A default is something `Bank.make` imports, so every app ships it, whether it uses it or not. A
bundler drops only the code nothing imports. The deriver is about 15 kB minified. The zxcvbn
checker's common-password list is about 214 kB minified and brotlied.

The deriver is also the choice an app most plausibly makes differently: the same Argon2id spec in
WebAssembly (`safebyok-fastkey`) or native to its platform. An app that makes that choice shouldn't
also carry ours. So the main entry names no default and imports nothing from `safebyok/browser`.

## Why a subpath works

Three settings together make "what you never import never ships" true:

* `safebyok/browser` is its own entry in `package.json`'s `exports` and in `tsdown.config.ts`.
* tsdown builds with `unbundle`, so each source module is its own file in `dist/`.
* The package is marked `sideEffects: false`, so a bundler may drop any module the host's imports
  never reach.

The zxcvbn dictionary goes one step further: the checker's `load` fetches it with a dynamic
`import()`, as a chunk of its own, at the bank's `hello()`, never at import. If the chunk won't load,
the hello fails loudly, and no vault is born until a later hello loads it.

Breaking any of the three, for example importing a `safebyok/browser` module from the main entry
"for convenience", puts the batteries in every bundle.

## Why the default checker refuses everything

It is the contract, not a bug (`notes/configuration.md`, *Pluggable Passphrase Strength
Checker*). The core won't guess how strong a passphrase a host's users need, and a length-only
checker is no checker. The refusal's message tells the user, and the developer, that a checker must
be chosen. A host gets a good one by spreading `browserOpts()`, or brings its own.

## Why not a package of its own

The Coach has said the best-practice defaults may one day move into a `-utils` or `-bestpractices`
package (NOTYET.md, 2026-10-16, #136). That is a decision for a Coach, not a cleanup. Until it is
made, they stay in `safebyok/browser`.

## Before you change any of this

Check the change against the three points above, and ask. A change that moves a default into
`Bank.make`, merges `safebyok/browser` into the main entry, or gives the strength checker a
permissive default reverses a decision on purpose. It needs a Coach's yes before it exists.
