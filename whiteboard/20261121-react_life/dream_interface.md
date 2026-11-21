# The dream interface

## Three rules

1. **React Query is the host's, and every record hook is sugar over a `queryOptions` factory.** That is where the
   React Query ecosystem has gone (tRPC v11's `@trpc/tanstack-react-query`, `openapi-react-query`, TkDodo's
   *The Query Options API*). A host who knows `useQuery`, `useSuspenseQuery`, `useQueries`, loaders and
   `invalidateQueries` already knows how to read a box. What a hook adds beyond its factory is the binding to
   whoever is signed in. The QueryClient is the host's; where a host has none, the giver makes one.

   A host may override anything the giver supplies: the keys factory, every default setting, and the default
   `select`, which answers null for a tombstone or the shell. Nothing may depend on a default staying in place. A host
   who overrides `select` receives the whole record, a tombstone or the shell, each a documented type.
2. **A whisper never reaches anything React or TanStack keeps.** Not render state, not a query's `data`, not a
   mutation's `variables` (TanStack keeps those in its mutation cache for `gcTime`, and devtools show them), not
   `useActionState`'s state. A whisper lives in a callback while it runs (`withWhisper`, a revisor), in an
   uncontrolled DOM input (`WhisperInput` and `WhisperText`, from parts), and in a form's `FormData` while its action
   runs. React shows that `FormData` to the components inside the form (`useFormStatus().data`) until the action
   settles: an action that deletes the field once read, before it first awaits, leaves no render to see it. A
   passphrase or a passkey answer travels in a gating, which shows as `'[gating]'` wherever TanStack keeps it, and is
   zeroed once attempted.

   An error a host's own callback throws is the host's, and reaches `error` as thrown, stack and all. A host whose
   HTTP client puts the request's headers on its errors (axios does) removes them inside the callback.
3. **Freshness is told in TanStack's own words.** `isStale` means the minder has heard of a newer revision than
   `data` (its item is behind), `dataUpdatedAt` is when the minder heard of the record (not when the bridge copied
   it), `error` is the minder's refusal, `isFetching` means a newer record is on its way. A host never learns a word
   of ours to ask "is this current?".

```ts
// == Once, at module scope: the giver, before any user. Static config, and the current device once a userid arrives ==
export const SOK  = Safebyok.reactGiver({ banks: { acme: { vaultDB } }, keyDeriver: argon2idDeriver() })
// PascalCase, so the rules-of-hooks lint checks Acme.useBox() as a hook.
export const Acme = SOK.bank('acme')

// == Who is signed in: one provider, at the root, above the router and inside the host's QueryClientProvider ==
<SOK.Provider userid={user?.id}>{children}</SOK.Provider>
//   a userid starts that user's device; null or undefined changes nothing (auth libraries report no user for a moment);
//   a different userid ends the first user's device in memory, then starts the second
//   Its children never render against a device whose userid is not the prop's: they get `starting` in that same pass.

// == The security stage: synchronous, never suspends, never null ==
const bank = Acme.useBank()
switch (bank.stage) {                 // one field drives the screen
  case 'signed_out': return <SignIn />
  case 'starting': return <Spinner />
  case 'unborn':   return <CreateVault />         // no bank stored for this user yet
  case 'locked':   return <UnlockForm />          // records show, sealed; a whisper needs the user
  case 'unlocked': return <App endsAt={bank.leaseEndsAt} />
  case 'failed':   return <ErrorPanel err={bank.lastErr} />
}
//   A screen that calls withWhisper renders at 'locked' and at 'unlocked' alike, at one place in the tree: an unlock
//   from the dialog keeps it mounted, with the result its call was waiting on. One component per stage unmounts it.
const locked = Acme.useBank((b) => b.isLocked)    // with a selector: re-renders only when the pick changes
const wanted = Acme.useBank((b) => b.isUnlockWanted)   // a call is waiting on the user: show the unlock form, or Acme.dismissUnlock()
const { isWatching, heardAt } = Acme.useBank()    // whether the vaultDB's watch is live, for "offline: showing what we had"

// == A record: the host's React Query, over factories bound to the signed-in user ==
const sok = SOK.useQueryOptions()                 // re-renders on a user switch, so every key below changes with the user
const { data: box, isStale, isFetching, dataUpdatedAt, error } = useQuery(sok.acme.box('openai'))
//   data: the whole record, its whisper sealed; null: nothing stored, or deleted; undefined: pending
//   A record overtaken by a newer revision shows until the newer one arrives.
//   It renders at once from the minder's item where the minder has one (initialData), and fetches only where it has none.
?? const box = useSuspenseQuery(sok.acme.box('openai')).data          // suspends on the bank's start and the first get, never on a lock
const title = useQuery({ ...sok.acme.box('openai'), select: (b) => liveOf(b)?.sidecar.title }).data   // liveOf is the default select; re-renders only when the title changes
const box = use(useQuery(sok.acme.box('openai')).promise)          // React 19's way, TanStack's own stable promise, behind its `experimental_prefetchInRender` flag

// The same, as sugar: each is the line above with the factory bound for you.
const { data: box } = Acme.useBox('openai')
const box           = Acme.useSuspenseBox('openai')

// Outside render, reading whoever is signed in when called.
loader: () => queryClient.ensureQueryData(Acme.boxQuery('openai'))
onPointerEnter={() => queryClient.prefetchQuery(Acme.boxQuery('openai'))}
queryClient.invalidateQueries({ queryKey: Acme.keys.under('acme_api') })   // the minder's own key grammar, under 'sok'

// == Listings ==
const { data: labelpaths } = Acme.useBoxList('acme_api')   // its children's labelpaths, tombstones included: the same array until one joins
labelpaths?.map((labelpath) => <Row key={labelpath} labelpath={labelpath} />)   // each Row's Acme.useBox(labelpath) redraws for its own box alone
const { data: boxes } = Acme.useBoxes('acme_api')          // useQueries with combine over the listing: each child's record, structurally shared
const { data: some }  = useQueries({ queries: ['openai', 'anthropic'].map((lp) => sok.acme.box(lp)), combine })   // plain TanStack, no hook of ours

// == The whisper: inside a callback, and nowhere else ==
await Acme.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt))   // on a locked bank, waits for the unlock form
const ask = useMutation({                                                     // the whisper stays inside mutationFn: the prompt is the variable
  mutationFn: (prompt: string) => Acme.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt)),
})
// A query that needs the whisper to run, and whose answer is not secret: keyed under the box, so a new revision refetches it.
const { data: models } = useQuery(sok.acme.whisperQuery('openai', 'models', ({ apiKey }) => listModels(apiKey)))
<WhisperText labelpath="openai" field="apiKey" />          // from parts: revealing writes to the DOM, never to state

// == The gate: each form is a mutation, handed a gating, so a passphrase never reaches its variables ==
const unlock = Acme.useUnlock()
<form action={(fd) => unlock.mutate(unlock.gating({ passphraseCleartext: fd.get('passphrase') }))}><PassphraseInput name="passphrase" /></form>
// Its error is the refusal, never the passphrase. React empties the form after it runs. A withWhisper waiting on it resumes.
unlock.mutate(unlock.gating({ passkeyCleartext: await askPasskey() }))
const { verdict, judge } = SOK.useStrengthVerdict()      // beside a new passphrase's field: disable the submit until verdict.strong
birth.mutate(birth.gating({ passphraseCleartext }))
replacePassphrase.mutate(replacePassphrase.gating({ passphraseCleartext, nextPassphraseCleartext }))   // proved by either wayin
addPasskey.mutate(addPasskey.gating({ passphraseCleartext, nextPasskeyCleartext: await createPasskey() }))
revokePasskey.mutate(revokePasskey.gating({ passkeyCleartext: await askPasskey() }))
Acme.lock()

// == Writing ==
const [putState, putAction, isPutting] = useActionState(Acme.putBoxAction('openai', {
  whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
  sidecarOf: (whisper) => ({ mask: mask(whisper.apiKey, { tail: 0 }) }),
}), null)                                                  // made once: at module scope, or under useMemo
<form action={putAction}><WhisperInput name="apiKey" /><SubmitButton /></form>   // WhisperInput is from parts, uncontrolled; SubmitButton reads useFormStatus()

await Acme.putBox('counter', (stored) => ({ whisper: { n: (stored?.whisper.n ?? 0) + 1 } }))  // a revisor, run again on stale_write
await Acme.putBoxOnce('openai', { sidecar }, { whisper })                                   // one try; a labelpath or a scoped record names the box, and the write cites the newest revision the minder has heard of there
await Acme.delBoxOnce('openai')
// By the time any of these resolves, every useBox showing that box shows what was written.
// Never useMutation({ mutationFn: Acme.putBox }) with a whisper in its variables: see rule 2.

// == Drafts: the nested editor ==
const draft = Acme.useDraft('acme_api/prd/database_url')
// { isDirty, isBehind, base, sidecar, setSidecar, whisperField('val') → props for a plain <input>, put, discard, rebase }
<input {...draft.whisperField('val')} />   // the field's value stays in the DOM; put() reads it from there

// == Typed whispers ==
export const SOK = Safebyok.reactGiver({ banks: { acme: { vaultDB } }, keyDeriver, whispers: { openai: z.object({ apiKey: z.string() }) } })
await Acme.withWhisper('openai', ({ apiKey }) => …)        // typed; unsealing checks the shape, through Standard Schema

// == Testing a host's components ==
render(                                                    // the real giver over a memory vaultDB, no mocks: the provider overrides the giver's config for its mount
  <QueryClientProvider client={queryClient}>
    <SOK.Provider userid="u1" vaultDB={new MemoryVaultDB()} keyDeriver={TestDeriver}><Settings /></SOK.Provider>
  </QueryClientProvider>,
)
```
