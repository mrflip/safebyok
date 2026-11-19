# The dream interface, second pass (2026-11-19)

What a professional React developer would want to write against safebyok, brought up to date from
`whiteboard/20261116-react_backwards/dream-hooks.ts.md` to match the current plan: a core `Vault` for record-level
verbs, a Snapper for snapshots, and a Giver for React and React Query. Where each verb lives is **not** settled
here, and nothing below argues for one surface over another: `SOK` (the Device's giver) and `Acme` (one bank's)
are placeholders for wherever the verb lands. Each section's notes say which layer the verb needs.

The questions for the Coach are at the end. The verbs follow three rules, which come first.

## Three rules

1. **React Query is the host's, and every record hook is sugar over a `queryOptions` factory.** That is where the
   React Query ecosystem has gone (tRPC v11's `@trpc/tanstack-react-query`, `openapi-react-query`, TkDodo's
   *The Query Options API*). A host who knows `useQuery`, `useSuspenseQuery`, `useQueries`, loaders and
   `invalidateQueries` already knows how to read a box. What a hook adds beyond its factory is the binding to
   whoever is signed in. The QueryClient is the host's; where a host has none, the giver makes one.

   **Design note, pinned (the Coach, 2026-11-19):** a host may override anything the giver supplies: the keys
   factory, every default setting, and the default `select`, which picks the car's `fullest`. Nothing may depend
   on a default staying in place. A host who overrides `select` receives the car, a documented type.
2. **A whisper never reaches anything React or TanStack keeps.** Not render state, not a query's `data`, not a
   mutation's `variables` (TanStack keeps those in its mutation cache for `gcTime`, and devtools show them), not
   `useActionState`'s state. A whisper lives in a callback while it runs (`withWhisper`, a revisor), in a DOM input
   (`WhisperInput`, `WhisperText`), and in `FormData` inside an action.
3. **Freshness is told in TanStack's own words.** `isStale` means the vaultDB has a newer revision than `data` (a
   `behind` car), `dataUpdatedAt` is when the minder heard of the record (not when the bridge copied it), `error` is
   the minder's refusal, `isFetching` means a newer record is on its way. A host never learns a word of ours to
   ask "is this current?".

```ts
// == Once, at module scope, beside the Device and the host's QueryClient ==
export const device      = Device.make({ banks: { acme: { vaultDB } }, keyDeriver: argon2idDeriver() })
export const queryClient = new QueryClient()
// Bridged from here on: a route loader that runs before anything renders still sees the minded cars.
export const SOK  = Safebyok.reactGiver(device, { queryClient })
// PascalCase, so the rules-of-hooks lint checks Acme.useBox() as a hook.
export const Acme = SOK.bank('acme')
// Where the host makes its QueryClient inside React (Next.js App Router, per request), it bridges there instead:
SOK.useBridge()                                       // inside the QueryClientProvider

// == Who is signed in: once, at the root ==
SOK.useSignIn(user?.id ?? null)       // in a layout effect, so no frame paints the old user; a new userid ends the old user's banks first
                                      // null does not vacate: auth libraries report no user for a moment while they refresh a token
await device.vacate()                 // sign-out is explicit, in the host's own handler

// == The security stage: synchronous, never suspends, never null ==
const bank = Acme.useBank()
switch (bank.stage) {                 // one field drives the screen
  case 'signed_out': case 'starting': return <Spinner />
  case 'unborn':   return <CreateVault />         // no bank stored for this user yet
  case 'locked':   return <UnlockForm />          // records show, sealed; a whisper needs the user
  case 'unlocked': return <App endsAt={bank.leaseEndsAt} />
  case 'ended':    return <SignedOutNotice why={bank.endCause} />   // swept or vacated: this bank object is done
  case 'failed':   return <ErrorPanel err={bank.lastErr} />
}
const locked = Acme.useBank((b) => b.isLocked)    // with a selector: re-renders only when the pick changes
const gating = SOK.useGating()                    // the gating open now, or null: { gatingkind, banklabel, isAttempting, lastRefusal }
const { isWatching, heardAt } = Acme.useBank()    // whether the vaultDB's watch is live, for "offline: showing what we had"

// == A record: the host's React Query, over factories bound to the signed-in user ==
const sok = SOK.useQueryOptions()                 // re-renders on a user switch, so every key below changes with the user
const { data: box, isStale, isFetching, dataUpdatedAt, error } = useQuery(sok.acme.box('openai'))
//   data: the fullest record, its whisper sealed; null: nothing stored, or deleted; undefined: pending
//   It renders at once from the minder's car where the minder has one (initialData), and fetches only where it has none.
const box = useSuspenseQuery(sok.acme.box('openai')).data          // suspends on the bank's start and the first get, never on a lock
const title = useQuery({ ...sok.acme.box('openai'), select: (b) => b?.sidecar.title }).data   // re-renders only when the title changes
const box = use(useQuery(sok.acme.box('openai')).promise)          // React 19's way, TanStack's own stable promise
const car = useQuery(sok.acme.boxCar('openai')).data               // the whole car, newest beside fullest: for a host that writes against the newest

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
const { data: boxes } = Acme.useBoxes('acme_api')          // useQueries with combine over the listing: each child's fullest, structurally shared
const { data: some }  = useQueries({ queries: ['openai', 'anthropic'].map((lp) => sok.acme.box(lp)), combine })   // plain TanStack, no hook of ours

// == The whisper: inside a callback, and nowhere else ==
await Acme.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt))   // unlocks first if locked, joining an unlock already asked for
const ask = useMutation({                                                     // the whisper stays inside mutationFn: the prompt is the variable
  mutationFn: (prompt: string) => Acme.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt)),
})
// A query that needs the whisper to run, and whose answer is not secret: keyed under the box, so a new revision refetches it.
const { data: models } = useQuery(sok.acme.whisperQuery('openai', 'models', ({ apiKey }) => listModels(apiKey)))
<WhisperText labelpath="openai" field="apiKey" />          // revealing writes to the DOM, never to state

// == Unlocking and locking: plain React 19 actions, so a passphrase travels in FormData ==
const [unlockState, unlockAction, isUnlocking] = useActionState(Acme.unlockAction, null)
<form action={unlockAction}><PassphraseInput name="passphrase" /></form>
// It answers the unlock gating that is open, if any (a withWhisper waiting on it resumes), and otherwise unlocks
// directly. Its state is { ok } or { ok: false, refusal }, never the passphrase. React empties the form after it runs.
<GatingDialogs />                                          // the kit draws whatever gating a call opened, wherever the host puts it
Acme.lock()

// == Writing ==
const [putState, putAction, isPutting] = useActionState(Acme.putBoxAction('openai', {
  whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
  sidecarOf: (whisper) => ({ mask: mask(whisper.apiKey) }),
}), null)                                                  // made once: at module scope, or under useMemo
<form action={putAction}><WhisperInput name="apiKey" /><SubmitButton /></form>   // SubmitButton reads useFormStatus()

await Acme.putBox('counter', (stored) => ({ whisper: { n: (stored?.whisper.n ?? 0) + 1 } }))  // a revisor, run again on stale_write
await Acme.putBoxOnce(car.newest, { sidecar }, { whisper })                                 // one try, citing what it is handed
await Acme.delBox('openai')
// By the time any of these resolves, every useBox showing that box shows what was written.
// Never useMutation({ mutationFn: Acme.putBox }) with a whisper in its variables: see rule 2.

// == Drafts: the nested editor ==
const draft = Acme.useDraft('acme_api/prd/database_url')
// { isDirty, isBehind, base, sidecar, setSidecar, whisperField('val') → props for WhisperInput, put, discard, rebase }, all stable
<input {...draft.whisperField('val')} />   // the field's value stays in the DOM; put() reads it from there

// == Typed whispers (a question below) ==
export const SOK = Safebyok.reactGiver(device, { queryClient, whispers: { openai: z.object({ apiKey: z.string() }) } })
await Acme.withWhisper('openai', ({ apiKey }) => …)        // typed; unsealing checks the shape, through Standard Schema

// == Testing a host's components ==
const device = Device.make({ banks: { acme: { vaultDB: new MemoryVaultDB() } }, keyDeriver: TestDeriver })
render(<QueryClientProvider client={queryClient}><Settings /></QueryClientProvider>)   // the real giver over a memory vaultDB, no mocks
```

## Notes, by section

**Module scope.** Bridging at module scope lets a loader read minded cars before the first render, so the bridge's
catch-up becomes the exception (a client made inside React). The giver holds the host's client, never one of its
own: `dream-hooks.ts.md`'s `SOK.queryClient` is gone.

**The security stage** comes from the Snapper (the Bank's lock, unlock and sweep; the Device's gating; the minder's
bank and main gate cars). It replaces `{ stage: 'ready', isLocked }` with one `stage` that a `switch` narrows,
`isLocked` kept beside it, true at every stage but `unlocked`, so a host that reads only `isLocked` fails safe. A
selector runs through `useSyncExternalStoreWithSelector` (React's own `use-sync-external-store`, as Redux and
Zustand use it), so a selector that builds an object can take an equality function rather than loop.

**Records.** The host's entry for a box sits under the minder's own key with `'sok'` at its head. Its factory sets
what the bridge needs and leaves the rest to the host:

* `queryFn` waits on the bank object, then asks the minder: cheap when the minder's car is timely.
* `initialData` and `initialDataUpdatedAt` from the minder's car, where it has one with a record to show. That is
  TanStack's "seed from another cache" pattern, and it makes `dream-hooks.ts.md`'s `usePeekBox` unnecessary.
* `staleTime` as a function, `Infinity` unless the car is `behind` or `bare`, then 0: what the minder already does
  for its own cache. A behind car is stale because of what it is, not because the bridge remembered to invalidate it.
* `structuralSharing` with the minder's own merge (`bestCarOf`), so a late, older answer can never replace a newer
  car in the host's entry. That retires the race of internals.md's open matter 8, rather than documenting it.
* `networkMode: 'always'`. The host's entry asks the minder, not the network, and the minder answers from its cache
  offline. Under TanStack's default, `'online'`, the host's entry would pause offline even with the car in hand.

`dream-hooks.ts.md`'s `boxPromise` (internals.md F14, stable promises) is TanStack's `promise` on a query result,
and needs nothing of ours. Its `useBoxesAt` is plain `useQueries` and goes.

**Listings.** A listing is labelpaths, so a list renders one row per labelpath and each row reads its own box.
That is the normalized pattern React Query recommends, and a memoized row redraws for its own box alone.
`useBoxes` is for a table that sorts or filters on sidecars. A child known only from a list is sparse, so it has no
sidecar until its whole record arrives: a placeholder can show the label and `written_at`, little more, until the
pouch (internals.md, open matter 14).

**The whisper.** `withWhisper` is core, not giver: a script wants it too. In React it needs no hook of its own: it
goes inside a `mutationFn` or a `queryFn`. `whisperQuery` is new: the commonest use of a stored API key, after
calling with it, is to show something derived from it ("valid", "the models this key can use"). Keying it under the
box's key means the bridge's change to the box invalidates it by prefix, with nothing more to keep in step.

**Unlocking and writing.** `dream-hooks.ts.md`'s `useUnlockAction` and `usePutBoxAction` become plain action
functions for React's own `useActionState`: one fewer API to learn, and they compose with `useFormStatus`,
`useTransition` and `startTransition` as any action does. The action reads `FormData` and keeps it out of what it
returns. React resets an uncontrolled form after its action succeeds, which empties a secret field for free.

**Writes resolve after the givable car changes.** The minder lands a write's record in its cache before
`tryWrite` resolves, and the bridge copies it in the same synchronous step, so `await Acme.putBox(...)` returns with
every `useBox` showing the new record. A host never needs `onSuccess: invalidate`.

**Nesting.** The dream reaches three levels (`acme_api/prd/database_url`); the plan builds one. The dream keeps
the deep paths as the target.

## Questions for the Coach

1. **One `stage` with `locked` and `unlocked`**, and `ended` for a swept or vacated bank object, in place of
   `ready` plus `isLocked`? I recommend yes: a `switch` on one field is the screen.
   **Settled** (the Coach, 2026-11-19), as vault-pieces.md S1 gives it: no `ended`; a tombstone's stage says where the user now stands, with `isEnded` and `endCause` beside it.
2. **Factories first, bound by a hook** (`SOK.useQueryOptions()`, as tRPC v11's `useTRPC()`), with `useBox` and
   the rest as sugar? Keys must carry the userid, so that one user's sidecars never paint, even for a frame,
   under another's: so a factory called during render needs a hook to re-render it on a user switch.
   **Later** (the Coach, 2026-11-19): no startup yet, so who the actors are is not known.
3. **The bridge at module scope**, given the host's QueryClient, with `useBridge()` for a client made inside
   React?
   **Later** (the Coach, 2026-11-19): as 2. The giver takes the host's QueryClient, or makes one where there is none.
4. **`whisperQuery`.** Internals.md's open matter 10 put "a customer's own view" after 1.0. This is a narrower
   case, the result of a call made with the whisper, not a view of it. In before 1.0?
   **Later** (the Coach, 2026-11-19): once it is known whether there are box instances.
5. **Suspense at 1.0.** Open matter 3 held Suspense back because a lock needs the user. Reading a box needs no
   unlock, only its whisper does, so `useSuspenseQuery(sok.acme.box(...))` never waits on a person. Reopen, and
   ship the suspense variants with the rest?
   **Later** (the Coach, 2026-11-19): once its costs can be stated definitively.
6. **Typed whispers**, a schema per labelpath or per labelpath pattern, checked at unseal through Standard
   Schema (Zod, Valibot, ArkType)? A mismatch would refuse, never hand `fn` a whisper of the wrong shape.
   **Not for 1.0** (the Coach, 2026-11-19).
7. **The watch's state in the bank snapshot** (`isWatching`, `heardAt`)? Without it a host cannot tell "current"
   from "the last we heard before the connection dropped", which is half of what freshness means.
   **Settled** (the Coach, 2026-11-19): `isWatching` and `heardAt`; no field has "state" in its name.
8. **A default `retry` on the host's entries.** React Query retries three times by default, which re-asks the
   minder on a refusal that will not change. I recommend the giver's factories default to retrying a transient
   refusal (`storage_unavailable`) alone. This is outside the primitive's path, so CLAUDE.md allows it.
   **Later** (the Coach, 2026-11-19): part of the orchestrating put's discussion (vault-pieces.md, W1).
9. **A rename while locked.** Sealing needs the lease, and a seal keeps none of the donor's whisper
   (`vault-pieces.md`, W), so changing a box's sidecar needs the bank unlocked and the whisper in hand. A host's
   "rename" then unlocks and unseals. Accept for now?
   Open, as vault-pieces.md W2.
10. **Devtools for the minder's cache.** The host's devtools show the givable cars; the minded ones are in a
    client no host sees. A dev-only `<SokDevtools />` would show them, but it brings in React Query's devtools,
    which must match the minder's query-core version. Later?
    *The TanStack inspection thing?* (the Coach, 2026-11-19).
