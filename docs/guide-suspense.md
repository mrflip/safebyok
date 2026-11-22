# Guide: Suspense and Actions

For a host that writes React 19 the way React's own docs do: data that suspends, forms that are
Actions, and no `isPending` flags threaded by hand. It adds to the
[plain-hooks guide](guide-react_query.md): the root, the stage, `useVault()` and the three rules are
as there. A pencil sketch; *Not built yet* is at the foot.

## Where things suspend, and where they never do

* **The stage never suspends.** `useBank()` is synchronous at every stage. The screen's first
  branch (signed out, starting, create, the app) is a `switch`, never a fallback.
* **A record suspends on its first fetch only**, never on a lock and never on a newer revision: a
  record overtaken shows until the newer one arrives.
* **Render suspending hooks under the stage switch**, at `'locked'` or `'unlocked'`. Above it there
  is no bank to read, and the hook throws `absent_vault` to the nearest error boundary.
* **A refusal the user can mend is state, not an exception.** A wrong passphrase comes back from the
  action as its result. Only a broken state reaches an error boundary.

```tsx
case 'locked':
case 'unlocked': return <ErrorBoundary fallback={<Trouble />}><Suspense fallback={<Skeleton />}><App /></Suspense></ErrorBoundary>
```

## One API key

```tsx
const box = useSuspenseBox('openai')     // the record, its whisper sealed, or null for none stored: never undefined

// Using the key: an Action. The transition keeps the old joke on screen while the new one is on its way.
const [joke, setJoke] = useState<string | null>(null)      // the answer is not secret; the key never leaves the callback
const [isAsking, startAsking] = useTransition()
<form action={(form) => startAsking(async () => {
  const line = String(form.get('line'))
  setJoke(await vault.withWhisper('openai', ({ apiKey }) => tellJoke(apiKey, line)))
})}>

// Saving the key: an Action that empties the form of the key before it writes, and resolves the box or the refusal.
const [saved, saveAction] = useActionState(vault.putBoxAction('openai', {
  whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
  sidecarOf: (whisper) => ({ mask: mask(whisper.apiKey, { tail: 0 }) }),
}), null)
<form action={saveAction}><WhisperInput name="apiKey" /><SubmitButton>Save</SubmitButton></form>   // SubmitButton reads useFormStatus()
{saved?.err && <p role="alert">{saved.err.message}</p>}

// Unlocking: actionOf makes any gate verb an Action that never throws a refusal, and resolves it instead.
const [refusal, unlockAction] = useActionState(actionOf(vault.unlock), null)
<form action={unlockAction}><PassphraseInput name="passphrase" /><SubmitButton whilePending="Unlocking…">Unlock</SubmitButton></form>
{refusal && <p role="alert">{refusal.message}</p>}
//   React empties the form after the action. The passphrase left its FormData before unlock first awaited.
```

## Doppler-lite: many secrets, each with settings

```tsx
// One boundary for the list, one for each row: a row's first fetch shows its own skeleton, not the page's.
const labelpaths = useSuspenseBoxList()
labelpaths.map((labelpath) => <Suspense key={labelpath} fallback={<RowSkeleton />}><Row labelpath={labelpath} /></Suspense>)
const boxes = useSuspenseBoxes()                         // or all of them at once, behind one boundary

// The same, without a hook of ours.
const { data: box } = useSuspenseQuery(vault.suspenseBox(labelpath))
const box = use(useQuery(vault.box(labelpath)).promise)  // behind TanStack's `experimental_prefetchInRender` flag

// A rename shows at once, and settles to what was stored. A sidecar is not secret, so React may hold it.
const [shownTitle, showTitle] = useOptimistic(box.sidecar.title)
<form action={async (form) => {
  const title = String(form.get('title'))
  showTitle(title)
  await vault.putBoxOnce(labelpath, { sidecar: { ...box.sidecar, title } }, {})
}}>

// A list that filters as the user types stays responsive: the filter is deferred, the records are already in hand.
const deferredSearch = useDeferredValue(search)
```

## A password manager that never leaves the device

```tsx
// Copy is an Action on a button: pending while the unlock form is up, done once the clipboard has the password.
<form action={async () => { await vault.withWhisper(labelpath, ({ password }) => navigator.clipboard.writeText(password)) }}>
  <SubmitButton whilePending="Unlocking…">Copy</SubmitButton>
</form>
//   A dismissed unlock form rejects `dismissed`: catch it in the action, since a rejection reaches the error boundary.

// Create the vault: the new passphrase and its confirmation, a strength verdict beside them, and one Action.
const newPassphrase = useNewPassphrase()                 // the verdicts as the user types; React keeps them, never the text
const [refusal, birthAction] = useActionState(actionOf(vault.birth), null)
<form action={birthAction}>
  <PassphraseInput {...newPassphrase.field} name="passphrase" />
  <PassphraseInput {...newPassphrase.confirmField} name="confirmation" />
  <SubmitButton disabled={! newPassphrase.isReady}>Create vault</SubmitButton>
</form>

// A passkey: the ceremony runs inside the Action, started by the press that submitted it.
<form action={async () => { await vault.unlock({ passkeyCleartext: await askPasskey(passkeyHeader) }) }}>
```

## Not built yet

* `useSuspenseBox`, `useSuspenseBoxList`, `useSuspenseBoxes`, and `vault.suspenseBox`. Today a box's
  query is skipped (`skipToken`) until the bank is brought up, which `useSuspenseQuery` does not
  accept: the suspending factory refuses `absent_vault` instead.
* `actionOf(verb)`, and gate verbs that take the form. Today the kit has a private `formActionOf`
  over a mutation and a gating.
* `vault.putBoxAction` exists as `Knock.putBoxAction`. Its result's `err` is `unknown`, so a host
  casts it to show its message.
* `useNewPassphrase()` exists in the kit, and takes the giver as an argument.
