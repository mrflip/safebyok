# safebyok-react

The thin React binding for safebyok: no vault logic, only the React-shaped plumbing a host app would
otherwise write itself.

* `BankProvider` -- makes the signed-in user's bank (`Bank.make`) from its props, the `user_id`
  prop from your auth among them, says `bank.hello()`, and sweeps it (`bank.sweep()`) as the user
  signs out or changes, or the provider unmounts. It asks the bank to lock each vault whose
  autolock has passed (`bank.autolock()`) once a minute. It is the bank's `requestCleartext`
  unless you pass one of your own: whenever a call needs the user -- `bank.ensureVault(...)` for
  a vault not yet built, `vault.ensureUnlocked()` on a vault locked -- it shows the dialog for
  that gating's kind, and the call waits on it (*Asking for the passphrase*, below).
* `useVault(vaultlabel)` -- where the user's vault under that label stands, and its Vault object:
  `{ stage: 'waiting' }` until the bank is ready, `{ stage: 'unborn' }` while the bank holds no
  live vault there, `{ stage: 'present', vault }` once it does. It never asks the user and never
  builds a vault: an `unborn` vault is built by `bank.ensureVault` from a click. It says
  `vault.hello()` once to each vault it hands you.
* `useVaultSnapshot(vaultlabel)` -- that vault's live snapshot, through
  `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`, its `lockState` among its fields;
  `null` while the vault is not `present`.
* `useBank()` -- the bank itself, to call from an event handler; `null` while the provider holds
  none.
* `useBankSnapshot()` -- the bank's live snapshot: its `stage` (`made`, `ready`, or `refused`
  with why, in `err`) and the vaults it lists; `null` while the provider holds no bank.
* `GatingModal` -- the shipped `requestCleartext`'s dialog, handed one gating and answering it,
  one dialog per `gatingkind`. For now the passphrase dialog, `PassphraseModal`, answers a
  `build_vault` gating (a first passphrase, typed twice) and an `unlock_vault` one; a gating of
  any other kind is declined unasked. Unstyled markup under `modal-scrim` / `modal` class names
  for the host's stylesheet to dress. Handed the bank's `leaseMillis`, as the provider hands it,
  it says how long an unlock lasts on the device -- "Locks again on this device in 7 days", "in
  15 minutes", "Stays unlocked ... until you lock it" ("Locks on this device ..." while it
  creates the vault). A refusal the user can correct -- a wrong passphrase, a weak new one --
  shows in the dialog in place, and the dialog asks again; a lock, a sweep or storage out of
  reach closes it, answering `declined`; anything else (misuse, a bug) shows a calm "Something
  went wrong" with a Close button, and goes to React's error reporting, never to your page
  (*When an unlock fails*, below). It is a modal `dialog` named by its heading; Escape cancels
  it; its error line is a live region a screen reader announces. Its passphrase fields are made
  for password managers, with a Show / Hide button and room for your advice beside a new one
  (*The passphrase field*, below).
* `WhisperField` -- the field a user types or pastes a whisper into, hidden as they type, with a
  Show / Hide button; password managers and autofill are turned away (*Entering a whisper*,
  below).

## Install

```sh
pnpm add safebyok safebyok-react react
```

`safebyok` and `react` are peer dependencies: the host app installs them itself, so the binding and
the app share one copy of each.

Platform: Node 22 and up for tests and server rendering, and evergreen browsers, with
`Intl.RelativeTimeFormat` for the dialog's "locks again in ..." line; the floor is stated in the
core's *Where it runs*.

## Use

```tsx
import { argon2idWebV1Deriver } from 'safebyok/browser'
import { BankProvider } from 'safebyok-react'

<BankProvider applabel="acme" user_id={session?.user_id ?? null} device_id={deviceId}
  vaultDB={vaultDB} deviceDB={deviceDB} keyDeriver={argon2idWebV1Deriver} strengthChecker={strengthChecker}>
  <App />
</BankProvider>
```

The provider takes every `Bank.make` option as a prop, but `requestCleartext`, which it answers
itself unless you pass one, and `user_id`, which is null while nobody is signed in: then it holds
no bank. It throws an option `Bank.make` refuses, or one it does not take -- a misspelling, a
name it no longer uses -- to the nearest error boundary, as `bad_option`. A refused
`bank.hello()` throws nothing: the bank's snapshot says so (`useBankSnapshot()`, its `stage`
`refused` and its `err`).

The provider makes a new bank, sweeping the last one, whenever an option changes identity. So
make a `vaultDB`, a `deviceDB`, a `keyDeriver`, a `strengthChecker` or a `logger` once, outside
the component (or memoize it): one written in the props is a new one at every render, and makes
the bank anew each time, ending any dialog.

A handler is the exception: `onBadNews` and `requestCleartext` make no new bank as they change, so
they may be written inline. The bank calls whichever the last render passed:

```tsx
<BankProvider {...opts} user_id={user_id} onBadNews={(news) => { telemetry.report(news.refusalkind) }}>
  <App />
</BankProvider>
```

The provider owns the bank it makes. A bank serves one user: a new user or a sign-out sweeps the
bank, and the next user gets a bank of their own. The provider makes its bank in an effect, so
under React's `StrictMode`, whose rehearsal in development runs each effect twice, the bank made
in the rehearsal is swept at once, and the one kept says hello.

Read a vault with the hooks, and build or unlock it from a click:

```tsx
const VaultPanel = () => {
  const bank = useBank()
  const { stage, vault } = useVault('main')
  const snapshot = useVaultSnapshot('main')
  const open = async () => {
    const ensured = await bank?.tryEnsureVault({ vaultlabel: 'main' })   // builds an unborn vault, asking
    if (ensured?.ok) { await ensured.val.tryEnsureUnlocked() }          // unlocks a locked one, asking
  }
  if (stage === 'waiting') { return <p>Opening your vault…</p> }
  if (stage === 'unborn') { return <button onClick={() => { void open() }}>Create your vault</button> }
  if (snapshot?.lockState !== 'unlocked') { return <button onClick={() => { void open() }}>Unlock</button> }
  return <button onClick={() => { vault.lock() }}>Lock</button>
}
```

`waiting` covers the renders after a user signs in, until the bank's hello lands, a refused hello,
and the server, just as while nobody is signed in. Tell "signed out" from "not here yet" by your
own session, and "refused" by `useBankSnapshot()`. A vault deleted reads as `unborn`.

## Asking for the passphrase

Data calls never contain UI: a call that needs the user raises a gating, handed to the bank's
`requestCleartext`, which the provider is unless you pass your own. So a click handler just calls
`bank.ensureVault(...)`, then `vault.ensureUnlocked()`, and the dialog comes up on its own.

* **One dialog at a time.** A bank opens one gating at a time; a call that would open a second
  while one is open is refused `already_asking`.
* **A lock closes it.** A `vault.lock()`, the autolock, a sign-out, another user, a changed option
  or the provider unmounting settles the gating, and the dialog closes, answering `declined`.
* **Only at the user's word.** The dialog shows only while the user's gesture is in hand
  (`navigator.userActivation`, where the browser has it): a call a timer or a background sync
  makes is declined unasked.
* **Your own dialog**: pass `requestCleartext={(gating) => ...}`, which the bank hands a gating
  -- its `gatingkind`, `vaultlabel`, `attempt(...)`, `decline()` and `whenSettled` -- and which
  resolves once the dialog closes; a gating still open then is declined. It may render
  `GatingModal` itself, `<GatingModal gating={gating} onDone={close} />`, or `PassphraseModal`
  for a `build_vault` or `unlock_vault` gating. `requestCleartext={null}` asks no one: each such
  call is declined.

## When an unlock fails

**The user sees what they can mend.** A wrong passphrase, or a new passphrase too easy to guess
(`weak_passphrase`): each shows in the dialog in the core's own calm words, and the gating stays
open for the user to try again or cancel. These are the core's `correctablekindVals`; nothing
tries again for the user. A weak passphrase's message is the reason the bank's
`strengthChecker` gave; the user hears the same reason before pressing Create, as advice (below).

**The rest closes the dialog.** Storage out of reach, a lock that won, a vault gone, or a refusal
the dialog cannot mend closes it, answering `declined`; the call that asked hears that refusal.

**Anything else never takes your page down.** Misuse, or a failure that is no `VaultError`, is not
the user's to mend, and its message is written for you, not them. The dialog shows "Something went
wrong", that their secrets are safe, and to reload and try again, with a Close button that answers
`declined`, as Cancel does (Escape too); the typed passphrase goes with the form. Your error
boundary never sees it.

**React reports it to you.** Each dialog catches such a failure in an error boundary of its own,
so React hands the error to the root's `onCaughtError`: by default the console, with the component
stack. It arrives with nothing the user typed: a `VaultError` keeps its kind, message and meta but
never its `cause`, and anything else -- a `passphraseAdvice` that threw, say -- arrives as a fixed
`unexpected_error` quoting none of it. Hook your error tracker there:

```tsx
createRoot(rootElement, {
  onCaughtError: (err, info) => { tracker.capture(err, { componentStack: info.componentStack }) },
}).render(<App />)
```

A refused option is the exception: `BankProvider` throws it to your boundary at mount, where it
fires on every load, before any user has typed anything.

## The passphrase field

The dialog's passphrase field is built to be the field a password manager handles best, so a user
can keep a long, generated passphrase without remembering it: a real `<form>`, `type="password"`,
`autocomplete="new-password"` while it creates the vault (the manager offers to generate one, and
to save it once the dialog closes) and `autocomplete="current-password"` while it unlocks (the
manager offers the one it saved). Beside it, a hidden field with `autocomplete="username"` names
what the manager files the passphrase under: by default the user and the vault, `u1 (main
vault)`. Name it yourself with `passphraseUsername`, on `BankProvider` or `PassphraseModal` --
but never the user's sign-in name alone: the vault passphrase is not their sign-in password, and a
manager that saw a new password for their sign-in name would offer to overwrite the one they log
in with.

```tsx
<BankProvider {...opts} user_id={user_id} passphraseUsername={`${email} (vault)`}>
```

It has a Show / Hide button (`aria-pressed`), flipping the field between `password` and `text`,
and is never capitalized, corrected or spell-checked, shown or hidden. Like `WhisperField`, it is
uncontrolled: React never writes the passphrase into the page.

**Typed twice when new.** A new passphrase, the vault's first, is
typed again in a confirmation field below it, also `autocomplete="new-password"`, so that a
manager that generates one fills both. A typo would otherwise become the vault's passphrase,
and once this device's unlock ends, nobody
could open the vault. A submit whose two differ is refused in place, before any key is derived or
anything is stored: "The new passphrase and its confirmation don't match: type the same one in
both." The confirmation field is then marked `aria-invalid` and described by that message
(`aria-describedby`), until the user types again. The two are compared only at the submit; the
confirmation field is uncontrolled too, and the advice never hears it. The unlock form asks once.

**Advice while choosing.** By default the dialog says the reason the bank's strength checker
gives (`gating.checkStrength`) as the user chooses a weak first passphrase, and nothing once the
checker admits it, so they hear why before
pressing Create. Pass `passphraseAdvice`, a function of what has
been typed, to say something of your own instead (the checker then goes unasked until Create); what
it answers shows beside the field as the user chooses a passphrase: tied to the field by
`aria-describedby`, announced politely (`role="status"`), only the answer to the latest text kept.
It answers a sentence, or null for nothing to say, and may answer through a promise. It is never
asked while unlocking, and it is advice, not a gate: the user may still create the vault, and what
the vault itself refuses shows as any refusal does. Say what helps -- length, and how guessable
the passphrase is -- rather than rules of composition: NIST SP 800-63B advises against requiring
capitals, digits or symbols, which make passphrases harder to remember and no harder to guess.

```tsx
const passphraseAdvice = (typed: string) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)
<BankProvider ... passphraseAdvice={passphraseAdvice}>
```

An advice function that throws, or rejects, shows the dialog's calm "Something went wrong", as any
other failure inside it does.

It hears the passphrase itself, in plain text, at every change -- and so does the strength checker,
when it gives the advice: keep both on the device. Never send the passphrase to a server, log it,
or let an error tracker capture it as an argument or in a thrown error's message.

## The dialog's words

Every word the binding shows a user lives in one module, `src/messages.ts`, sentence by
sentence, in English; real locales come later. The dialog phrases how long an unlock lasts with
`Intl.RelativeTimeFormat`, and assumes it is there: every current browser and Node has it. On an
engine that may lack it -- React Native's Hermes, an older browser you support -- make sure it is
always there by importing the standard polyfill, with its English locale data, at your app's
entry, before anything renders (`pnpm add @formatjs/intl-relativetimeformat`; it is yours to
install, not a dependency of ours):

```ts
import '@formatjs/intl-relativetimeformat/polyfill'
import '@formatjs/intl-relativetimeformat/locale-data/en'
```

The polyfill installs itself only where the engine has no `Intl.RelativeTimeFormat` of its own.
Without it, such an engine meets a `TypeError` in the dialog, which shows its calm "Something
went wrong" notice in place of the form.

## Entering a whisper

`WhisperField` is the input for an API key or another whisper: hidden as the user types, with a
Show / Hide button (`aria-pressed`) to check it. A whisper is no credential, so where the
passphrase field invites password managers, this one turns them away: it is named `whisper_text`
-- a password manager looks for `key`, `password` and `token` -- and carries
`WhisperFieldAttributes` from `safebyok/utils`: each major password manager's flag to ignore it,
`autocomplete="off"` (nothing saved fills it, nothing is generated for it), and no capitalizing,
correcting or spell-checking (a browser's enhanced spell-check may send what is typed to its
maker's servers). It shows no placeholder unless you give one; any other input attribute passes
through, `ref` among them.

It is uncontrolled: it takes no `value`, and React never writes what is typed into the page
(*Revealing a whisper*, below). Hear the text through `onChange`, read it from the form under its
name, or through a `ref`; to empty it, reset the form or give the field a new `key`.

```tsx
import { WhisperField } from 'safebyok-react'

const [keyText, setKeyText] = useState('')
<WhisperField onChange={setKeyText} placeholder="sk-ant-…" aria-label="Anthropic API key" />

// or, in a form:
<form onSubmit={(evt) => { evt.preventDefault(); void save(new FormData(evt.currentTarget).get('whisper_text')) }}>
  <WhisperField aria-label="Anthropic API key" /> <button>Save</button>
</form>
```

A field of your own, or another framework's, spreads the same attributes:
`<input name="whisper_text" type="password" {...WhisperFieldAttributes} />`. Each manager
honors only its own flag, and a browser's built-in manager may honor none: Chrome's still offers a
saved password for a `type="password"` field, `autocomplete="off"` or not.

## Revealing a whisper

A whisper you show the user -- a "view" button, an edit form filled with the stored key, the
field above while they type -- is in React state, and so in your component tree's memory, until
that state lets go of it: React DevTools shows it, and an error reporter that captures props or
state may send it. That is the cost of showing it; keep it as small as the feature allows. A
controlled input carries more: React 19 copies its value into the element's `value` attribute, so
the whisper as typed is in the page's markup (`outerHTML`), where a CSS attribute selector, a
browser extension or a session-replay tool can read it, hidden or shown. `WhisperField` and the
passphrase dialog are uncontrolled for that reason; a field of your own should be too. Show
`mask(whisper)` (from `safebyok/utils`) where the user only needs to tell keys apart; read a
whisper into state only when the user asks to see or edit it, and drop it (set the state back)
when they hide it, save, or navigate away.

## Development

`pnpm justify` here runs lint, typecheck, tests (vitest + testing-library under jsdom) and the
build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from
its source, through the workspace's `@safebyok/source` export condition, so they need no build. The
tests and build resolve it through its built `dist/`, as a consumer's would, and build the core
first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild step.
