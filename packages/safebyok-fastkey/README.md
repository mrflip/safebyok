# safebyok-fastkey

A [safebyok](../safebyok) key deriver that runs Argon2id through WebAssembly. It takes the same
keyDeriverSpecs and labels as the core's pure-JavaScript deriver, derives the same bytes, and runs
about four times faster.

* `argon2idWasmWebV1Deriver` -- Argon2id at the supplied `Argon2idWebV1` spec, under its label
  `argon2id_web_v1`: a drop-in replacement for the core's `argon2idWebV1Deriver`.
* `makeArgon2idWasmDeriver(spec)` -- Argon2id at a spec of your own, checked exactly as the core's
  `makeArgon2idDeriver` checks it.

## Install

```sh
pnpm add safebyok safebyok-fastkey
```

`safebyok` is a peer dependency, so the deriver and your app share one copy (and one `VaultError`).
`hash-wasm` is this package's only dependency.

## Use

Pass the deriver as `keyDeriver`:

```ts
import { Device } from 'safebyok'
import { argon2idWasmWebV1Deriver } from 'safebyok-fastkey'

const device = Device.make({ user_id: session.user_id, banklabel: 'acme', gates: ['main'], vaultDB, deviceDB, strengthChecker, requestCleartext, keyDeriver: argon2idWasmWebV1Deriver })
const bank = await device.ensureBank()
const vault = await bank.ensureVault({ vaultlabel: 'main' })
```

A vault records only its deriver's label, and this deriver derives exactly what the core's does
under the same label. So a vault made through WebAssembly on one device unlocks through
`@noble/hashes` on another, and back: each device may run whichever suits it. The tests compare the two
to each other byte for byte, and both to Argon2id's reference test vector.

A spec of your own works the same way, through either implementation:

```ts
import { Argon2idWebV1 } from 'safebyok/browser'
import { makeArgon2idWasmDeriver } from 'safebyok-fastkey'

const spec = { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 }
const keyDeriver = makeArgon2idWasmDeriver(spec)  // derives what makeArgon2idDeriver(spec) does
```

`makeArgon2idWasmDeriver` refuses with `bad_option` exactly the specs the core's factory refuses: a spec
Argon2id cannot run, or one that has a supplied spec's label but other parameters. It calls the
core's `parseKeyDeriverSpec` (from `safebyok/browser`), so its messages are the core's own.

## How fast

At `argon2id_web_v1` (64 MiB, three passes, one lane), in Node 24 on one development
machine: about 130 ms a derivation through WebAssembly, against about 580 ms through `@noble/hashes`. At 1 GiB, about
0.9 s against 3 s. A user waits for one derivation at each unlock, and one at each passphrase
change.

The derivation runs as one synchronous WebAssembly call: it blocks the thread for those 130 ms,
while the core's deriver takes longer but yields to the event loop as it runs. For a spec heavier than the
supplied one, consider running the vault's unlock where a pause does not show.

## Where it runs, and where it does not

* **Browsers, Node, Bun, and the frameworks on them**: anywhere WebAssembly runs, on Node 22 and
  up and evergreen browsers.
* **Not React Native.** Hermes has no WebAssembly; use the core's `argon2idWebV1Deriver` there, or a
  native Argon2 binding behind the same label (tested against it byte for byte).
* **A Content-Security-Policy** must allow WebAssembly to compile: `script-src 'self'
  'wasm-unsafe-eval'`. hash-wasm embeds its WebAssembly in its JavaScript, so nothing else is
  fetched.

Where WebAssembly is missing or will not compile, `deriveKeyBytes` refuses with `bad_option` (the
host's to fix), and its message says which. The vault keeps nothing of what a deriver throws,
because a throw may quote the passphrase: unlocking the vault (`ensureVault`, `ensureUnlocked`)
refuses `unexpected_error`, carrying neither the deriver's message nor its kind. Calling
`deriveKeyBytes` directly shows which. This package never falls back to the core's deriver on its
own: choose one per platform yourself, as `keyDeriver`.

## Errors

* `bad_option` -- from `makeArgon2idWasmDeriver(spec)`, for a spec it cannot run (the message names the
  field). From `deriveKeyBytes` called directly, when the platform has no WebAssembly, or when a
  Content-Security-Policy lacks `'wasm-unsafe-eval'` (the platform's `CompileError` is its `cause`).
  Through the vault, this arrives as `unexpected_error`, with no `cause`.
* `wrong_passphrase` -- from `deriveKeyBytes` called directly with an empty passphrase. Through the
  vault, this too arrives as `unexpected_error`.

Any other failure (a device without the memory a spec asks for, say) is thrown as the platform threw
it. Through the vault, it too arrives as `unexpected_error`, and what was thrown is kept nowhere.
