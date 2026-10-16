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
  sign-out, another user, the provider unmounting). A dialog still asking when the vault unlocks
  by any other route -- an earlier, cancelled dialog's unlock finishing late -- closes, and its
  calls run again. Beside them, `openError` and
  `retryOpen()` for an open that failed (below).
* `useVaultSnapshot()` -- the live snapshot via `useSyncExternalStore`.
* `PassphraseModal` -- the default dialog: unstyled markup under `modal-scrim` / `modal` class
  names for the host's stylesheet to dress. It says how long an unlock lasts on the device -- "Locks
  again on this device in 7 days", "in 15 minutes", "Stays unlocked ... until you lock it"
  ("Locks on this device ..." while it creates the vault) -- read from the vault itself (its
  `reentryWindowMillis`, the `forcePassphraseReentryHours` it was opened with). A wrong
  passphrase, or any other condition the unlock meets (storage out of reach), shows in the dialog
  in place; anything else (misuse, a bug) shows a calm "Something went wrong" with a Close
  button, and goes to React's error reporting, never to your page (*When an unlock fails*,
  below). For a vault with a passkey, "Use a passkey" comes first, ahead of the passphrase
  field, and takes the focus. It is a modal `dialog` named by its heading; Escape cancels it and
  goes no further; its error line is a live region a screen reader announces. It follows the
  vault as it changes, and starts afresh when handed another. With `allowStartOver`, a user who
  has forgotten the passphrase may erase the vault and start a new one (*Starting over*, below).
* `WhisperField` -- the field a user types or pastes a whisper into, hidden as they type, with a
  Show / Hide button; password managers are asked to leave it alone (*Entering a whisper*,
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

## Use

```tsx
import { browserOpts } from 'safebyok/browser'
import { VaultProvider } from 'safebyok-react'

<VaultProvider {...browserOpts()} applabel="acme" vaultlabel="main" userId={session?.userId ?? null}
  vaultDB={vaultDB}>
  <App />
</VaultProvider>
```

The provider takes every `openVault` option as a prop. `browserOpts()` supplies the two a browser
app answers like any other, `keyDeriver` and `deviceDB`; `vaultDB` is your backend's adapter. It
answers the same bag on every call, so it is safe in a render: the provider reopens the vault
whenever a prop changes identity. So define a `logger` or a `clock` once, outside the component (or
memoize it): an object literal written in the props is a new one at every render, and reopens
the vault each time. The provider warns of it once, through your logger (or the console, when
you pass none), the first time either changes. `passphraseStrengthTest` never reopens it: it
plays no part in opening, so the vault runs whichever test the latest render passed, and an arrow
in the props is fine. `validators` is the other exception: the provider watches each schema in
the bag rather than the bag, so `validators={{ boxlabel: BoxlabelCheck }}` is fine in the props, so
long as `BoxlabelCheck` itself is built once, at module level. A bag with a field it does not know
(`boxLabel`) is thrown, as `bad_option`, to the nearest error boundary, as `openVault` would refuse
it.

## When opening fails

What happens when `openVault` rejects depends on the error's family (safebyok's
`VaultErrorFamilyForKind`): who has to act. The `safebyok` README's *Errors* section lists every
kind, its family, and what it means.

**A condition stays in place.** Storage that cannot be reached (`storage_unavailable`), a user
storage no longer serves (`identity_revoked`, as when signed out of the backend, or not yet
signed in to it) or a stored vault
bundle that fails its checks (`damaged_bundle`) arrives as `openError`, a `VaultError`, with
`vault` still null. (A damaged lockbox never stops the open: the snapshot lists it with
`damaged: true`, for your UI to offer `erase()` or a fresh `store()`; see the `safebyok`
README's *Damaged lockboxes*.) Show it where the vault's UI would be, and offer `retryOpen()`, which clears it and
opens again; a failed open leaves no storage watch behind, so retrying costs nothing:

```tsx
const VaultPanel = () => {
  const { vault, openError, retryOpen } = useVault()
  if (openError !== null) { return <p>{"Can't reach your vault."} <button onClick={retryOpen}>Retry</button></p> }
  if (vault === null) { return <p>Opening your vault…</p> }
  return <Lockboxes vault={vault} />
}
```

Branch on `openError.kind` for a better message: an `identity_revoked` user should sign in
again, a `damaged_bundle` will not mend on retry, and a `newer_format` vault was written by a
newer version of the app: the user updates, and never erases it. Its `message` is calm and safe to
show.

For a `damaged_bundle`, the one way forward is to erase the vault and start over:
`eraseDamagedVault()` from `useVault()` does that (the `safebyok` README's *A vault that cannot be
opened*) and opens again, with the provider's own options. The user's lockboxes in it are lost for
good, so ask first:

```tsx
const { openError, eraseDamagedVault } = useVault()
if (openError?.kind === 'damaged_bundle') {
  return <button onClick={() => { if (confirm('Erase your vault and start over?')) { void eraseDamagedVault() } }}>Start over</button>
}
```

It does nothing for any other `openError`, or none, and rejects with storage's refusal (say,
`storage_unavailable`) if the erase fails, leaving `openError` as it was. A `stale_write` means
the vault was made anew meanwhile, so it opens again as well; any other refusal opens nothing
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
reason the vault's `passphraseStrengthTest` gave, at least 12 characters by default. Pass
`passphraseStrengthTest={zxcvbnPassphraseTest}` (from `safebyok/browser`) to the provider to turn
away common passwords and keyboard patterns too; it is a few hundred kB of dictionary, so it is
its own import. The test is a plain function of the passphrase, so a field of your own can call
the same one as the user types: `const verdict = passphraseStrengthTest(typed)`, then show
`verdict.reason` while `verdict.strong` is false (await it, should yours answer a promise).

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
... />`) has the dialog offer that: "Forgot it? Start a new vault" asks first, then erases the
vault on every device (`vault.destroy()`, which needs no passphrase) and becomes "Choose a vault
passphrase" for the new one; the action that summoned it runs again there. It is off by default:
a vault with another way in (a second passphrase, a passkey) may not need it, and it erases
every lockbox.

## The dialog's words

Every word the binding shows a user lives in one module, `src/messages.ts`, sentence by
sentence, in English; real locales come later. The dialog phrases how long an unlock lasts with
`Intl.RelativeTimeFormat`, which every current browser has. An engine without it shows the
dialog without that line, and the provider warns you once; to show it there, import the
standard polyfill yourself, before the app renders:

```ts
import '@formatjs/intl-relativetimeformat/polyfill'
import '@formatjs/intl-relativetimeformat/locale-data/en'
```

## Entering a whisper

`WhisperField` is a controlled input for an API key or another whisper: hidden as the user types,
with a Show / Hide button (`aria-pressed`) to check it. It is named `whisper_text` -- a password
manager looks for `key`, `password` and `token` -- and carries `WhisperFieldAttributes` from
`safebyok/utils`: each major password manager's flag to ignore it, `autocomplete="new-password"`,
and no capitalizing, correcting or spell-checking (a browser's enhanced spell-check may send what
is typed to its maker's servers). It shows no placeholder unless you give one; any other input
attribute passes through.

```tsx
import { WhisperField } from 'safebyok-react'

const [keyText, setKeyText] = useState('')
<WhisperField value={keyText} onChange={setKeyText} placeholder="sk-ant-…" aria-label="Anthropic API key" />
```

A field of your own, or another framework's, spreads the same attributes:
`<input name="whisper_text" type="password" {...WhisperFieldAttributes} />`. Each manager
honors only its own flag, and a browser's built-in manager may honor none.

## Revealing a whisper

A whisper you show the user -- a "view" button, an edit form filled with the stored key, the
field above while they type -- is in React state, and so in your component tree's memory, until
that state lets go of it: React DevTools shows it, and an error reporter that captures props or
state may send it. That is the cost of showing it; keep it as small as the feature allows. Show
`mask(whisper)` (from `safebyok/utils`) where the user only needs to tell keys apart; read a
whisper into state only when the user asks to see or edit it, and drop it (set the state back)
when they hide it, save, or navigate away; and to use a whisper, call `vault.use(boxlabel,
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
  const unlockId = await vault.addPasskey(passphrase, makePasskey, { unlocklabel: 'laptop_fingerprint' })
  if (unlockId === null) { return }  // the user dismissed the prompt
}

// Unlocking: the browser offers each of the vault's passkeys, and the one touched answers.
const passkey = await askPasskey(vault.getSnapshot().unlocks)
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
  unlocklabel })`, then `vault.removeUnlock(passkey, oldId)`. A vault always keeps one passphrase:
  removing the last refuses with kind `last_unlock`.

## Development

`pnpm justify` here runs lint, typecheck, tests (vitest + testing-library under jsdom) and the
build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from
its source, through the workspace's `@safebyok/source` export condition, so they need no build. The
tests and build resolve it through its built `dist/`, as a consumer's would, and build the core
first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild step.
