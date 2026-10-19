# safebyok-react

The thin React binding for safebyok: no vault logic, only the React-shaped plumbing a host app would
otherwise write itself.

* `VaultProvider` -- opens the vault for the signed-in user (`userId` prop from your auth) and
  keeps it matched to that identity; renders the passphrase dialog when an action run through
  `withUnlockedVault` finds the vault locked.
* `useVault()` -- the vault handle and `withUnlockedVault()`, which wraps any action that touches
  a whisper: on `vault_locked` it asks for the passphrase and retries, and resolves `null` if
  dismissed (unambiguous for reads: a whisper is never null). Every call settles: calls that
  overlap wait on one dialog, and each resolves `null` if the vault goes while it is open (a
  sign-out, another user, the provider unmounting); so does a call whose action was still under
  way when the provider closed its vault for one of those. A dialog still asking when the vault unlocks
  by any other route -- an earlier, cancelled dialog's unlock finishing late -- closes, and its
  calls run again. Beside them, `openError` and
  `retryOpen()` for an open that failed (below).
* `useVaultSnapshot()` -- the live snapshot via `useSyncExternalStore`.
* `PassphraseModal` -- the default dialog: unstyled markup under `modal-scrim` / `modal` class
  names for the host's stylesheet to dress. It says how long an unlock lasts on the device -- "Locks
  again on this device in 7 days", "in 15 minutes", "Stays unlocked ... until you lock it"
  ("Locks on this device ..." while it creates the vault) -- read from the vault itself (its
  `leaseMillis`, the `leaseHours` it was opened with). A wrong
  passphrase, or any other condition the unlock meets (storage out of reach), shows in the dialog
  in place; anything else (misuse, a bug) shows a calm "Something went wrong" with a Close
  button, and goes to React's error reporting, never to your page (*When an unlock fails*,
  below). For a vault with a passkey, "Use a passkey" comes first, ahead of the passphrase
  field, and takes the focus. It is a modal `dialog` named by its heading; Escape cancels it and
  goes no further; its error line is a live region a screen reader announces. It follows the
  vault as it changes, and starts afresh when handed another. With `allowStartOver`, a user who
  has forgotten the passphrase may retire the vault and start a new one (*Starting over*, below).
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
browser app answers like any other, `keyDeriver`, `deviceDB` and `passphraseStrengthTest`;
`vaultDB` is your backend's adapter. It answers the same bag on every call, so it is safe in a
render: the provider reopens the vault whenever a prop changes identity. So define a `logger`, a
`clock` or a `passphraseStrengthTest` of your own once, outside the component (or memoize it): a
function or object literal written in the props is a new one at every render, and reopens the
vault each time, ending any dialog. The provider warns of it once, the first time any of them
changes, through the one logger it and its vault share: your `logger` prop, or, when you pass
none, the logger your `vaultDB` was made with (the default logger, if it was given none). The vault keeps the test it
was opened with for its life; one that is no function, or none at all, is thrown at the render
that has it, as `bad_option`, to the nearest error boundary. `validators` is the exception: the provider watches each schema in
the bag rather than the bag, so `validators={{ boxlabel: BoxlabelCheck }}` is fine in the props, so
long as `BoxlabelCheck` itself is built once, at module level. A bag with a field it does not know
(`boxLabel`) is thrown, as `bad_option`, to the nearest error boundary, as `Vault.make` would refuse
it.

## When opening fails

The provider makes the vault with `Vault.make` as soon as there is a signed-in user, and hands it
down at once, its snapshot saying `opening` until its `hello()` has read storage. What happens
when `Vault.make` throws, or the hello is refused, depends on the error's family (safebyok's
`VaultErrorFamilyForKind`): who has to act. The `safebyok` README's *Errors* section lists every
kind, its family, and what it means.

**A condition stays in place.** Storage that cannot be reached (`storage_unavailable`), a user
storage no longer serves (`identity_revoked`, as when signed out of the backend, or not yet
signed in to it) or a vault whose stored props fail their checks (`damaged_vault`) arrives as
`openError`, a `VaultError`: the snapshot's `trouble`, the vault still `opening`. (A damaged lockbox never stops the open:
the snapshot lists it with `damaged: true`, for your UI to offer `retireBox()` or a fresh
`storeBox()`; see the `safebyok` README's *Damaged lockboxes*.) Show it where the vault's UI
would be, and offer `retryOpen()`, which has the vault say hello again: `openError` clears once it
settles, or names what the retry met. A browser that keeps the app from storing
anything on this device (`storage_blocked`) is a condition too, but one a retry will not mend
until the browser's settings or room change: say so, rather than offering `retryOpen()`.

```tsx
const VaultPanel = () => {
  const { vault, openError, retryOpen } = useVault()
  const { state } = useVaultSnapshot()
  if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
  if (vault === null || state === 'opening') { return <p>Opening your vault…</p> }
  return <Lockboxes vault={vault} />
}
```

Branch on `openError.kind` for a better message: an `identity_revoked` user should sign in
again, a `damaged_vault` will not mend on retry, and a `newer_format` vault was written by a
newer version of the app: the user updates, and never retires it. Its `message` is calm and safe to
show.

For a `damaged_vault`, the one way forward is to retire the vault and start over:
`retireDamagedVault()` from `useVault()` does that (the `safebyok` README's *A vault that cannot be
opened*) and has the vault say hello again, finding it absent. The user's lockboxes in it are lost for
good, so ask first:

```tsx
const { openError, retireDamagedVault } = useVault()
if (openError?.kind === 'damaged_vault') {
  return <button onClick={() => { if (confirm('Remove your vault and start over?')) { void retireDamagedVault() } }}>Start over</button>
}
```

It does nothing for any other `openError`, or none, and rejects with storage's refusal (say,
`storage_unavailable`) if retiring it fails, leaving `openError` as it was. A `stale_write` means
the vault was made anew meanwhile, so it says hello again as well; any other refusal says nothing anew
(`retryOpen()` will, should the vault read sound now).

**A sign-out the app did not hear of** -- in another tab, or a session that expired -- reaches
the vault as storage refusing it, kind `identity_revoked`, and an open vault locks itself
(the `safebyok` README's *When the user signs out*). The snapshot reads `locked`; the next `withUnlockedVault` opens the passphrase
dialog, whose unlock meets the same refusal and shows its message there. Once your auth says the
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

## When an unlock fails

**The user sees what they can mend.** A wrong passphrase, storage out of reach, a passkey that
does not answer: each condition shows in the dialog in the vault's own calm words, to try again
or cancel. So does a new passphrase too easy to guess (`weak_passphrase`): its message is the
reason the vault's `passphraseStrengthTest` gave -- with `browserOpts()`, `zxcvbnPassphraseTest`,
which asks for 12 characters and turns away common passwords, keyboard patterns and the vault's
own names. The user hears the same reason before pressing Create, as advice (below). The test is
a plain function of the passphrase and the vault's scope, so a field of your own can call the
same one as the user types: `const verdict = await passphraseStrengthTest(typed, vault.getSnapshot().scope)`,
then show `verdict.reason` while `verdict.strong` is false.

**Anything else never takes your page down.** Misuse -- a closed vault handle, an `rpId` that
does not fit the page, a vault made with a key deriver this build lacks (as in a tab left open
across a deployment) -- or a failure that is no `VaultError` is not the user's to mend, and its
message is written for you, not them. The dialog shows "Something went wrong", that their secrets
are safe, and to reload and try again, with a Close button that resolves `withUnlockedVault` to
null, as Cancel does (Escape too); the typed passphrase goes with the form. A
`PasskeyUnlockButton` that meets one takes itself away and tells `onGripe` to use the passphrase
instead; `PassphraseModal` announces that, keeps it on screen until the next submit, and moves
focus to the passphrase field. Your error boundary never sees it.

**React reports it to you.** Each component catches such a failure in an error boundary of its
own, so React hands the very error to the root's `onCaughtError`: by default the console, with the
component stack, in development and production alike. Hook your error tracker there:

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
... />`) has the dialog offer that: "Forgot it? Start a new vault" asks first, then retires the
vault on every device (`vault.retire()`, which needs no passphrase) and becomes "Choose a vault
passphrase" for the new one; the action that summoned it runs again there. It is off by default:
a vault with another way in (a second passphrase, a passkey) may not need it, and starting over
loses every lockbox.

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

**Advice while choosing.** By default the dialog `VaultProvider` renders says the
`passphraseStrengthTest`'s reason as the user chooses a weak passphrase, and nothing once the test
admits it, so they hear why before pressing Create; a `PassphraseModal` you render yourself says
nothing unless you pass it `passphraseAdvice`. Pass `passphraseAdvice`, a function of what has
been typed, to say something of your own instead (the test then goes unasked until Create); what
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

It hears the passphrase itself, in plain text, at every change -- and so does the strength test,
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

A vault may let the user in with a passkey -- a fingerprint, a face, a phone, a security key --
beside their passphrase. The core takes the passkey's answer as bytes and never calls WebAuthn;
these helpers make the calls, through the WebAuthn PRF extension (passkeys and security keys
alike: a security key's `hmac-secret` is what PRF runs on).

```tsx
import { askPasskey, createPasskey, passkeysAvailable } from 'safebyok-react'

// Adding one asks for a passphrase as proof, even while unlocked: the vault keeps no copy of its
// vaultKey to wrap anew. The vault checks it first, and only then calls createPasskey, so a
// mistyped passphrase leaves no passkey on the authenticator.
const addFingerprint = async (passphrase: string) => {
  const makePasskey = () => createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName: fullName } })
  const wayinId = await vault.addPasskey(passphrase, makePasskey, { wayinlabel: 'laptop_fingerprint' })
  if (wayinId === null) { return }   // the user dismissed the prompt
}

// Unlocking: the browser offers each of the vault's passkeys, and the one touched answers.
const passkey = await askPasskey(vault.getSnapshot().wayins)
if (passkey !== null) { await vault.unlock(passkey) }
```

* **Show the button only where it can work.** `passkeysAvailable()` says whether the browser
  offers WebAuthn; whether its authenticator offers PRF is learned only by trying, and
  `createPasskey` refuses with kind `passkey_unavailable` when it does not (as do older
  browsers, and some authenticators). Offer the passphrase then.
* **A dismissed prompt resolves null**, from either helper: WebAuthn reports a dismissal, a timeout
  and "none of these passkeys is on this device" alike, on purpose. A `createPasskey` whose second
  touch (on authenticators that answer only when asked again) is dismissed, or whose authenticator
  has no PRF, has still made a passkey: it stays on the authenticator, useless to the vault, until
  the user deletes it.
* **The passkey prompt comes after the proof.** `vault.addPasskey` checks the passphrase (a key
  derivation, and a read of storage) before it calls `createPasskey`, so the browser asks for the
  new passkey a moment after the click. Current browsers allow that; older Safari releases
  wanted WebAuthn called straight from the click and refused it otherwise, which `createPasskey`
  reports as a dismissal (null). Try it on the Safari versions you support.
* **The authenticator always checks the user.** `createPasskey` and `askPasskey` ask WebAuthn for
  `userVerification: 'required'`, so an authenticator answers only once the user has proved
  themselves to it -- a fingerprint, a face, or the device's PIN or passcode -- never for a mere
  touch. An authenticator that cannot verify its user (some older security keys) is turned away
  by the browser, which the helpers report as a dismissal (null): offer the passphrase then.
* **These passkeys are not logins.** Each is a new credential under a random user handle, so it
  never replaces a passkey your sign-in uses; its challenge is random and nothing on your server
  checks it. If you pass `rp.id` to `createPasskey`, pass the same `rpId` to `askPasskey` (and to
  `PasskeyUnlockButton`): a passkey answers only under the relying party it was made for.
* **The dialog.** `PassphraseModal` shows `PasskeyUnlockButton` first when the vault lists a
  passkey and the browser offers WebAuthn, under the page's own relying party. A dialog of your
  own can place `<PasskeyUnlockButton vault={vault} onDone={close} onGripe={setGripe} />` beside
  its field (`autoFocus` to make it the first choice); `onGripe` hears null as each press
  begins (what it said before no longer stands), each condition's message, and the button's
  word when it takes itself away.
* **A passkey can stand in for a forgotten passphrase**: `vault.addPassphrase(passkey, fresh, {
  wayinlabel })`, then `vault.retireWayin(passkey, oldId)`. A vault always keeps one passphrase:
  removing the last refuses with kind `last_wayin`.

## Development

`pnpm justify` here runs lint, typecheck, tests (vitest + testing-library under jsdom) and the
build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from
its source, through the workspace's `@safebyok/source` export condition, so they need no build. The
tests and build resolve it through its built `dist/`, as a consumer's would, and build the core
first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild step.
