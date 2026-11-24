# The dream interface: forms

A pencil sketch of how a host's forms use the library: four kinds of form, three ways to submit one,
and the four React modalities in [the overview](../../docs/react-overview.md). The root, the stage and
reading a record are in [the plain-hooks guide](../../docs/guide-react_query.md) and are not repeated.
*Not built yet* at the foot says how far today's package is from this page.

## One shape for every form

Every form that carries a secret is run by a hook of the same shape. Learn one and you know them all.

```tsx
const unlock = useUnlock()            // and useBirth, useReplacePassphrase, useAddPasskey, useRevokePasskey
const save   = usePutBox('openai', { whisperOf, sidecarOf })

unlock.attempt(params)                // a FormData, or a plain object with the same fieldnames
unlock.isPending, unlock.error        // the hook is a TanStack mutation, and reads like one
unlock.formClearing()                 // an onReset handler: what the form keeps and what it empties
```

A secret travels in the form, never in anything React or TanStack retains. `attempt` takes it out of
the `FormData` before it first awaits.

Every callback on this page can be written inline. None needs `useCallback`: a hook reads its options
afresh on each render, as `useMutation` does.

## Three ways to submit

### Form Actions

A form Action hands `attempt` straight to the form. There is no handler to write, and the button knows
when it is pending.

```tsx
const birth = useBirth()
<form action={birth.attempt}>
  <PassphraseInput name="passphrase" />
  <SubmitButton>Create vault</SubmitButton>               {/* reads useFormStatus() */}
</form>
{birth.error && <p role="alert">{textOf(birth.error)}</p>} {/* a refusal is state, never a thrown error */}
```

Check the form's own fields before the Action starts, in `onSubmit`. Cancelling there costs the user
nothing they typed.

```tsx
function checkFields(event: FormEvent<HTMLFormElement>) {
  const fields = Fields.safeParse(textsOf(event.currentTarget))
  if (! fields.success) {
    showProblems(fields.error)
    event.preventDefault()
  }
}
<form action={save.attempt} onSubmit={checkFields}>
```

### Keeping what was typed: `formClearing`

React empties a form Action's fields after every outcome, a refusal included. `formClearing` keeps
them when the attempt was refused, so a typo does not cost a long passphrase or a key the provider
shows only once.

```tsx
// Stored: emptied. Refused or failed: kept.
<form action={birth.attempt} onReset={birth.formClearing()}>

// A settings form: nothing goes away.
<form action={save.attempt} onReset={save.formClearing({ ifSuccess: 'keep' })}>

// The host's own tidying, run whenever the form does empty.
<form action={birth.attempt} onReset={birth.formClearing({ onCleared: newPassphrase.forget })}>

formClearing({ ifSuccess = 'clear', ifRefused = 'keep', onCleared }?)
//   The user's own Reset or Cancel always empties the form, and calls onCleared.
//   A form with no onReset is React's default: emptied after every outcome.
```

### `onSubmit` forms

Where a form must not be an Action, it submits from a handler with the same call. The unlock form is
the one that must not: it opens beneath other work in progress, and has to show its own progress at once.

```tsx
const unlock = useUnlock()
function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  void unlock.attempt(new FormData(event.currentTarget))
}
<form method="post" onSubmit={handleSubmit}>
  <PassphraseInput name="passphrase" autoFocus />
  <button disabled={unlock.isPending}>{unlock.isPending ? 'Unlocking…' : 'Unlock'}</button>
</form>
//   React never resets this form: the text stays through a refusal with no help.
```

A handler's form that should empty once stored asks for its own reset, and `formClearing` decides as before.

```tsx
async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const form = event.currentTarget          // the event forgets it once the handler awaits
  await save.attempt(new FormData(form))
  form.reset()
}
<form onSubmit={handleSubmit} onReset={save.formClearing()}>
```

### No form at all

A passkey, a command palette, a test: hand `attempt` an object.

```tsx
async function unlockWithPasskey() {
  const passkeyAnswer = await askPasskey(passkeyHeader)
  await unlock.attempt({ passkeyAnswer })
}
<button type="button" onClick={unlockWithPasskey}>Unlock with a passkey</button>
```

## Four kinds of form

### A passphrase

Create the vault, unlock it, replace the passphrase, add or revoke a passkey. The field is masked, a
password manager can fill and save it, and the strength verdict the user sees is the one the library
enforces.

```tsx
const birth = useBirth()
const newPassphrase = useNewPassphrase()                  // the verdicts as the user types; React has them, never the text
<form action={birth.attempt} onReset={birth.formClearing({ onCleared: newPassphrase.forget })}>
  <input name="username" autoComplete="username" value={user.email} readOnly hidden />
  <PassphraseInput {...newPassphrase.field}        name="passphrase"   autoComplete="new-password" />
  <PassphraseInput {...newPassphrase.confirmField} name="confirmation" autoComplete="new-password" />
  <p>{newPassphrase.verdictText}</p>
  <SubmitButton disabled={! newPassphrase.isReady}>Create vault</SubmitButton>
</form>

// Or the kit, where its looks will do.
<CreateVaultForm /> <UnlockDialog /> <ReplacePassphraseForm /> <AddPasskeyForm /> <PasskeyUnlockButton />
```

### Committing a box

"Take this away and store it; my next steps are elsewhere." Adding an API key is the usual case. Once
stored the key is gone from the form and shows only masked. A refused save leaves everything in
place to correct.

```tsx
const save = usePutBox('openai', {
  whisperOf: (form) => ({ apiKey: String(form.get('apiKey')).trim() }),
  sidecarOf: (whisper, form) => ({ title: String(form.get('title')), mask: mask(whisper.apiKey) }),
})
<form action={save.attempt} onReset={save.formClearing()}>
  <input name="title" required />
  <WhisperInput name="apiKey" required />                 {/* uncontrolled, masked, with its own Show */}
  <SubmitButton>Save</SubmitButton>
</form>
{save.error && <p role="alert">{textOf(save.error)}</p>}
<WhisperMask labelpath="openai" field="apiKey" />         {/* …1234 once stored */}

// Testing the key before saving is a button, not a submit: the key stays in its field, and no variable has it.
const test = useMutation({
  mutationFn: () => checkKey(keyInput.current!.value),
})
<button type="button" onClick={() => { test.mutate() }}>Test</button>
```

### Editing a box

"Apply my change while I keep working." A settings table, an env editor. Nothing goes away when a
save lands, typing during a save is kept, and a secret is veiled until the user asks to see it.

```tsx
const draft = useDraft(labelpath)
//   { sidecarField, whisperField, eye, isDirty, isSaving, isBehind, error, put, discard, rebase }

<input {...draft.sidecarField('username')} />
{/* Veiled; shown while focused or while its eye is on; veiled again on blur. */}
<input {...draft.whisperField('password')} />
<button type="button" {...draft.eye('password')}><Eye /></button>
<button disabled={! draft.isDirty || draft.isSaving} onClick={draft.put}>Save</button>
<button disabled={! draft.isDirty} onClick={draft.discard}>Undo</button>
{draft.error && <p role="alert">{textOf(draft.error)}</p>}
{draft.isBehind && <button onClick={draft.rebase}>Changed on another device: load it</button>}

// Or no Save button: each field saves as the user leaves it, and only if it changed.
<input {...draft.whisperField('password', { putOnBlur: true })} />
```

### A form that uses a secret

The form's own fields are not secret; its work needs one. The key is read inside the call and goes
nowhere else. On a locked vault the call waits for the user to unlock, and the form keeps what was typed.

```tsx
const [prompt, setPrompt] = useState('')                  // not a secret: ordinary state
const ask = useMutation({
  mutationFn: (prompt: string) => vault.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt)),
})
function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  ask.mutate(prompt)
}
<form onSubmit={handleSubmit}>
  <textarea value={prompt} onChange={(event) => { setPrompt(event.target.value) }} />
  <button disabled={ask.isPending}>Ask</button>
</form>
<UnlockDialog />                                          {/* once, at the root: opens while a call waits */}
//   Dismissing the dialog rejects the call with `dismissed`. The prompt is still there.
```

## The four React modalities

The forms above are the same in every one. What changes is how a host reads a record and shows
progress.

### Plain hooks over React Query

Records are queries and form hooks are mutations, so `select`, `useQueries`, `useMutationState` and
the devtools work as they do for the host's own data. What they show of a form is `'[gating]'`, never
the secret.

```tsx
const { data: box } = useBox('openai')                    // or useQuery(vault.box('openai')), with the host's own select
<button disabled={save.isPending}>Save</button>           {/* isPending, error, reset: a mutation's own */}
void queryClient.invalidateQueries({ queryKey: vault.keys.under() })
```

### Suspense and Actions

Records suspend on their first fetch, forms are Actions, and no pending flag is threaded by hand.

```tsx
const box = useSuspenseBox('openai')
<form action={save.attempt} onReset={save.formClearing()}>
  …
  <SubmitButton whilePending="Saving…">Save</SubmitButton>
</form>

// A sidecar is not secret, so React may hold it.
const [shownTitle, showTitle] = useOptimistic(box.sidecar.title)
async function rename(form: FormData) {
  const title = String(form.get('title'))
  showTitle(title)
  await vault.putBoxOnce(labelpath, { sidecar: { ...box.sidecar, title } }, {})
}
<form action={rename}>
  <input name="title" defaultValue={shownTitle} />
</form>
```

### Next.js App Router

The vault runs in the browser. A Server Component renders these forms directly, and the server never
sees a passphrase or a key.

```tsx
// app/settings/page.tsx: a Server Component
export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <ApiKeyForm />
      <UnlockDialog />
    </>
  )
}

// components/api-key-form.tsx
'use client'
export function ApiKeyForm() {
  const save = usePutBox('openai', { whisperOf, sidecarOf })
  return (
    <form action={save.attempt} onReset={save.formClearing()}>
      …
    </form>
  )
}
//   save.attempt is a client Action. Never put 'use server' on a function that is handed a secret.
```

### Headless, and shadcn

The host's own `Input`, `Button` and `Dialog`. A field hook gives the props that keep a secret out of
React; the form hooks are unchanged.

```tsx
const field = usePassphraseField({ autoComplete: 'current-password' })
function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  void unlock.attempt(new FormData(event.currentTarget))
}
<form method="post" onSubmit={handleSubmit}>
  <Input name="passphrase" {...field.inputProps} />        {/* type, id, the handlers: never a value */}
  <Button type="button" variant="ghost" {...field.toggleProps}>
    {field.isRevealed ? <EyeOff /> : <Eye />}
  </Button>
  <Button type="submit" disabled={unlock.isPending}>Unlock</Button>
</form>
```

### With a form library

Register every field but the secret. The library validates and holds the rest; the secret stays in
its input.

```tsx
const { register, handleSubmit, reset } = useForm<{ title: string }>()
const formRef = useRef<HTMLFormElement>(null)

const onValid = handleSubmit(async () => {
  const form = formRef.current!
  await save.attempt(new FormData(form))
  form.reset()
})
const onReset = save.formClearing({ onCleared: () => { reset() } })

<form ref={formRef} onSubmit={onValid} onReset={onReset}>
  <input {...register('title', { required: true })} />
  <WhisperInput name="apiKey" />                          {/* not registered */}
</form>
```

## What each form keeps

| Outcome                                    | Passphrase | Committing a box | Editing a box  | A form that uses a secret |
| ------------------------------------------ | ---------- | ---------------- | -------------- | ------------------------- |
| Succeeded                                  | Emptied    | Emptied          | Kept           | The host's choice         |
| Refused, or failed                         | Kept       | Kept             | Kept           | Kept                      |
| The user cancels                           | Emptied    | Emptied          | Back to stored | The host's choice         |
| The user dismisses the unlock it asked for | —          | Kept             | Kept           | Kept                      |

The first two columns are `formClearing()` as it comes; the third is `useDraft`; the fourth is ordinary state.

## Not built yet

* `formClearing`. Today each form hook has `keepTextIfRefused(event, onEmptied?)`, which is
  `formClearing({ onCleared })` with no choices.
* `usePutBox`. Today a box is committed through `putBoxAction` under `useActionState`, which empties
  every field and hands the non-secret ones back as `texts` to restore by hand. On a locked vault it
  refuses, where this page has it wait for the user to unlock.
* `useDraft` for editing: `isSaving`, typing kept across a save, `sidecarField`, `eye`, `putOnBlur`.
  Today `put` discards the draft when it lands, a field shows its text only while focused, and the
  host binds sidecar fields and blur by hand.
* The field hooks (`usePassphraseField`, `useWhisperField`), `useSuspenseBox`, hooks imported by name,
  and `useVault()`: as the guides list.
