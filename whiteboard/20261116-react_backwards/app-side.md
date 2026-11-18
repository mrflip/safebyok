# react_backwards: the host's side

What a React app writes against the library we would want, worked from two use cases: holding an
API key, and a doppler-lite (nested projects, configs and secrets, edited in place). The library
here does not exist yet. `internals.md`, beside this file, sketches what would have to exist
underneath. Status: a proposal for discussion, 2026-11-16, rewritten the same day around one
Device per process. Settled points are marked in *Open matters*; the rest is proposal.

The core's interface serves this layer, not the other way round. Where the sketch needs something
the new core lacks or names differently, it says so and `internals.md` lists it as a facility.

## The three tiers

| Tier | Entry point | What it is | Who uses it |
|---|---|---|---|
| Hooks | `safebyok-react` | The provider, and one hook per thing. Each hook returns a frozen snapshot | Everyone, sooner or later |
| Parts | `safebyok-react` | Unstyled components that bind a field or a form to the core: `WhisperInput`, `WhisperText`, the gating forms' fields. They render plain semantic HTML, pass through `className` and every DOM prop, and expose state as `data-*` attributes | A host with its own design system |
| Kit | `safebyok-react/kit`, `safebyok-react/kit.css` | Drop-in components built only from the tiers above: `GatingDialogs`, `ApiKeyField`, `LockButton`, `WaysIn`, `BoxTree`, `WhisperForm`. Styled through CSS variables in `@layer safebyok`, so any host rule wins | A host shipping today, up to its own 1.2 |

The kit uses no private API. Anything it does, a host can do with hooks and parts, which keeps
the kit honest and gives us a test that the lower tiers are enough.

## Rules the interface keeps

Each comes back in the comparison at the end. They are the "why".

1. **The Device is made outside React, once per process.** `Device.make(opts)` runs at module
   scope, the way a TanStack `QueryClient` or a Redux store does, and the provider receives it.
   React subscribes to it and never owns it. StrictMode's double effects, Fast Refresh and remounts
   then cannot make a second one, and code outside React (a fetch wrapper, a test) uses the same
   object. Each tab is its own process.
2. **The Device answers synchronously; a bank arrives whole.** Before anyone signs in, and while a
   signed-in user's bank is starting, every hook answers from the Device's snapshot. A bank object
   exists only once its async start has finished, so it has no half-made stage of its own.
3. **A hook returns a snapshot, and acts go through live objects, never through a snapshot.** A
   snapshot carries no methods, so a stale one cannot act (STYLE.md, *Stateful objects and
   snapshots*). The Device and a bank object are live, and keep one identity, so a closure that
   captured one acts on the current state.
4. **No cleartext in render by default.** A whisper is used where it is needed: in an event handler
   or a query function, through `withWhisper`. Render state shows up in React DevTools and in
   whatever error reporter the host runs, so a whisper reaches render only through a part that
   writes it straight into the DOM (`WhisperInput`, `WhisperText`), never through a hook's return
   value.
5. **Locked is a stage, not an error.** A call that needs the user (`withWhisper`, or `putBox` on a
   locked bank) asks through a gating and resumes once it is answered. Wherever the host has put
   `<GatingDialogs />`, the dialog shows up. The user dismissing it rejects the call with
   `dismissed`, and `isDismissed(err)` tells it apart.
6. **A box is addressed by its labelpath below the root box**: `'openai'`, `'acme_api/prd/stripe'`.
   There is no vault argument, and the host never writes the core's `box/` prefix.
7. **Styling goes through `className` and `data-*` attributes**, never style props or render
   props for looks: `data-stage="absent"`, `data-locked`, `data-dirty`. That suits plain CSS,
   CSS modules and Tailwind (`data-[locked]:opacity-50`) alike.

## Setup, for both use cases

```ts
// src/device.ts: made once per process, at module scope. Safe to import during a server render.
import { Device } from 'safebyok'
import { ConvexVaultDB } from 'safebyok-convex'
import { argon2idDeriver } from 'safebyok-argon2'
import { zxcvbnChecker } from 'safebyok-zxcvbn'

export const device = Device.make({
  keyDeriver:      argon2idDeriver(),
  strengthChecker: zxcvbnChecker(),
  banks: {
    acme: { vaultDB: new ConvexVaultDB(convex) },   // each bank may have its own backend
  },
  // What this browser keeps for a user ('none', 'userids' or 'offline_signins'), and how long an unlock
  // lasts: the host's decisions (internals.md, F13).
  keepOnDevice: 'offline_signins',
  autolock:     { hours: 24 * 14, on: 'since_last_proof' },
})
```

```tsx
// src/App.tsx
'use client'
import { SafebyokProvider } from 'safebyok-react'
import { GatingDialogs } from 'safebyok-react/kit'
import 'safebyok-react/kit.css'
import { device } from './device'

export function App() {
  const { user } = useAuth()  // the host's own auth: Clerk, Convex, Auth.js...
  return (
    <SafebyokProvider device={device} userid={user?.id ?? null}>
      <Routes />
      <GatingDialogs passphraseUsername={user?.email} />
    </SafebyokProvider>
  )
}

// At sign-out, in the host's own handler: end the user's banks, and forget what this browser cached for them.
async function signOut() {
  await device.vacate()
  await auth.signOut()
}
```

* At mount, the provider calls `device.hello()`, which warms what it can before anyone signs in:
  it probes the key deriver and the strength checker, which may load libraries, opens the
  deviceDB, and reads into memory whatever this browser cached for its banks. Nothing a user owns
  reaches a snapshot until that user's `userid` arrives from auth.
* When `userid` arrives, the provider hands it to the Device in a layout effect, so no frame
  paints in between. The Device starts each of the user's banks. Until a bank object arrives, its
  stage is `starting` in the Device's snapshot.
* `userid` going null does not vacate: auth libraries briefly report no user while they refresh a
  token, so sign-out is explicit. A different `userid` ends the previous user's banks first.

## Use case 1: an API key

### With the kit: the whole app, up to 1.2

```tsx
import { ApiKeyField, LockButton, WaysIn } from 'safebyok-react/kit'

function SettingsPage() {
  return (
    <section>
      <h2>Your OpenAI key</h2>
      <ApiKeyField labelpath="openai" title="OpenAI API key" placeholder="sk-…" />
      <LockButton />
      <WaysIn />  {/* change passphrase, add or remove a passkey, delete the bank */}
    </section>
  )
}
```

`ApiKeyField` covers everything the demo's widget flow does by hand today. It shows "No key
saved" or "Key `sk-*****************wxyz` saved, added 3 days ago": at each put it writes
`mask(apiKey)` into the box's sidecar, so it can say which key is saved while the bank is locked.
It has a masked input with Show / Hide, and Save (which builds the bank on first use and unlocks
it if needed), Replace and Remove. Its text comes from a `messages` prop with English defaults,
which is also how a host localizes it. While the bank is `starting` its buttons are disabled.

### Use it in a call

The main path, and the one that most shapes the design. The key goes from the box to the SDK,
inside the host's own TanStack mutation or query, and never through React state.

```tsx
import { useBank, useBox, isDismissed } from 'safebyok-react'
import { useMutation } from '@tanstack/react-query'

function AskForm() {
  const [, bank] = useBank()
  const box = useBox('openai')
  const ask = useMutation({
    mutationFn: (prompt: string) => bank!.withWhisper('openai', ({ apiKey }) => (
      new OpenAI({ apiKey, dangerouslyAllowBrowser: true }).responses.create({ model, input: prompt })
    )),
  })
  if (box.stage === 'absent') { return <p>Add your OpenAI key in Settings first.</p> }
  return (
    <form action={(form) => ask.mutate(String(form.get('prompt')))}>
      <textarea name="prompt" />
      <button disabled={(bank === null) || (box.stage !== 'present') || ask.isPending}>Ask</button>
      {ask.isError && (! isDismissed(ask.error)) && <p role="alert">{ask.error.message}</p>}
    </form>
  )
}
```

* `useBank()` returns the bank's snapshot and the bank object, the way `useState` returns a value
  and its setter. The bank object is null until it arrives, which the disabled button covers.
* On a locked bank, `withWhisper` opens an `unlock_bank` gating, `GatingDialogs` shows the
  passphrase dialog, and the call resumes once it is answered. Two calls at once on a locked bank
  share one gating (internals.md, F9).
* `withWhisper` hands its callback the whisper and lets go of it once the callback settles. It
  cannot zero a JavaScript string, and claims no more than letting go.
* A query whose result depends on the key puts the box's `revtok` in its key, so rotating the key
  refetches it: `useQuery({ queryKey: ['models', box.revtok], queryFn: ... })`.

### Store, rotate, remove, lock

```ts
await bank.putBox({ labelpath: 'openai', whisper: { apiKey }, sidecar: { mask: mask(apiKey) } })  // store or rotate: one verb
await bank.delBox('openai')
bank.lock()
```

* `putBox(proposed, revisor?, opts?)` is the orchestrating put (internals.md, F12). On a conflict
  with a write from elsewhere, it gets the box again, unsealed, and calls
  `revisor(stored, proposed)` for the next box to propose, up to `retry` times. The default
  revisor keeps `proposed`: the key the user typed is meant to replace whatever is there.
  `putBoxOnce` is the single try beneath it, which refuses on a conflict.
* `putBox` builds the bank on first use and unlocks it, asking the user as needed (rule 5).
* `lock()` is synchronous, and drops every whisper the bank has in memory: open drafts, and any
  `WhisperText` showing one (internals.md, F11).

### Hand-built: the same field from hooks and parts

```tsx
import { useBank, useBox, useWhisperDraft, WhisperInput, RevealButton } from 'safebyok-react'

function OpenAIKeyField() {
  const [bankSnap] = useBank()
  const box = useBox('openai')
  const draft = useWhisperDraft('openai', { fieldnames: ['apiKey'] })  // begin() starts empty where no box is stored
  return (
    <div className="key-field" data-stage={box.stage} data-locked={bankSnap.isLocked || undefined}>
      <label htmlFor="openai-key">OpenAI API key</label>
      {draft.isEditing
        ? (
          <>
            <WhisperInput draft={draft} fieldname="apiKey" id="openai-key" placeholder="sk-…" />
            <RevealButton draft={draft} fieldname="apiKey" />
            <button onClick={() => draft.put()} disabled={! draft.isDirty}>Save</button>
            <button onClick={() => draft.discard()}>Cancel</button>
          </>
        )
        : <button onClick={() => draft.begin()} disabled={! draft.isReady}>{box.stage === 'present' ? 'Replace' : 'Add key'}</button>}
    </div>
  )
}
```

`useWhisperDraft` returns a snapshot (`isReady`, `isEditing`, `isDirty`, `isBehind`, `lastErr`)
and the draft's own stable acts, which act on the draft's current state, never on the snapshot's.
`isReady` is false until the bank arrives. `WhisperInput` is an uncontrolled `<input>`, registered
with the draft by a ref callback. What the user types lives in the input and in the draft's
private field, never in React state (internals.md, F10).

## Use case 2: a doppler-lite

Projects, each with configs (`dev`, `stg`, `prd`), each with secrets. Every secret is a box. Its
whisper is `{ val }`, and its sidecar `{ envname: 'STRIPE_KEY' }`, because an environment
variable's name is uppercase and a label is not. One secret per box means two people editing two
secrets never collide, and each secret has its own history.

```text
acme_api                       project    sidecar { title: 'ACME API' }
acme_api/prd                   config     sidecar { title: 'Production' }
acme_api/prd/stripe_key        secret     sidecar { envname: 'STRIPE_KEY' }   whisper { val }
acme_api/prd/database_url      secret     sidecar { envname: 'DATABASE_URL' } whisper { val }
```

### With the kit

```tsx
import { BoxTree, WhisperForm } from 'safebyok-react/kit'

function SecretsPage() {
  const [labelpath, setLabelpath] = useState<string | null>(null)
  return (
    <div className="two-pane">
      <BoxTree listpath="/" selected={labelpath} onSelect={setLabelpath} titleOf={(sidecar) => sidecar.envname ?? sidecar.title} />
      {labelpath !== null && <WhisperForm key={labelpath} labelpath={labelpath} fieldnames={['val']} />}
    </div>
  )
}
```

`BoxTree` is an accessible tree (`role="tree"`, arrow keys), built on `useBoxList`. It renders
while the bank is locked, since titles come from sidecars. `WhisperForm` is the hand-built field
above, generalized to several fields, with the conflict banner below.

### Hand-built

```tsx
import { useBank, useBoxList, useBox, useWhisperDraft, WhisperInput, WhisperText } from 'safebyok-react'

function ConfigTable({ listpath }: { listpath: string }) {   // listpath: 'acme_api/prd/'
  const boxlist = useBoxList(listpath)
  if (boxlist.stage === 'pending') { return <Spinner /> }
  return (
    <table>
      <tbody>
        {boxlist.boxes.map((entry) => <SecretRow key={entry.labelpath} labelpath={entry.labelpath} />)}
      </tbody>
    </table>
  )
}

const SecretRow = memo(function SecretRow({ labelpath }: { labelpath: string }) {
  const [, bank] = useBank()
  const box = useBox(labelpath)
  const draft = useWhisperDraft(labelpath, { fieldnames: ['val'] })
  const [isShown, setShown] = useState(false)
  return (
    <tr data-dirty={draft.isDirty || undefined} data-behind={draft.isBehind || undefined}>
      <th>{box.sidecar?.envname}</th>
      <td>
        {draft.isEditing
          ? <WhisperInput draft={draft} fieldname="val" />
          : isShown ? <WhisperText labelpath={labelpath} fieldname="val" /> : '••••••••'}
      </td>
      <td>
        <button onClick={() => setShown((was) => ! was)}>{isShown ? 'Hide' : 'Show'}</button>
        <button disabled={bank === null} onClick={() => bank?.withWhisper(labelpath, ({ val }) => navigator.clipboard.writeText(val))}>Copy</button>
        {draft.isEditing
          ? <><button onClick={() => draft.put()}>Save</button><button onClick={() => draft.discard()}>Cancel</button></>
          : <button disabled={! draft.isReady} onClick={() => draft.begin()}>Edit</button>}
      </td>
      {draft.isBehind && (
        <td role="alert">
          Changed on another device. <button onClick={() => draft.rebase()}>Load theirs</button>
          <button onClick={() => draft.put({ citing: 'latest' })}>Keep mine</button>
        </td>
      )}
    </tr>
  )
})
```

* `useBoxList(listpath)` returns the sparse entries the listing has (labelpath, sidecar,
  `revtok`, `written_at`), in tree order. The `boxes` array keeps its identity until an entry
  changes, and so does each entry, so a memoized row redraws only when its own box changes.
* `WhisperText` unseals the box and writes the field's text into a `<span>` through a ref, so the
  cleartext never enters React's tree. Locking clears it (rule 4, internals.md, F11).
* `isBehind` turns true when a newer revision of the box arrives while a draft is open. A draft's
  put cites the record the draft began from, so `draft.put()` then refuses rather than
  overwriting, and "Keep mine" cites the newer one. The UI offers both ways out. Everyone expects
  this of a shared secrets editor, and only a draft that remembers the revision it began from can
  give it.
* A merge is a revisor: `bank.putBox({ labelpath, whisper: { rotated_at: nowMillis() } }, merge)`,
  with es-toolkit's or lodash's `merge`. The revisor is handed the stored box unsealed, `{ whisper,
  sidecar, revtok }`, and for an absent box the empty shell, `{ whisper: {}, sidecar: {}, revtok:
  null }`, so `merge` and spreads need no null check. The same shape gives an "atomic" increment:
  `(stored, proposed) => ({ ...proposed, whisper: { count: (stored.whisper.count ?? 0) + 1 } })`.
  A deep merge cannot delete a field; that takes a revisor of the host's own.
* "Export .env" is `bank.withWhispers('acme_api/prd/', (whispers) => ...)`, one unlock for the
  whole listpath.

## Hook and component index

| Name | Tier | Returns or renders |
|---|---|---|
| `Device.make(opts)` | core | The Device: made once per process, outside React. `banks` names each bank and its vaultDB |
| `device.hello()` | core | Warms what can be warmed before a user: probes, the deviceDB, cached packets |
| `device.vacate()` | core | Ends the user's banks and forgets what this browser cached for them |
| `<SafebyokProvider device userid>` | hooks | Gives the Device to the hooks below, calls `hello()` at mount, and hands it each `userid` |
| `useDevice()` | hooks | The Device |
| `useBank(banklabel?)` | hooks | `[snapshot, bank]`: `{ stage: 'signed_out' \| 'starting' \| 'unborn' \| 'ready' \| 'failed', isLocked, leaseEndsAt, lastErr }`, and the bank object or null. `banklabel` may be left out where the Device has one bank |
| `useBox(labelpath)` | hooks | `{ stage: 'pending' \| 'absent' \| 'present', labelpath, sidecar, revtok, written_at, isRefreshing, lastErr }` |
| `useBoxList(listpath)` | hooks | `{ stage, boxes, isRefreshing, lastErr }` |
| `useWhisperDraft(labelpath, opts)` | hooks | A draft's snapshot and its acts: `begin`, `put`, `discard`, `rebase` |
| `useOpenGating()` | hooks | The open gating, or null: for a host that draws its own dialogs |
| `useSuspenseBank`, `useSuspenseBox`, `useSuspenseBoxList` | hooks | The same, suspending until the bank or the record arrives (after 1.0; internals.md, F14) |
| `boxQueryOptions(bank, labelpath)` | hooks | TanStack `queryOptions` for a box's record, for a host on react-query |
| Bank acts | core | `withWhisper`, `withWhispers`, `putBox`, `putBoxOnce`, `delBox`, `lock`, `ensureUnlocked`, the gate verbs |
| `WhisperInput`, `RevealButton`, `WhisperText` | parts | Field-level bindings that keep cleartext out of React |
| `PassphraseFields`, `ChosenPassphraseFields`, `PasskeyButton` | parts | The gating forms' insides |
| `GatingDialogs`, `ApiKeyField`, `LockButton`, `WaysIn`, `BoxTree`, `WhisperForm` | kit | Drop-ins |
| `isDismissed(err)` | hooks | True when the user cancelled a gating |
| `mask(text)` | hooks | The outline of a secret text that is safe to show, `sk-*****************wxyz`: safebyok-big's, re-exported |
| `askPasskey`, `createPasskey`, `passkeysAvailable` | hooks | As today |

## Compared with safebyok-react today

| Area | Today | Proposed | Why |
|---|---|---|---|
| Who makes the device | `BankProvider` makes one per user and bank, in a layout effect from its props. Later prop changes are ignored with a warning, and the effect calls `setState` | `Device.make` once per process, at module scope. The provider takes it, and hands it `userid` | Rule 1. The ignored-props warning, the StrictMode bookkeeping (`lastDevice`, `userkey`) and the effect that owns the device all go away |
| What a device is | One user's presence for one bank scope | This tab's presence. Users come and go, and each bank, with its own backend, starts under it | A bank label is independent of the user, and banks may differ in backend |
| Before a bank is up | `useBank()` returns null, beside a separate snapshot hook | The Device's snapshot says `starting`, and the bank object arrives whole | Rule 2 |
| Gating UI | The provider renders the built-in dialogs unless it gets a `requestCleartext` prop | `<GatingDialogs />` wherever the host puts it, or `useOpenGating()` for its own | The host chooses where the dialogs sit, inside its theme and portal tree. A callback prop is an imperative hook stuck into a declarative tree |
| Hooks per thing | `useBox` + `useBoxSnapshot` + `useBoxIsShowing` + `useBoxExposure` + `useWhisper`, and `useVault` + `useVaultSnapshot` | One hook per thing, returning one snapshot whose `stage` narrows its type | One subscription per component, and TypeScript narrowing does the work of the extra hooks |
| Addressing | `(vaultlabel, boxlabel)` | One `labelpath` | Vault is gone. Boxes nest |
| Cleartext | `useWhisper(box)` returns the whisper into render. The demo's toolkit flow binds it to a controlled input | No hook returns cleartext. `withWhisper` for use, and `WhisperInput` / `WhisperText` for display, which write to the DOM | Rule 4. React DevTools and error reporters see render state |
| Editing | `box.expose()`, `patchWhisper`, `putExposed`, `unexpose`, `BoxFields.of(box).bind(path)` | One draft handle: `begin`, `put`, `discard`, `rebase`, with `isDirty` and `isBehind` | One object for one task. Conflict handling needs the revision the edit began from |
| Getting a box ready | `CreateVaultButton`, and the demo's `ensureApiKeyBoxExposed` chaining `ensureBank`, `ensureUnlocked`, `ensureVault`, `putBox`, `expose` | `putBox` and `draft.begin()` do the ensuring, asking the user as needed | Today every host writes that chain. It belongs in one place |
| Writing | One try, and the host handles a conflict | `putBox(proposed, revisor)` with `retry`, where `merge` is a revisor; `putBoxOnce` for one try | A merge or an increment is the revisor's job, and the host should not write that loop |
| Listing | `useBoxes(vaultlabel)`: boxlabels only | `useBoxList(listpath)`: entries with sidecar and `revtok`, each keeping its identity until it changes | A tree or table needs titles while locked, and memoized rows |
| Gate verbs | The host writes `WaysIn` (the demo does), calling `bank.maingate.try…Prompt()` | `<WaysIn />` in the kit, and the verbs on the bank | Every host needs it, so it ships |
| Styling | Fixed class names, no stylesheet. The host styles `.modal` and the rest | Parts unstyled, with `data-*` state. The kit has a stylesheet in `@layer safebyok` with CSS variables | Works with any styling approach, and the kit looks right without any host CSS |
| Text | `Messages`, English, fixed | A `messages` prop on each kit component, English by default | Localization |
| TanStack Query | Not involved | `revtok` for query keys, and `boxQueryOptions` | Hosts already on react-query fit in, with nothing new to learn |
| React Server Components | No `'use client'` banner | The entry points carry `'use client'`, `Device.make` is safe on the server, and `getServerSnapshot` answers `signed_out` | Next.js App Router hosts can import it |

### What stays

* **The dialogs' insides**: the `<dialog>` element with `showModal()`, form actions with
  `useActionState`, the passphrase fields and their strength meter, the error boundary that keeps
  a quoted passphrase out of the report. They are good React already, and move into the parts.
* **Uncontrolled whisper inputs** with `WhisperFieldAttributes`, which keep password managers away.
  `BoxWhisperField`'s ref binding is the seed of `WhisperInput`.
* **The passkey helpers** (`askPasskey`, `createPasskey`, `passkeysAvailable`), and the devmode
  inspectors, behind their own entry point.
* **`onBadNews`** for trouble with no caller.

## Open matters

The *Coach* column quotes the Coach's notes of 2026-11-16 as written.

| # | Matter | My recommendation | Coach | Stands |
|---|---|---|---|---|
| 1 | Is the core's `box/` prefix ever the host's to write? | Never | *Agree: no* | Settled |
| 2 | May a kit component show part of the key? That puts it in the sidecar, in the clear | Yes, through `mask`, which now follows a schedule by length (thread `20261116-mask_schedule`): a text of 12 characters or fewer shows only stars. Once built, the mask in the clear sidecar gets an entry in `notes/security.md` | *we export a helper `mask(str)` to show part of a string. Making that durable is reasonable*. Then: a safe schedule of stars, by length | Settled; `mask` rebuilt, uncommitted |
| 3 | Do hooks suspend by default? | Not at 1.0. Locked needs the user, and Suspense is for waiting, so status snapshots come first and `useSuspense…` variants follow | | Open |
| 4 | Retry, and what the revisor is handed | `putBoxOnce` is the single try; `putBox` and `putBoxRecord` orchestrate, with `retry` and a revisor. The revisor gets the box unsealed | *There will be a layer providing retry and a revisor callback*. Then: *the base no-retry one should move to putFooOnce, the orchestrating ones becoming putFoo and putFooRecord*, and *unsealed: the revisor is what lets them merge old and new, or "atomic" increment it* | Settled, with `putBox(proposed, (stored, proposed) => nextProposed)`, so that `merge` is a revisor (*bank.putBox({ whisper: ... }, _.merge)*). Open: `retry`'s default (I'd say 3) |
| 5 | What the long-lived object is, and its name | The Device, once per process (each tab its own). Banks start under it, each with its own vaultDB, and arrive whole after an async start | *The thing you're describing as a store deserves the name Device*, and the discussion after | Settled |
| 6 | Live box objects: `bank.boxAt(labelpath)`, one per labelpath, standing for it through its lives, with `put`, `withWhisper` and the rest on it | Accept. Rule 3 already allows acting through a live object, and one instance API then serves React and every other host alike | Your note on 4 wrote `box.put(...)` | Open |
| 7 | On a user this browser has never seen whose bank is not stored, does `ensureUnlocked` (the kit's Unlock) birth the bank, or refuse "no bank"? | Refuse. The kit shows Create instead of Unlock while the bank is `unborn`, and only a put births it | | Open |
| 8 | Is `device_tok` one per browser, or one per user on it? | One per user. One token across users on a shared computer would link them in the backend, through the wayins and leases it is written into | | Open |
