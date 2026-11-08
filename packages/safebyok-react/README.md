# safebyok-react

React bindings for the safebyok vault: a provider, hooks, and dialogs. A full guide is coming.

## Building a form safely

If you hand a whisper to an `<input>` through React's `value` prop, React also writes it into the input's `value`
attribute, so that part of the whisper shows in `outerHTML` and in anything that serializes the page.

`BoxWhisperField` keeps the whisper out of React's hands. It fills the field in directly rather than through `value`,
and gives the field no `name`, so a form submitted the ordinary way sends nothing. It stays blank and read-only while
the whisper won't show. When the last field referencing part of the whisper unmounts(\*), the box unexposes.

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
        ? <button onClick={() => fields.trySave().then(showOutcome)}>Save</button>
        : <button onClick={() => box.expose().catch(showRefusal)}>Show</button>}
    </>
  )
}
```

The whisper reaches no prop or state of yours, so it is only in the page (and on the screen), where React's dev tools
do not list it. The field goes blank at a lock or a veil, and an edit comes back with the value. Nothing is stored
until `fields.save()`. Both buttons refuse while the vault is locked, so `showOutcome` and `showRefusal`, yours to
write, say so. `BoxFields.of` answers the same instance for a box wherever it is called. Outside React,
`const letGo = BoxFields.of(box).bind('apiKey')(el)` fills any element with a `value`, and `letGo()` lets it go.

(\*) When React takes the field off the page or hides it, which can be sooner than you'd expect. In development, React
also does this once right after the field first appears, so expose the box after its field mounts. The details, with
React's own documentation, are in [notes/expose_improves_security.md](https://github.com/mrflip/safebyok/blob/main/notes/expose_improves_security.md#what-minimize-the-surface-would-cost).

## Dialogs

`BankProvider` shows its own dialog for each gating the bank holds open: the dialog follows `openGating` in the bank's
snapshot, and closes when the gating settles, whether by the user's answer, a lock, a sweep or a vacate. Its passkey
button asks the passkey from the user's click on it, so a gating opened from a timer or a fetch shows the dialog all the
same, and the user's click supplies the gesture the browser needs.

Pass `requestCleartext` to use a dialog of your own: the provider then renders none. It is called with each gating, and
as last rendered, so an inline arrow is fine. Pass it from the first render, as whether the host's dialog asks is fixed
when the bank is made.

## Signing out

Call `bank.vacate()` when the user signs out, before you clear their `user_id`: it erases the bank's cached leases and
its bank row on this device, so the next person to use it starts fresh. `BankProvider` doesn't vacate when `user_id` turns `null`,
since auth may blink to `null` while it refreshes a token or reconnects, after a laptop wakes for instance. When a
different user signs in, it vacates the last user's bank itself.

Once a bank is vacated, by your sign-out or by a revoked identity, `useVault` answers `{ stage: 'spent', vault: null,
cause }` for each of its vaults, `cause` saying why the bank ended, and `useVaultSnapshot` answers null. Show a signed-out
state there rather than a spinner: the bank never becomes ready again.

## Hearing the bank

`BankProvider` takes `Bank.make`'s `onLifecycle` and `onBadNews`, and calls each as last rendered, so an inline arrow
is fine. `onLifecycle` hears each hello the provider and the hooks make, as a `helloed` event with its outcome, and the
other events of the bank's life. `onBadNews` hears the refusals no caller waits on, a failed unlock from
`VaultLockControl` among them. Leave either out for its default, described in the safebyok README.

## React version

safebyok-react needs React 19.2 or later, for `useEffectEvent`. `BoxFields` gives React a `ref` function that returns a cleanup. React 19 runs that
cleanup when the field leaves the page; React 18 ignores it. On React 18 the field is never let go, and the box never
unexposes.
