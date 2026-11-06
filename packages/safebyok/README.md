# safebyok

An end-to-end encrypted vault for API keys and other small secrets a user brings to a browser app.
Secrets are encrypted on the device, under keys that never leave it, and synchronized between
devices through a storage layer the host plugs in.

**This is a design in progress, and nothing has been released.** This package is the new design.
The old one is `safebyok-old`, private, which `safebyok-react`, the storage adapters and the demo
run on until they move here; its long README describes that design, not this one.

## What a host relies on

* **The backend holds ciphertext it cannot open.** It can read what is visible: labels, times and
  each box's sidecar, which are authenticated but never encrypted. Put no secret in a sidecar.
* **Nothing is recoverable, and removal is not revocation.** Nobody can open a vault whose
  passphrase is forgotten and which has no working passkey. A replaced passphrase or revoked passkey
  stops opening the vault, but the vaultKey never changes, so a copy of the old record still opens.
* **State is framework-agnostic.** `Bank`, `Vault`, `Box` and `vault.boxListing` each have
  `subscribe` and `getSnapshot`, detached, as `useSyncExternalStore` wants them. A snapshot is
  plain data, keeps its identity until something changes, and never holds a whisper.
* **The core speaks only to interfaces**: a `VaultDB` for what syncs, a `DeviceDB` for what stays
  on this device, and a `KeyDeriver`. Each adapter is its own package. The core uses no Node
  built-ins, so it runs wherever the host does.
* **The vaultDB is the ground truth, what this instance holds is a cache, and failure is a throw.**
  A refusal is a `VaultError` with a `refusalkind`. Primitive calls have no retries or abort
  controllers: add them where you need them. Most calls have a `try` form (`tryEnsureVault`)
  answering `{ ok, val, err }`.
* **Exports and stored vaults are contracts**, versioned by semver, but until 1.0.0 neither binds
  backward: no shims, no migrations. An older record that fails today's checks reads as absent or
  damaged, and the changeset says what a host will see.

## The cast

[VOCABULARY.md](../../VOCABULARY.md) has the only names for these. Its nouns hold, but some calls
it names are the old design's (`putWayin`, `getWhisper`): for calls, trust the types here.

* **whisper**: the secret, always a plain object of JSON, such as `{ apiKey: 'sk-...' }`. A **box**
  holds one, encrypted, with its `boxlabel` and sidecar.
* **vault**: one user's boxes, named by `applabel`, `user_id` and `vaultlabel`. Deleted and made
  anew, it is a new life: a new `vault_tok` and a new `Vault` instance.
* **bank**: a signed-in user's vaults and what they share. One per signed-in user.
* **wayin**: a way in: one passphrase, and at most one passkey. Together they are the **gate**.
* **gating**: one request for the user's passphrase or passkey, handed to the host's
  `requestCleartext`, the one place UI meets the vault.
* **lease**: what lets this device unlock again without asking, until `autolockMinutes` passes.

## A host

```ts
import { Bank } from 'safebyok'

const bank = Bank.make({
  applabel: 'acme', user_id: session.user_id,
  vaultDB, deviceDB, keyDeriver, strengthChecker, // none has an export yet: see below
  requestCleartext: async (gating) => {
    if (gating.gatingkind !== 'build_vault' && gating.gatingkind !== 'unlock_vault') { return }
    while (gating.isOpen) { // a wrong passphrase leaves it open
      const passphraseClear = await dialog.ask(gating.gatingkind)
      if (passphraseClear === null) { return } // returning with no attempt under way declines
      await gating.attempt({ passphraseClear })
    }
  },
})
await bank.hello()

const vault = await bank.ensureVault({ vaultlabel: 'main' }) // none yet: asks, build_vault
const box = await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-...' }, sidecar: { nickname: 'work' } })
const whisper = await box.extractWhisper() // hands it over, and keeps nothing

vault.lock()                 // every subscriber is told before this returns
await vault.ensureUnlocked() // no lease now: asks, unlock_vault
```

Easy to get wrong:

* With no `strengthChecker`, every new passphrase is refused `weak_passphrase`, so no vault builds.
* The core sets no timers. Call `bank.autolock()` after `hello` and on a timer of your own.
* `vault.hello()` lists a vault's boxes and starts their watch. Until then `vault.boxListing` is
  empty, and with no watch nothing from another device arrives until the next `vault.hello()`.
* To show a whisper, `box.expose()` holds it on `box.whisper`, a plain object of the box's to edit,
  until `box.unexpose()`. `box.veil()` and `box.unveil()` hide it and show it again. While it will
  not show, `box.whisper` answers a frozen bag, whose `Whispered` symbol says why: `'encrypted'`
  (not exposed), `'locked'` or `'veiled'`. A bag has no fields, and a put of one refuses. A lock
  keeps the whisper, so the unlock brings the same object back. `box.subscribe` hears of a lock too:

  ```tsx
  const { exposed, lockState } = useSyncExternalStore(box.subscribe, box.getSnapshot)
  if (lockState === 'locked') { return <button onClick={() => vault.ensureUnlocked()}>Unlock</button> }
  if (! exposed) { return <button onClick={() => box.expose()}>Show</button> }
  return <WhisperForm initial={box.whisper} onSave={(next) => box.put({ whisper: next })} />
  ```

  A script edits it in place, and `box.putExposed()` stores it:
  `await box.expose(); box.whisper.org = 'acme'; await box.putExposed()`.
* `bank.vacate()` is sign-out: it erases this device's leases and leaves the vaultDB alone.

## Not done yet

**A host outside this repo cannot make a `Bank` yet.** The `safebyok` entry point exports `Bank`,
`Box`, `Gating`, `Vault`, their snapshot types and `VaultError`, and `safebyok/testing` adds a cheap `testDeriver`
and an `anyStrengthChecker`. Nothing exports a `VaultDB`, a `DeviceDB`, a real key deriver or
strength checker; the only stores are in-memory ones the tests reach in for.

## Next

* [tests/models/proof.test.ts](tests/models/proof.test.ts): a host drives a bank's whole life,
  and every step asserts what its components render. This is the real usage guide.
* [notes/guarantees.md](../../notes/guarantees.md): where secret material lives.
* [CUSTOMIZATION.md](CUSTOMIZATION.md): choosing a strength checker.
