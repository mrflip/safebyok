# safebyok-react

The thin React binding for safebyok: no vault logic, only the React-shaped plumbing a host app would
otherwise write itself.

* `BankProvider` -- makes the app's bank (`Bank.make`) from its props, for the signed-in user
  (the `userId` prop from your auth); lets every vault in it go as the user signs out or changes
  (`bank.closeVaults()`). It is the vaults' `requestCleartext`, unless you pass one of your own:
  whenever a call on a vault needs the user -- `vault.getWhisper(...)`, `vault.putBox(...)` or
  `vault.ensureUnlocked()` on a vault locked, `vault.putWayin(...)`, `vault.delWayin('passkey')`,
  `vault.del()` -- it shows the dialog for that gating's kind, one at a time, and the call waits on
  it (*Asking for the passphrase*, below).
* `useVault(vaultlabel)` -- the bank's entry for the user's vault under that label, asking the
  bank for it (`bank.ensureVault`) when it holds none: `starting`, `timely` with its Vault object,
  or `refused` with why; `null` while nobody is signed in, and until the ask lands. Its Vault
  object's fields read live in an event handler; render from the snapshot.
* `useVaultSnapshot(vaultlabel)` -- that vault's live snapshot, through
  `useSyncExternalStore(vault.subscribe, vault.getSnapshot)`; `null` while there is no Vault object.
* `useBank()` -- the bank itself, to ask for a vault again (`bank.ensureVault`), or to take the
  ways past a refusal: `bank.delDamagedVault`, `bank.clearCachedVault` (*When opening fails*, below).
* `GatingModal` -- the shipped `requestCleartext`'s dialog, handed one gating and answering it,
  one form per `gatingkind`: the passphrase dialog, `PassphraseModal`, for an unlock or a first
  passphrase; the current passphrase and the next for `change_passphrase`, a new passphrase typed
  twice, at a change as at the first (a submit whose two differ is refused in place, before
  anything is attempted, so that a typo never becomes the vault's passphrase); the passphrase, then a
  passkey the browser makes, for `put_passkey`; the passphrase for `del_passkey` and `del_vault`.
  Unstyled markup under `modal-scrim` / `modal` class names for the host's stylesheet to dress.
  It says how long an unlock lasts on the device -- "Locks again on this device in 7 days", "in 15
  minutes", "Stays unlocked ... until you lock it" ("Locks on this device ..." while it creates the
  vault) -- read from the vault itself (its `leaseMillis`, the `leaseHours` it was opened with). A
  refusal the user can correct -- a wrong passphrase, a weak or unchanged new one, a way in that
  cannot answer -- shows in the dialog in place, and the dialog asks again; a lock that won or
  storage out of reach closes it, answering `declined`; anything else (misuse, a bug) shows a calm
  "Something went wrong" with a Close button, and goes to React's error reporting, never to your
  page (*When an unlock fails*, below). For a vault with a passkey, "Use a passkey" comes first in
  the passphrase dialog, ahead of the field, and takes the focus. It is a modal `dialog` named by
  its heading; Escape cancels it and goes no further; its error line is a live region a screen
  reader announces. It follows the vault as it changes, and starts afresh when handed another
  gating. `allowStartOver` offers nothing for now (*Starting over*, below). Its passphrase fields
  are made for password managers, with a Show / Hide button and room for your advice beside a new
  one (*The passphrase field*, below).
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
import { BankProvider } from 'safebyok-react'

<BankProvider {...browserOpts()} applabel="acme" userId={session?.userId ?? null} vaultDB={vaultDB}>
  <App />
</BankProvider>
```

The provider takes every `Bank.make` option as a prop, beside the signed-in `userId`, and throws
one it does not take -- a misspelling, a name it no longer uses, or a `vaultlabel`, which each hook
names -- as `bad_option`, to the nearest error boundary. `browserOpts()` supplies the three a
browser app answers like any other, `keyDeriver`, `deviceDB` and `strengthChecker`;
`vaultDB` is your backend's adapter. It answers the same bag on every call, so it is safe in a
render: the provider makes a new bank, letting the last one's vaults go, whenever a prop changes
identity. So define a `logger`, a
`clock` or a `strengthChecker` of your own once, outside the component (or memoize it): a
function or object literal written in the props is a new one at every render, and makes the bank
anew each time, ending any dialog. The provider warns of it once, the first time any of them
changes, through the one logger it and its bank share: your `logger` prop, or, when you pass
none, the logger your `vaultDB` was made with (the default logger, if it was given none). The bank keeps the checker it
was made with for its life; one that is no function is thrown, as `Bank.make` refuses it, as
`bad_option`, to the nearest error boundary. Its `load`, if it carries one (`zxcvbnStrengthChecker`
fetches its dictionary), runs at the bank's `hello()`, before a vault is born, and a load that
fails is thrown, as `unexpected_error`, to the nearest error boundary. Leave it out and every new passphrase is refused as
too weak, the dialog's advice saying so, until you choose one (the core's CUSTOMIZATION.md). `validators` is the exception: the provider watches each schema in
the bag rather than the bag, so `validators={{ boxlabel: BoxlabelCheck }}` is fine in the props, so
long as `BoxlabelCheck` itself is built once, at module level. A bag with a field it does not know
(`boxLabel`) is thrown, as `bad_option`, to the nearest error boundary, as `Bank.make` would refuse
it.

A handler is the other exception: `onBadNews` and `requestCleartext` make no new bank as they change, so
they may be written inline. The vaults call whichever the last render passed:

```tsx
<BankProvider {...browserOpts()} applabel="acme" userId={userId} vaultDB={vaultDB}
  onBadNews={(news) => { telemetry.report(news.refusalkind) }}>
  <App />
</BankProvider>
```

The provider owns the bank it makes, and the vaults in it: a new user, a sign-out or a changed
option lets them go (`bank.closeVaults()`), and so does the provider unmounting. Under React's
`StrictMode`, whose rehearsal in development asks for a vault and lets it go again at once, that
rehearsal reads nothing from storage: only the vault kept is born.

**A vault is asked for by the hook that names it.** `useVault('main')` asks the bank for the
user's `main` vault as it mounts, unless the bank holds an entry for it already, and renders from
that entry as it changes. Two components naming one vault share its one Vault object. The
provider makes its bank in an effect, sets it as state from that effect -- what React's
`set-state-in-effect` lint rule warns of, done here on purpose: a bank made during render would be
made twice under `StrictMode`, and one of the two never let go -- and the hook asks in an effect of
its own. For your app:

* `useBank()`, `useVault('main')` and `useVaultSnapshot('main')` are `null` for the renders after a user
  signs in, until the ask lands, and on the server, just as while nobody is signed in. Tell
  "signed out" from "not here yet" by your own session, so those frames show a spinner rather
  than a sign-in prompt.
* Each bank made renders everything under the provider again, and each change to an entry renders
  the components that read it. A prop that is a new object at every render (above) makes a bank,
  and those renders, at every render.
* A changed prop or a new user lets the old vaults go, and every call on an old Vault object, one
  still under way or waiting on the dialog among them, is refused `vault_gone`. Where your code
  catches refusals around a sign-out or a changed option, expect `vault_gone` there.

Read a vault with the hooks:

```tsx
const VaultPanel = () => {
  const entry = useVault('main')
  if (entry === null || entry.status === 'starting') { return <p>Opening your vault…</p> }
  if (entry.vault === null) { return <p>{"Can't open your vault: "}{entry.err?.message}</p> }
  const { vault } = entry
  return <button onClick={() => { void vault.lock() }}>Lock</button>
}

const BoxCount = () => {
  const snapshot = useVaultSnapshot('main')
  if (snapshot === null) { return <p>Opening your vault…</p> }
  return <p>{snapshot.boxes.length} keys stored</p>
}
```

## When opening fails

The provider makes its bank with `Bank.make` as soon as there is a signed-in user, and
`useVault('main')` asks it for the vault: one read of storage that births the Vault object, or is
refused. The entry is `starting` until it settles. What happens when `Bank.make` throws, or the
birth is refused, depends on the error's family (safebyok's `RefusalFamilyForKind`): who has to
act. The `safebyok` README's *Errors* section lists every kind, its family, and what it means.

**A condition or bad news stays in place,** in the entry: `refused`, its `err` a `VaultError`, no
Vault object. Storage that cannot be reached (`storage_unavailable`), a user storage no longer
serves (`identity_revoked`, as when signed out of the backend, or not yet signed in to it), a
vault whose stored props fail their checks (`damaged_vault`), or storage serving an older copy of
the vault than this device has seen (`vault_behind`). (A damaged box never stops the birth:
the snapshot lists it with `damaged: true`, for your UI to offer `delBox()` or, while it
names its `revision_tok`, a fresh `putBox()`; see the `safebyok` README's *Damaged boxes*.) Show
it where the vault's UI would be. **A refused entry stays refused until the app asks again**:
`useBank().ensureVault({ userId, vaultlabel: 'main' })` reads storage afresh, the entry `starting`
while it reads, then `timely`, or `refused` with what it met. A browser that keeps the app from
storing anything on this device (`storage_blocked`) is a condition too, but one asking again will
not mend until the browser's settings or room change: say so, rather than offering a Retry.

```tsx
const VaultPanel = ({ userId }: { userId: string }) => {
  const bank = useBank()
  const entry = useVault('main')
  if (entry?.err) {
    return <p>{"Can't reach your vault."} <button onClick={() => { void bank?.tryEnsureVault({ userId, vaultlabel: 'main' }) }}>Retry</button></p>
  }
  if (! entry?.vault) { return <p>Opening your vault…</p> }
  return <Boxes vault={entry.vault} />
}
```

Branch on `entry.err.refusalkind` for a better message: an `identity_revoked` user should sign in
again, a `damaged_vault` will not mend on retry, and a `newer_format` vault was written by a
newer version of the app: the user updates, and never deletes it. Its `message` is calm and safe to
show.

**A vault deleted stays gone.** Deleted by its own `del()`, or found deleted (`vault_gone`) or
deleted and made anew (`vault_remade`) by a later read, here or on another device, its Vault
object is gone, and its entry is `refused` with that kind. Nothing asks for it again on its own: a
new vault, `novel`, is stored only once the app asks the bank (`bank.ensureVault`), as on the
user's "Start a new vault".

**A vault behind this device.** Should a later read find storage handing back an older copy of the
vault than this device has seen, the vault takes nothing from it, and locks: the entry stays
`timely`, the vault `locked`, its snapshot's `trouble` `vault_behind`. At birth, the entry is
`refused` `vault_behind`. Asking again will not mend it: it holds until storage serves the newer
copy again, or the user or the host, sure the older copy was restored on purpose, has this device
accept it with `bank.clearCachedVault` (the `safebyok` README's *A vault behind this device*). That
lets the entry go, so `useVault` asks for the vault again:

```tsx
const bank = useBank()
const acceptRestore = async () => {
  if (bank === null) { return }
  await bank.clearCachedVault({ userId, vaultlabel: 'main' })
  await bank.ensureVault({ userId, vaultlabel: 'main' })
}
```

**A damaged vault.** For a `damaged_vault`, the one way forward is to delete the vault and start
over: `bank.delDamagedVault({ userId, vaultlabel: 'main' })` does that with the bank's own stores
(the `safebyok` README's *A vault that cannot be opened*), and lets the entry go, so `useVault`
asks for the vault again: a new one, `novel`, for the user to choose a passphrase for. The user's
boxes in it are lost for good, so ask first. It refuses with storage's refusal (say,
`storage_unavailable`) if deleting it fails, the entry left as it was; `stale_write` means the
vault was made anew meanwhile, and `bad_option` that it reads sound now: ask for it again.

**A sign-out the app did not hear of** -- in another tab, or a session that expired -- reaches
the vault as storage refusing it, kind `identity_revoked`, and a vault already born locks itself
(the `safebyok` README's *When the user signs out*). The snapshot reads `locked`; the next call
that needs the vault opens the passphrase dialog, whose unlock meets the same refusal and closes
it, the call refused `vault_locked`. Once your auth says the
user signed out, pass `userId={null}`, which lets the vaults go.

**Misuse goes to your error boundary.** A bad label or option -- a bug in the app's code -- is
thrown while rendering, as is a birth refused as misuse, or with anything that is not a
`VaultError`: `BankProvider` throws what `Bank.make` refuses, and `useVault` what the birth was
refused with. Wrap the provider in an error boundary, keyed on the user's identity, so the dev
overlay or the boundary's fallback shows it and a different user (or a sign-out and back in) gets
a fresh attempt:

```tsx
<ErrorBoundary key={userId ?? 'signed-out'} fallback={<VaultTroubleNotice />}>
  <BankProvider {...browserOpts()} applabel="acme" userId={userId} vaultDB={vaultDB}>
    <App />
  </BankProvider>
</ErrorBoundary>
```

## Asking for the passphrase

Data calls never contain UI: a call that needs the vault unlocked and finds it locked (or `novel`,
with no passphrase yet) raises a gating, handed to the vault's `requestCleartext`, which the provider is unless you pass your own.
So a component just calls the vault, and the dialog comes up on its own:

```tsx
const { ok, val: whisper } = await vault.tryGetWhisper('anthropic_api_key')   // asks through the dialog when locked
if (! ok) { return null }   // dismissed: refused 'vault_locked'
```

* **One dialog at a time.** Calls that overlap wait on the one dialog, and its answer settles
  them all: unlocked, each goes on; dismissed, each is refused `vault_locked`. The throwing forms
  (`vault.getWhisper(...)`) throw that refusal; the `try` forms resolve it as `err`.
* **A lock closes it.** A `lock()` closes the dialog, and every call waiting on it is refused
  `vault_locked`. A lock that lands while the passphrase is being checked wins: the vault stays
  locked. A sign-out, another user, a changed prop or the provider unmounting lets the vault go,
  which closes it too: the Vault object is gone, and the calls waiting on the dialog are refused
  `vault_gone`.
* **Only at the user's word.** The dialog shows only while the user's gesture is in hand
  (`navigator.userActivation`, where the browser has it): a call a timer or a background sync
  makes is declined unasked, and refused `vault_locked`. A call that cannot land -- a whisper JSON cannot carry, a bad label -- is refused before
  anything is asked.
* **Unlock ahead of time** with `vault.ensureUnlocked()` on a button: `onClick={() => { void
  vault.tryEnsureUnlocked() }}`; `vault.ensureUnlocked({ renewMinutes: 60 })` asks now if the
  lease ends within the hour.
* **Changes to the ways in, and deleting the vault**, raise gatings of their own kinds:
  `vault.putWayin('passphrase')` raises `change_passphrase` (`initialize_gate` on a vault with no
  passphrase yet), `vault.putWayin('passkey')` raises `put_passkey`, `vault.delWayin('passkey')`
  raises `del_passkey`, and `vault.del()` raises `del_vault`. The provider's dialog asks for each,
  proven by the passphrase; cancelled, the call refuses `vault_locked`, its message saying what
  stands ("The passphrase is unchanged.", "Nothing was deleted."), and nothing was changed.
  `vault.putWayin('passkey')` on a vault with no passphrase yet refuses `absent_vault`, asking
  nothing: a passkey is added under the passphrase.
* **A call behind another kind's dialog waits.** One gating stands per vault. A call that needs
  the vault unlocked while a change's or a deletion's dialog is up waits for that dialog to close,
  and does not show in it. A change made leaves the vault unlocked, so the waiting call goes on
  unasked; a change cancelled lets the call ask for the passphrase in a dialog of its own, as
  soon as the first has closed (shown only while the user's gesture is in hand, as ever). A
  deletion made leaves the Vault object gone, and the waiting call refuses `vault_gone`. Calls
  asking for one kind join its dialog: two unlocks, or two passphrase changes, share one.
* **Your own dialog**: pass `requestCleartext={(gating) => ...}`, which the vault hands a gating
  -- its `gatingkind`, the `vault`, the kind's attempt, `decline()` and `lockLanded` -- and which
  resolves once the dialog closes. It may render `GatingModal` itself for every kind,
  `<GatingModal gating={gating} onDone={close} />`, or `PassphraseModal` for an unlock or a
  first passphrase. `requestCleartext={null}` asks no one: each such call is refused
  `vault_locked`.

## When an unlock fails

**The user sees what they can mend.** A wrong passphrase, a passkey that does not answer, a way in
gone or stored damaged, a new passphrase too easy to guess (`weak_passphrase`) or the one the vault
already has (`same_passphrase`): each shows in the dialog in the vault's own calm words, and the
gating stays open for the user to try again or cancel. These are the core's
`CorrectableKindVals`; nothing tries again for the user. A weak passphrase's message is the reason
the vault's `strengthChecker` gave -- with `browserOpts()`, `zxcvbnStrengthChecker`, which asks
for 12 characters and turns away common passwords, keyboard patterns and the vault's own names.
The user hears the same reason before pressing Create, as advice (below). A field of your own can
ask the vault's checker, held to the same contract, as the user types:
`const { ok, err } = await vault.tryCheckStrength(typed)`, then show `err.message` while `err` is
a `weak_passphrase`.

**The rest closes the dialog.** Storage out of reach, a lock that won, a vault gone, or a refusal
the dialog cannot mend closes it, answering `declined`; the call that asked hears that refusal.
A first passphrase that lost the race to one set on another device (`gate_made_elsewhere`)
closes it too: the call that asked refuses `gate_made_elsewhere`, and the next call asks to
unlock with the passphrase chosen there.

**Anything else never takes your page down.** Misuse -- an `rpId` that
does not fit the page, a vault made with a key deriver this build lacks (as in a tab left open
across a deployment) -- or a failure that is no `VaultError` is not the user's to mend, and its
message is written for you, not them. The dialog shows "Something went wrong", that their secrets
are safe, and to reload and try again, with a Close button that answers `declined`, as Cancel
does (Escape too); the typed passphrase goes with the form. A
`PasskeyUnlockButton` that meets one takes itself away and tells `onGripe` to use the passphrase
instead; `PassphraseModal` announces that, keeps it on screen until the next submit, and moves
focus to the passphrase field. Your error boundary never sees it.

**React reports it to you.** Each component catches such a failure in an error boundary of its
own, so React hands the error to the root's `onCaughtError`: by default the console, with the
component stack, in development and production alike. It arrives with nothing the user typed: a
`VaultError` keeps its kind, message and meta but never its `cause`; whatever a key deriver
throws, a `VaultError` of its own included, is the vault's `unexpected_error`, carrying nothing of
the throw, as it heard the passphrase; a `strengthChecker` that threw, or answered no verdict, is the
vault's own refusal of it (`unexpected_error` quoting none of it, or `bad_option`); and anything
else -- a `passphraseAdvice` that threw, say -- arrives as a fixed `unexpected_error` quoting none
of it. (A key deriver's `VaultError` of the condition family keeps its kind, in safebyok's own
words, and is met as any condition is -- shown in the dialog, or closing it -- and never
reported.) Hook your error tracker there:

```tsx
createRoot(rootElement, {
  onCaughtError: (err, info) => { tracker.capture(err, { componentStack: info.componentStack }) },
}).render(<App />)
```

An open's misuse is the exception: `BankProvider` and `useVault` throw it to your boundary at mount (*When
opening fails*, above), where it fires on every load, before any user has typed anything.

## Starting over

A forgotten passphrase cannot be recovered: the vault and its whispers are gone with it. Deleting
a vault is proven by its passphrase (`vault.del()` raises a `del_vault` gating), so a user who has
forgotten it cannot delete it from the dialog: "Forgot it? Start a new vault" is not offered for
now, and `allowStartOver` and `onStartedOver` are taken and do nothing. A vault with a passkey
still unlocks with it.

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
<BankProvider {...browserOpts()} applabel="acme" userId={userId} vaultDB={vaultDB}
  passphraseUsername={`${email} (vault)`}>
```

It has a Show / Hide button (`aria-pressed`), flipping the field between `password` and `text`,
and is never capitalized, corrected or spell-checked, shown or hidden. Like `WhisperField`, it is
uncontrolled: React never writes the passphrase into the page.

**Typed twice when new.** A new passphrase -- the vault's first, or the next at a change -- is
typed again in a confirmation field below it, also `autocomplete="new-password"`, so that a
manager that generates one fills both. A typo would otherwise become the vault's passphrase
(at a change, the passkey goes with the old one), and once this device's unlock ends, nobody
could open the vault. A submit whose two differ is refused in place, before any key is derived or
anything is stored: "The new passphrase and its confirmation don't match: type the same one in
both." The confirmation field is then marked `aria-invalid` and described by that message
(`aria-describedby`), until the user types again. The two are compared only at the submit; the
confirmation field is uncontrolled too, and the advice never hears it. The unlock form, and the
current passphrase at a change, ask once.

**Advice while choosing.** By default the dialog says the reason `vault.tryCheckStrength` gives
as the user chooses a weak passphrase (a first one, or the next at a change), and nothing once the checker admits it, so they hear why before
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
when they hide it, save, or navigate away; and to use a whisper, call `vault.useWhisper(boxlabel,
callback)`, which hands it to your callback and keeps it out of state altogether.

## Fingerprint unlock (passkeys)

A vault may let the user in with one passkey -- a fingerprint, a face, a phone, a security key --
beside its one passphrase. The core takes the passkey's answer as bytes and never calls WebAuthn;
these helpers make the calls, through the WebAuthn PRF extension (passkeys and security keys
alike: a security key's `hmac-secret` is what PRF runs on).

```tsx
import { askPasskey, createPasskey, passkeysAvailable } from 'safebyok-react'

// Putting one asks for the passphrase as proof, even while unlocked: the vault keeps no copy of
// its vaultKey to wrap anew. vault.putWayin('passkey') raises a put_passkey gating; in your
// dialog for it, make the passkey first, then attempt with the passphrase. A vault holds at most
// one passkey: putting another replaces it.
const answer = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName: fullName } })
if (answer !== null) { await gating.attempt(passphrase, answer) }   // null: the user dismissed the prompt

// Removing it, again with the passphrase as proof: vault.delWayin('passkey') raises del_passkey.

// Unlocking, inside an unlock_vault gating's dialog of your own: the browser asks the user to
// touch the vault's passkey, and it answers.
const passkey = await askPasskey(gating.vault.passkey)
if (passkey !== null) { const { ok } = await gating.attemptPasskey(passkey) }
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
* **The passkey is made before the attempt.** A `put_passkey` attempt takes the passkey's
  answer, so `createPasskey` runs first, straight from the click, as WebAuthn wants. The attempt
  checks the passphrase before it uses the answer, so a typo returns to the dialog with the answer
  unspent; an attempt refused otherwise leaves that passkey on the authenticator, a way into
  nothing: the user deletes it there, and the next try makes another.
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
  own can place `<PasskeyUnlockButton gating={gating} onDone={close} onGripe={setGripe} />` beside
  its field (`autoFocus` to make it the first choice); `onDone` hears `'unlocked'`, or
  `'declined'` for a refusal that closes the dialog; `onGripe` hears null as each press
  begins (what it said before no longer stands), each message to show in place, and the button's
  word when it takes itself away. `GatingModal`'s form for `put_passkey` asks for the passphrase,
  then makes the passkey at each submit, filed under `passphraseUsername` for a relying party
  named for the `applabel`, at the page's own domain. It keeps no answer across attempts: after a
  typo, the next submit makes another passkey, and the first stays on the authenticator, unused.
* **A passkey unlocks; only the passphrase changes things.** `vault.putWayin('passphrase')`,
  `vault.putWayin('passkey')` and `vault.delWayin('passkey')` each raise a gating whose attempt
  takes the standing passphrase as proof, never a passkey's answer. A user who forgot the passphrase can still unlock
  with the passkey, but can set a new passphrase only by starting over (*Starting over*, above).
  A new passphrase removes the passkey, which was matched to the old one: offer to add it again,
  under the new passphrase, once the change lands.

## Development

`pnpm justify` here runs lint, typecheck, tests (vitest + testing-library under jsdom) and the
build with its publint and arethetypeswrong checks. The typecheck and lint read `safebyok` from
its source, through the workspace's `@safebyok/source` export condition, so they need no build. The
tests and build resolve it through its built `dist/`, as a consumer's would, and build the core
first by themselves (`pnpm build:deps`), so a fresh clone needs no prebuild step.
