# safebyok-fastkey

Argon2id through WebAssembly, as a [safebyok](../safebyok) key deriver: the same keyDeriverSpecs
and labels as the core's pure-JavaScript deriver, the same bytes out, about four times faster.

* `argon2idWasmWebV1Deriver` -- Argon2id at the supplied `Argon2idWebV1` spec, wearing its label,
  `argon2id_web_v1`. A stand-in for the core's `argon2idWebV1Deriver`.
* `argon2idWasmDeriver(spec)` -- Argon2id at a spec of your own, checked exactly as the core's
  `argon2idDeriver` checks it.

## Install

```sh
pnpm add safebyok safebyok-fastkey
```

`safebyok` is a peer dependency, so the deriver and your app share one copy (and one `VaultError`).
`hash-wasm` is this package's one dependency.

## Use

Pass the deriver as `keyDeriver`, after any `browserOpts()` spread, so it wins:

```ts
import { Vault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { argon2idWasmWebV1Deriver } from 'safebyok-fastkey'

const vault = Vault.make({ ...browserOpts(), keyDeriver: argon2idWasmWebV1Deriver, applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
```

A vault records only its deriver's label, and this deriver derives exactly what the core's does
under the same label. So a vault made through WebAssembly on one device opens through
`@noble/hashes` on another, and back: each device may run whichever suits it. The tests hold the two
to each other byte for byte, and both to Argon2id's reference test vector.

A spec of your own works the same way, through either implementation:

```ts
import { Argon2idWebV1 } from 'safebyok'
import { argon2idWasmDeriver } from 'safebyok-fastkey'

const spec = { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 }
const keyDeriver = argon2idWasmDeriver(spec)  // derives what argon2idDeriver(spec) does
```

It refuses (`bad_option`) what the core's factory refuses -- a spec Argon2id cannot run, or one
wearing a supplied spec's label without its parameters -- in the core's own words, since it calls
the core's `parseKeyDeriverSpec`.

## How fast

At `argon2id_web_v1` (64 MiB, three passes, one lane), in Node 24 on one development
machine: about 130 ms a derivation through WebAssembly, against about 580 ms through `@noble/hashes`. At 1 GiB, about
0.9 s against 3 s. A user waits for one derivation at each unlock, and one at each passphrase
change.

The derivation runs as one synchronous WebAssembly call: it holds the thread for its 130 ms, where
the core's deriver takes longer but yields to the event loop as it goes. For a spec heavier than the
supplied one, consider running the vault's unlock where a pause does not show.

## Where it runs, and where it does not

* **Browsers, Node, Bun, and the frameworks on them**: anywhere WebAssembly runs, on Node 22 and
  up and evergreen browsers (the floor is stated in the core's *Where it runs*).
* **Not React Native.** Hermes has no WebAssembly; use the core's `argon2idWebV1Deriver` there, or a
  native Argon2 binding behind the same label (tested against it byte for byte).
* **A Content-Security-Policy** must allow WebAssembly to compile: `script-src 'self'
  'wasm-unsafe-eval'`. hash-wasm embeds its WebAssembly in its JavaScript, so nothing else is
  fetched.

Where WebAssembly is missing or will not compile, `deriveKeyBytes` refuses with `bad_option` (the
host's to fix), saying which. The vault, having handed the deriver a passphrase, passes on no
deriver's misuse as its own: its `unlock()` refuses `unexpected_error`, the deriver's `bad_option`
its `cause` (which `safebyok-react` strips before React's error handlers hear it). It never falls
back to the core's deriver on its own: choose one per platform yourself, as `keyDeriver`.

## Errors

* `bad_option` -- from `argon2idWasmDeriver(spec)`, a spec it cannot run (the message names the
  field); from `deriveKeyBytes` called directly, no WebAssembly here, or a Content-Security-Policy
  without `'wasm-unsafe-eval'` (the platform's `CompileError` is its `cause`). Through the vault,
  this arrives as `unexpected_error`, the `bad_option` its `cause`.
* `wrong_passphrase` -- an empty passphrase handed straight to `deriveKeyBytes`. The vault refuses
  one before it reaches a deriver; should one reach it on unlock, the vault answers with its own
  `wrong_passphrase`, never the deriver's message.

Any other failure (a device without the memory a spec asks for, say) is thrown as the platform
raised it; through the vault, it too arrives as `unexpected_error`, what was thrown its `cause`.
