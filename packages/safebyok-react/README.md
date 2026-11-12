# safebyok-react

React bindings for the safebyok vault: a provider, hooks, and dialogs. A full guide is coming.

## Building a form safely

If you hand a whisper to an `<input>` through React's `value` prop, React also writes it into the input's `value`
attribute, so that part of the whisper shows in `outerHTML` and in anything that serializes the page.

`BoxWhisperField` keeps the whisper out of React's props and state. It fills the field in directly rather than
through `value`, and gives the field no `name`, so a form submitted the ordinary way sends nothing. It stays blank and
read-only while the whisper is hidden. When the last field referencing part of the whisper unmounts(\*), the box unexposes.

For a plain `<input>`, `BoxFields.of(box).bind('apiKey')` from `safebyok/dom` does the same: pass what it returns as
the input's `ref`.

```tsx
import { BoxFields } from 'safebyok/dom'

function ApiKeyField({ box }) {
  const fields = BoxFields.of(box)
  const { isExposed } = useSyncExternalStore(box.subscribe, box.getSnapshot)
  return (
    <>
      <input ref={fields.bind('apiKey')} type="password" autoComplete="off" spellCheck={false} />
      {isExposed
        ? <button onClick={() => fields.tryPut().then(showOutcome)}>Save</button>
        : <button onClick={() => box.expose().catch(showRefusal)}>Show</button>}
    </>
  )
}
```

The whisper reaches no prop or state of yours, so it is only in the page (and on the screen), where React's dev tools
do not list it. The field goes blank when the vault locks or the box is veiled, and comes back, with any unsaved edit,
when the whisper shows again. Nothing is stored until `fields.put()`. Both calls fail while the vault is locked, so
`showOutcome` and `showRefusal`, yours to write, should say so. `BoxFields.of` returns the same instance for a box
wherever it is called. Outside React, `const letGo = BoxFields.of(box).bind('apiKey')(el)` fills any element that has
a `value`, and `letGo()` unbinds it.

(\*) When React takes the field off the page or hides it, which can be sooner than you'd expect. In development, React
also does this once right after the field first appears, so expose the box after its field mounts. The details, with
React's own documentation, are in [notes/expose_improves_security.md](https://github.com/mrflip/safebyok/blob/main/notes/expose_improves_security.md#what-minimize-the-surface-would-cost).

## Dialogs

`BankProvider` shows its own dialog for each gating the device has open. The dialog follows `openGating` in the
device's snapshot (`useDeviceSnapshot()`), and closes when the gating concludes, whether by the user's answer, a sweep or a vacate. A lock leaves it
open. Its passkey button asks for the passkey from the user's click on it, so a gating opened from a timer or a fetch
still shows the dialog, and the user's click supplies the gesture the browser needs.

The dialogs are native `<dialog>` elements with the class `modal`, opened with `showModal()`, so the browser keeps the
focus inside and makes the page behind inert. Style the dimmed page with `.modal::backdrop`. jsdom has no `showModal` or
`close`, so a host's tests that show a dialog need a stand-in on `HTMLDialogElement.prototype`.

Pass `requestCleartext` to use a dialog of your own: the provider then renders none. The provider calls the function
from its latest render with each gating, so an inline arrow is fine. Pass it from the first render, because whether
your dialog or the provider's asks the user is fixed when the device is made. To show one of this package's modals from
your function, keep the gating in state until it concludes:
`setGating(gating); await gating.whenConcluded; setGating(null)`.

## Signing out

Call `useDevice()`'s `vacate()` when the user signs out, before you clear their `user_id`, whether or not its bank is up:
it forgets the bank's cached leases and its device row on this device, so the next person to use it starts fresh.
`BankProvider` doesn't vacate when `user_id` turns `null`, because auth may briefly report `null` while it refreshes a
token or reconnects, for instance after a laptop wakes. When a different user signs in, it vacates the last user's
device itself.

Once a device is vacated, by your sign-out or by a revoked identity, `useBank` returns null, `useDeviceSnapshot` shows
the stage `disabled` and why in its `err`, `useVault` returns `{ stage: 'spent', vault: null, cause }` for each of the
bank's vaults, where `cause` says why the device ended, and `useVaultSnapshot` returns null. Show a signed-out state
there rather than a spinner: the device never becomes ready again.

## Hearing the device

`BankProvider` takes `Device.make`'s `onLifecycle` and `onBadNews`, and calls each as last rendered, so an inline arrow
is fine. `onLifecycle` receives a `helloed` event, with its outcome, for each `ensureBank` and hello the provider and
the hooks make, and the device's other lifecycle events. `onBadNews` receives the refusals no caller is waiting on, including a failed
unlock from `VaultLockControl`. Leave either out for its default, described in the safebyok README.

## React version

safebyok-react needs React 19.2 or later, for `useEffectEvent`. `BoxFields`, from `safebyok/dom`, gives React a `ref` function that returns a cleanup. React 19 runs that
cleanup when the field leaves the page; React 18 ignores it. On React 18 the field is never let go, and the box never
unexposes.
