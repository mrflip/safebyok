# Guide: plain hooks over React Query

For a host that already uses TanStack Query: a provider, hooks imported by name, and records read
with `useQuery`. A pencil sketch of the target; *Not built yet* at the foot says how far the
package is from it. The other guides ([Suspense](guide-suspense.md), [Next.js](guide-nextjs.md),
[headless](guide-headless.md)) build on this one.

## Three rules

1. **React Query is the host's.** Every record hook is `useQuery` over a `queryOptions` factory, so
   `select`, `useQueries`, `invalidateQueries` and the devtools work as they do for any query.
2. **A secret never reaches anything React or TanStack retains**: not state, not a query's `data`, not
   a mutation's `variables`. A whisper is read inside a callback (`withWhisper`, a `mutationFn`) or
   typed into an uncontrolled input. A passphrase travels in the form's `FormData`, which the verb
   empties of it before it first awaits.
3. **One bank, labelled `'main'`.** No call names a bank. Each means the bank `'main'`: its keys are
   `['sok', userid, 'main', …]`, and its stored scope is `banklabel: 'main'`. A second bank, when
   there is one, wraps a subtree (`<BankScope banklabel="work">`) and changes no call written today.

## The root, the stage, the handle

```tsx
// One provider, inside the host's QueryClientProvider. Nothing is made at module scope.
<QueryClientProvider client={queryClient}>
  <SafebyokProvider userid={user?.id} vaultDB={vaultDB} keyDeriver={argon2idWebV1Deriver}>{children}</SafebyokProvider>
</QueryClientProvider>
//   A userid starts that user's device; null or undefined shows 'signed_out'. The config is read when the device starts.

const bank = useBank()                       // synchronous, never suspends, never null
switch (bank.stage) {                        // one field drives the screen
  case 'signed_out': return <Signin />
  case 'starting':   return <Spinner />
  case 'unborn':     return <CreateVault />  // nothing stored for this user yet
  case 'locked':                             // records show, sealed; a whisper needs the user
  case 'unlocked':   return <App />          // one component for both, so unlocking unmounts nothing
  case 'failed':     return <ErrorPanel err={bank.lastErr} />
}
const isLocked = useBank((b) => b.isLocked)  // with a selector: re-renders only when the pick changes

const vault = useVault()   // the calls and the query factories, for whoever is signed in. The same object until that changes.
```

## One API key

```tsx
const { data: box } = useBox('openai')   // the record, its whisper sealed; null: none stored; undefined: pending
const keyMask = useBox('openai', { select: (thing) => liveOf(thing)?.sidecar.mask }).data   // React Query's own options

// Using the key: it stays inside mutationFn. The prompt is the variable.
const ask = useMutation({ mutationFn: (prompt: string) => vault.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt)) })
//   On a locked bank, withWhisper waits for the unlock form: show it while useBank((b) => b.isUnlockWanted).

// Saving the key: putBoxMutationOptions pops it from the form before anything is awaited, and runs offline, so nothing TanStack retains contains it.
const save = useMutation(vault.putBoxMutationOptions('openai', {
  whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
  sidecarOf: (whisper) => ({ mask: mask(whisper.apiKey, { tail: 0 }) }),
}))
<form action={(form) => { save.mutate(form) }}><WhisperInput name="apiKey" /><button disabled={save.isPending}>Save</button></form>
//   A mutationFn of the host's own reads a secret with popField(form, 'apiKey'), which returns the field's text and deletes it.

// Unlocking: each gate verb is a plain async call that takes the form. It reads `passphrase` and deletes it at once.
// The unlock form submits from a handler, never as an Action: it may open beneath a pending Action (Suspense guide).
const unlock = useMutation({ mutationFn: vault.unlock })
<form onSubmit={(event) => { event.preventDefault(); unlock.mutate(new FormData(event.currentTarget)) }}>
  <PassphraseInput name="passphrase" /><button disabled={unlock.isPending}>Unlock</button>
</form>
{unlock.error && <p role="alert">{unlock.error.message}</p>}   // the refusal, never the passphrase
//   The same for vault.birth, vault.replacePassphrase (`passphrase`, `nextPassphrase`), vault.addPasskey, vault.revokePasskey.
```

## Doppler-lite: many secrets, each with settings

```tsx
const { data: labelpaths } = useBoxList()              // the boxes' labelpaths, deleted ones too; undefined until the first list; lists again only on evidence (a new box, `invalidateQueries`), never on focus or remount
labelpaths?.map((labelpath) => <Row key={labelpath} labelpath={labelpath} />)   // each Row's useBox redraws for its own box alone
const { data: boxes } = useBoxes()                     // every live record, sealed: for sorting, counts and "nothing here yet"

// The same, without a hook of ours.
const { data: box } = useQuery(vault.box(labelpath))
const titles = useQueries({ queries: labelpaths.map((lp) => vault.box(lp)), combine })
void queryClient.invalidateQueries({ queryKey: vault.keys.under() })

// Settings live in the sidecar, readable while locked. Writing them needs no secret in hand.
const rename = useMutation({ mutationFn: (title: string) => vault.putBoxOnce(labelpath, { sidecar: { ...box.sidecar, title } }, {}) })
const remove = useMutation({ mutationFn: () => vault.delBoxOnce(labelpath) })
//   By the time either resolves, every useBox showing that box shows what was written.

// An editor: the value's text stays in the input, and put() reads it from there.
const draft = useDraft(labelpath)   // { isDirty, isBehind, sidecar, setSidecar, whisperField, put, discard }
<input {...draft.whisperField('val')} />
```

## A password manager that never leaves the device

```tsx
// No backend and no sign-in: the vault is in this browser's IndexedDB, under one fixed userid.
<SafebyokProvider userid="local" vaultDB={idbVaultDB()} keyDeriver={argon2idWebV1Deriver}>

// Search runs over sidecars, so nothing is unsealed to search.
const hits = useBoxes({ select: (boxes) => boxes.filter((box) => matches(box.sidecar, search)) }).data

// Copy: the password goes from the callback to the clipboard, and nowhere else.
const copy = useMutation({ mutationFn: (labelpath: string) => vault.withWhisper(labelpath, ({ password }) => navigator.clipboard.writeText(password)) })

// A passkey: its answer is made inside mutationFn, so no variable has it.
const unlockByPasskey = useMutation({ mutationFn: async () => vault.unlock({ passkeyCleartext: await askPasskey(passkeyHeader) }) })
const passkeyHeader = useGate({ select: passkeyHeaderOf }).data   // null: the bank has no passkey
```

## Testing a host's components

```tsx
// The real thing over a memory vaultDB, no mocks. Each render has its own device, so no module is reset between tests.
render(
  <QueryClientProvider client={new QueryClient()}>
    <SafebyokProvider userid="u1" vaultDB={new MemoryVaultDB()} keyDeriver={testDeriver}><Settings /></SafebyokProvider>
  </QueryClientProvider>,
)
```

## Not built yet

Today's package has `reactGiver(config)` at module scope, `SOK.Provider`, and hooks as members
(`Knock.useBox`). Against this sketch:

* `SafebyokProvider` with the config as props, owning the device; hooks imported by name; `'main'` as the bank's label.
* `useVault()`, one handle for the calls and the factories (today: `Knock.*`, `Knock.boxQuery`, `SOK.useQueryOptions`).
* Gate verbs as calls that take the form (today: a hook for each verb, `Knock.useUnlock()`, whose `attempt` takes the form).
* `vault.putBoxMutationOptions`, the twin of the Suspense guide's `putBoxAction`, exists as `Knock.putBoxMutationOptions`.
* `useBoxes`; a `useBoxList` without deleted boxes (today: they stay listed, and their `useBox` answers null).
* `idbVaultDB`: no browser vaultDB is ported to the new core.
* Typed whispers: a schema for each labelpath, so `withWhisper`'s callback is typed.
