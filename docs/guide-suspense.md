# Guide: Suspense and Actions

For a host that writes React 19 the way React's own docs do: data that suspends, forms that are
Actions, and no `isPending` flags threaded by hand. It adds to the
[plain-hooks guide](guide-react_query.md): the root, the stage, `useVault()` and the three rules are
as there. A pencil sketch; *Not built yet* is at the foot.

## Where things suspend, and where they never do

* **The stage never suspends.** `useWorld()` is synchronous at every stage. The screen's first
  branch (signed out, starting, create, the app) is a `switch`, never a fallback.
* **A record suspends on its first fetch**, and never after: not on a lock, nor on a newer revision.
  A record overtaken shows until the newer one arrives; a box deleted and written anew elsewhere
  shows as deleted (`null`) until this device has the new box whole.
* **Render suspending hooks under the stage switch**, at `'locked'` or `'unlocked'`. Above it there
  is no bank to read, and the hook throws `absent_vault` to the nearest error boundary.
* **A refusal the user can mend is state, not an exception.** A wrong passphrase is the unlock
  mutation's `error`, a refused write the Action's result. Only a broken state reaches an error boundary.
* **Unlocking is never an Action.** The unlock form opens beneath a caller that may itself be a
  pending Action (`await vault.withWhisper(…)` inside one), and React batches every transition in
  progress: an Action there could show nothing until its caller finished. It submits from a plain
  handler, and shows pending from ordinary state. The other gate verbs may be Actions: no call waits on them.
* **No transition smooths a stage change.** The stage comes through `useSyncExternalStore`, whose
  updates are never transitions, so unlocking that reveals a suspending subtree shows its fallback.
  Place the boundary low.

```tsx
case 'locked':
case 'unlocked': return <ErrorBoundary fallback={<Trouble />}><Suspense fallback={<Skeleton />}><App /></Suspense></ErrorBoundary>
```

## One API key

```tsx
const box = useSuspenseBox('openai')     // the record, its whisper sealed, or null for none stored: never undefined

// Using the key: an Action. The transition leaves the old joke on screen while the new one is on its way.
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
//   Every field is deleted from the form. Name the secret ones (`secretFieldnames: ['apiKey']`) and only those are:
//   a refusal then resolves the others' text as `saved.texts`, to put back with `defaultValue`.

// Unlocking: the kit's <UnlockDialog /> at the root, or a form of the host's own as a mutation, whose updates are ordinary ones.
const unlock = useMutation({ mutationFn: vault.unlock })   // reads `passphrase` and deletes it before it first awaits
<form onSubmit={(event) => { event.preventDefault(); unlock.mutate(new FormData(event.currentTarget)) }}>
  <PassphraseInput name="passphrase" /><button disabled={unlock.isPending}>{unlock.isPending ? 'Unlocking…' : 'Unlock'}</button>
</form>
{unlock.error && <p role="alert">{unlock.error.message}</p>}
```

## Doppler-lite: many secrets, each with settings

```tsx
// One boundary for the list, one for each row: a row's first fetch shows its own skeleton, not the page's.
const labelpaths = useSuspenseBoxList()
labelpaths.map((labelpath) => <Suspense key={labelpath} fallback={<RowSkeleton />}><Row labelpath={labelpath} /></Suspense>)
const boxes = useSuspenseBoxes()                         // or all of them at once, behind one boundary

// The same, without a hook of ours.
const { data: box } = useSuspenseQuery(vault.suspenseBox(labelpath))
const box = use(useQuery(vault.box(labelpath)).promise)  // an option, behind TanStack's experimental `experimental_prefetchInRender` flag; nothing of ours depends on it

// A rename shows at once, and settles to what was stored. A sidecar is not secret, so React may retain it.
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
// actionOf makes any gate verb but unlock an Action that never throws a refusal, and resolves it instead.
const newPassphrase = useNewPassphrase()                 // the verdicts as the user types; React has them, never the text
const [refusal, birthAction] = useActionState(actionOf(vault.birth), null)
<form action={birthAction}>
  <PassphraseInput {...newPassphrase.field} name="passphrase" />
  <PassphraseInput {...newPassphrase.confirmField} name="confirmation" />
  <SubmitButton disabled={! newPassphrase.isReady}>Create vault</SubmitButton>
</form>

// A passkey: not an Action either. The kit's <PasskeyUnlockButton />, or the ceremony inside a mutationFn, started by the press.
const unlockByPasskey = useMutation({ mutationFn: async () => vault.unlock({ passkeyCleartext: await askPasskey(passkeyHeader) }) })
<button type="button" disabled={unlockByPasskey.isPending} onClick={() => { unlockByPasskey.mutate() }}>Unlock with a passkey</button>
```

## Not built yet

* `useSuspenseBox`, `useSuspenseBoxList`, `useSuspenseBoxes`, and `vault.suspenseBox`. Today a box's
  query is skipped (`skipToken`) until the device's sign-in answers, which `useSuspenseQuery` does not
  accept: the suspending factory refuses `absent_vault` instead.
* `actionOf(verb)`. Today each gate verb's hook has an `attempt` that takes the form, to hand a
  form's `action`.
* `vault.putBoxAction` exists as `Knock.putBoxAction`.
* `useNewPassphrase()` exists in the kit, and takes the giver as an argument.
