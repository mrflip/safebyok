# safebyok-react

The thin React binding for safebyok: no vault logic, only the React-shaped plumbing a host app would
otherwise write itself.

* `VaultProvider` -- makes the vault for the signed-in user (`userId` prop from your auth) from
  `Vault.make`'s options, its props; says its first `hello()`; closes it as the user signs out,
  and makes a new one for the next. It is the vault's `getProof`, unless you pass one of your own:
  whenever a call on the vault needs it unlocked and finds it not -- `vault.getBox(...)`,
  `vault.putBox(...)`, or `vault.ensureLease()` on an Unlock button -- it shows the passphrase
  dialog, one at a time, and the call waits on it (*Asking for the passphrase*, below).
* `useVault()` -- the vault itself, or `null` while nobody is signed in. Its fields read live in
  an event handler; render from the snapshot.
* `useVaultSnapshot()` -- the vault's live snapshot, through
  `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`; `null` while nobody is signed in.
* `useOpenError()` -- `openError`, `retryOpen()` and `delDamagedVault()`, for an open that failed
  (below).
* `PassphraseModal` -- the shipped `getProof`'s dialog, handed one `Ask` and answering it: unstyled markup under `modal-scrim` / `modal` class
  names for the host's stylesheet to dress. It says how long an unlock lasts on the device -- "Locks
  again on this device in 7 days", "in 15 minutes", "Stays unlocked ... until you lock it"
  ("Locks on this device ..." while it creates the vault) -- read from the vault itself (its
  `leaseMillis`, the `leaseHours` it was opened with). A wrong
  passphrase shows in the dialog in place; a lock that won or storage out of reach closes it,
  answering `declined`; anything else (misuse, a bug) shows a calm "Something went wrong" with a Close
  button, and goes to React's error reporting, never to your page (*When an unlock fails*,
  below). For a vault with a passkey, "Use a passkey" comes first, ahead of the passphrase
  field, and takes the focus. It is a modal `dialog` named by its heading; Escape cancels it and
  goes no further; its error line is a live region a screen reader announces. It follows the
  vault as it changes, and starts afresh when handed another. With `allowStartOver`, a user who
  has forgotten the passphrase may delete the vault and start a new one (*Starting over*, below).
  Its passphrase field is made for password managers, with a Show / Hide button and room for your
  advice beside it (*The passphrase field*, below).
* `WhisperField` -- the field a user types or pastes a whisper into, hidden as they type, with a
  Show / Hide button; password managers and autofill are turned away (*Entering a whisper*,
  below).
* `createPasskey()`, `askPasskey()`, `passkeysAvailable()` and `PasskeyUnlockButton` -- the
  WebAuthn half of a fingerprint (passkey, security key) unlock, below. The three functions import
  no React.

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
import { browserOpts } from 'safebyok/browser'
import { VaultProvider } from 'safebyok-react'

<VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={session?.userId ?? null}
  vaultDB={vaultDB}>
  <App />
</VaultProvider>
```

The provider takes every `Vault.make` option as a prop, and throws one it does not take -- a misspelling, or a name it no longer uses -- as `bad_option`, to the nearest error boundary. `browserOpts()` supplies the three a
browser app answers like any other, `keyDeriver`, `deviceDB` and `strengthChecker`;
`vaultDB` is your backend's adapter. It answers the same bag on every call, so it is safe in a
render: the provider reopens the vault whenever a prop changes identity. So define a `logger`, a
`clock` or a `strengthChecker` of your own once, outside the component (or memoize it): a
function or object literal written in the props is a new one at every render, and reopens the
vault each time, ending any dialog. The provider warns of it once, the first time any of them
changes, through the one logger it and its vault share: your `logger` prop, or, when you pass
none, the logger your `vaultDB` was made with (the default logger, if it was given none). The vault keeps the checker it
was opened with for its life; one that is no function is thrown, as `Vault.make` refuses it, as
`bad_option`, to the nearest error boundary. Its `load`, if it carries one (`zxcvbnStrengthChecker`
fetches its dictionary), runs at the provider's `hello()`, and a load that fails is thrown, as
`unexpected_error`, to the nearest error boundary. Leave it out and every new passphrase is refused as
too weak, the dialog's advice saying so, until you choose one (the core's CUSTOMIZATION.md). `validators` is the exception: the provider watches each schema in
the bag rather than the bag, so `validators={{ boxlabel: BoxlabelCheck }}` is fine in the props, so
long as `BoxlabelCheck` itself is built once, at module level. A bag with a field it does not know
(`boxLabel`) is thrown, as `bad_option`, to the nearest error boundary, as `Vault.make` would refuse
it.

A handler is the other exception: `onBadNews` and `getProof` make no new vault as they change, so
they may be written inline. The vault calls whichever the last render passed:

```tsx
<VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB}
  onBadNews={(news) => { telemetry.report(news.refusalkind) }}>
  <App />
</VaultProvider>
```

The provider owns the vault it makes: a new user, a sign-out or a changed option closes it. Under
React's `StrictMode`, whose rehearsal in development makes a vault and closes it again at once,
that rehearsed vault reads nothing from storage: only the vault kept says hello.

**The vault arrives one render after the props that make it.** The provider makes its vault in an
effect and hands it down by setting state from that effect -- what React's `set-state-in-effect`
lint rule warns of, done here on purpose: a vault made during render would be made twice under
`StrictMode`, and one of the two never closed. For your app:

* `useVault()` and `useVaultSnapshot()` are `null` for the first render after a user signs in,
  and on the server, just as while nobody is signed in. Tell "signed out" from "not here yet" by
  your own session, so that first frame shows a spinner rather than a sign-in prompt.
* Each vault made renders everything under the provider a second time. A prop that is a new
  object at every render (above) makes a vault, and that second render, at every render.
* A changed prop or a new user closes the old vault as the new one is made, and a call still under
  way on the old one is refused: `vault_locked` if it was waiting on the dialog, `vault_closed`
  otherwise. Where your code catches refusals around a sign-out or a changed option, expect
  `vault_closed` there, though anywhere else it is misuse.

Read the vault with the hooks:

```tsx
const LockButton = () => {
  const vault = useVault()
  if (vault === null) { return <SignIn /> }
  return <button onClick={() => { void vault.lock() }}>Lock</button>
}

const BoxCount = () => {
  const snapshot = useVaultSnapshot()
  if (snapshot === null || snapshot.state === 'opening') { return <p>Opening your vault…</p> }
  return <p>{snapshot.boxes.length} keys stored</p>
}
```

## When opening fails

The provider makes the vault with `Vault.make` as soon as there is a signed-in user, and hands it
down at once, its snapshot saying `opening` until its `hello()` has read storage. What happens
when `Vault.make` throws, or the hello is refused, depends on the error's family (safebyok's
`RefusalFamilyForKind`): who has to act. The `safebyok` README's *Errors* section lists every
kind, its family, and what it means.

**A condition or bad news stays in place.** Storage that cannot be reached (`storage_unavailable`), a user
storage no longer serves (`identity_revoked`, as when signed out of the backend, or not yet
signed in to it) or a vault whose stored props fail their checks (`damaged_vault`) arrives as
`openError`, a `VaultError`: what the provider's own first `hello()` was refused with, the vault still `opening`. (A damaged box never stops the open:
the snapshot lists it with `damaged: true`, for your UI to offer `delBox()` or, while it
names its `revision_tok`, a fresh `putBox()`; see the `safebyok` README's *Damaged boxes*.) Show it where the vault's UI
would be, and offer `retryOpen()`, which has the vault say hello again: `openError` clears once it
settles, or names what the retry met. A browser that keeps the app from storing
anything on this device (`storage_blocked`) is a condition too, but one a retry will not mend
until the browser's settings or room change: say so, rather than offering `retryOpen()`.

A vault already open can come back to this. Should a later read find storage handing back an older
copy of the vault than this device has seen (`rolled_back`), the vault locks, forgets what it
held, and reads `opening` again; that refusal, the vault's `trouble`, is `openError` then. A retry
will not mend it until you accept the older copy (the `safebyok` README's *A vault rolled back*).

```tsx
const VaultPanel = () => {
  const vault = useVault()
  const snapshot = useVaultSnapshot()
  const { openError, retryOpen } = useOpenError()
  if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
  if (vault === null || snapshot === null || snapshot.state === 'opening') { return <p>Opening your vault…</p> }
  return <Boxes vault={vault} />
}
```

Branch on `openError.refusalkind` for a better message: an `identity_revoked` user should sign in
again, a `damaged_vault` will not mend on retry, and a `newer_format` vault was written by a
newer version of the app: the user updates, and never deletes it. Its `message` is calm and safe to
show.

`openError` is not the vault's `trouble`. `trouble` (on the vault and its snapshot) is the latest
bad news the vault met on any read, for as long as the vault stands -- a damaged record, a box
listed damaged, storage rolled back -- and never a condition. `openError` is only why the
provider's own hello could not open the vault, a condition among them, and clears once the vault
opens. A damaged record is both, as is a vault rolled back: the very same error.

For a `damaged_vault`, the one way forward is to delete the vault and start over:
`delDamagedVault()` from `useOpenError()` does that (the `safebyok` README's *A vault that cannot be
opened*) and has the vault say hello again, finding it absent. The user's boxes in it are lost for
good, so ask first:

```tsx
const { openError, delDamagedVault } = useOpenError()
if (openError?.refusalkind === 'damaged_vault') {
  return <button onClick={() => { if (confirm('Remove your vault and start over?')) { void delDamagedVault() } }}>Start over</button>
}
```

It does nothing for any other `openError`, or none, and rejects with storage's refusal (say,
`storage_unavailable`) if deleting it fails, leaving `openError` as it was. A `stale_write` means
the vault was made anew meanwhile, so it says hello again as well; any other refusal says nothing anew
(`retryOpen()` will, should the vault read sound now).

**A sign-out the app did not hear of** -- in another tab, or a session that expired -- reaches
the vault as storage refusing it, kind `identity_revoked`, and an open vault locks itself
(the `safebyok` README's *When the user signs out*). The snapshot reads `locked`; the next call
that needs the vault opens the passphrase dialog, whose unlock meets the same refusal and closes
it, the call refused `vault_locked`. Once your auth says the
user signed out, pass `userId={null}`, which closes the handle.

**Misuse goes to your error boundary.** A bad label or option -- a bug in the app's code -- is
thrown while rendering, as is anything rejected that is not a `VaultError`. Wrap the provider in
an error boundary, keyed on the user's identity, so the dev overlay or the boundary's fallback
shows it and a different user (or a sign-out and back in) gets a fresh attempt:

```tsx
<ErrorBoundary key={userId ?? 'signed-out'} fallback={<VaultTroubleNotice />}>
  <VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB}>
    <App />
  </VaultProvider>
</ErrorBoundary>
```

## Asking for the passphrase

Data calls never contain UI: a call that needs the vault unlocked and finds it locked (or the vault
not yet made) asks through the vault's `getProof`, which the provider is unless you pass your own.
So a component just calls the vault, and the dialog comes up on its own:

```tsx
const { ok, val: whisper } = await vault.tryGetBox('anthropic_api_key')   // asks through the dialog when locked
if (! ok) { return null }   // dismissed: refused 'vault_locked'
```

* **One dialog at a time.** Calls that overlap wait on the one dialog, and its answer settles
  them all: unlocked, each goes on; dismissed, each is refused `vault_locked`. The throwing forms
  (`vault.getBox(...)`) throw that refusal; the `try` forms resolve it as `err`.
* **A lock closes it.** A `lock()`, a sign-out, another user or the provider unmounting closes the
  dialog, and every call waiting on it is refused `vault_locked`. A lock that lands while the
  passphrase is being checked wins: the vault stays locked. So does the start over (below): a
  delete lands as a lock does.
* **Only at the user's word.** The dialog shows only while the user's gesture is in hand
  (`navigator.userActivation`, where the browser has it): a call a timer or a background sync
  makes is declined unasked, and refused `vault_locked`, or carries on under a lease that is about
  to end. A call that cannot land -- a whisper JSON cannot carry, a bad label -- is refused before
  anything is asked.
* **Unlock ahead of time** with `vault.ensureLease()` on a button: `onClick={() => { void
  vault.tryEnsureLease() }}`; `vault.ensureLease({ renewMinutes: 60 })` asks now if the lease ends
  within the hour.
* **Your own dialog**: pass `getProof={(ask) => ...}`, which the vault hands an `Ask` -- `why`
  (`absent`, `locked` or `lease_ending`), the `vault`, `attempt(proof)` and `lockLanded` -- and
  which answers `'unlocked'`, `'declined'` or (for `lease_ending` only) `'carry_on'`. It may render
  `PassphraseModal` itself: `<PassphraseModal ask={ask} onDone={answer} />`. `getProof={null}`
  asks no one: each such call is refused `vault_locked`, and the app prompts on its own,
  unlocking with `vault.unlock(passphrase)`.

## When an unlock fails

**The user sees what they can mend.** A wrong passphrase, a passkey that does not answer, a way in
stored damaged: each shows in the dialog in the vault's own calm words, to try again or cancel.
Storage out of reach, a lock that won, or a refusal the dialog cannot mend closes it, answering
`declined`, so the call that asked is refused `vault_locked`. So does a new passphrase too easy to guess (`weak_passphrase`): its message is the
reason the vault's `strengthChecker` gave -- with `browserOpts()`, `zxcvbnStrengthChecker`,
which asks for 12 characters and turns away common passwords, keyboard patterns and the vault's
own names. The user hears the same reason before pressing Create, as advice (below). A field of
your own can ask the vault's checker, held to the same contract, as the user types:
`const verdict = await vault.checkPassphrase(typed)`, then show `verdict.reason` while
`verdict.strong` is false.

**Anything else never takes your page down.** Misuse -- a closed vault handle, an `rpId` that
does not fit the page, a vault made with a key deriver this build lacks (as in a tab left open
across a deployment) -- or a failure that is no `VaultError` is not the user's to mend, and its
message is written for you, not them. The dialog shows "Something went wrong", that their secrets
are safe, and to reload and try again, with a Close button that answers `declined`, as Cancel
does (Escape too); the typed passphrase goes with the form. A
`PasskeyUnlockButton` that meets one takes itself away and tells `onGripe` to use the passphrase
instead; `PassphraseModal` announces that, keeps it on screen until the next submit, and moves
focus to the passphrase field. Your error boundary never sees it.

**What is thrown, rather than refused, reaches your error boundary.** A `strengthChecker` that
throws or answers no verdict is a bug, which the vault throws rather than refusing: met as the
user types, or at Create, the dialog throws it on to the nearest error boundary above it, as is a
`passphraseAdvice` that throws. A broken checker arrives as the vault's own `unexpected_error`
(or `bad_option`), quoting nothing of what it heard; advice that threw, as a fixed
`unexpected_error` quoting none of it. Wrap the app, or the part of it under `VaultProvider`, in
one.

**React reports it to you.** Each component catches such a failure in an error boundary of its
own, so React hands the error to the root's `onCaughtError`: by default the console, with the
component stack, in development and production alike. It arrives with nothing the user typed: a
`VaultError` keeps its kind, message and meta but never its `cause`; whatever a key deriver
throws, a `VaultError` of its own included, is the vault's `unexpected_error` with that throw as the
cause, as it heard the passphrase; and anything else arrives as a fixed `unexpected_error`
quoting none of it. (A
condition a key deriver raises is met as the same condition from storage is -- shown in the
dialog, or closing it -- and never reported.) Hook your error tracker there:

```tsx
createRoot(rootElement, {
  onCaughtError: (err, info) => { tracker.capture(err, { componentStack: info.componentStack }) },
}).render(<App />)
```

An open's misuse is the exception: `VaultProvider` throws it to your boundary at mount (*When
opening fails*, above), where it fires on every load, before any user has typed anything.

## Starting over

A forgotten passphrase cannot be recovered: the vault and its whispers are gone with it, and the
user starts a new one. `<VaultProvider allowStartOver ...>` (or `<PassphraseModal allowStartOver
... />`) has the dialog offer that: "Forgot it? Start a new vault" asks first, then deletes the
vault on every device (`vault.del()`, which needs no passphrase). A delete lands as a lock does,
so the dialog closes and the call that summoned it is refused `vault_locked`; the next call that
needs the vault asks the user to choose a passphrase for the new one. It is off by default:
a vault with a passkey still unlocks with it (though neither the passphrase nor the passkey can
be changed without the passphrase), and starting over loses every box.

## The passphrase field

The dialog's passphrase field is built to be the field a password manager handles best, so a user
can keep a long, generated passphrase without remembering it: a real `<form>`, `type="password"`,
`autocomplete="new-password"` while it creates the vault (the manager offers to generate one, and
to save it once the dialog closes) and `autocomplete="current-password"` while it unlocks (the
manager offers the one it saved). Beside it, a hidden field with `autocomplete="username"` names
what the manager files the passphrase under: by default the user and the vault, `u1 (main
vault)`. Name it yourself with `passphraseUsername`, on `VaultProvider` or `PassphraseModal` --
but never the user's sign-in name alone: the vault passphrase is not their sign-in password, and a
manager that saw a new password for their sign-in name would offer to overwrite the one they log
in with.

```tsx
<VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={userId} vaultDB={vaultDB}
  passphraseUsername={`${email} (vault)`}>
```

It has a Show / Hide button (`aria-pressed`), flipping the field between `password` and `text`,
and is never capitalized, corrected or spell-checked, shown or hidden. Like `WhisperField`, it is
uncontrolled: React never writes the passphrase into the page.

**Advice while choosing.** By default the dialog says `vault.checkPassphrase`'s reason as the
user chooses a weak passphrase, and nothing once the checker admits it, so they hear why before
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
<VaultProvider ... passphraseAdvice={passphraseAdvice}>
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
when they hide it, save, or navigate away; and to use a whisper, call `vault.useBox(boxlabel,
callback)`, which hands it to your callback and keeps it out of state altogether.

## Fingerprint unlock (passkeys)

A vault may let the user in with one passkey -- a fingerprint, a face, a phone, a security key --
beside its one passphrase. The core takes the passkey's answer as bytes and never calls WebAuthn;
these helpers make the calls, through the WebAuthn PRF extension (passkeys and security keys
alike: a security key's `hmac-secret` is what PRF runs on).

```tsx
import { askPasskey, createPasskey, passkeysAvailable } from 'safebyok-react'

// Putting one asks for the passphrase as proof, even while unlocked: the vault keeps no copy of
// its vaultKey to wrap anew. Make the passkey first, then hand its answer to the vault. A vault
// holds at most one passkey: putting another replaces it.
const addFingerprint = async (passphrase: string) => {
  const answer = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName: fullName } })
  if (answer === null) { return }   // the user dismissed the prompt
  await vault.putWayin(passphrase, answer)
}

// Removing it, again with the passphrase as proof.
const removeFingerprint = async (passphrase: string) => { await vault.delWayin(passphrase) }

// Unlocking, inside a getProof of your own: the browser asks the user to touch the vault's
// passkey, and it answers.
const passkey = await askPasskey(ask.vault.passkey)
if (passkey !== null) { const { ok } = await ask.attempt(passkey) }
```

* **Show the button only where it can work.** `passkeysAvailable()` says whether the browser
  offers WebAuthn; whether its authenticator offers PRF is learned only by trying, and
  `createPasskey` refuses with kind `passkey_unavailable` when it does not (as do older
  browsers, and some authenticators). Offer the passphrase then.
* **A dismissed prompt resolves null**, from either helper: WebAuthn reports a dismissal, a timeout
  and "that passkey is not on this device" alike, on purpose. A `createPasskey` whose second
  touch (on authenticators that answer only when asked again) is dismissed, or whose authenticator
  has no PRF, has still made a passkey: it stays on the authenticator, useless to the vault, until
  the user deletes it.
* **The passkey is made before the proof is checked.** `vault.putWayin` takes the passkey's
  answer, so `createPasskey` runs first, straight from the click, as WebAuthn wants. A passphrase
  the vault then refuses (a typo) leaves that passkey on the authenticator, a way into nothing:
  the user deletes it there, and the next try makes another.
* **The authenticator always checks the user.** `createPasskey` and `askPasskey` ask WebAuthn for
  `userVerification: 'required'`, so an authenticator answers only once the user has proved
  themselves to it -- a fingerprint, a face, or the device's PIN or passcode -- never for a mere
  touch. An authenticator that cannot verify its user (some older security keys) is turned away
  by the browser, which the helpers report as a dismissal (null): offer the passphrase then.
* **These passkeys are not logins.** Each is a new credential under a random user handle, so it
  never replaces a passkey your sign-in uses; its challenge is random and nothing on your server
  checks it. If you pass `rp.id` to `createPasskey`, pass the same `rpId` to `askPasskey` (and to
  `PasskeyUnlockButton`): a passkey answers only under the relying party it was made for.
* **The dialog.** `PassphraseModal` shows `PasskeyUnlockButton` first when the vault has a
  passkey and the browser offers WebAuthn, under the page's own relying party. A dialog of your
  own can place `<PasskeyUnlockButton ask={ask} onDone={answer} onGripe={setGripe} />` beside
  its field (`autoFocus` to make it the first choice); `onDone` hears `'unlocked'`, or
  `'declined'` for a refusal that closes the dialog; `onGripe` hears null as each press
  begins (what it said before no longer stands), each message to show in place, and the button's
  word when it takes itself away.
* **A passkey unlocks; only the passphrase changes things.** `vault.putWayin(passphrase,
  newPassphrase)`, `vault.putWayin(passphrase, answer)` and `vault.delWayin(passphrase)` each take
  the standing passphrase as proof, never a passkey's answer (refused as `bad_option`). A user who forgot the passphrase can still unlock
  with the passkey, but can set a new passphrase only by starting over (*Starting over*, above).
  A new passphrase removes the passkey, which was matched to the old one: offer to add it again,
  under the new passphrase, once the change lands.

## Development

`pnpm justify` here runs lint, typecheck, tests (vitest + testing-library under jsdom) and the
build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from
its source, through the workspace's `@safebyok/source` export condition, so they need no build. The
tests and build resolve it through its built `dist/`, as a consumer's would, and build the core
first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild step.
