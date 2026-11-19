```ts
// == Once, beside the Device ==
// Bound to the Device, not read from context: bank labels typecheck against Device.make's banks,
// several standalone Devices need no nested providers, and a test binds a fake Device.
// PascalCase on purpose: eslint-plugin-react-hooks checks `Acme.useBox()` as a hook only when
// the object's name is PascalCase.
export const Sb   = reactGiver(device)
export const Acme = Sb.bank('acme')

// == Who is signed in: once, at the root ==
Sb.useSignIn(user?.id ?? null)            // hands userid to the Device in a layout effect; null vacates

// == This tab's state: always synchronous, never suspends, null-free ==
const dev  = Sb.useDevice()               // { userid, banks: { acme: { stage, lastSeen } }, openGating }
const bank = Acme.useBank()               // { stage, isLocked, leaseEndsAt, lastErr }
const ends = Acme.useBank((b) => b.leaseEndsAt)   // with a selector: re-renders only when that changes

// == A record, at the temperature you ask for ==
// Fully cooked: suspends until in hand, throws to the error boundary.
const box = Acme.useSuspenseBox('openai')             // .data: BoxView, or null for no box stored

// Placeholder, then full: renders at once from what is in hand (its listing entry, or one kept
// under keepOnDevice), then swaps in the fetched record. The result is TanStack's.
const { data: box, isPlaceholderData, isFetching } = Acme.useBox('openai')

// Pick one field: re-renders only when the mask changes.
const { data: shown } = Acme.useBox('openai', { select: (b) => b?.sidecar.mask })

// React 19's way to wait in render: one stable promise per labelpath (F14).
const box = use(Acme.boxPromise('openai'))

// Synchronous, never fetches: what is in hand this instant, for a menu or a tooltip.
const box = Acme.usePeekBox('openai')                 // BoxView | null | undefined (undefined: not in hand)

// Outside render: a route loader, or prefetch on hover.
loader: () => Acme.ensureBox('openai')
onPointerEnter={() => Acme.prefetchBox('openai')}

// == Listings ==
const { data: rows } = Acme.useBoxes({ under: 'acme_api/' })  // each entry keeps its identity until it changes
const { data: rows } = Acme.useSuspenseBoxes({ under: 'acme_api/' })
const { data: some } = Acme.useBoxesAt(['openai', 'anthropic'])  // useQueries, combined

// == Bare react-query, nothing in the way ==
useQuery({ ...Acme.boxQuery('openai'), staleTime: 60_000 }, Sb.queryClient)
useSuspenseQueries({ queries: paths.map(Acme.boxQuery) }, Sb.queryClient)
Sb.queryClient.invalidateQueries({ queryKey: Acme.keys.boxes('acme_api/') })

// == The whisper: never a value React holds ==
await Acme.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt))  // unlocks first if locked: one shared unlock
<WhisperText labelpath="openai" field="apiKey" />      // revealing writes to the DOM, never to state

// == Acts: form actions, so secrets travel in FormData, never in state ==
const [unlockState, unlockAction, isUnlocking] = Acme.useUnlockAction()
<form action={unlockAction}><WhisperInput name="passphrase" /></form>

const [putState, putAction, isPutting] = Acme.usePutBoxAction('openai', {
  whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
  sidecarOf: (whisper) => ({ mask: mask(whisper.apiKey) }),
})
await Acme.putBox({ labelpath: 'counter', whisper: {} }, bump)  // imperative, with a revisor
Acme.lock()

// == Drafts: the nested editor ==
const draft = Acme.useDraft('acme_api/prd/database_url')
// { isDirty, isBehind, base, sidecar, setSidecar, whisperField('val') → props for WhisperInput,
//   put(), discard(), rebase() }: all stable
111