```ts
// == Once, beside the Device ==
// Bound to the Device, not read from context: bank labels typecheck against Device.make's banks,
// several standalone Devices need no nested providers, and a test binds a fake Device.
// PascalCase on purpose: eslint-plugin-react-hooks checks `vault.useBox()` as a hook only when
// the object's name is PascalCase.
export const SOK   = Safebyok.reactGiver(device)
export const vault = SOK.vault('acme')

// == Who is signed in: once, at the root ==
SOK.useSignIn(user?.id ?? null)            // hands userid to the Device in a layout effect; null vacates

// == This tab's state: always synchronous, never suspends, null-free ==
const device = SOK.useDevice()                    // { userid, banks: { acme: { stage, lastSeen } }, openGating }
const bank = vault.useBank()                      // { stage, isLocked, leaseEndsAt, lastErr }
const ends = vault.useBank((b) => b.leaseEndsAt)  // with a selector: re-renders only when that changes

// == A record, at the temperature you ask for ==
// Fully cooked: suspends until in hand, throws to the error boundary.
const box = vault.useSuspenseBox('openai')             // .data: BoxView, or null for no box stored

// Placeholder, then full: renders at once from what is in hand (its listing entry, or one kept
// under keepOnDevice), then swaps in the fetched record. The result is TanStack's.
const { data: box, isPlaceholderData, isFetching } = vault.useBox('openai')

// Pick one field: re-renders only when the mask changes.
const { data: shown } = vault.useBox('openai', { select: (b) => b?.sidecar.mask })

// React 19's way to wait in render: one stable promise per labelpath (F14).
const box = use(vault.boxPromise('openai'))

// Synchronous, never fetches: what is in hand this instant, for a menu or a tooltip.
const box = vault.usePeekBox('openai')                 // BoxView | null | undefined (undefined: not in hand)

// Outside render: a route loader, or prefetch on hover.
loader: () => vault.ensureBox('openai')
onPointerEnter={() => vault.prefetchBox('openai')}

// == Listings ==
const { data: rows } = vault.useBoxes({ under: 'acme_api/' })  // each entry keeps its identity until it changes
const { data: rows } = vault.useSuspenseBoxes({ under: 'acme_api/' })
const { data: some } = vault.useBoxesAt(['openai', 'anthropic'])  // useQueries, combined

// == Bare react-query, nothing in the way ==
useQuery({ ...vault.boxQuery('openai'), staleTime: 60_000 }, SOK.queryClient)
useSuspenseQueries({ queries: paths.map(vault.boxQuery) }, SOK.queryClient)
SOK.queryClient.invalidateQueries({ queryKey: vault.keys.boxes('acme_api/') })

// == The whisper: never a value React holds ==
await vault.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt))  // unlocks first if locked: one shared unlock
<WhisperText labelpath="openai" field="apiKey" />      // revealing writes to the DOM, never to state

// == Acts: form actions, so secrets travel in FormData, never in state ==
const [unlockState, unlockAction, isUnlocking] = vault.useUnlockAction()
<form action={unlockAction}><WhisperInput name="passphrase" /></form>

const [putState, putAction, isPutting] = vault.usePutBoxAction('openai', {
  whisperOf: (form) => ({ apiKey: String(form.get('apiKey')) }),
  sidecarOf: (whisper) => ({ mask: mask(whisper.apiKey) }),
})
await vault.putBox({ labelpath: 'counter', whisper: {} }, bump)  // imperative, with a revisor
vault.lock()

// == Drafts: the nested editor ==
const draft = vault.useDraft('acme_api/prd/database_url')
// { isDirty, isBehind, base, sidecar, setSidecar, whisperField('val') → props for WhisperInput,
//   put(), discard(), rebase() }: all stable
111