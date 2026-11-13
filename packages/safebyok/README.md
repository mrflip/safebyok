# safebyok

An end-to-end encrypted vault for API keys and other small secrets a user brings to a browser app.
Secrets are encrypted on the device, under keys that never leave it, and synchronized between
devices through a storage layer the host plugs in.

**This is a design in progress, and nothing has been released.**

## What a host relies on

* **The backend has ciphertext it cannot decrypt.** It can read labels and times, which are
  authenticated but never encrypted, and each box's sidecar, which is neither: the backend can read
  and change a sidecar, and the box still opens. Put no secret in a sidecar (*Whisper and sidecar*).
* **One unlock opens every vault of the bank.** A bank has one passphrase, and at most one passkey,
  for all its vaults. Once the user unlocks it on a device, every box of every vault in it can be
  unsealed there until the bank locks. Secrets that must be unlocked separately belong in separate
  banks, each under its own `banklabel`.
* **Nothing is recoverable, and removal is not revocation.** Nobody can unlock a bank whose
  passphrase is forgotten and which has no working passkey. A replaced passphrase or revoked passkey
  no longer unlocks the bank, but the bankKey never changes, so a copy of the old gate row can still
  be unlocked with the old passphrase or passkey. Deleting a vault deletes its boxes but no key:
  a copy of those boxes kept elsewhere still unseals under the bank's key. Only deleting the bank,
  with `bank.delPrompt()`, removes the stored copies of its key.
* **State is framework-agnostic.** `Device`, `Bank`, `Vault`, `Box`, the main gate
  (`bank.maingate`) and each listing (`bank.vaultListing`, `vault.boxListing`) have `subscribe` and
  `getSnapshot`, which can be passed on their own, the way `useSyncExternalStore` takes them. A
  snapshot is the same object until something changes, shows only its own thing's state (a
  listing's is its labels), and never contains a whisper. It is plain data, except for the device's
  `openGating`, which is the live gating your dialog calls.
* **The core speaks only to interfaces**: a `BankDB` for what syncs, a `DeviceDB` for what stays
  on this device, and a `KeyDeriver`. Each adapter is its own package. The core uses no Node
  built-ins, so it runs wherever the host does.
* **The bankDB is the ground truth, what this instance has is a cache, and a failed call throws.**
  A refusal is a `VaultError` with a `refusalkind`. Primitive calls have no retries or abort
  controllers: add them where you need them. Most calls have a `try` form (`tryEnsureVault`)
  that returns `{ ok, val, err }` instead of throwing.
* **Exports and stored vaults are contracts**, versioned by semver, but until 1.0.0 neither is kept
  backward compatible: no shims, no migrations. An older record that fails today's checks reads as
  absent or damaged, and the changeset says what a host will see.

## The cast

[VOCABULARY.md](../../VOCABULARY.md) has the only names for these. Where it names a call that the
types here do not have, trust the types.

* **whisper**: the secret, always a plain JSON object, such as `{ apiKey: 'sk-...' }`. A **box**
  contains one whisper, encrypted, along with its `boxlabel` and sidecar.
* **vault**: one user's boxes, named by `user_id`, `banklabel` and `vaultlabel`. A vault that is
  deleted and made again is a new life, with a new `vault_tok`; the `Vault` object for its scope
  stays the same, and moves to the new life. While deleted, it refuses a fetch or a call on its boxes as `vault_gone`.
* **device**: the signed-in user's presence on this browser. It holds your options and functions,
  and brings up the bank.
* **bank**: a signed-in user's vaults and what they share: one gate, one lease and one lock. One
  per signed-in user and `banklabel`. A bank deleted, or built again on another device, disables its
  `Bank` object; `device.ensureBank()` then returns another.
* **wayin**: one way into the bank: its passphrase or its passkey. A bank has one passphrase and at
  most one passkey; together they are its **gate**, `bank.maingate`.
* **gating**: one request for the user's passphrase or passkey, and the only place where UI meets
  the bank. It appears in the device's snapshot as `openGating`, and the device passes it to your
  `requestCleartext` if you gave one.
* **lease**: a grant that lets this device unlock the bank again without asking the user, until
  `autolockMinutes` have passed.

## Whisper and sidecar

A box keeps two JSON objects of your app's. The whisper is sealed: encrypted, and bound to the box's
labels, times and revision, so that a whisper altered or moved in storage refuses to open. The
sidecar is laid beside it, unsealed, so that your server may read it and change it. A field the
server should read but must not change unnoticed goes in both: the sidecar's copy for the server, the
whisper's for your app, which compares the two once the box is unsealed to see what changed.

| A field kept in       | Server-readable | Server-writable | Authenticated                      |
|-----------------------|-----------------|-----------------|------------------------------------|
| the whisper           | no              | no              | yes                                |
| both, copied          | yes             | up to you       | yes: compare to see what changed   |
| the sidecar           | yes             | yes             | no                                 |

## A host

```ts
import { Device } from 'safebyok'
import { browserOpts } from 'safebyok/browser'

const device = Device.make({
  ...browserOpts({ dbName: 'acme' }), // keyDeriver, deviceDB and strengthChecker; a field after it wins
  user_id: session.user_id, banklabel: 'acme',
  gates: ['main'], // the only gates accepted for now
  bankDB, // see below
  requestCleartext: async (gating) => {
    if (gating.gatingkind !== 'build_bank' && gating.gatingkind !== 'unlock_bank') { return }
    while (gating.isOpen) { // a wrong passphrase leaves it open
      const passphraseClear = await dialog.ask(gating.gatingkind)
      if (passphraseClear === null) { return } // returning with no attempt under way dismisses
      await gating.attempt({ passphraseClear })
    }
  },
})
const bank = await device.ensureBank() // asks the deviceDB for this device's row, then lists the vaults

const vault = await bank.ensureVault({ vaultlabel: 'main' }) // none yet: put in the bank just built, asking nobody
const box = await vault.putBox({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-...' }, sidecar: { nickname: 'work' } })
const whisper = await box.extractWhisper() // returns the whisper, and the box keeps no copy

bank.lock()                 // every subscriber is told before this returns
await bank.ensureUnlocked() // no lease now: asks, unlock_bank
```

**Rendering the dialog from the snapshot.** If you leave `requestCleartext` out, a gating calls
none of your functions. It stays open in `device.snapshot.openGating` until a call to its `attempt`
or `dismiss` concludes it. Render your dialog while `openGating` is not null. The device notifies its
subscribers when a gating opens and when it concludes (by the user's answer, a sweep or a vacate),
so the dialog closes by itself. A lock leaves the gating open.

```ts
const { openGating } = useSyncExternalStore(device.subscribe, device.getSnapshot)
// Render a dialog while openGating is not null. Its Cancel calls openGating.dismiss().
```

A passkey prompt needs a live user gesture: start it from the click handler of a button in your
dialog.

Easy to get wrong:

* With no `strengthChecker`, every new passphrase is refused as `weak_passphrase`, so no bank can
  be built. `browserOpts` supplies `zxcvbnStrengthChecker`, whose dictionary loads at `device.ensureBank()`.
* The core sets no timers. Call `bank.autolock()` after `ensureBank` and on a timer of your own.
* `vault.beginWatch()` lists a vault's boxes and starts watching them. Until you call it,
  `vault.boxListing` is empty and nothing is watched, so a change made on another device does not
  arrive until the next `vault.beginWatch()`.
* `device.vacate()` is sign-out. It disables the device and its bank, then removes this bank's
  cached leases and its device row from the deviceDB. It does not touch the bankDB, and it resolves
  once each removal has been tried. The next device's `ensureBank` for that user gets a new
  `device_tok`. Await it before the page unloads: a lease it could not remove is reported to your
  `onLifecycle` as `lease_revoke_failed`, and a `vacated` event follows once the removals have
  settled, with the number of leases left behind (`unrevoked`). If listing the leases is refused, or
  the device row cannot be removed, that is reported to your `onBadNews`.
* **A swept or vacated device cannot be used again.** From the moment you call `device.sweep()` or
  `device.vacate()`, `device.isEnabled` is permanently false, `device.bank` is null, `ensureBank`,
  `ensureVault` and `vaultAt` refuse with `disabled`, and the device stops calling your functions:
  the events and refusals it would have sent them go to `DefaultOnLifecycle` and `DefaultOnBadNews`
  instead. The only exception is a vacate's
  cleanup, which still reports what it could not remove to your `onLifecycle` and `onBadNews`.
* **A revoked identity vacates the device**, whatever your handlers do. When your storage adapter
  throws `identity_revoked`, the device is vacated, its snapshot shows that refusal, and your
  `onLifecycle` receives `vacated` with the refusal as its `cause`. Make another device once the user
  signs in again.
* **`onLifecycle` receives the device's lifecycle events.** Each is a `DeviceEvent`, distinguished by
  its `kind`: `helloed`, with the outcome of each `vault.beginWatch()` and of each `device.ensureBank()`
  until the bank is up; `lease_revoke_failed`, when a cached lease could not be removed, with
  `where` it happened and the bank, if there is one; and `vacated`. If you pass no `onLifecycle`,
  `DefaultOnLifecycle` handles them. For a lease that a lock or a vacate could not remove, it logs
  an error, reports it to the platform and vacates the device. It reports a vacate's cause the same
  way, unless the cause is `disabled`. It logs a warning for anything else that went wrong. Your own
  `onLifecycle` replaces that policy; to keep the default's policy as well, call it from yours:

  ```ts
  const onLifecycle: LifecycleHandler = (event) => {
    myTelemetry.lifecycle(event.kind)
    DefaultOnLifecycle(event)
  }
  ```
* **`onBadNews` receives the refusals that no caller is waiting on**, often several around one
  lifecycle event. If you pass none, `DefaultOnBadNews` logs a warning for each through the device's
  logger.
* **Only the device calls your `onBadNews`**: it has no `tellBadNews` method. To pass a refusal from
  your own code to a handler the way the device does, call `tellBadNewsTo(onBadNews, device, [err])`.
  It does not wait for the handler, and if the handler throws, the error is reported to the
  platform.
* **When the signed-in user changes, vacate the device and make another.** A device and everything
  it hands out keep the `user_id` they were made with for as long as they exist; safebyok never moves
  them to a new one, and does not notice the change for you. On sign-out, or a sign-in as someone
  else, call `device.vacate()`, then `Device.make` for the new user.

## Trying storage at startup

`await bank.tryProbe()` tries the whole storage path once: it replaces one box, `box1` in the
vault `home`, fetches it back and unseals it. A missing grant or a blocked database then shows up at
startup, not at the first `putBox`. It returns an `Outcome`. On success, its `val` says what each
step found and when, and contains no whisper, ciphertext or wrapped key. The probe asks the user
if the bank is locked, and makes the vault if it is absent. You can pass each label, the whisper and the sidecar.
`{ maxMillisSinceRefresh }`, 1000 by default, sets how fresh the vault and box must be, independently
of the device's own refresh settings. The probe leaves the box in place, and it counts toward the
vault's `maxBoxes`.

## Showing a whisper

`box.expose()` keeps a whisper on the box until `box.unexpose()`, a sweep, a vacate or a delete, and
`box.whisper` returns it. While the whisper is hidden, `box.whisper` returns a frozen bag with no
fields, and a put of that bag is refused. `box.exposure` says whether it is shown, and if not, why:
`'unexposed'`, `'locked'`, `'veiled'` or `'showing'` (`useBoxExposure` in safebyok-react). `box.isShowing` and
`box.isVeiled` are the two booleans, and `isWhisperedBag(val)` is true for one of those bags and
false for a whisper. Don't compare `box.whisper` with a bag or read its mark: a second copy of
safebyok has bags of its own. A veiled box stays veiled while its bank is locked: `box.isVeiled`
is still true, and `box.exposure` is `'locked'`. A box's snapshot has `isExposed`, `isVeiled`, and
`isLocked`, its bank's lock; a vault's snapshot has no lock of its own. `box.veil()` hides
the whisper and `box.unveil()` shows it again, and the veil is cleared when the whisper is removed.
A lock hides the whisper, and an unlock shows it again. `box.subscribe` notifies its listeners of
each of these changes.

**A script.** Fetch the passphrase in `requestCleartext`, with a token the container already has:

```ts
const device = Device.make({
  /* ... */
  requestCleartext: async (gating) => {
    await gating.attempt({ passphraseClear: await doppler.get('BANK_PASSPHRASE') })
  },
})
const bank = await device.ensureBank()
const vault = await bank.ensureVault({ vaultlabel: 'main' })
await vault.beginWatch()
const box = await vault.getBox('stripe')

await box.expose()
await stripe.charge({ ...box.whisper, amount: 100 })
box.whisper.org = 'acme'
await box.putExposed()

bank.lock()                 // box.whisper.apiKey is undefined
await bank.ensureUnlocked() // and it is back, edit included
```

Read the whisper through `box.whisper` each time: a reference you kept to the object still has the
secret after a lock.

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

While the whisper is hidden, `box.whisper` is a bag with no fields, so the input is blank. Never
replace the whisper object or edit it in place here: call `box.patchWhisper`, which makes the new
object and notifies the hook. It merges deeply, except that an array replaces the old one.

A form that edits a whisper safely takes more care than this. The
[safebyok-react README](../safebyok-react/README.md) has the helpers for it, and the React versions they support.

## Entry points

The `safebyok` entry point exports `Device`, `Bank`,
`Box`, `Vault`, the `Gating` type, their snapshot types and `VaultError`, `safebyok/dom` exports `BoxFields`, and
`safebyok/testing` adds a cheap `testDeriver` and an `anyStrengthChecker`. `safebyok/browser` exports the Argon2id derivers,
`idbDeviceDB`, the device database in IndexedDB, `zxcvbnStrengthChecker`, and `browserOpts`, which returns all three as one options object.
`safebyok/storage` is what a storage adapter is written against: `AdapterBankDB` and `MemoryBankDB`. `safebyok-indexeddb`, `safebyok-postgres`, `safebyok-convex`
and `safebyok-graphql` are the adapters.

## Next

* [tests/models/proof.test.ts](tests/models/proof.test.ts): a host takes a device and its bank through its whole
  lifecycle, and every step asserts what its components render. This is the real usage guide.
* [notes/guarantees.md](../../notes/guarantees.md): where secret material lives.
* [notes/configuration.md](../../notes/configuration.md): choosing a strength checker.
