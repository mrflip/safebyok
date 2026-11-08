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
import { browserOpts } from 'safebyok/browser'

const bank = Bank.make({
  ...browserOpts({ dbName: 'acme' }), // keyDeriver, deviceDB and strengthChecker; a field after it wins
  applabel: 'acme', user_id: session.user_id,
  device_id: deviceId, // a crypto.randomUUID() you keep for this device
  vaultDB, // see below
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
  `browserOpts` supplies `zxcvbnStrengthChecker`, whose dictionary loads at `bank.hello()`.
* The core sets no timers. Call `bank.autolock()` after `hello` and on a timer of your own.
* `vault.hello()` lists a vault's boxes and starts their watch. Until then `vault.boxListing` is
  empty, and with no watch nothing from another device arrives until the next `vault.hello()`.
* `bank.vacate()` is sign-out: it erases this device's leases and leaves the vaultDB alone.
* **When the signed-in user changes, vacate the bank and make another.** A bank and everything it
  hands out keep the `user_id` they were made with for life; safebyok never moves them to a new
  one, and does not notice the change for you. On sign-out, or a sign-in as someone else, call
  `bank.vacate()`, then `Bank.make` for the new user.

## Showing a whisper

`box.expose()` holds a whisper on the box until `box.unexpose()`, a sweep, a vacate or a delete, and
`box.whisper` shows it. While it will not show, `box.whisper` answers a frozen bag with no fields,
and a put of one refuses. To learn why it hides, ask `box.exposure`: `'unexposed'`, `'locked'`,
`'veiled'` or `'showing'` (`useBoxExposure` in safebyok-react). `box.isShowing` and
`box.isVeiled` answer one question each, and `isWhisperedBag(val)` tells a bag from a whisper. Don't
compare `box.whisper` with a bag or read its mark: a second copy of safebyok has bags of its own.
`box.isVeiled` stays true behind a lock, where `box.exposure` is `'locked'`. A box's snapshot
carries `exposed` and `veiled`, and its vault's snapshot the `lockState`. `box.veil()` and
`box.unveil()` hide it and show it again, and `box.unexpose()` drops the veil with the whisper; a
lock hides it, and an unlock shows it again. `box.subscribe` hears of all of this. The lock is the vault's, on
`vault.getSnapshot()`, not the box's.

**A script.** Fetch the passphrase in `requestCleartext`, with a token the container already holds:

```ts
const bank = Bank.make({
  /* ... */
  requestCleartext: async (gating) => {
    await gating.attempt({ passphraseClear: await doppler.get('VAULT_PASSPHRASE') })
  },
})
await bank.hello()
const vault = await bank.ensureVault({ vaultlabel: 'main' })
await vault.hello()
const box = await vault.getBox('stripe')

await box.expose()
await stripe.charge({ ...box.whisper, amount: 100 })
box.whisper.org = 'acme'
await box.putExposed()

vault.lock()                 // box.whisper.apiKey is undefined
await vault.ensureUnlocked() // and it is back, edit included
```

Read it through `box.whisper` each time: a reference you kept outlives a lock.

**React that looks like React.** The hook needs no library code:

```tsx
function ApiKeyForm({ box }) {
  const whisper = useSyncExternalStore(box.subscribe, () => box.whisper)
  return (
    <>
      <input
        type="password" value={whisper.apiKey ?? ''} readOnly={! box.isShowing}
        onChange={(evt) => box.patchWhisper({ apiKey: evt.target.value })}
      />
      <button onClick={() => box.putExposed()}>Save</button>
    </>
  )
}
```

While it will not show, `box.whisper` is a bag with no fields, so the input is blank. Never replace
the prop or edit it in place here: `box.patchWhisper` makes the new object, and tells the hook. It
merges deeply, and an array replaces.

There are important considerations to building a form safely, and we have provided helpers to do so. See the
[safebyok-react README](../safebyok-react/README.md) for details and react version compatibility.

## Not done yet

**A host outside this repo cannot make a `Bank` yet.** The `safebyok` entry point exports `Bank`,
`Box`, `Gating`, `Vault`, their snapshot types and `VaultError`, `safebyok/dom` exports `BoxFields`, and
`safebyok/testing` adds a cheap `testDeriver` and an `anyStrengthChecker`. `safebyok/browser` exports the Argon2id derivers,
`idbDeviceDB`, the device store in IndexedDB, `zxcvbnStrengthChecker`, and `browserOpts`, the three in one bag. Nothing in
the core exports a `VaultDB`.

## Next

* [tests/models/proof.test.ts](tests/models/proof.test.ts): a host drives a bank's whole life,
  and every step asserts what its components render. This is the real usage guide.
* [notes/guarantees.md](../../notes/guarantees.md): where secret material lives.
* [CUSTOMIZATION.md](CUSTOMIZATION.md): choosing a strength checker.
