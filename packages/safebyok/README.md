# safebyok

Bring Your Own Key (BYOK) Browser Vault using E2EE (End-to-end Encryption) and pluggable remote storage

`safebyok` gives users a secure "Bring Your Own Key" vault. Secrets are available on their own device and nowhere else.

* Secrets are always stored in encrypted form, using keys that never leave the end-user's device
* Secrets synchronize across multiple devices using a passphrase the user controls
* The user may change their passphrase without re-entering their information, and keep several
  passphrases, any of which opens the vault
* Accessing a vault is prohibitively difficult -- even given the application's database, code and environment.

It is react-friendly (`safebyok-react`) and database agnostic: storage adapters implement a small
abstract seam, and ship as packages of their own, each `safebyok-<store>` -- `safebyok-indexeddb`
for a vault kept in this browser, `safebyok-convex` for Convex, `safebyok-postgres` for Postgres
on the host's server, and `safebyok-graphql` to reach a server's VaultDB over GraphQL. The IndexedDB
device store ships in `safebyok/idb`.
`safebyok/testing` is for tests only, star-imported as `TH`: a cheap key deriver, a vault's
options over stores in memory (`memoryVaultOpts`), shape-valid records with fake ciphertext, a
live lease, small timing and tampering aids, a way to hold or slip work into an
adapter's next call (`holdNextCall`, `beforeNextCall`) and to count its storage watches
(`tallyWatches`), a logger that keeps what it hears (`spyLogger`), checks that a call refuses
(`expectRefusal`) and that what it threw quotes nothing it should not (`thrownText`,
`leafTexts`), and `describeVaultDB` and `describeDeviceDB`, the vitest suites every storage
adapter owes, with `perUser` to run the first over an adapter made per signed-in user,
`VaultDBContract` to cite the contract's lines in an adapter's own tests, and `raceEveryWay`,
`throughTurnstile` and `expectRoundTripsThroughTurnstile` to race an adapter's devices under every
interleaving a test can make.
`safebyok/utils` holds small helpers for the app around the vault, such as `mask`, which shows
which API key a lockbox holds (`sk***...***wxyz`) without showing the key. `mask` is intended
for plain text; calling it with arbitrary blobs may give unusual behavior. It strips every
combining mark, so a script that writes its vowels as marks loses them (Hindi `नमस्ते` comes out as
`नमसत`); an API key is ASCII, and is untouched.
`whiteboard/20261013-relic/proposed-README.md` drafts the full README for when the surface
settles.

## Quickstart

```ts
import { Vault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { idbVaultDB } from 'safebyok-indexeddb'

const vault = Vault.make({
  applabel:   'acme',
  userId:     session.userId,                 // your auth's stable, opaque id for the user; never an email
  vaultlabel: 'main',
  vaultDB:    idbVaultDB({ dbName: 'acme' }), // or your backend's adapter
  ...browserOpts({ dbName: 'acme' }),         // the key deriver, device store and passphrase strength test a browser wants
})

await vault.hello()               // reads storage and this device's lease; every call waits for it anyway
vault.getSnapshot().state         // 'absent' | 'locked' | 'unlocked'
await vault.unlock(passphrase)    // on an absent vault, this first unlock creates it
await vault.storeBox('anthropic_api_key', 'sk-ant-...')

const answer = await vault.useBox('anthropic_api_key', (whisper) => callAnthropic(whisper))
```

The vault store is never among the defaults: where the vault lives is the one choice every app
makes for itself. Any option you pass after the spread replaces the default it names, and an
option `Vault.make` does not take -- a misspelling, or a name it no longer uses -- is refused with
`bad_option` rather than quietly ignored.

`Vault.make` answers at once, and the handle starts its own `hello()`: until that has read
storage, the snapshot says `opening`, and any call made meanwhile waits for it. A hello that
fails reading storage leaves the vault `opening`, saying why as the snapshot's `trouble` (and
through the logger); one that fails after it, as this device's store refuses its lease, settles
`locked` with the `trouble` beside it. `vault.hello()` tries again, and so does any other call.

Serve the app over https: a browser withholds WebCrypto from a page served over plain http, so
`Vault.make` refuses one at once, with kind `insecure_context` (`http://localhost` counts as
secure, for development).

## The cast, and how it fits together

safebyok names each thing once; [VOCABULARY.md](../../VOCABULARY.md) is the dictionary, and the
code, the stored records and these docs all use its words.

* A **whisper** is the secret you store: any JSON value, such as an API key. A **lockbox** holds
  one whisper, encrypted, with its `boxlabel` and its **sidecar**, your app's own data that
  rides beside it, server-readable: authenticated, never encrypted. A **vault** is one user's set of lockboxes, named by your `applabel`,
  the signed-in user's id and a `vaultlabel`.
* The vault is unlocked by a **proof** of one of its **wayins**: a passphrase, or a passkey's
  answer. Each wayin holds the one **vaultKey** (the vault's random master key) wrapped under a key
  made from that proof, so adding, changing or retiring a wayin rewrites no lockbox. The vaultKey
  wraps a fresh **lockboxKey** for every stored whisper, and the lockboxKey encrypts the whisper.
  The wayins live in the **vault props**, the one record per vault that every device syncs. The
  backend holds those and the lockboxes, nothing else: every key and whisper in them is
  ciphertext, and only their labels, ids, times and sidecars are readable by the server.
* A **lease** lets this device unlock again without a proof for a while: when a proof unlocks the
  vault, the device keeps the vaultKey wrapped under a key the browser cannot export, until
  `leaseHours` run out. It never leaves the device.
* Every encryption is bound to its **ctx**: the app, user and vault, the field, and every other
  field of its record. Ciphertext moved to another record, or under an altered field, will not
  open.
* The vault is made with `Vault.make(opts)`, which answers at once, and `hello()` reads what
  storage and this device hold of it, so the snapshot's `state` is `absent`, `locked` or
  `unlocked`. Its lockboxes are written with `storeBox`, read with `readBox` and `useBox`, and
  removed with `retireBox`; `retire()` removes the whole vault. Two devices that write at once
  cannot both win: the late one is refused as `stale_write` (see *Two devices storing at once*),
  and a first unlock that loses the race to create the vault, and whose passphrase does not open
  the vault made there, is `created_elsewhere`.
* Storage is two plug-ins the core speaks to only as interfaces: a **vaultDB** for what syncs
  (vault props and lockboxes) and a **deviceDB** for this device's lease and device mark.

```text
proof + wayin ──> wayinKey ──unwraps──> vaultKey ──unwraps──> lockboxKey ──deciphers──> whisper
                                           ^
                                   lease: leaseKey on this device unwraps it without a proof
```

## Where it runs

The platform floor, which `engines` and CI hold to:

* **Node 22 and up.** CI runs the tests on Node 22, the floor, and on the newest Node.
* **Evergreen browsers**: current Chrome, Edge, Firefox and Safari, with WebCrypto
  (`crypto.subtle`), IndexedDB (for the device store in `safebyok/idb` and `safebyok-indexeddb`),
  Unicode property escapes in regular expressions, and `Intl.RelativeTimeFormat` (for the
  dialog's "locks again in 7 days" in `safebyok-react`). The browser paths are tested against
  jsdom and a fake IndexedDB, not in real browsers; a release is walked by hand first
  (`notes/release-checklist.md`).
* **Bun and the frameworks on Node or the browser** (Next.js, Nuxt): they provide the same
  globals, and are not run in CI.
* **React Native (Hermes) is untested.** It lacks WebAssembly (so `safebyok-fastkey`) and has
  partial `Intl` and property-escape support; try it before you rely on it.

No Node built-ins are used in `src/`, and nothing is polyfilled: a host on a platform without one
of the above supplies it.

## Entry points, and why the main one asks for everything

* `safebyok` -- `Vault` (`Vault.make`) and the types, errors and stores around it.
* `safebyok/browser` -- `browserOpts({ dbName }?)`: the pinned Argon2id key deriver
  (`argon2idWebV1Deriver`), the IndexedDB device store (`idbDeviceDB`) and the passphrase
  strength test (`zxcvbnPassphraseTest`), as a bag of options. The strength test's zxcvbn
  dictionary loads, as a chunk of its own, only when a passphrase is first tested (see *A new
  passphrase's strength*).
* `safebyok/idb` -- the IndexedDB device store, `idbDeviceDB`, and `inspectIdbDeviceDB`, a raw
  window onto its rows for a debug panel. The IndexedDB vault store, `idbVaultDB`, is a package
  of its own, `safebyok-indexeddb`.
* `safebyok/validators` -- the checks for names (`Label`, `UserId`, `DefaultValidators`,
  `AnyTextValidators`), the floor beneath them all (`NameFloor`), and their bounds
  (`MaxLabelChars`, `LabelPattern`, `MaxUserIdChars`, `UserIdPattern`, `NameFloorBytes`), for a
  form, a server or another library to check what the vault will, at a few kB. All are in the main entry too, with the record schemas (`Whisper`,
  `EpochMillis` and the rest).

`Vault.make` takes its `keyDeriver`, `deviceDB` and `passphraseStrengthTest` from you, with no default behind them. A
default would be imported by `Vault.make` itself, so every app would ship it, used or not: a
bundler drops only the code nothing imports. The key deriver is the choice an app most plausibly
makes differently -- another implementation of the same Argon2id spec, in WebAssembly or native
to its platform -- and such an app should not also ship this one (about 15 kB minified). So the
main entry names no default and imports nothing from `safebyok/browser`, and the package is
marked `sideEffects: false`: what you never import never ships.

## A lockbox's sidecar

Each lockbox carries a **sidecar**: your app's own data, riding beside the whisper,
**server-readable** -- authenticated, but never encrypted, so anyone who can read your database can
read it. It is any JSON value your app keeps about the lockbox -- what the user calls the account,
which project a key belongs to, when it was last rotated -- or whatever your app wants searchable
server-side (a team, a rotation reminder, a usage count). It shows in the snapshot while the vault
is locked, as `box.sidecar`. The vault never looks inside it.

```ts
await vault.storeBox('anthropic_api_key', 'sk-ant-...', { sidecar: { note: 'work account', project: 'atlas' } })
await vault.storeBox('anthropic_api_key', 'sk-ant-new')                  // keeps the sidecar it has
await vault.storeBox('anthropic_api_key', 'sk-ant-new', { sidecar: {} }) // and empties it
vault.getSnapshot().boxes[0]  // { boxlabel: 'anthropic_api_key', sidecar: {}, damaged: false, ... }
```

* **It is never encrypted.** It is stored in the clear, so never put secret material in it: a key, a
  password, a recovery code. Anyone who can read your storage reads it.
* **It is authenticated.** Its JSON, keys sorted, is bound into the lockbox's encryption with the rest of
  the lockbox's server-readable fields, so a sidecar altered or swapped in storage makes the lockbox refuse to
  open (`damaged_lockbox`). The snapshot shows the sidecar as storage holds it; only `readBox()` proves
  it unaltered. A sidecar stored other than as the vault writes it (respaced, reordered) lists the
  lockbox as damaged.
* **Its shape is yours.** The vault checks only that it is JSON (`Sidecar`; anything else is
  `bad_option`): check its shape yourself, with your own schema, before `storeBox()`. Left out of a
  `storeBox()`, the lockbox keeps the sidecar it has, once its record opens; a new lockbox's is `{}`, as
  is one written over a record that will not open.
* **It shares the whisper's room.** `maxWhisperBytes` counts the whisper's JSON and the
  sidecar's together, so a large sidecar leaves less room for the whisper. Its size shows in storage, as every
  server-readable field's does.

## Names, and your own checks

By default a label (`applabel`, `vaultlabel`, `boxlabel`, and the `wayinlabel` of each way in
you add) is lowercase words of letters and digits joined by single underscores, 2 to 40
characters (`Label`); and a `userId` is 1 to 100 ASCII letters, digits and `-_.:@+|` (`UserId`),
which holds every stable id an auth provider issues -- a UUID, Auth0's `provider|id`, Clerk's
`user_...`, a DID -- and pass your provider's stable, opaque id, never an email or a handle,
which can change and would orphan the vault. That suits API keys. A host that wants more --
labels in Hebrew, Arabic or Thai, its own auth's id shape -- passes its own Zod schemas as
`validators`, and each **replaces** ours:

```ts
import * as z from 'zod'
import { AnyTextValidators, UserId } from 'safebyok/validators'

// Built once, at module level.
const validators = {
  ...AnyTextValidators,                                 // labels of any text above the floor
  boxlabel: z.string().min(1).max(200),                 // ...but box names of 1 to 200 characters
  userId:   z.string().regex(/^user_[A-Za-z0-9]{27}$/), // and Clerk's user ids
}
const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, validators, ...browserOpts() })
await vault.storeBox('מפתח OpenAI: עבודה', 'sk-...', { sidecar: { note: 'the team account, billed monthly' } })
```

* **The floor holds beneath every check.** Whatever your schemas admit, a name is one character
  to 1 KiB of UTF-8, well-formed Unicode (no lone surrogate, half of a character), in Unicode's
  composed form (NFC), and with no control character: `NameFloor`. A name holds no `^` either,
  the character the key-value stores join a row's names on, so every store holds the same names:
  a vault whose names suit Postgres today suits IndexedDB tomorrow. Below the floor is
  `bad_label`, and a stored record below it reads back as damaged. Your storage
  may hold less: Postgres holds a name of at most 640 bytes (`VAULTDB.md`, *Names*).
* **A check only checks.** What passes is kept exactly as you passed it, never what the schema
  makes of it: a name is bound into the ciphertext and names its rows, so a schema that trims or
  lowercases would otherwise send the same user to another vault. Nothing is normalized either:
  text not in NFC is refused, never composed for you.
* **Your checks are an alarm at the door, not a promise about storage.** They run where a name
  enters the vault: `Vault.make` (the scope), `storeBox()` (the boxlabel), `addPassphrase` and
  `addPasskey` (the wayinlabel). A lockbox already stored under a name they refuse
  -- by another client, or before you narrowed them -- lists, reads and retires as any other, by
  the name it was stored under; `storeBox()` refuses only to write a new one under a refused name.
  With nothing stored under it, a name they refuse is `bad_label` at `readBox()`, `useBox()` and
  `retireBox()`. The first way in, which the vault names `passphrase`, is not checked.
* **Widen with care.** A check admitting text outside ASCII should require NFC, as the floor
  does, and widen only once every client you serve runs the wider check: an older one refuses at
  its door the names a newer one stores.
* **The refusal is the vault's own**: kind `bad_label`, naming the
  field, never quoting the name or your schema's issues. Where one of our checks refused, it says
  what was wrong (too long, a control character, not well-formed); your schema's, it names only.
  A schema must check synchronously; one that is async or throws is refused as `bad_option`,
  carrying nothing of what it threw. Each refusal names the first failure: a form checks its
  fields with the exported schemas first, and the vault's refusal is the backstop.
* **A misspelt field is refused**, as `bad_option`: `boxLabel` would otherwise leave the default
  check quietly in place. `checkValidators(bag)` runs that check alone, for a binding or wrapper
  that takes the bag apart (`VaultProvider` does).
* **Sizes follow the names.** Each `storeBox()` weighs its lockbox -- whisper, sidecar and names
  -- and refuses one heavier than the backend holds in a record (`lockbox_too_large`), or a new
  one that would take the vault past what the backend holds of a vault (`vault_full`). The record
  is weighed as its real serialized bytes; the vault's total is a conservative estimate made
  before the lockbox is sealed (each counted at twice `maxWhisperBytes` for its whisper and sidecar,
  with its names as measured), so at a `maxVaultBytes` set exactly tight it may refuse a write
  that would just fit. A replacement weighs what it replaces, and is never refused as full.
  `maxWhisperBytes` is checked as a whisper is stored, never as one is read, so lowering it
  strands nothing.
* Labels of any text are shown to your users as written: mind what bidirectional and invisible
  characters can make one look like.

## Your own storage adapter

Extend `VaultDB` and implement its `do*` methods (`Vault.make` takes nothing but a `VaultDB`,
whose public verbs check every record your code sees): its doc block says what each one owes, the
[VaultDB contract](VAULTDB.md) says what an adapter promises in all and what it may leave
undone, and `describeVaultDB` from `safebyok/testing` checks it, a group of tests to each of the
contract's numbered lines. Give it `makeDevices` -- devices over one backend, each round trip
through a turnstile -- and it races your writes from two devices, holding one before each round
trip while the other moves ([Proving the races](VAULTDB.md#proving-the-races)). A backend with columns (Convex, SQL) keeps
the applabel, user id, vaultlabel and boxlabel in columns of their own. A backend that holds rows
under one string -- a key-value store, localStorage -- files them under `Ckeys`, as
`localVaultDB` and `idbVaultDB` do, names joined on `^`:

```ts
import { Ckeys } from 'safebyok'

Ckeys.vaultProps(scope)            // 'vault^acme^u1^main'
Ckeys.box(scope, 'anthropic')  // 'box^acme^u1^main^anthropic'
Ckeys.boxPrefix(scope)         // 'box^acme^u1^main^' -- every lockbox of the vault, by prefix scan
store.ckeys().filter(Ckeys.isBoxIn(scope))  // every lockbox of the vault, from a list of every ckey
```

No name holds `^` (the floor refuses it), so no two vaults ever share a ckey or list each other's
lockboxes. The ckeys are part of the stored format: use these, not a join of your own, and every
device finds your rows.

Your `do*` methods take any name the base class passed: every public verb holds each name to the
floor and to your adapter's declared `maxNameBytes`, and takes no
validators of the host's, which are the vault's own. So an adapter that hands its calls on to
another VaultDB's public verbs passes each call through as it came.

A device store of your own (a `DeviceDB`, for a platform without IndexedDB) owes two things beyond
keeping its records, each the compare and the write in one step: `writeLease(lease, expected)`
writes only while the scope's device mark stands at `expected.lock_generation` (0 with no mark),
and otherwise writes nothing and refuses with `stale_write`; and `writeMark` keeps the higher
`lock_generation` of the mark it writes and the one it replaces. That is how a lock in one tab
stops an unlock under way in another. A mark may hold no vault (`seen: null`): a lock where no
vault was seen, and `retire()`, leave one, keeping the count. `describeDeviceDB` from
`safebyok/testing` checks all of this.

Every refresh -- after each of the vault's own writes, and at each change your adapter's
`subscribe` reports -- lists every lockbox in the vault, one at a time per handle, so its cost
grows with the vault. That is the trade for a listing every adapter can give; measure before
doing better.

## Key derivation

The passphraseKey is made by Argon2id at a keyDeriverSpec: its parameters under a
`key_deriver_label`, which every vault stores. A label must always mean the same parameters, or
vaults made on one device stop opening on another. There are three ways to choose:

* **The supplied spec**, `Argon2idWebV1`: 64 MiB, 3 passes, 1 lane, a 16-byte salt and a 32-byte
  key. Its deriver, `argon2idWebV1Deriver`, is what `browserOpts()` hands over. Use it unless you
  have a reason not to.
* **A spec of your own**, through `argon2idDeriver`:

  ```ts
  const keyDeriver = argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
  ```

  Give it a label of your own, and never change its parameters once a vault is made under it.
  Labels beginning `argon2id_web_` are reserved for the specs we supply, now and later, and
  refused. It refuses (`bad_option`) what Argon2id cannot run -- a salt under 8 bytes or over 65536,
  memory under 8 KiB a lane or over 1 GiB, no passes or lanes, a key other than 32 bytes -- and
  allows weak parameters that run: those are yours to judge.
* **Another implementation of a spec**: `safebyok-fastkey` runs any of them through
  WebAssembly, several times faster, deriving the same bytes. For one native to your platform,
  spread the spec into your deriver, `{ ...Argon2idWebV1, deriveKeyBytes }`, keeping its label,
  and test that it derives the same bytes as ours; `parseKeyDeriverSpec(spec)` checks a host's
  spec exactly as `argon2idDeriver` does. `Vault.make` refuses a deriver that wears a supplied spec's label
  without carrying exactly its parameters; it cannot check the bytes, so that test is yours.

Any `keyDeriver` needs a `salt_bytes` from 1 to 65536 (the most `crypto.getRandomValues` hands out
at once), which `Vault.make` checks, and must hand back 32 bytes of memory of its own from
`deriveKeyBytes`, derived afresh on every call -- a fresh `Uint8Array`, not a view over a
`SharedArrayBuffer`, and not one it keeps: the vault zeroes the bytes once it has made the
passphraseKey of them. `unlock()` and the calls that set a passphrase refuse anything else with
`bad_option`, 32 zero bytes among it: a key anyone could rebuild, which a deriver handing back
bytes it kept from an earlier call would. A deriver of ours refuses a salt of another length than
its spec's.

`KeyDeriver` is one of two types. An `Argon2idKeyDeriver` carries a whole keyDeriverSpec beside
its function, as every deriver above does, and `Vault.make` checks the spec as `argon2idDeriver`
would, so one Argon2id cannot run is refused at open, not at the first unlock. A
`CustomKeyDeriver` carries only `key_deriver_label`, `salt_bytes` and `deriveKeyBytes`, and may
name its `algorithm`; it may not declare `'argon2id'` without being a whole spec. `Vault.make` logs
a warning (not a refusal) for a label beginning `test_`, the mark of a deriver made cheap for
tests, such as `safebyok/testing`'s.

## Locking

A proof that unlocks the vault grants this device a **lease**: the vault stays unlocked, across
reloads, until the lease runs out (`leaseHours`, seven days by default, at most 588 hours: 24.5 days) or the host locks it. `Infinity` hours means never
on this device, until a lock: `askPassphraseAt` is then the exported `FarFuture`, the latest
instant the package accepts (in 2255). A finite number past 588 is refused, since no timer
reaches further. Show "until locked" for any `askPassphraseAt >= FarFuture - MinuteMillis`;
never compare a time for equality. The vault reports the lease it was opened with as
`vault.leaseMillis`, in milliseconds, the default and `Infinity` resolved (`Infinity`
reads as the exported `ForeverMillis`), so a UI can say how long an unlock lasts without being
told the option again.

The deadline is the truth, and a timer enforces it. From `askPassphraseAt` the snapshot reads
`locked` and every call that would start new work throws `vault_locked`; work already under way
keeps the key for one more minute to finish, and then a timer drops it, with no call needed. A timer that runs late, as one may on a device that slept, is caught at the next
call. The timer is `unref`'d, so it never holds a Node or Bun process open.

**The lease starts again whenever the user types a passphrase and it proves**: an `unlock()`, a
`changePassphrase()`, and an `addPassphrase()`, `addPasskey()` or `retireWayin()` with a
passphrase as proof. An `unlock()` with a passkey sets it too. Nothing else moves it: not a read,
a store or a refresh, nor a passkey proving a change on a vault already unlocked. The lease
running out while an `unlock()` or `changePassphrase()` is under way is no lock: the call ends
unlocked, with a lease of its own.

Lowering the option later takes hold on each device at its next open: a lease granted under the
longer setting, whose deadline lies past the new number of hours from then, is forgotten, and the
user types their passphrase again. Raising it lengthens no lease already granted. A device keeps
one lease per vault, shared by its tabs, so open a vault with one setting on a device: two tabs
opening it with different ones each forget the other's lease (`notes/wontfix.md`). A device clock
stepped backwards does the same to a lease granted just before: it seems to last past its
setting, and the user is asked again, the safe direction.

Two calls lock, and each forgets the unlock in memory and on this device alike, so the user types
their passphrase again afterwards:

* **`vault.lock()`** is the hard lock: the goons are at the door. Use it for a real lock signal: a
  Lock button, or a locked screen. The key is dropped at once, and the lock wins over everything
  under way, in this tab or in another on the same device: an `unlock()` or `changePassphrase()`
  still under way is granted no lease and leaves the vault locked (the `unlock()` throws kind
  `vault_locked`; a wrong passphrase is still told as `wrong_passphrase`, the more useful news),
  and a `readBox()` or `useBox()` under way refuses with `vault_locked`, the whisper it had deciphered
  dropped, never handed back. A write already sent to storage lands. Across tabs this rides on the
  device mark's `lock_generation`, which every hard lock raises and an unlock's record write
  compares. `retire()` locks the same way, and so does storage the vault cannot trust (below).
  A refresh that finds the vault's ways in changed on another device, or the vault gone, drops
  the key the same way for this handle: a `readBox()` or `useBox()` under way refuses with
  `vault_locked`.
* **`vault.lockSoon(graceSeconds = 5)`** is the soft lock: the bartender's stinkeye. Use it when
  the user steps away: a hidden tab, a sign-out. From the instant it is called the snapshot reads
  `locked`, every `readBox`, `useBox`, `storeBox` or `retireBox` called afterwards throws kind `vault_locked`, and this
  device forgets its lease; but work already in hand finishes: a `readBox()` or a
  `storeBox()` under way, and an `unlock()` or `changePassphrase()` under way, here or in another tab,
  which leaves the vault unlocked again. The key is dropped `graceSeconds` later, or sooner when
  the lease would drop it sooner. An `unlock()` (or a `changePassphrase()`, which proves the
  passphrase too) within the grace ends it. The grace is at most 60 seconds; `lockSoon(0)` is
  `lock()`.

`close()` is not a lock: the lease stays, for the next open, along with any an unlock under way
granted before the close; it ends a `lockSoon()` grace at once, an unlock under way on
the closed handle takes nothing up, and a `readBox()` or `useBox()` under way hands back nothing,
refusing with `vault_closed`.

A host clock that turns bad partway through a call (it throws, or reads outside 1981 to 2255)
drops the key and fails the call with `bad_option`, even when the call's write had already
landed: fix the clock, and look again.

**Locking ends the lease.** A host that wants "stay unlocked on this device for a
week" should not lock on tab-away: each time the user comes back to the tab, the vault would ask
for the passphrase again. Lock on the signals your users mean as "lock it".

### A screen-lock recipe

The core cannot watch for a locked screen or a hidden tab (it runs where there is no
`document`), so locking on those signals is a few lines in the host app. `visibilitychange`
fires when the user switches tabs or the screen locks, which is as close to a screen-lock signal
as every browser offers; it also fires for a tab merely switched away from, so it calls the
gentle one:

```ts
const lockWhenHidden = (vault: Vault) => {
  const onChange = () => {
    if (! document.hidden) { return }
    vault.lockSoon().catch((err: unknown) => {
      // A lockSoon() racing a close() is the one refusal to expect; any other, such as a device
      // store that would not forget the lease, is worth a word.
      if (! isVaultError(err, 'vault_closed')) { console.warn('The vault did not lock cleanly', err) }
    })
  }
  document.addEventListener('visibilitychange', onChange)
  return () => { document.removeEventListener('visibilitychange', onChange) }
}
```

Call the function it returns when you close the vault. The `catch` quiets only a `lockSoon()`
that races a `close()`, and lets a failure to forget the lease be heard: that vault
is locked in this tab, but the next open may unlock without the passphrase. Chromium's Idle
Detection API, behind a permission the user grants, is the only true screen-lock signal, and a
locked screen is the user meaning it, so it calls `lock()`, quieted the same way:

```ts
const aborter = new AbortController()   // aborter.abort() when you close the vault
if (await IdleDetector.requestPermission() === 'granted') {   // from a click: it needs a user gesture
  const idle = new IdleDetector()
  idle.addEventListener('change', () => {
    if (idle.screenState !== 'locked') { return }
    vault.lock().catch((err: unknown) => { if (! isVaultError(err, 'vault_closed')) { console.warn('The vault did not lock cleanly', err) } })
  })
  await idle.start({ threshold: 60_000, signal: aborter.signal })
}
```

TypeScript's DOM types do not carry `IdleDetector` yet; declare it, or take it from a types
package, before this compiles.

For a sign-out, call `lockSoon()` first, then close the handle (in React, unmount the provider)
once what was under way has settled: closing ends the grace at once.

### When the user signs out

A sign-out the host hears of is the host's to act on, as above. One it does not hear of -- in
another tab, a session that expired, another user signing in -- storage tells the vault: an
adapter whose backend knows who is signed in refuses a vault whose user is no longer that one
with kind `identity_revoked` (`safebyok-convex`, `safebyok-postgres` and `safebyok-graphql` do;
`safebyok-indexeddb` and `localVaultDB` keep everything on the device, and never do). The vault
then locks at once, as `lock()` does: it drops its vaultKey, this device forgets its lease, and
the snapshot reads `locked`. It removes nothing stored. The call that met the refusal
throws it, and the next unlock, once the user has signed in again, asks for the passphrase. A
background refresh that meets it has nobody to throw to: it locks all the same, and tells the
logger.

The same rule holds for storage handing back an older copy of the vault than this device has seen
(kind `rolled_back`, *A vault rolled back*, below): storage the vault cannot trust with an unlocked
vault locks it, in the call that met it or in a background refresh alike. There is no option to
stay unlocked: an adapter that refuses `identity_revoked` for a passing fault, rather than
`storage_unavailable`, breaks its contract (VAULTDB.md, line 5.5), and is the bug to fix.

Open the vault only once your backend knows who is signed in: a vault opened while its auth is
still loading meets `identity_revoked` at once, and forgets the lease with it (safe:
the user types the passphrase again). A backend that tells "who are you?" from "you may not"
refuses the second as `not_permitted`, which locks nothing. A call that meets the refusal in a tab
closed meanwhile still forgets the lease; and the Convex adapter's watch refreshes on
every error it hears, not only a sign-out. Both are the safe direction, and stay.

## Logging

Some things a vault cannot throw to anyone: they happen in the background, or in a call that
must not fail. It says them to its logger, which `Vault.make` takes as `logger`, an object with
three functions, each `(message?, story?, err?) => void`:

```ts
const vault = Vault.make({
  ...opts,
  logger: {
    log:   (message, story) => { telemetry.info(message, story) },
    warn:  (message, story, err) => { telemetry.warn(message, story, err) },
    error: (message, story, err) => { telemetry.error(message, story, err) },
  },
})
```

With no logger anywhere, safebyok writes to the console, each message tagged `safebyok:` (null
counts as none). Pass functions that do nothing for quiet, or `console` itself to drop the tag (it
then prints a missing story or error as `undefined` or `null`). A logger that throws, or returns a
promise that rejects, is ignored: logging never breaks a lock, a hello or a store. Anything else is
refused as `bad_option`.

Most apps name their logger once, as the app starts:

```ts
import { setDefaultLogger } from 'safebyok'

setDefaultLogger(telemetry)  // everything safebyok would have said to the console goes here instead
```

That covers every storage adapter, vault, `VaultProvider` and store given no logger of its own,
whether it was made before the call or after. Name a logger a second time only to keep two apart,
as a child logger would: give one to your storage adapter's factory (`idbVaultDB({ logger })`),
and the adapter, every vault opened over it, and `VaultProvider` all use it, as one object; give
one to `Vault.make` (or `VaultProvider`), and it is the vault's alone, the adapter keeping its own.
Pass `logger: DefaultLogger` to have the vault use the default whatever its adapter was given.
An adapter's logger is fixed when it is made: `vaultDB.logger` reads it, and nothing replaces it.

An adapter of your own extends `VaultDB` and hands `super()` the host's options, `super(opts)`:
the base class settles the logger from them, the host's or the default. It says what it has nobody
to throw to through `this.logger`.

Each call is a plain-language `message`; a `story` naming the vault call it happened in
(`{ call: 'lockSoon' }`); and, when there is one, the error behind it, a `VaultError` or your own
(your clock's, your storage adapter's). The vault puts no whisper, passphrase, key, ciphertext or
option's value in any of the three, not even the `userId` or the labels: a host with several
vaults gives each its own logger, bound to whatever context it wants in its logs. An error of your
own goes as your code made it, as itself or as a `VaultError`'s `cause`, so what it quotes (a
storage client's error may quote the request it failed) is yours to keep clean. Today a vault
says these things:

* `warn`: `lockSoon()` could not read the clock, so it locked at once, without a grace; or the
  clock failed as a lease ended (`{ call: 'expiry' }`), so the key went at once.
* `warn`: this device's lease could not be read or would not open, so it was forgotten, and the
  vault opened locked. A lease that simply ran out, or that a new
  passphrase outdated, is routine, and says nothing.
* `warn`: a refresh rung by a change in storage failed, so the snapshot may lag behind storage
  (it reads `syncing: false`) until a read succeeds. Said once for a failing streak; then `log`,
  once, when a read succeeds again.
* `warn`: the catch-up after a write storage refused as stale failed. The call throws
  `stale_write`, the catch-up's failure its `cause`, and the snapshot reads `syncing: false`.
* `log`: storage the vault cannot trust -- its user signed out, or an older copy of the vault --
  locked it (`{ call: 'untrustedStorage' }`); `warn` when this device's lease could not then be
  forgotten.
* `warn`: a change to the ways in landed in storage, but this device could not keep its mark of
  the vault, or grant its lease afresh. The change stands, and the call resolves.
* `warn`: this device's mark of the vault could not be read, so its rollback check starts again
  from what storage holds now.
* `warn`: the hello `Vault.make` starts was refused (`{ call: 'hello' }`, the refusal as its
  error). The vault stays `opening`, saying why as its snapshot's `trouble`; `vault.hello()`, or
  any other call, tries again.

## Several passphrases

A vault may have up to `MaxUnlocks` (8) passphrases and passkeys together, each its own way in: a daily one, one
written down at home, one a partner holds. Each wraps the same vaultKey under its own salt, no
passphrase is ever stored, and adding or removing one rewrites no lockbox. The snapshot lists
them, locked or not, as `wayins`: each a `wayinkind` (`passphrase` or `passkey`), a `wayin_id`, the
`wayinlabel` the user chose, and when it was added and by which device (`registered_at`,
`device_id`).

```ts
vault.getSnapshot().wayins        // [{ wayinkind: 'passphrase', wayin_id: '1b9d...', wayinlabel: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000 }]

const spareId = await vault.addPassphrase(passphrase, spare, { wayinlabel: 'written_down' })
await vault.changePassphrase(spare, renewedSpare)       // changes that one; the first still opens
await vault.retireWayin(passphrase, spareId)            // never the last one: 'last_wayin'
await vault.unlock(passphrase, { wayinId })             // aimed at one: a single key derivation
```

* **Every change asks for proof**, even on an unlocked vault: the vault keeps no copy of
  its vaultKey it could wrap anew, and a walked-away unlocked screen should not be able to add a
  way in. Any way in the vault has will do: a passphrase, or a passkey's answer. That includes
  `changePassphrase`, so a user who forgot their passphrase sets a new one with their
  fingerprint: `vault.changePassphrase(passkey, newPassphrase)`, naming which passphrase with
  `{ wayinId }` when the vault has several.
* **Every change locks the other devices.** It moves the vault props' `unlock_epoch`, so each
  other device falls back to `locked` and must unlock with a passphrase still standing. This
  device stays unlocked.
* **An unlock not aimed at one tries each in turn**, one key derivation apiece: about 0.6 s each
  with the browser's deriver, so a mistyped passphrase in a vault of eight takes about five
  seconds to refuse. A host that knows which one the user means (a picker over `wayins`) passes
  its `wayinId`.
* **Removal is not revocation.** A removed passphrase stops opening the vault from here on, but
  whoever knew it and kept a copy of the vault props from before can still open that copy, and the
  vaultKey inside is the one the vault still uses. There is no key rotation yet.

## A new passphrase's strength

Every passphrase about to become a way in -- the one the first `unlock()` creates the vault
with, and each `addPassphrase()` or `changePassphrase()` sets -- is put to the vault's
`passphraseStrengthTest` first, before any key derivation. One it finds weak is refused with kind
`weak_passphrase`, the test's reason the message. An `unlock()` of a vault that stands is never
refused for weakness: a passphrase already in use is the user's to change, not the vault's to
lock them out with.

```ts
import { browserOpts, zxcvbnPassphraseTest } from 'safebyok/browser'

const vault = Vault.make({ ...opts, ...browserOpts() })   // brings zxcvbnPassphraseTest
await zxcvbnPassphraseTest('password1234')
// { strong: false, reason: 'That is very like a commonly used password: ...' }
await zxcvbnPassphraseTest('skylarkpinecone', { applabel: 'skylark', user_id: 'u1', vaultlabel: 'pinecone' })
// { strong: false, reason: 'That holds something about you or this site, ...' }
```

* **There is no default in the core.** `passphraseStrengthTest` is required, as `keyDeriver` and
  `deviceDB` are: `Vault.make` refuses to make a vault without one (`bad_option`), and `checkStrengthTest`
  is the same check, for a wrapper that takes the options apart. A test of length alone is no
  test -- 'a' and eleven spaces is twelve characters -- so the package offers none.
* **In a browser, `browserOpts()` brings `zxcvbnPassphraseTest`.** It asks for at least
  `MinPassphraseChars` (12) characters, each Unicode code point counting one, and then a zxcvbn
  score of at least `MinZxcvbnScore` (3 of 4), through `@zxcvbn-ts/core` and its common-password
  dictionary: it turns away common passwords and ones very like them, keyboard walks, repeats,
  sequences, dates, and the vault's own names. No composition rules (a digit, a capital, a
  symbol): NIST SP 800-63B advises against them, as they make a passphrase harder to remember and
  no harder to guess. Its dictionary is about 214 kB (minified and brotlied), so the test loads it
  with a dynamic `import()` at its first call, and a bundler splits it into a chunk of its own:
  a page that never chooses a passphrase never fetches it. It answers through a promise, in a
  few milliseconds after that first load. If the load fails (the network dropped), the call
  rejects with kind `storage_unavailable`, a condition a retry may mend; the vault refuses the new
  passphrase with that refusal, making nothing, and the next call tries again.
* **The test hears the vault's scope.** It is called as `test(passphrase, scope)`, `scope` the
  vault's `{ applabel, user_id, vaultlabel }`: words a guesser who knows the user tries first.
  `zxcvbnPassphraseTest` hands each name, whole and split into its runs of letters and digits, to
  zxcvbn as the user's own words.
* **Your own test** replaces it: pass it after the spread. It is any function from the passphrase
  (and the scope) to a verdict, `{ strong: true }` or `{ strong: false, reason }`, at once or as a
  promise; the reason is shown to the user, so write it calmly, say what to do, and never quote the
  passphrase. To ask for more, wrap ours:
  `async (typed, scope) => (typed.includes('acme') ? { strong: false, reason: 'Leave out the name of the app.' } : await zxcvbnPassphraseTest(typed, scope))`.
  `Vault.make` refuses anything but a function, and a test that answers anything but a verdict,
  with `bad_option`; whatever a test throws, the call throws.
* **Build it once.** The vault keeps the test it was opened with for its life. A binding that
  reopens on a changed option (`safebyok-react`'s provider) reopens for a new test, so define it
  at module level, or memoize it, rather than writing it inline.
* **Call it from the field as well.** A strength test is a plain function of the passphrase and
  the scope, with no vault behind it, so the field the user types into can call the very same one
  on each keystroke, and show the reason before the user submits: `safebyok-react`'s dialog does
  so by default. It hears the passphrase in plain text, so it must run on the device and keep
  nothing: never send it to a server, log it, or let an error tracker capture it.

## Fingerprint unlock (passkeys)

A vault's ways in may include passkeys: a fingerprint, a face, a phone or a security key, whose
authenticator answers for the vault through the WebAuthn PRF extension. The core never calls
WebAuthn: it takes the answer as a `PasskeyProof` (`{ credentialId, prfSaltB64, prfBytes }`),
which `safebyok-react`'s `createPasskey` and `askPasskey` make (they import no React, so any
framework's host can use them).

```ts
// The vault checks the passphrase first, then calls createPasskey: a wrong one makes no passkey.
const wayinId = await vault.addPasskey(passphrase, () => createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName } }), { wayinlabel: 'laptop' })
// wayinId is null if the user dismissed the prompt

vault.getSnapshot().wayins        // [..., { wayinkind: 'passkey', wayin_id, wayinlabel: 'laptop', device_id, registered_at, credential_id, prf_salt_b64 }]

const answer = await askPasskey(vault.getSnapshot().wayins)    // null if the user dismissed it
if (answer !== null) { await vault.unlock(answer) }             // no key derivation to wait for
```

* **A passkey is a way in like a passphrase.** Its wayin wraps the same vaultKey, under a key
  made from the passkey's answer by HKDF-SHA256; an unlock with it grants this device a lease
  for `leaseHours`, and `askPassphraseAt` applies, as for a passphrase. It counts
  toward `MaxUnlocks`.
* **Adding one asks for proof**, a passphrase or another passkey's answer, as every change to the
  ways in does; `addPassphrase` and `retireWayin` take a passkey's answer as proof too.
  `changePassphrase` changes a passphrase only.
* **A passkey can stand in for a forgotten passphrase**: `addPassphrase(answer, fresh, {
  wayinlabel })`, then `retireWayin(answer, oldId)`. But **a vault always keeps a passphrase**:
  removing the last one refuses with kind `last_wayin`, since a passkey can be lost with its
  device. A vault is created with a passphrase, too: a passkey's `unlock()` on an `absent` vault
  refuses with `absent_vault`.
* **Where it works.** A passkey answers on the device that holds it: a platform passkey synced by
  iCloud Keychain or Google Password Manager on every device signed in to that account, a security
  key wherever it is plugged in. Browsers and authenticators without PRF refuse with kind
  `passkey_unavailable`; offer the passphrase then.
* **Removal is not revocation**, here as for a passphrase: a removed passkey still opens a copy of
  the vault props kept from before.

## No recovery

There is no recovery path, on purpose. A forgotten passphrase means an unrecoverable vault: the
user re-enters their API keys, which is annoying, not catastrophic. Say so in your UI; the React
binding's passphrase dialog does. A passkey added beforehand is the one way back in: with it the
user sets a new passphrase.

## Errors

Every vault call that refuses throws a `VaultError` (`isVaultError(err, kind?)` tests for one),
with a calm message and a `kind` to branch on. The kinds are `VaultErrorKindVals`, and the
whole list: the storage adapters (`safebyok-indexeddb`, `safebyok-convex`, `safebyok-postgres`,
`safebyok-graphql`, your own) throw these same kinds, and no package has others. An error never
carries a whisper, a passphrase or any other secret, in its message or as a property.

The kinds fall into two families, told apart by who must act.

### Misuse: fix the code

A programming error. Do not show it to the user and do not retry; let it reach an error boundary
or the dev overlay (in React, `VaultProvider` rethrows misuse from `Vault.make` or its hello
during render for that, and hands a condition down as `openError`).

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `bad_label`           | a label (or the `userId`) that fails the vault's check: `Label` (or `UserId`) by default, or the host's own in `validators`; or a `wayinlabel` the vault already has | Pass labels the app chose; check a user-typed one first with the same check, and against the snapshot's `wayins` |
| `bad_whisper`         | a whisper JSON cannot carry (`undefined`, a function, a class instance) | Store plain JSON; to empty a lockbox, `retireBox` it |
| `bad_option`          | an option or argument out of its range: a `Vault.make` option, or one it does not take, an `argon2idDeriver` spec, a `storeBox()`'s sidecar, a passphrase or callback of the wrong type; a passkey's answer of the wrong shape, or one already a way in | Fix the call; the message names what it takes |
| `bad_record`          | a record or expectation handed to a `VaultDB` verb that is not one this package builds: a malformed lockbox or vault props, an expectation missing a field, or a record and its expectation that disagree about the `vault_id` or `vault_key_epoch` | A bug in a hand-built record or a custom adapter's caller: hand a `VaultDB` only the records and expectations a vault builds; the message names which |
| `vault_closed`        | the vault handle was closed                                      | Open the vault again; do not use a handle after `close()` |
| `unknown_key_deriver` | the vault names a key deriver this handle was not built with     | Update safebyok, or open the vault with the deriver that made it |
| `insecure_context`    | `Vault.make` in a page that is not a secure context: served over plain http from anywhere but localhost, where the browser withholds WebCrypto | Serve the app over https |

### Conditions: handle them at run time

Part of normal operation. Each can reach the user; the app decides how.

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `vault_locked`        | a whisper was asked for before the vault was unlocked            | Ask for the passphrase and `unlock()`, then retry (`safebyok-react`'s `withUnlockedVault` does) |
| `wrong_passphrase`    | the passphrase did not unlock the vault, or was empty. A passphrase wayin altered in storage refuses its passphrase in just the same way, so the message says that the stored vault may be damaged | Ask again, with a hint to check for typos. If your handling says "check for typos", treat `created_elsewhere` alongside it, with its own advice |
| `created_elsewhere`   | a first `unlock()` on an `absent` vault lost a race: another device created the vault between this one's look at storage and its write, and the passphrase given does not open that vault. Nothing was created here, and the vault now shows `locked` as the other device made it. A passphrase that does open it unlocks as usual | Show the message as advice, not as a typo: the user enters the passphrase chosen on the other device |
| `weak_passphrase`     | a new passphrase -- the one the first `unlock()` creates the vault with, or one `addPassphrase()` or `changePassphrase()` sets -- that the vault's `passphraseStrengthTest` finds too easy to guess. The message is the test's own reason. Never raised by an `unlock()` of a vault that stands | Show the message beside the field, and ask for another |
| `wrong_passkey`       | the passkey's answer did not unlock the vault, or answered for another salt. An answer for the wayin's own salt that does not open it most likely means the wayin was altered in storage, and the message says so | Ask for a passphrase; if it works, the user may remove that passkey and add it again |
| `passkey_unavailable` | this browser or authenticator cannot answer for a passkey unlock: no WebAuthn, or no PRF extension | Offer the passphrase instead; on `createPasskey`, tell the user this device cannot be a fingerprint unlock |
| `absent_box`          | no lockbox under that label                                      | Offer to create it, or refresh the list: it may have been retired elsewhere |
| `absent_vault`        | the vault has never been created, or was deleted elsewhere, and the call will not create it | Unlock with a new passphrase to create it |
| `absent_wayin`        | no way into the vault has that `wayin_id`, or is the passkey that answered: it may have been removed on another device | Look again at the snapshot's `wayins`, and ask the user which they mean |
| `whisper_too_large`   | a whisper over the vault's `maxWhisperBytes`                     | Tell the user it is too large; a host that means to allow more passes a larger `maxWhisperBytes` |
| `lockbox_too_large`   | a lockbox -- its whisper, sidecar and boxlabel together, as the UTF-8 bytes of its JSON -- over its storage's `maxRecordBytes`; only a host whose validators admit long names, or a backend with small records, meets it | Tell the user to store a smaller whisper or sidecar |
| `vault_full`          | a new lockbox in a vault already holding its `maxLockboxes`, a new lockbox whose names would take the vault past its storage's `maxVaultBytes`, or a write the storage backend has no room for | Tell the user to retire a lockbox first; the host may raise `maxLockboxes` where the backend allows |
| `too_many_wayins`     | a passphrase or passkey added to a vault already holding `MaxUnlocks` (8) ways in | Tell the user to remove one first             |
| `last_wayin`          | removing the vault's last passphrase: a vault always keeps one, since a passkey can be lost with its device | Add another passphrase first; to be rid of the vault, `retire()` it |
| `corrupt_record`      | a stored record failed validation as storage read it back: storage's own word, from a `VaultDB` called directly. A vault call says what it means for the vault instead, as one of the three below -- but for a `storeBox()` whose storage adapter answered its write with a record that fails its checks, or a `retireBox()` whose adapter answered in a shape this package does not know: a bug in that adapter | Nothing was changed, unless a write was answered so: then it may have landed. Do not retry; see a developer: the record is damaged, was moved, or came from a newer safebyok, or the adapter cannot read back what it writes or reports |
| `damaged_vault`       | the vault's stored props failed their checks (not a shape this package writes, or naming another vault), so no way in can be tried: `hello()` refuses it | Nothing was changed, and a retry will not mend it. Tell the user the vault cannot be opened; restore its props from a backup, if there is one, or, if the user chooses to start over, `retireDamagedVault()` (see *A vault that cannot be opened*) |
| `damaged_wayin`       | a way in is stored in a form this package never writes (a salt of the wrong length, or not base64url), so it cannot be tried: the passkey asked for, the passphrase `wayinId` aims at, or every passphrase the vault has. Other ways in are still tried | Unlock another way, then `retireWayin()` the damaged one and add it again |
| `damaged_lockbox`     | a lockbox failed its checks as read, or would not open under the vault's own vaultKey, or opened to no whisper: altered in storage, or moved there from elsewhere. A lockbox that will not open is named so only after the vault has caught up with storage once: one a vault made anew elsewhere wrote makes the call `vault_locked` instead | Nothing was changed. Offer `retireBox()`, or a fresh `storeBox()` over it (see *Damaged lockboxes*) |
| `newer_format`        | the vault's stored props are in a form this version does not know -- a `format`, wayinkind or number of wayins -- which a newer safebyok may have written: `hello()` and `retireDamagedVault` refuse it | Nothing was changed. Tell the user to update the app; never offer to start over |
| `stale_write`         | storage changed since this device read it, so the write was refused and nothing was written: another device or tab wrote, created or retired the lockbox a `storeBox()` was writing; a `retireBox()` into a vault deleted or made anew elsewhere, its message saying the lockbox could not be retired because its vault is gone; and a write whose catch-up with storage then failed too (its `cause` says why; the snapshot reads `syncing: false`) -- unless the catch-up was refused as `identity_revoked`, `rolled_back` or `newer_format`, which the write throws as it came | The vault has caught up: show what stands now and, if the change still applies, repeat it (*Two devices storing at once*, below). Nothing is tried again by itself |
| `rolled_back`         | this device has already seen a newer copy of the vault props than storage offers now (storage restored from a backup, or altered), so it won't use this one, and the vault locked: nothing was unlocked or written | Tell the user this device has seen a newer copy of the vault than storage holds. If the storage was restored from an older copy on purpose, accept it on this device (see *A vault rolled back*, below); otherwise the app's support should look at its storage |
| `not_permitted`       | the storage backend refused the signed-in user, still the vault's own, this one call | Tell the user they may not; signing in again will not help |
| `identity_revoked`    | the storage backend no longer serves the user this vault was opened for: signed out, or another user signed in. The vault has locked itself (see *When the user signs out*) | Have the user sign in again, then open the vault for whoever that is |
| `storage_unavailable` | the storage backend could not be reached, or failed; or this device's own store failed for a reason that may pass; or `zxcvbnPassphraseTest`'s word list could not be fetched | Try again shortly; the adapter's own error is the `cause`, unless it may quote the call (Convex's) |
| `storage_blocked`     | this device's own store (its device store, or a vault kept on the device, as `safebyok-indexeddb`'s) refused for a reason that holds until something outside the app changes: the browser withholds storage from the page (site data blocked, a sandboxed frame), has no room for it (a quota of zero, as some private windows give, or a full disk), or offers no IndexedDB at all | Do not offer a retry: tell the user this browser is keeping the app from storing anything on this device. The app may open the vault again with `memoryDeviceDB()`, which keeps no lease here; the browser's own error is the `cause` |

`Vault.make` itself throws `bad_option`, `bad_label` or `insecure_context`, at once. Its `hello()`,
as it reads the vault from storage, can refuse with `storage_unavailable`, `not_permitted`,
`identity_revoked` or `damaged_vault` (a damaged lockbox never stops it): conditions, which the
snapshot keeps as its `trouble`, the vault still `opening`. So is `storage_blocked`, from this
device's own store or a vault store on it, which saying hello again will not mend. A refused hello
leaves the handle as it was, its storage watch live, so the host calls `hello()` again, or simply
carries on: every call but `lock()`, `lockSoon()` and `close()` tries again first. Close the
handle to let it go.

### Two devices storing at once

A `storeBox()` writes only over the revision of the lockbox it read (or over none, for a new one),
in the vault and under the vaultKey it read. When another device or tab writes, creates or
retires that lockbox in between, storage refuses the write, and `storeBox()` catches up with storage
once and throws `stale_write` at once, without waiting: nothing was written, and the snapshot
shows the lockbox as storage now holds it. The vault never tries again by itself and never
merges two writes -- in a store of secrets, a write that lost must be seen -- so show the user
what is there now, and call `storeBox()` again if their whisper should still replace it: the second
call writes over what the catch-up brought in. Should the catch-up find the vault retired or
made anew elsewhere, or its ways in changed, the device relocks, and `storeBox()` throws
`vault_locked` instead, writing nothing. A `retireBox()`, a passphrase change or a `retire()` that
meets another device's write is refused as `stale_write` the same way, once caught up.

Do not overlap your own `storeBox()` calls on one lockbox: await the first before the second.
Both would read the same revision, so the second is refused as `stale_write`, and its message
words it as another device's write, because storage cannot tell your app's second call from
another device's.

### A vault that cannot be opened

Stored vault props that fail their checks make `hello()` refuse with `damaged_vault`, and
`retire()` cannot reach a vault it cannot read. `retireDamagedVault` is the way to clear such a vault
and start over. It takes the options `Vault.make` took (only the vault's names and its two stores
matter) and retires that vault's stored props and lockboxes through the `VaultDB`, and this
device's lease of it through the `DeviceDB`: what `retire()` does, for this one case. Whatever the
vault held is gone for good, so ask the user first.

```ts
const vault = Vault.make(opts)
try {
  await vault.hello()
} catch (err) {
  if (! isVaultError(err, 'damaged_vault') || ! await userAgreesToStartOver()) { throw err }
  await retireDamagedVault(opts)
  await vault.hello()   // absent: a new vault is made on the next unlock
}
```

It refuses a vault that is sound, with `bad_option` and nothing removed: a vault that opens is
retired through its handle's `retire()`. With no vault stored it erases only the device's
lease, so a call cut short can be made again. It needs the stored record's `vault_id`
to aim the retirement, so vault props too damaged to show one are refused as `damaged_vault`
still, with nothing removed: the backend's own tools can clear them (`localVaultDB`'s vault props
that are not JSON at all are one case). A record this version cannot read may instead have been written by a **newer**
safebyok, which opens it; so one in a `format` this version does not know, with a
`wayinkind` it does not know, or with more wayins than `MaxUnlocks`, is refused with a kind of its
own, `newer_format`, by `hello()` and `retireDamagedVault` alike, nothing removed, with a message
telling the user to update the app: never offer to start over on it. That is all this version can tell from damage, which rests on a rule: **any change to
what a stored record may hold -- a field, a shape, or a range a check accepts -- bumps
`format`**, so an older build can tell "newer" from "damaged". Where it cannot
tell, it refuses rather than retires. So is any backend that checks a record before
it hands it over, as `safebyok-graphql`'s server does: there a damaged row is the backend's to
clear; so is a typed backend's (Convex's, Postgres's), whose rows cannot hold damaged vault props.
`safebyok-react` hands `retireDamagedVault()` down beside `retryOpen`. A `VaultDB` that wraps
another's public verbs hands `VaultDB.retireDamagedVault` on too (`VAULTDB.md`, line 3.5). The
retirement aims at the stored `vault_id` alone, so vault props rewritten under that same
`vault_id` between its read and the retirement go too: it is the same vault, the one the user
asked to retire.

### A vault rolled back

Each device keeps a mark of the newest copy of each vault's props it has seen (its device mark,
in the `DeviceDB`), and refuses an older copy of that vault with `rolled_back`, taking nothing
from it, and locks, as for a user signed out (*When the user signs out*): storage handing back an
older vault props could otherwise bring back a way in that was removed, or, once a vaultKey can be
replaced, a vaultKey too. A device that never saw the newer
copy, or whose site data was cleared, cannot tell, and takes the older copy as it stands.

When the vault's storage was restored from an older copy on purpose, each device that saw a
newer one accepts it by forgetting its mark of the vault -- the one way out, by design: no verb
puts forgetting the newer copy one call away -- through the `DeviceDB` it opens the vault
with, and saying hello again. Whether the restore was on purpose is for the app to know, from its
own backend or its operators, and not for the user to guess: storage that rolls a vault back on
its own meets the user with the same refusal, so a prompt asking "was your vault restored?" turns
the check off for whoever the check is there to stop.

```ts
const vault = Vault.make(opts)
try {
  await vault.hello()
} catch (err) {
  if (! isVaultError(err, 'rolled_back') || ! await storageWasRestoredOnPurpose()) { throw err }
  await opts.deviceDB.eraseMark({ applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
  await vault.hello()
}
```

Close any handle already open on the vault first; `rolled_back` also reaches an open handle, from
`unlock()`, a change to the ways in or a store. Whatever the older copy holds stands then, so tell
the user what that means: ways in removed since, and passphrases since changed, open the vault
again, and a passphrase added or changed since opens it no longer. This device's lease is from
the newer copy, so it lapses, and the user enters a passphrase again. The
device takes a new `device_id` for the vault, so the ways in it adds from then on carry a different
one than those it added before. A restore for a vault refused as `damaged_vault` meets the same
refusal on every device that saw a newer copy than the backup.

### Damaged lockboxes

A lockbox whose stored record does not read back -- not JSON, a malformed time, a sidecar
that is not JSON, a record naming another boxlabel than the one it is stored under, one from a newer
safebyok, or one sealed under a vaultKey the vault does not hold (its `vault_key_epoch` neither
the vault props' nor the prior one's) -- is listed in the snapshot as damaged,
`{ boxlabel, damaged: true, revision_tok }`, sorted among the sound ones, which carry
`damaged: false`. Its `revision_tok` is the one its record holds, when it holds one as text, and
null otherwise; nothing else of it is trusted. (One stored under a name your `validators` refuse
is not damaged: it lists and reads as any other.) The rest of the vault opens and works
as ever. `readBox()` and `useBox()` refuse a damaged lockbox with `damaged_lockbox`; `retireBox()` removes
it by the name it is listed under, and `storeBox()` writes a fresh lockbox over it -- except under a
name your boxlabel check refuses, which `storeBox()` refuses with `bad_label`, writing nothing. A
damaged lockbox's boxlabel is the name it is stored under, above the floor but perhaps one your
boxlabel check refuses: show it as text, never as markup. A row stored under a name below the
floor, which no call could reach, is not listed. Show it as removable:

```ts
for (const box of vault.getSnapshot().boxes) {
  if (box.damaged) { showDamaged(box.boxlabel) }   // offer retireBox(box.boxlabel), or a fresh storeBox()
  else { showSummary(box.boxlabel, box.sidecar, box.written_at) }
}
```

Damage the listing cannot see -- altered ciphertext, a missing or malformed ciphered field --
shows only when the lockbox is read: the listing reads each record's shape and never opens its
ciphertext, which would cost deciphering the whole vault at every refresh. Such a lockbox lists
as sound, `readBox()` refuses it with `damaged_lockbox`, and `retireBox()` removes it. Before it says
`damaged_lockbox` of a lockbox that will not open, the vault catches up with storage once: a
lockbox written by a vault retired and made anew elsewhere relocks this device, and the read
refuses with `vault_locked` instead. `storeBox()` starts afresh over any record it cannot read as a
lockbox -- every one the snapshot lists as damaged, and one missing or mangling a ciphered field --
carrying nothing from it, neither its sidecar nor when it was first stored. It writes over the
revision the listing names, in one write that lands only while that record still stands, so a
sound lockbox another device wrote there meanwhile is never retired: the store is refused as
`stale_write`, as over any lockbox written meanwhile, and a second store writes over theirs. Only a record that names no revision
is retired first and then written, and should that write fail, nothing stands under the boxlabel.
A record that reads but will not decipher -- its ciphertext, sidecar or times altered -- is written
over its revision, and carries nothing forward either: nothing vouches for its server-readable fields, so
its sidecar becomes `{}` unless you give one, and its first-stored time is now. A storage adapter's `doListBoxes` hands up each lockbox as a
`StoredLockbox`, the boxlabel it is stored under beside its record exactly as stored, so a record
too damaged to name itself is still listed under the boxlabel that reaches it.

A retirement within the vault wins over any revision, damaged or sound. A `retireBox()` that finds
the lockbox written over since the snapshot showed it, on another device or tab, retires that
write all the same; so does the retirement a `storeBox()` makes first over a record naming no
revision, should another device have stored there meanwhile, and the store then writes its own.
Either way the vault warns through your logger that a different revision than the one it showed
was retired, naming neither: the other device's whisper is gone, and only the log says so.

In code, `VaultErrorFamilyForKind` gives each kind's family (`VaultErrorFamilyVals`: `misuse`,
`condition`), and `isVaultCondition(err)` is true for a `VaultError` of the condition family:
show or retry those, and let anything else reach an error boundary.
