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
which API key a box holds (`sk***...***wxyz`) without showing the key. `mask` is intended
for plain text; calling it with arbitrary blobs may give unusual behavior. It strips every
combining mark, so a script that writes its vowels as marks loses them (Hindi `नमस्ते` comes out as
`नमसत`); an API key is ASCII, and is untouched.
`whiteboard/20261013-relic/proposed-README.md` drafts the full README for when the surface
settles.

## Quickstart

```ts
import { Bank } from 'safebyok'
import { browserOpts } from 'safebyok/browser'
import { idbVaultDB } from 'safebyok-indexeddb'

const vaultDB = idbVaultDB({ dbName: 'acme' })   // once, at module level: or your backend's adapter

const bank = Bank.make({          // as the user signs in: a bank per user
  applabel:   'acme',
  user_id:    session.user_id,    // your auth's stable, opaque id for the user; never an email
  vaultDB,
  ...browserOpts({ dbName: 'acme' }), // the key deriver, device store and passphrase strength checker a browser wants, the same at every call
  requestCleartext: (gating) => showDialogFor(gating), // your dialog: see *Asking the user: gatings*
})

const vault = await bank.ensureVault({ vaultlabel: 'main' })
vault.snapshot.gate               // null until the first passphrase is set
vault.snapshot.ask_passphrase_at  // null while locked on this device
await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-...')   // locked or novel: asks through requestCleartext first

const answer = await vault.useWhisper('anthropic_api_key', (whisper) => callAnthropic(whisper))
```

The vault store is never among the defaults: where the vault lives is the one choice every app
makes for itself. Any option you pass after the spread replaces the default it names, and an
option `Bank.make` does not take -- a misspelling, or a name it no longer uses -- is refused with
`bad_option` rather than quietly ignored.

A bank serves one signed-in user, and lives as long as their session: make it as they sign in, and
at sign-out let its vaults go (`bank.closeVaults()`) and drop it. What is costly to load -- the key
deriver and the strength checker -- is made once, before any bank, and handed to each.

`Bank.make` answers at once, and touches nothing: no storage, no device store, no timer, no
prompt. `bank.ensureVault` says the bank's `hello()` first (running the strength checker's and
the key deriver's `load`, where they carry one), then
births the vault's Vault object from one read of storage and this device's store: the vault as
stored, or a new one with no passphrase yet (`novel`), stored at once; this device's lease taken up
when it still fits. Two asks for one vault get one Vault object. A Vault object holds one life of
the vault: deleted, or deleted and made anew, it is gone for good, and `bank.ensureVault` hands out
the next. Once born, a vault's `hello()` within `staleMinutes` (five minutes, unless `Bank.make`
or the call says otherwise) reads nothing anew; call `hello()` on `visibilitychange`, and
`hello({ staleMinutes: 0 })` to read now. At sign-out, `bank.closeVaults()`, and drop the bank.

Each bank call naming a vault takes a bag whose `vaultlabel` names it: `{ vaultlabel: 'main' }`, or
a Vault object, its snapshot or a vault the bank lists, as it is: `bank.closeVault(vault)`. An
`applabel` or `user_id` in the bag must be the bank's, or the call refuses `bad_scope`
(`bank.demandConsistentWith`); any other field is left out. A vault stored elsewhere than the
bank's stores names its own in a second bag:
`bank.ensureVault({ vaultlabel: 'work' }, { vaultDB: workVaultDB })`; put in the first, a store is
refused, never ignored.

A Vault object's own fields are its stamp, fixed for its life: `format`, `applabel`, `user_id`,
`vaultlabel`, `vault_tok` and `registered_at`. It is frozen, so a log line of it shows those
alone, and `vault.stamp` hands them out as one frozen plain object, to spread or copy. Everything that changes -- its `gate`, `boxes`, `capacity`, `ask_passphrase_at`,
`trouble` and the rest -- is read through `vault.snapshot`, frozen in one object: read it in an
event handler and it is current. React renders from `getSnapshot()`, the same object, and
re-renders on `subscribe()`.

The bank reads where it stands through `bank.lifecycle` -- `made`, `starting` while `hello()`
loads, `ready`, or `refused` -- and its listing through `bank.vaults`: each vault asked for and not
let go, sorted by `vaultlabel`, as its scope and its own `lifecycle` (`starting` while its birth
reads storage, `ready`, or `refused` with its `err`). The listing holds no Vault object:
`bank.vaultOf({ vaultlabel })` hands out the one the bank holds, null until it is `ready`, and
`bank.bankVaultOf({ vaultlabel })` looks one vault's place in the listing up. The listing is the
same array until a vault in it changes, and each of its elements the same object until it changes
itself.

```ts
if (bank.lifecycle !== 'ready') { await bank.hello() }
const refused = bank.vaults.filter((bankVault) => bankVault.lifecycle === 'refused')
```

React renders from the bank's snapshot, `bank.snapshot` (and `getSnapshot()`), frozen likewise:
flat on the bank's scope (`applabel`, `user_id`), with the same `lifecycle` and `vaults`, and the
`err` of a `refused` bank.

### The snapshot

The snapshot carries what a host renders, and nothing more. It sits flat on the vault's scope
(`applabel`, `user_id`, `vaultlabel`), so it may be handed to any bank call as it is, and carries
the vault's `format` and `vault_tok`, so `vault.demandConsistentWith(snapshot)` judges it: it
checks the scope, the `vault_tok` and whether the Vault object is gone, and, as the snapshot holds
no epochs, no longer catches a change to the ways in (`gate_moved`). Beside them:

| field               | what it holds                                                                                      |
|---------------------|----------------------------------------------------------------------------------------------------|
| `gate`              | the ways in, `{ passphrase, passkey }`, each its sparse shape (`GateSparse`); null until the first passphrase is set |
| `boxes`             | every sound box, sorted by boxlabel, each its `BoxSparse`: every field of its record but the ciphertext |
| `damagedBoxes`      | every box stored damaged, sorted by boxlabel: `{ boxlabel, revision_tok, damage }` (see *Damaged boxes*) |
| `capacity`          | the room the vault has, `{ boxes, bytes }`, each `{ used, max }`                                    |
| `ask_passphrase_at` | when this device's unlock ends, in epoch ms; null while locked                                     |
| `freshness`         | `timely`, `aged` or `refused`: how far to trust what it shows of storage                          |
| `trouble`           | the latest bad news (see *Bad news: tell the user*), or null                                       |

A host chooses its screen from two of them:

```ts
const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
if (snapshot.gate === null) { return <ChoosePassphrase /> }               // novel: no passphrase yet
if (snapshot.ask_passphrase_at === null) { return <Unlock gate={snapshot.gate} /> }   // locked
return <BoxList boxes={snapshot.boxes} />                                 // unlocked
```

The snapshot is the same object until something changes, and so is each of `gate`, `boxes`,
`damagedBoxes` and `capacity` until it changes itself: a memoized component handed `snapshot.boxes`
skips a lock, an unlock or a change to the ways in. It holds none of the vault's epochs, nor
anything an offline guess at a passphrase could start from: no salt, key deriver label or wrapped
vaultKey. A passkey's credential id and PRF salt do show, as its authenticator is asked with them.

Serve the app over https: a browser withholds WebCrypto from a page served over plain http, so
`Bank.make` refuses one at once, with kind `insecure_context` (`http://localhost` counts as
secure, for development).

## The cast, and how it fits together

safebyok names each thing once; [VOCABULARY.md](../../VOCABULARY.md) is the dictionary, and the
code, the stored records and these docs all use its words.

* A **whisper** is the secret you store: any JSON value, such as an API key. A **box** holds
  one whisper, encrypted, with its `boxlabel` and its **sidecar**, your app's own data that
  rides beside it, visible in storage: authenticated, never encrypted. A **vault** is one user's set of boxes, named by your `applabel`,
  the signed-in user's id and a `vaultlabel`.
* The vault is unlocked through one of its two **wayins**: its passphrase, which every
  vault has, or its passkey's answer, if it has one. A **gating** asks the user for one, and
  makes what they give it a **proving**, a key that lives for that one request. Each wayin holds the
  one **vaultKey** (the vault's random master key) wrapped under a key made from its passphrase
  or passkey, so changing the
  passphrase, or adding or removing the passkey, rewrites no box. The vaultKey wraps a fresh
  **boxKey** for every stored whisper, and the boxKey encrypts the whisper. The wayins live in
  the vault's **gate**, nested in the **vault record**, the one record per vault that every
  device syncs (`VaultRecord`: its scope, `vault_tok`, `registered_at`, `vault_epoch`,
  `gate_epoch`, and `gate`, null until the first passphrase is set). The backend holds those
  and the boxes, nothing else: every key and whisper in them is ciphertext; only their labels,
  ids, times and sidecars are not, and those are unencrypted, readable by anyone who can read your database.
* A **lease** lets this device unlock again without asking for a while: when a gating unlocks the
  vault, the device keeps the vaultKey wrapped under a key the browser cannot export, until
  `leaseHours` run out. It never leaves the device.
* Every encryption is bound to its **ctx**: the **stamp** of what it seals, the fields fixed for
  its life (a box's every visible field, beside its vault's scope, `vault_tok` and
  `registered_at`), and which field it is. Ciphertext moved to another record, or under an
  altered field, will not open.
* A **bank** (`Bank.make(opts)`, which answers at once) holds the signed-in user's vaults, and
  `bank.ensureVault({ vaultlabel })` births a Vault object from what storage and this
  device hold of the vault, storing it, with no passphrase yet, if none is stored: novel (the
  snapshot's `gate` null), locked (its `ask_passphrase_at` null) or unlocked. Its boxes are written with `putBox`, read with `getBox` (the sealed `Box`, or null), `getWhisper` (its
  whisper, refusing `absent_box` for none) and `useWhisper`, and removed with `delBox`; `del()` removes the whole vault, and the Vault object with it. A `Box` in hand
  opens with `box.extractWhisper()`, under the vault's lease, reading nothing.
  A `Box` is one revision of one box, every field it shows fixed for its life and frozen: its
  scope and boxlabel, its record's fields but the two ciphered ones, and the `vault_tok`,
  `vault_epoch` and `gate_epoch` of the vault it was made under. It holds its stored record as
  `box.record`, which no spread or JSON shows. While unlocked, the vault keeps the vaultKey in one
  place, wrapped in its `Lease`, which is the Vault object's own: no getter shows it. A box seals
  and opens under it (`vault.putBox()`, `box.extractWhisper()`), and locking drops it;
  `vault.snapshot.ask_passphrase_at` is when it ends. Two devices that write at once
  cannot both win: the late one is refused as `stale_write` (see *Two devices storing at once*),
  and a first unlock that loses the race to set the vault's first passphrase is
  `gate_made_elsewhere`.
* Storage is two plug-ins the core speaks to only as interfaces: a **vaultDB** for what syncs
  (vault record and boxes) and a **deviceDB** for this device's lease and its **device record** of
  each vault (the highest `vault_epoch` it has seen there).

```text
passphrase or passkey + wayin ──> wayinKey ──unwraps──> vaultKey ──unwraps──> boxKey ──deciphers──> whisper
                                                          ^
                                   lease: leaseKey on this device unwraps it without asking
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

* `safebyok` -- `Bank` (`Bank.make`), the `Vault` it hands out, and the types, errors and stores
  around them.
* `safebyok/browser` -- `browserOpts({ dbName }?)`: the pinned Argon2id key deriver
  (`argon2idWebV1Deriver`), the IndexedDB device store (`idbDeviceDB`) and the passphrase
  strength checker (`zxcvbnStrengthChecker`), as a bag of options. The checker's zxcvbn
  dictionary loads, as a chunk of its own, at the bank's `hello()`, never at import (see
  *A new passphrase's strength*).
* `safebyok/idb` -- the IndexedDB device store, `idbDeviceDB`, and `inspectIdbDeviceDB`, a raw
  window onto its rows for a debug panel. The IndexedDB vault store, `idbVaultDB`, is a package
  of its own, `safebyok-indexeddb`.

`Bank.make` takes its `keyDeriver` and `deviceDB` from you, with no default behind them, and its
`strengthChecker` too, with a default that refuses every passphrase until you choose one. A
default would be imported by `Bank.make` itself, so every app would ship it, used or not: a
bundler drops only the code nothing imports. The key deriver is the choice an app most plausibly
makes differently -- another implementation of the same Argon2id spec, in WebAssembly or native
to its platform -- and such an app should not also ship this one (about 15 kB minified). So the
main entry names no default and imports nothing from `safebyok/browser`, and the package is
marked `sideEffects: false`: what you never import never ships.

## A box's sidecar

Each box carries a **sidecar**: your app's own data, riding beside the whisper,
**visible** -- authenticated, but never encrypted, so anyone who can read your database can
read it. It is a JSON object your app keeps about the box (`{}` when it keeps nothing) -- what the user calls the account,
which project a key belongs to, when it was last rotated -- or whatever your app wants searchable
server-side (a team, a rotation reminder, a count of the calls the app made to OpenRouter with this whisper). It shows in the snapshot while the vault
is locked, as `box.sidecar`. The vault never looks inside it.

```ts
await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account', project: 'atlas' } }, 'sk-ant-...')
await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-new')                // keeps the sidecar it has
await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'personal' } }) // keeps the whisper it has
await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: {} }, 'sk-ant-new')   // and empties the sidecar
vault.getSnapshot().boxes[0]  // { boxlabel: 'anthropic_api_key', sidecar: {}, revision_tok, written_at, ... }
```

* **It is never encrypted.** It is stored in the clear, so never put secret material in it: a key, a
  password, a recovery code. Anyone who can read your storage reads it.
* **It is guaranteed unchanged.** Its JSON, keys sorted, is bound into the box's encryption with the
  rest of the box's visible fields, so a sidecar altered or swapped in storage makes the box
  refuse to open (`damaged_box`). The guarantee comes with `getWhisper()`: the snapshot shows the sidecar as
  storage holds it, and only `getWhisper()` proves it unaltered. It is stored as the JSON object it
  is, so a backend may keep it as JSON it can query (a Postgres `jsonb` column) and reorder its
  keys: the box binds it with its keys sorted, so the same value opens however storage orders it.
* **Its shape is yours.** The vault checks only that it is a JSON object (`sidecar`; anything
  else, a bare string, array or null among them, is `bad_option`): check its shape yourself, with your own schema, before `putBox()`. Left out of a
  `putBox()`, the box keeps the sidecar it has: the call reads the box and opens it first; a new box's is `{}`, as
  is one written over a record that will not open. Given with the whisper, nothing is read: the box is
  written over the revision the snapshot lists, keeping its `registered_at`.
* **It shares the whisper's room.** `maxWhisperBytes` counts the whisper's JSON and the
  sidecar's together, so a large sidecar leaves less room for the whisper. Its size shows in storage, as every
  visible field's does.

## Names

Every name is the package's to check. A label -- an `applabel`, a `vaultlabel` or a `boxlabel` --
is lowercase words of letters and digits joined by single underscores, starting with a letter, 2
to 40 characters (`label`). A `user_id` is 1 to 100 ASCII letters, digits and `-_.~:@+|%`, never
dots alone (`user_id`), opaque and compared byte for byte: pass your auth provider's stable id,
which never changes, as a vault is found by it. Percent-encode (RFC 3986) a name outside these
rules, the same way every time, as a name is bound into the ciphertext. A name that fails refuses
`bad_scope`, naming each failing field (its `meta.fieldnames` lists them) and never quoting the
name; check one a user types first, with `label.safeParse(typed)`, or `LabelPattern` and
`MaxLabelChars` on a form's input. A pull request widening a rule is welcome where it keeps a name
safe as a scopepath segment.

Each `putBox()` weighs its box -- whisper, sidecar and names -- and refuses one heavier than the
backend holds in a record (`box_too_large`), or a new one that would take the vault past what the
backend holds of a vault (`vault_full`). The record is weighed as its real serialized bytes; the
vault's total is a conservative estimate made before the box is sealed (each counted at twice
`maxWhisperBytes` for its whisper and sidecar, with its names as measured), so at a `maxVaultBytes`
set exactly tight it may refuse a write that would just fit. A replacement weighs what it replaces,
and is never refused as full. `maxWhisperBytes` is checked as a whisper is stored, never as one is
read, so lowering it strands nothing.

## Validators

The checks a host or a storage adapter calls or builds on are exported from the main entry, each
under its own name, lowerCamelCase beside its type: the stored records (`vaultRecord`,
`boxRecord`), the scopes and scopepaths, each stored field (`vault_tok`),
the options `Bank.make`, its calls and its stores take, the objects a host hands in (a store, a
clock, a key deriver, a logger) and what their callbacks return, and the expectations a `VaultDB`
is handed. The pieces the package builds those from are its own. Each is Zod, made in a
`Checkers` or `Checker` call: its `parse` throws a `VaultError` of its kind (`bad_record`, `bad_scope`,
`bad_option`, `bad_whisper`), and its `safeParse` is Zod's own. `label`, `user_id` and
`epochMillis` are plain Zod, the names they are all made of. Import each by name, as below, or
the whole main entry (`import * as Safebyok from 'safebyok'`, then `Safebyok.vaultRecord.parse(row)`):
there is no namespace of validators.

```ts
import { Checker, vault_tok } from 'safebyok'

const sidebarOpts = Checker(({ obj, bool, vaultlabel }) => obj({ vaultlabel, collapsed: bool.optional() }).strict(), 'bad_option')
sidebarOpts.parse({ vaultlabel: 'work', collapsed: true })
vault_tok.safeParse(storedRow.vault_tok).success
```

A refusal names each failing field and says what it must be, in Zod's English, and never repeats
what it was handed: not a value, and not the name of a field it does not take, which it counts,
listing the fields it does take. Your own validators made with `Checker`, `objCheck` or
`Checkers` refuse the same way: `Checker` makes one, its kind `'bad_record'` unless given after
the builder; `objCheck` makes one of an object from its fields, strict unless given
`{ refuseAs, extras: 'strip' }`; `Checkers` makes several, returned by name.

## Your own storage adapter

Extend `VaultDB` and implement its `do*` methods (`Bank.make` takes nothing but a `VaultDB`,
whose public verbs check every record your code sees): its doc block says what each one owes, the
[VaultDB contract](VAULTDB.md) says what an adapter promises in all and what it may leave
undone, and `describeVaultDB` from `safebyok/testing` checks it, a group of tests to each of the
contract's numbered lines. Give it `makeDevices` -- devices over one backend, each round trip
through a turnstile -- and it races your writes from two devices, holding one before each round
trip while the other moves ([Proving the races](VAULTDB.md#proving-the-races)). A backend with columns (Convex, SQL) keeps
the applabel, user id, vaultlabel and boxlabel in columns of their own. A backend that holds rows
under one string -- a key-value store, localStorage -- files each under its `Scopepath`, as
`localVaultDB` and `idbVaultDB` do: the row's kind, then its names, joined on `^`.

```ts
import { Scopepath } from 'safebyok'

Scopepath.vault(scope)                          // 'vault^acme^u1^main'
Scopepath.box({ ...scope, boxlabel: 'openai' }) // 'box^acme^u1^main^openai'
Scopepath.withinVaultScopepathPrefix(scope)     // 'box^acme^u1^main^' -- every box of the vault, by prefix scan or key range
store.scopepaths().filter(Scopepath.withinVaultScopepathPred(scope))  // every row under the vault's prefix, from a list of every scopepath
Scopepath.isBox(row) ? Scopepath.boxscope(row).boxlabel : null  // a listed row's boxlabel; null for a row no box is filed under
```

No name holds `^` (no label or user_id may), so no two vaults ever share a scopepath or list each
other's boxes. Each maker checks its scope, refusing `bad_scope` as the public verbs do. The
scopepaths are part of the stored format: use these, not a join of your own, and every device finds
your rows. A listing passes over a row under the vault's prefix that `isBox` rejects, rather than
failing the read: no verb reaches it, so it holds no box.

A read answers the vault as one atomic step read it: `doGetVault` and `doEnsureVault` resolve a
`StoredVault`, `{ vault, boxes, damagedBoxes }`, the vault record exactly as stored (or a
tombstone, or null) and the box rows split by `splitStoredBoxes`, which judges each row's damage
so your adapter never does. Hand it each row as a `StoredBox`: the boxlabel it is filed under,
from its scopepath or its column, beside the record exactly as stored. `StoredBox.box` is typed
as what a row should hold, so cast the row once where you read it from storage; the split's check
backs that cast, and lists a row that is not so as damaged.

```ts
import { splitStoredBoxes, type StoredBox, type StoredVault } from 'safebyok'

protected async doGetVault(scope: VaultScope): Promise<StoredVault> {
  const { vaultRow, boxRows } = await this.getVaultRows(scope)   // one transaction
  return { vault: vaultRow ?? null, ...splitStoredBoxes(boxRows.map((row) => ({ boxlabel: row.boxlabel, box: row as StoredBox['box'] }))) }
}
```

Your `do*` methods take any name the base class passed: every public verb holds each name to its
check (`label`, or `user_id`) and to your adapter's declared `maxNameBytes`. So an adapter that hands its calls on to
another VaultDB's public verbs passes each call through as it came.

A device store of your own extends `DeviceDB`, as a vault store extends `VaultDB`, and
implements its `do*` methods: `idbDeviceDB` from `safebyok/idb` covers a browser, and your own
suits, say, an app that keeps its rows in an IndexedDB database of its own. It keeps two records
per scope, the lease and the device record. The base class files each under its `Scopepath`,
refusing `bad_scope` for a scope whose names fail their checks, so each `do*` method is handed a
scopepath and the record as it is: a lease holds a non-extractable `CryptoKey`, so the store must
keep records by structured clone, never as JSON.

* **Reads hand back the row as stored**, or `undefined` for none. The base class checks it: one
  that fails its check reads as none, and the base class has `doDelUnparsed` discard it. That
  deletes the row only if `isSound` is still false of it as read in the same transaction, so
  a record written since the read is never lost.
* **The device record is raised, never lowered.** `doRaiseDeviceRecord(scopepath, raisedFrom)`
  reads the row, hands it to `raisedFrom` and writes what comes back, all in one transaction, so
  two tabs raising at once never lower each other's record.
* **Calls land in the order they were made.** Each verb calls its `do*` method before awaiting
  anything, so a store that starts each call's work in the order it is called keeps that order,
  awaited or not: a lock's `tryDelLease`, made after a grant's `tryPutLease`, must erase it.
* **What your store throws is a condition.** Every verb is a try pair: `getLease` resolves the
  record or throws its refusal, a `VaultError`, and `tryGetLease` resolves the same as an `Outcome`
  and never rejects. Either way, what your store throws becomes a condition: a browser's refusal
  that holds until something outside the app changes (`SecurityError`, `QuotaExceededError`,
  `NotSupportedError`) becomes `storage_blocked`, which a host shows without offering a retry, and
  anything else `storage_unavailable`. Neither keeps what your store threw, not as a `cause` and not
  its message, only its `name` (`QuotaExceededError`, say), which ends the condition's message: a
  device store is handed every lease record, and an error of its own may quote one, while the logger
  hands a condition to your code whole. A `VaultError` your store throws passes as it came.

```ts
import { openDB } from 'idb'
import { Bank, DeviceDB, type DeviceRecord, type LeaseRecord } from 'safebyok'

// The app's own database, with an object store set aside for safebyok's rows from version 3 on.
const appDB = openDB('acme', 3, { upgrade: (db, oldVersion) => { if (oldVersion < 3) { db.createObjectStore('safebyok_device') } } })

class AcmeDeviceDB extends DeviceDB {
  protected async doGetLease(leaseScopepath: string) { return (await appDB).get('safebyok_device', leaseScopepath) }
  protected async doPutLease(leaseScopepath: string, record: LeaseRecord) { await (await appDB).put('safebyok_device', record, leaseScopepath) }
  protected async doDelLease(leaseScopepath: string) { await (await appDB).delete('safebyok_device', leaseScopepath) }
  protected async doGetDeviceRecord(deviceScopepath: string) { return (await appDB).get('safebyok_device', deviceScopepath) }
  protected async doDelDeviceRecord(deviceScopepath: string) { await (await appDB).delete('safebyok_device', deviceScopepath) }
  protected async doDelAll() { await (await appDB).clear('safebyok_device') }

  protected async doRaiseDeviceRecord(deviceScopepath: string, raisedFrom: (stored: unknown) => DeviceRecord) {
    const tx = (await appDB).transaction('safebyok_device', 'readwrite')   // the read and the write, in one transaction
    await tx.store.put(raisedFrom(await tx.store.get(deviceScopepath)), deviceScopepath)
    await tx.done
  }

  protected async doDelUnparsed(scopepath: string, isSound: (row: unknown) => boolean) {
    const tx = (await appDB).transaction('safebyok_device', 'readwrite')
    if (! isSound(await tx.store.get(scopepath))) { await tx.store.delete(scopepath) }
    await tx.done
  }
}

const bank = Bank.make({ ...opts, deviceDB: new AcmeDeviceDB() })
```

Change the database and object store names to your app's. `Bank.make` refuses (`bad_option`)
a `deviceDB` that does not extend `DeviceDB`. `deviceRecordOf(scope, device_id,
highest_vault_epoch)` builds a device record from a scope's names alone. The device record is
strict, and one that fails its check reads as none: so a field added to it moves its `format`
on, and a device whose safebyok predates the field discards the record, its watermark with it,
until its next read raises it again. `describeDeviceDB` from `safebyok/testing` checks all of
this; hand it a second factory, an adapter over a store the browser withholds, and it checks
each verb answers `storage_blocked`.

Every refresh -- after each of the vault's own writes, and at each change your adapter's
`subscribe` reports -- reads the vault with every box in it (`getVault`), one at a time per Vault object, so its cost
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
  spec exactly as `argon2idDeriver` does. `Bank.make` refuses a deriver that wears a supplied spec's label
  without carrying exactly its parameters; it cannot check the bytes, so that test is yours.

Any `keyDeriver` needs a `salt_bytes` from 1 to 65536 (the most `crypto.getRandomValues` hands out
at once), which `Bank.make` checks, and must hand back 32 bytes of memory of its own from
`deriveKeyBytes`, derived afresh on every call -- a fresh `Uint8Array`, not a view over a
`SharedArrayBuffer`, and not one it keeps: the vault zeroes the bytes once it has made the
passphraseKey of them. A gating's attempt, unlocking or setting a passphrase, refuses anything else with
`bad_option`, 32 zero bytes among it: a key anyone could rebuild, which a deriver handing back
bytes it kept from an earlier call would. A deriver of ours refuses a salt of another length than
its spec's.

`KeyDeriver` is one of two types. An `Argon2idKeyDeriver` carries a whole keyDeriverSpec beside
its function, as every deriver above does, and `Bank.make` checks the spec as `argon2idDeriver`
would, so one Argon2id cannot run is refused at once, not at the first unlock. A
`CustomKeyDeriver` carries only `key_deriver_label`, `salt_bytes` and `deriveKeyBytes`, and may
name its `algorithm`; it may not declare `'argon2id'` without being a whole spec. `Bank.make` logs
a warning (not a refusal) for a label beginning `test_`, the mark of a deriver made cheap for
tests, such as `safebyok/testing`'s.

A deriver that must fetch or build something before it can derive (a WebAssembly module, say)
carries that as `load`, as a strength checker does: each bank's `hello()` runs it, before any
vault is born. Make the deriver once, before any bank, and hand the same one to each, so the
`load` costs nothing once it has succeeded; it forgets a failure, which refuses the hello
`unexpected_error`, the load's error its cause, and the next hello tries again. Call it early to
warm up. The derivers above carry none.

## Asking the user: gatings

Data calls never contain UI, and no vault call takes a passphrase. A call that needs the vault
unlocked -- `putBox`, `getBox`, `getWhisper`, `useWhisper`, `delBox` -- goes through
`vault.ensureUnlocked()`, which says `hello()`, and, when the vault is locked or `novel`, raises a
**gating**: one request for the user's passphrase or passkey, handed to your `requestCleartext`.
So do the changes only the user can prove: `vault.putWayin(slotlabel)`, `vault.delWayin('passkey')`
and `vault.del()`. `safebyok-react`'s `BankProvider` is a `requestCleartext` already: its dialog.

```ts
const requestCleartext: RequestCleartext = async (gating) => {
  // No user gesture in hand (a timer's put, a background sync): don't pop a dialog. Returning declines.
  if (navigator.userActivation?.isActive === false) { return }
  await showDialogFor(gating)   // calls the gating's attempt on each submit; resolves when the dialog closes
}
```

* **`gating.gatingkind`** says which dialog to show, and which attempt it carries:
  `initialize_gate` (a `novel` vault's first passphrase, and a passkey beside it if you offer one:
  `attempt(passphrase, passkey?)`; offer strength advice), `unlock_vault`
  (`attemptPassphrase(passphrase)` or `attemptPasskey(answer)`), `change_passphrase`
  (`attempt(current, next)`), `put_passkey` (`attempt(passphrase, passkey)`), `del_passkey` and
  `del_vault` (`attempt(passphrase)`).
* **The attempt runs the whole change** and resolves an `Outcome`. The refusals a user can
  correct (`correctableKindVals`) leave the gating open: show them in place and ask again.
  They are `wrong_passphrase`, `wrong_passkey`, `weak_passphrase` and `same_passphrase`, and a
  way in gone or stored damaged (`absent_wayin`, `damaged_wayin`) or a passkey this browser
  cannot ask (`passkey_unavailable`), where the other way in, or Cancel, is the user's next
  step. Nothing tries again by itself. Anything else settles the gating -- success, or the
  refusal, which every call waiting on it then hears -- so close the dialog. `gate_made_elsewhere`
  means another device set the first passphrase while the user typed: the next call asks for the
  one chosen there. A first passphrase set when this device's store would not keep the unlock
  refuses `ensureUnlocked()` `storage_blocked` or `storage_unavailable`, saying the passphrase was
  set; through `putWayin`, the change resolves and the logger says so. A second submit while an
  attempt runs refuses `attempt_in_flight`; disable the button meanwhile.
* **An attempt spends the passkey's answer it is handed**: its bytes are zeroed, whether it was
  sealed or never tried. Only a refusal the user can correct leaves it unspent, to hand in again;
  zero it yourself (`answer.prfBytes.fill(0)`) if you will not. Each later attempt needs a fresh
  answer: ask the passkey again.
* **Cancel** resolves your `requestCleartext`, or calls `gating.decline()`: a gating still open
  then is declined, and its calls refuse `vault_locked`. Declining never locks a vault that is
  unlocked, and is no lock: a decline that lands while an attempt's lease is being written to this
  device's store attaches nothing here, but leaves that proven lease in the store, and the next
  call takes it up without asking. To have the vault locked, call `lock()`. A `requestCleartext`
  that throws refuses its calls `unexpected_error`, carrying nothing of the throw (it may quote
  the passphrase): the logger hears only that it threw.
* **One gating at a time.** Every call that needs the vault while a gating is pending waits on it,
  and joins it only when its settling answers the call. `ensureUnlocked()` -- and so every box
  call -- joins an unlock (`unlock_vault`, `initialize_gate`) and hears its answer: a decline
  refuses it too. A joined unlock that leaves the lease ending within the call's own
  `renewMinutes` has the call ask again for itself. `ensureUnlocked()` waits out a change to the
  ways in or a deletion, whatever it settles with, then asks for itself only if the vault is
  still locked: declining "add a passkey" does not refuse a `getWhisper` waiting behind it, which
  then raises its own unlock. `putWayin`, `delWayin` and `del` join one of their own kind and wait
  out any other. A call raises at most one gating of its own. A `lock()` landing while a gating
  is pending refuses every call joined to it `vault_locked`, and the bank letting the vault go
  (`bank.closeVault`) refuses them `vault_gone`; either way `gating.lockLanded` settles: close the
  dialog. An attempt under way
  then attaches no lease, and one after refuses `gating_landed`. A deletion whose write is sent is
  past a lock's or a decline's reach: `del()` resolves when it lands, and refuses `vault_locked`
  when storage refuses it.
* **Another tab's unlock is used first.** Before your `requestCleartext` hears of it, an
  unlocking gating takes up this device's lease when another tab granted one that fits.
* **No `requestCleartext`** means every gating is declined at once: the call refuses
  `vault_locked`.

`vault.ensureUnlocked()` itself unlocks ahead of time, on a button; `ensureUnlocked({
renewMinutes: 60 })` asks now when the lease ends within the hour. A `renewMinutes` as long as the
lease or longer refuses `bad_option`, since every call would ask: to have the user asked each
time, `lock()` once done. A call that cannot land -- a whisper JSON cannot carry, a label the
vault's check refuses, a box the listing in hand does not show -- is refused before anything is
asked.

## Locking

A gating that unlocks the vault grants this device a **lease**: the vault stays unlocked, across
reloads, until the lease runs out (`leaseHours`, seven days by default, at most 588 hours: 24.5 days) or the host locks it. `Infinity` hours means never
on this device, until a lock: `ask_passphrase_at` is then the exported `FarFuture`, the latest
instant the package accepts (in 2255). A finite number past 588 is refused, since no timer
reaches further. Show "until locked" for any `ask_passphrase_at >= FarFuture - MinuteMillis`;
never compare a time for equality. Each gating reports the lease the bank was made with as
`gating.leaseMillis`, in milliseconds, the default and `Infinity` resolved (`Infinity`
reads as the exported `ForeverMillis`), so a dialog can say how long an unlock lasts without
being told the option again.

The deadline is the truth, and a timer enforces it. At `ask_passphrase_at` a timer drops the key,
with no call needed: its snapshot's `ask_passphrase_at` turns null, and every call that needs the key throws
`vault_locked`, work already under way included. A timer that runs late, as one may on a device
that slept, is caught at the next call. The timer is `unref`'d, so it never holds a Node or Bun process open.

**The lease starts again whenever the user proves who they are**: a gating's attempt that
unlocks, by passphrase or passkey, sets the first passphrase, or changes the ways in. Nothing else
moves it: not a read, a store or a refresh. The lease expiring while an attempt is under way is
no lock: the attempt ends unlocked, with a lease of its own.

Lowering the option later takes hold on each device at the vault's next birth: a lease granted
under the longer setting, whose deadline lies past the new number of hours from then, is not
taken up, the vault is born locked, and the user types their passphrase again. Raising it
lengthens no lease already granted. A device keeps one lease per vault, shared by its tabs, so
open a vault with one setting on a device: two tabs opening it with different ones are not
supported, and the lower one wins (`notes/wontfix.md`). A tab already unlocked keeps its own lease
when another tab unlocks or renews, and at its own deadline its next call takes up the other's
without asking; a `lock()` in another tab, or a change to the ways in, drops it at its next read
(`vault.hello`). A lock and an unlock in another tab that both land before that read leave it
in force: the device holds a lease under the same ways in again. A device clock
stepped backwards does the same to a lease granted just before: it seems to last past its
setting, and the user is asked again, the safe direction.

**`vault.lock()`** forgets the unlock in memory and on this device alike, so the user types their
passphrase again afterwards. Use it for a real lock signal: a Lock button, a locked screen, a
sign-out. The key is dropped at once, and every call that needs it throws kind `vault_locked`. A
`getBox()`, `getWhisper()` or `useWhisper()` under way refuses with `vault_locked` too, handing nothing
back, unless an unlock has put a key back in hand by the time storage answers. A gating's attempt under way
attaches no lease: it refuses `gating_landed` at its next step, and a change to the ways in it
already stored stays stored. **A lock spares only the transactional part**: a VaultDB write once
sent completes or refuses as storage decides, and every step before it refuses `vault_locked`. A
`putBox()` under way refuses with `vault_locked`, writing nothing,
when the lock comes while it waits on a gating, reads and opens the box (`VaultDB.getBox`,
`box.extractWhisper()`), or seals it (`Box.seal`); a `delBox()` does when it comes while it waits
on a gating. Only the write itself
is past a lock's reach: once `VaultDB.putBox` or `VaultDB.delBox` is sent, it lands or refuses as
storage decides, and a stale write still refuses `stale_write`, never landing. `del()` locks the same way, and so does storage the vault cannot
trust (below). A refresh that finds the vault's ways in changed on another device drops the key
the same way; one that finds the vault deleted, or deleted and made anew, drops it too, and the
Vault object is gone (`vault_gone`, `vault_remade`): ask the bank for the vault again.

`bank.closeVault({ vaultlabel })`, and `bank.closeVaults()` for every vault, is not a lock: it lets the
Vault object go, and the lease stays, for the next birth, along with any an unlock under way
granted before; an unlock under way on the Vault object let go takes nothing up, a `getWhisper()`
or `useWhisper()` under way hands back nothing, and every call on it refuses `vault_gone`.

A host clock is checked once, at `Bank.make`: one reading must be epoch milliseconds from 1981
to 2255, so a clock counting in seconds or microseconds is refused there with `bad_option`.
After that the vault takes each reading as the clock gives it, rounded down to whole
milliseconds; a clock that later throws fails the call that read it with `unexpected_error`, its
error the cause. The vault's boxes, ways in and lease read it so.

**Locking ends the lease.** A host that wants "stay unlocked on this device for a
week" should not lock on tab-away: each time the user comes back to the tab, the vault would ask
for the passphrase again. Lock on the signals your users mean as "lock it".

### A screen-lock recipe

The core cannot watch for a locked screen or a hidden tab (it runs where there is no
`document`), so locking on those signals is a few lines in the host app. `visibilitychange`
fires when the user switches tabs or the screen locks, which is as close to a screen-lock signal
as every browser offers; it also fires for a tab merely switched away from, so use it only where
a tab left behind should ask for the passphrase again:

```ts
const lockWhenHidden = (vault: Vault) => {
  const onChange = () => {
    if (! document.hidden) { return }
    vault.lock().catch((err: unknown) => {
      // A lock() racing the bank letting the vault go is the one refusal to expect; any other,
      // such as a device store that would not erase the lease, is worth a word.
      if (! isVaultError(err, 'vault_gone')) { console.warn('The vault did not lock cleanly', err) }
    })
  }
  document.addEventListener('visibilitychange', onChange)
  return () => { document.removeEventListener('visibilitychange', onChange) }
}
```

Call the function it returns when you let the vault go. The `catch` quiets only a `lock()`
that races `bank.closeVault`, and lets a failure to revoke the lease be heard: that vault
is locked in this tab, but the next birth may unlock without the passphrase. Chromium's Idle
Detection API, behind a permission the user grants, is the only true screen-lock signal, and a
locked screen is the user meaning it, so it calls `lock()` too, quieted the same way:

```ts
const aborter = new AbortController()   // aborter.abort() when you let the vault go
if (await IdleDetector.requestPermission() === 'granted') {   // from a click: it needs a user gesture
  const idle = new IdleDetector()
  idle.addEventListener('change', () => {
    if (idle.screenState !== 'locked') { return }
    vault.lock().catch((err: unknown) => { if (! isVaultError(err, 'vault_gone')) { console.warn('The vault did not lock cleanly', err) } })
  })
  await idle.start({ threshold: 60_000, signal: aborter.signal })
}
```

TypeScript's DOM types do not carry `IdleDetector` yet; declare it, or take it from a types
package, before this compiles.

For a sign-out, call `lock()`, then `bank.closeVaults()`, and drop the bank (in React, the
provider lets the vault go, and drops its bank, as `user_id` turns null: lock it first): the lock
revokes the lease, and `closeVaults` lets every Vault object go. The next user signs in to a bank
of their own.

### When the user signs out

A sign-out the host hears of is the host's to act on, as above. One it does not hear of -- in
another tab, a session that expired, another user signing in -- storage tells the vault: an
adapter whose backend knows who is signed in refuses a vault whose user is no longer that one
with kind `identity_revoked` (`safebyok-convex`, `safebyok-postgres` and `safebyok-graphql` do;
`safebyok-indexeddb` and `localVaultDB` keep everything on the device, and never do). The vault
then locks at once, as `lock()` does: it drops its vaultKey, this device revokes its lease, and
its snapshot's `ask_passphrase_at` turns null. It removes nothing stored. The call that met the refusal
throws it, and the next unlock, once the user has signed in again, asks for the passphrase. A
background refresh that meets it has nobody to throw to: it locks all the same, and tells the
logger.

The same rule holds for storage handing back an older copy of the vault than this device has seen
(kind `vault_behind`, *A vault behind this device*, below): storage the vault cannot trust with an unlocked
vault locks it, in the call that met it or in a background refresh alike. There is no option to
stay unlocked: an adapter that refuses `identity_revoked` for a passing fault, rather than
`storage_unavailable`, breaks its contract (VAULTDB.md, line 5.5), and is the bug to fix.

Make the bank, and ask for the vault (`bank.ensureVault`), only once your backend knows who is signed in: a vault
born while its auth is still loading meets `identity_revoked` at once, and revokes the lease with it (safe:
the user types the passphrase again). A backend that tells "who are you?" from "you may not"
refuses the second as `not_permitted`, which locks nothing. A call that meets the refusal in a tab
closed meanwhile still revokes the lease; and the Convex adapter's watch refreshes on
every error it hears, not only a sign-out. Both are the safe direction, and stay.

## Logging

Some things a vault cannot throw to anyone: they happen in the background, or in a call that
must not fail. It says them to its logger, which `Bank.make` takes as `logger`, an object with
three functions, each `(message?, story?, err?) => void`:

```ts
const bank = Bank.make({
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

That covers every storage adapter, vault, `BankProvider` and store given no logger of its own,
whether it was made before the call or after. Name a logger a second time only to keep two apart,
as a child logger would: give one to your storage adapter's factory (`idbVaultDB({ logger })`),
and the adapter, every vault opened over it, and `BankProvider` all use it, as one object; give
one to `Bank.make` (or `BankProvider`), and it is the bank's and its vaults' alone, the adapter
keeping its own. Pass `logger: DefaultLogger` to have the bank use the default whatever its adapter was given.
An adapter's logger is fixed when it is made: `vaultDB.logger` reads it, and nothing replaces it.

An adapter of your own extends `VaultDB` and hands `super()` the host's options, `super(opts)`:
the base class settles the logger from them, the host's or the default. It says what it has nobody
to throw to through `this.logger`.

Each call is a plain-language `message`; a `story` naming the vault call it happened in
(`{ call: 'refresh' }`); and, when there is one, the error behind it, a `VaultError` or your own
(your clock's, your storage adapter's). The vault puts no whisper, passphrase, key, ciphertext or
option's value in any of the three, not even the `user_id` or the labels: a host with several
vaults gives each its own logger, bound to whatever context it wants in its logs. An error of your
own goes as your code made it, as itself or as a `VaultError`'s `cause`, so what it quotes (a
storage client's error may quote the request it failed) is yours to keep clean. Today a vault
says these things:

* `warn`: this device's lease could not be read, so the vault was born locked, the lease left where
  it lies; or, taken up from another tab, it could not be read or would not open, so it was
  discarded. A lease that simply expired, or that a new passphrase outdated, is routine, and says
  nothing.
* `warn`: a refresh rung by a change in storage failed, so the snapshot may lag behind storage
  (its `freshness` reads `refused`) until a read succeeds. Said once for a failing streak; then `log`,
  once, when a read succeeds again.
* `log`: a call found the vault moved on from what it held -- deleted, made anew, its ways in
  changed, or locked -- and refused (`{ call, refusalkind }`): `vault_gone`, `vault_remade`,
  `gate_moved` or `vault_locked`. It never names what the call held.
* `log`: storage the vault cannot trust -- its user signed out, or an older copy of the vault --
  locked it (`{ call: 'untrustedStorage' }`); `warn` when this device's lease could not then be
  revoked.
* `warn`: a change to the ways in landed in storage, but this device could not grant its lease
  afresh. The change is kept, and the call resolves.
* `warn`: this device could not raise its device record to what a read, or a write of its own,
  just took. What it did stands, and the record catches up at a later read.
* `warn`: a `delBox()` removed another revision than the one the snapshot showed, because another
  device or tab wrote over the box meanwhile (`{ call: 'delBox' }`). The call carries on.
  When the box shown was damaged, the message says so and the story adds `damaged: true`. It
  names no revision or boxlabel.
* `error`: the `onBadNews` handler threw, or its promise rejected, as it was told of bad news
  (`{ call: 'onBadNews' }`, what it threw as its error). It goes to the platform's `reportError`
  too, where there is one, and the vault's `trouble` keeps it.

## The passphrase and the passkey

A vault has exactly one passphrase, and at most one passkey. Each wraps the same vaultKey under
its own salt, no passphrase is ever stored, and changing either rewrites no box. The snapshot
shows them, locked or not, as its `gate`'s `passphrase` and `passkey` (the gate null while the
vault has no passphrase, the passkey null while it has none): each a `wayinkind`, and when it was
set and by which device (`registered_at`, `device_id`); the passkey's carries its
`credential_id` and `prf_salt_b64` too, for asking the authenticator.
Neither holds the passphrase's salt or any
wrapped vaultKey -- what an offline guess at a passphrase starts from -- so a snapshot in React
state, devtools or an error report gives none away; the vault keeps the stored records to itself.
A way in stored in a form this package never writes cannot be tried, but the other still opens
the vault: the read that finds it succeeds, and `onBadNews` is told `damaged_wayin`,
`meta.wayin_listed` naming it.

```ts
vault.getSnapshot().gate?.passphrase   // { wayinkind: 'passphrase', device_id: 'k3x9...', registered_at: 1760000000000 }
vault.getSnapshot().gate?.passkey      // null, until one is put

await vault.putWayin('passphrase')   // change_passphrase: the passphrase replaced, stamped afresh: this device, now; any passkey removed
await vault.putWayin('passkey')      // put_passkey: the passkey put, replacing any (below)
await vault.delWayin('passkey')      // del_passkey: the passkey removed; delWayin('passphrase') refuses passphrase_required
```

Each raises its gating, which your `requestCleartext` answers with the passphrase (and the next
passphrase, or a new passkey's answer), and resolves the vault once the change is stored; the
snapshot's `gate` shows it. Each leaves the vault unlocked, its lease
starting again from now (`tryPutWayin` and `tryDelWayin` resolve the same as an `Outcome`). Each
refuses, changing nothing: `wrong_passphrase`
for a `passphrase` that does not open the vault, or is blank; `weak_passphrase` for a new passphrase the
`strengthChecker` finds weak, or a blank one; `bad_option` for a passkey's answer in place of the passphrase,
or a new one over anything but a fresh salt; `damaged_wayin` when the passphrase is stored damaged;
`absent_wayin` from `delWayin` on a vault with no passkey; and `stale_write` when another device
changed the vault meanwhile. `damaged_wayin` and `absent_wayin` met by the dialog's attempt leave
the dialog open, as a wrong passphrase does.

* **Every change asks for the passphrase**, even on an unlocked vault: the vault keeps no copy of
  its vaultKey it could wrap anew, and a walked-away unlocked screen should not be able to change
  a way in. Only the current passphrase proves a change -- a new passphrase, a passkey put or
  removed -- never a passkey's answer, which is refused `bad_option`: this is how it is done
  everywhere else. A passkey opens the vault; it does not change who may.
* **One passphrase, and a passkey matched to it.** A vault always has its passphrase, and at most
  one passkey, added by proving the passphrase. A new passphrase removes the passkey with the old
  one: the user adds a passkey again, proving the new passphrase. Warn them before they change it
  ("your passkey will be removed; add it again afterwards").
* **Every change locks the other devices.** It moves the vault record's `gate_epoch`, so each
  other device falls back to `locked` and must unlock again. This device stays unlocked.
* **An unlock tries the one passphrase**: one key derivation, about 0.6 s with the browser's
  deriver.
* **Removal is not revocation.** An old passphrase, or a removed passkey, stops opening the vault
  from here on, but whoever knew it and kept a copy of the vault record from before can still open
  that copy, and the vaultKey inside is the one the vault still uses. There is no key rotation yet.

## A new passphrase's strength

Every passphrase about to become a way in -- the one an `initialize_gate` gating sets on a
`novel` vault, and each `change_passphrase` sets -- is put to the vault's
`strengthChecker` first, before any key derivation. One it finds weak is refused with kind
`weak_passphrase`, the checker's reason the message; a blank one is refused so before the checker
hears it. An unlock of a vault that has its passphrase is never
refused for weakness: a passphrase already in use is the user's to change, not the vault's to
lock them out with.

```ts
import { browserOpts, zxcvbnStrengthChecker } from 'safebyok/browser'

const bank = Bank.make({ ...opts, ...browserOpts() })   // brings zxcvbnStrengthChecker
await zxcvbnStrengthChecker('password1234')
// { strong: false, reason: 'That is very like a commonly used password: ...' }
await zxcvbnStrengthChecker('skylarkpinecone', { applabel: 'skylark', user_id: 'u1', vaultlabel: 'pinecone' })
// { strong: false, reason: 'That holds something about you or this site, ...' }
```

* **The core's default refuses every passphrase.** Leave `strengthChecker` out and every new
  passphrase is refused as too weak, so no vault can be made until you choose a checker. The
  refusal's message says so, to the user and to you, pointing at
  [CUSTOMIZATION.md](CUSTOMIZATION.md#pluggable-passphrase-strength-checker); nothing is logged.
  A checker of length
  alone is no checker -- 'a' and eleven spaces is twelve characters -- so the core offers none.
* **In a browser, `browserOpts()` brings `zxcvbnStrengthChecker`.** It asks for at least
  `MinPassphraseChars` (12) characters, each Unicode code point counting one, and then a zxcvbn
  score of at least `MinZxcvbnScore` (3 of 4), through `@zxcvbn-ts/core` and its common-password
  dictionary: it turns away common passwords and ones very like them, keyboard walks, repeats,
  sequences, dates, and the vault's own names. No composition rules (a digit, a capital, a
  symbol): NIST SP 800-63B advises against them, as they make a passphrase harder to remember and
  no harder to guess. Its dictionary is about 214 kB (minified and brotlied), which a bundler
  splits into a chunk of its own, fetched with a dynamic `import()` by the checker's `load`: the
  each bank's `hello()` runs it, which `bank.ensureVault` awaits, so a page that never asks for a vault
  never fetches it. It answers through a promise, in a few milliseconds once loaded. Without its
  dictionary it cannot tell a common password from a good one, so a load that fails (the network
  dropped, the chunk was left out of the build) fails the bank's hello, `unexpected_error` with the
  load's error as its cause, and no vault is born; the next hello loads again.
* **The checker hears the vault's scope.** It is called as `strengthChecker(passphrase, scope)`, `scope` the
  vault's `{ applabel, user_id, vaultlabel }`: words a guesser who knows the user tries first.
  `zxcvbnStrengthChecker` hands each name, whole and split into its runs of letters and digits, to
  zxcvbn as the user's own words.
* **Your own checker** replaces it: pass it after the spread. It is any function from the passphrase
  (and the scope) to a verdict, `{ strong: true }` or `{ strong: false, reason }`, at once or as a
  promise; the reason is shown to the user, so write it calmly, say what to do, and never quote the
  passphrase. A checker that needs something fetched first carries it as `load`, idempotent, which
  each bank's `hello()` runs once, before any vault is born; a `load` that fails fails the hello,
  and the next tries again. To ask for
  more, wrap ours, carrying its `load` along:
  `Object.assign(async (typed, scope) => (typed.includes('acme') ? { strong: false, reason: 'Leave out the name of the app.' } : await zxcvbnStrengthChecker(typed, scope)), { load: zxcvbnStrengthChecker.load })`.
  Its whole contract is that verdict, for every passphrase: it never throws. `Bank.make` refuses
  anything but a function (whose `load`, if any, is a function too) with `bad_option`. The vault
  keeps it held to its contract, and asks it as `vault.checkStrength(typed)`. A checker that
  answers anything but a verdict is refused `bad_option`, and one that throws `unexpected_error`,
  carrying nothing of what it threw, as it heard the passphrase. CUSTOMIZATION.md says how to
  choose one.
* **Build it once.** Make the checker once, before any bank, and hand the same one to every
  user's bank: each keeps the checker it was made with for its life. A binding that reopens on a
  changed option (`safebyok-react`'s provider) reopens for a new checker, so define it at module
  level, or memoize it, rather than writing it inline.
* **Call it from the field as well, through the vault.** The field the user types into can ask
  `vault.tryCheckStrength(typed)` on each keystroke, and show a `weak_passphrase` refusal's
  message, the checker's reason, before the user submits: the same check, held to the same contract, so the field and Create decide alike (a
  blank passphrase is weak without the checker hearing it). `safebyok-react`'s dialog does so by
  default. It hears the passphrase in plain text, so it must run on the device and keep nothing:
  never send it to a server, log it, or let an error tracker capture it.

## Fingerprint unlock (passkeys)

A vault may have one passkey: a fingerprint, a face, a phone or a security key, whose
authenticator answers for the vault through the WebAuthn PRF extension. The core never calls
WebAuthn: it takes the answer as a `PasskeyAnswer` (`{ credential_id, prf_salt_b64, prfBytes }`),
which `safebyok-react`'s `createPasskey` and `askPasskey` make (they import no React, so any
framework's host can use them).

```ts
// In your put_passkey dialog: make the passkey from the click, then attempt with the passphrase.
const made = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName } })
if (made !== null) { await gating.attempt(passphrase, made) }   // null if the user dismissed the prompt

vault.getSnapshot().gate?.passkey   // { wayinkind: 'passkey', device_id, registered_at, credential_id, prf_salt_b64 }

// In your unlock_vault dialog:
const answer = await askPasskey(vault.getSnapshot().gate)   // null if the user dismissed it
if (answer !== null) { await gating.attemptPasskey(answer) }   // no key derivation to wait for

await vault.delWayin('passkey')                                // del_passkey: the passkey is gone
```

* **A passkey is a way in like the passphrase.** Its wayin wraps the same vaultKey, under a key
  made from the passkey's answer by HKDF-SHA256; an unlock with it grants this device a lease
  for `leaseHours`, and `ask_passphrase_at` applies, as for the passphrase.
* **One passkey per vault.** Putting one replaces the passkey the vault had, if any: the snapshot's
  `gate.passkey` says which it is, when it was added and from which device, so warn the user before
  asking ("this replaces the passkey added on 3 Oct from another device"). Putting the same
  passkey again mends one stored damaged. A new passphrase removes the passkey: it was matched to
  the old one, and the user adds it again under the new.
* **Putting or removing one asks for the passphrase**, as every change to the ways in does; a
  passkey's answer proves neither. The attempt checks the passphrase before it seals the passkey's
  answer, so a mistyped passphrase returns to the dialog with the answer unspent; a passkey made
  for an attempt that is then refused otherwise stays on its authenticator, a way into nothing:
  the user may delete it there. `delWayin('passkey')` on a vault with no passkey refuses
  `absent_wayin` before any dialog; a passkey removed elsewhere while the dialog is up, and a
  passkey's attempt to unlock a vault with none, refuse the attempt `absent_wayin`, the dialog
  left open. A vault's first way in is a passphrase, with a passkey beside it if the
  `initialize_gate` dialog offers one: `putWayin('passkey')` on a `novel` vault refuses
  `absent_vault`, asking nothing.
* **Where it works.** A passkey answers on the device that holds it: a platform passkey synced by
  iCloud Keychain or Google Password Manager on every device signed in to that account, a security
  key wherever it is plugged in. Browsers and authenticators without PRF refuse with kind
  `passkey_unavailable`; offer the passphrase then.
* **Removal is not revocation**, here as for the passphrase: a removed passkey still opens a copy
  of the vault record kept from before.

## No recovery

There is no recovery path, on purpose. A forgotten passphrase means an unrecoverable vault: the
user re-enters their API keys, which is annoying, not catastrophic. Say so in your UI; the React
binding's passphrase dialog does. A passkey added beforehand still opens the vault, so the user
can read what it holds; but it cannot set a new passphrase, which only the old one proves, so a
vault whose passphrase is forgotten is, in the end, removed and made again.

## Errors

Every vault call comes in two forms. `tryEnsureUnlocked()`, `tryPutBox()`, `tryGetBox()` and the rest
resolve to an `Outcome`, `{ ok: true, val }` or `{ ok: false, err }`, and never reject: the form
for code that branches on the refusal. `ensureUnlocked()`, `putBox()`, `getBox()` and the rest resolve to
that `val` or throw that `err`: the form for code that reports failure by throwing, as a TanStack
`queryFn` does. Either way the refusal is a `VaultError` (`isVaultError(err, refusalkind?)` is the
test for one), with a calm message, a `refusalkind` to branch on, and the `family` it belongs to; bad
news is told to `onBadNews` once, whichever form met it. `useWhisper()` comes
in the throwing form alone, and `subscribe()` and `Bank.make` throw their misuse at once.

```ts
const { ok, err } = await vault.tryPutBox({ boxlabel: 'anthropic_api_key' }, typedKey)
if (! ok && err.refusalkind === 'vault_locked') { offerUnlock() }   // declined, or a lock landed

const queryFn = () => vault.getWhisper('anthropic_api_key')   // throws its refusal, for TanStack Query
```

A retry predicate never retries `family: 'misuse'` or `vault_locked`, and may retry
`storage_unavailable`. A `VaultDB`'s and a `DeviceDB`'s verbs come in the same two forms:
`vaultDB.tryGetBox(...)` resolves an `Outcome`, its `err` that same `VaultError`, and
`vaultDB.getBox(...)` resolves the record or throws it. `outcomeOf(thunk)` makes an `Outcome` of
any body that throws, and `valOf(outcome)` hands back its `val` or throws its `err`. A throw that
is no `VaultError` becomes `unexpected_error`, which a retry predicate never retries: wrap a call
out to your own storage as `outcomeOf(thunk, Refusals.storageUnavailable)`. The kinds are `refusalKindVals`, and the
whole list: the storage adapters (`safebyok-indexeddb`, `safebyok-convex`, `safebyok-postgres`,
`safebyok-graphql`, your own) throw these same kinds, and no package has others. An error never
carries a whisper, a passphrase or any other secret, in its message or as a property.

The kinds fall into three families, told apart by who handles them.

A record that fails its checks takes its kind from who is at fault, the same from a `VaultDB`
as from a vault. One read from storage that fails them, or a box that will not open, is damaged:
`damaged_vault` for the vault record, `damaged_box` for a box (a listing shows it among its
`damagedBoxes` instead, *Damaged boxes* below), Zod's own error its `cause` where a check failed. One your code
handed in is `bad_record` (a box handed to a `VaultDB`'s `putBox`, `invalid_box`). A storage
adapter that answers in a shape its protocol does not allow is `corrupt_record`: a bug in that
adapter. None of them quotes the record, its ciphertext or its sidecar.

### Misuse: fix the code

A programming error. Do not show it to the user and do not retry; let it reach an error boundary
or the dev overlay (in React, `BankProvider` throws misuse from `Bank.make` to the nearest error
boundary, and `useVault` throws a birth's misuse there; a condition lands in the bank's listing,
which `useListedVault` hands down).

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `bad_scope`           | a name in a scope -- an `applabel`, `vaultlabel` or `boxlabel` that is no `label`, or a `user_id` that fails `user_id` -- the message naming each failing field, as `meta.fieldnames` does; or a bag handed to a bank's call naming another `applabel` or `user_id` than the bank's (`bank.demandConsistentWith`) | Pass labels the app chose; check a user-typed one first with `label`; percent-encode a user id outside the rules; make a bank per signed-in user, and drop it at sign-out |
| `bad_whisper`         | a whisper JSON cannot carry (`undefined`, a function, a class instance) | Store plain JSON; to empty a box, `delBox` it |
| `bad_option`          | an option or argument out of its range: a `Bank.make` option or a vault's options, or one it does not take (counted, never named, beside the names it takes), an `argon2idDeriver` spec, a `putBox()`'s sidecar, a passphrase or callback of the wrong type; a passkey's answer of the wrong shape; an event handed to `hello()` or `ensureUnlocked()` as its options; a vault's options naming another `vaultDB` or `deviceDB` than the vault the bank holds was opened with | Fix the call; the message names what it takes |
| `bad_record`          | a record or expectation handed to a `VaultDB` verb that is not one this package builds: a malformed vault record, a name in it that fails its check included, an expectation missing a field, or a vault record and its expectation that disagree about the `vault_tok` (a box is `invalid_box`; a name handed to a verb on its own or in a scope is `bad_scope`, and so is a name that passes its check but is longer than the storage holds, in a record or not). | A bug in a hand-built record or a custom adapter's caller: hand a `VaultDB` only the records and expectations a vault builds; the message names which |
| `invalid_box`         | a box handed to a `VaultDB`'s `putBox` that is not one this package builds -- malformed, a name in it that fails its check, or no box at all -- or one sealed under another vaultKey than its expectation names; from a vault, which built the box, it is a bug | A bug in a hand-built box or a custom adapter's caller: hand `putBox` only the boxes a vault seals |
| `corrupt_record`      | a storage adapter answered a `VaultDB` in a shape its protocol does not allow: a box write's echo that fails a box's checks or names another revision, a stale or full refusal missing the `box_stored`, `vault_stored` or `capacity` it must carry, a deletion's report or a capacity in another shape (and `safebyok-convex`'s component deployed from another version). Never a record that reads back damaged, which is `damaged_vault` or `damaged_box` | A bug in the adapter: do not retry, and have a developer look at it. A write or deletion answered so may have landed: reading the vault again shows what is stored |
| `unknown_key_deriver` | the vault names a key deriver this bank was not made with        | Update safebyok, or open the vault with the deriver that made it |
| `insecure_context`    | `Bank.make` in a page that is not a secure context: served over plain http from anywhere but localhost, where the browser withholds WebCrypto | Serve the app over https |
| `unexpected_error`    | something threw that is no refusal: a bug, in safebyok or in a function the app handed it (a key deriver that throws something other than a `VaultError` condition, a `strengthChecker` that throws at all, or its `load`, or the key deriver's, failing at `hello()`). What a key deriver or a strength checker threw is kept nowhere, not its message, meta or `cause`, as each was handed a passphrase; the logger hears only that the deriver threw (`call: 'deriveKeyBytes'`), and the kind of a `VaultError` it threw when that kind is listed. (A key deriver's `VaultError` of the condition family keeps its kind, in safebyok's own words, rather than refusing here.) What a `load` threw is its `cause`, as it heard nothing | Do not retry; read the log for the deriver's kind (or the `cause` of a `load`), and fix the function, or report the bug |
| `passphrase_required` | `delWayin('passphrase')`: a vault keeps its passphrase, which can be replaced, never removed | Call `putWayin('passphrase')` to replace it |

### Conditions: handle them at run time

Part of normal operation. Each can reach the user; the app decides how.

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `vault_locked`        | the vault is locked and no gating unlocked it: the user declined it, there is no `requestCleartext`, or a lock won while the call ran | Nothing to retry: the user said no, or locked it. Call again when they want the vault |
| `wrong_passphrase`    | the passphrase did not unlock the vault, or was empty. A passphrase wayin altered in storage refuses its passphrase in just the same way, so the message says that the stored vault may be damaged | Ask again, with a hint to check for typos. If your handling says "check for typos", treat `gate_made_elsewhere` alongside it, with its own advice |
| `gate_made_elsewhere` | an `initialize_gate` attempt on a `novel` vault lost a race: another device set the vault's first passphrase between this one's birth of the vault and its write, whatever passphrase either chose. Nothing was set here; the next `hello()` shows the vault `locked` as the other device made it | Show the message as advice, not as a typo: the user enters the passphrase chosen on the other device |
| `weak_passphrase`     | a new passphrase -- the first one an `initialize_gate` attempt sets, or one a `change_passphrase` attempt sets -- that the vault's `strengthChecker` finds too easy to guess, or a blank one (a blank one offered to unlock a vault that has its passphrase, or to confirm a change, is `wrong_passphrase`). The message is the checker's own reason. Never raised by an unlock of a vault that has its passphrase | Show the message beside the field, and ask for another |
| `wrong_passkey`       | the passkey's answer did not unlock the vault, or answered for another salt. An answer for the wayin's own salt that does not open it most likely means the wayin was altered in storage, and the message says so | Ask for the passphrase; if it works, the user may add the passkey again, which replaces it |
| `passkey_unavailable` | this browser or authenticator cannot answer for a passkey unlock: no WebAuthn, or no PRF extension | Offer the passphrase instead; on `createPasskey`, tell the user this device cannot be a fingerprint unlock |
| `crypto_failed`       | the browser's WebCrypto failed as a box was sealed -- a boxKey made, wrapped under the vaultKey, or the whisper ciphered -- for no reason this package can act on: a fault of the platform, not of the user or the record. Nothing was stored, and the vault stays unlocked | Try again; if it fails every time, tell the user this browser cannot keep secrets for the app just now. Nothing of WebCrypto's error is kept but its `name`, which ends the message |
| `absent_box`          | no box under that label                                      | Offer to create it, or refresh the list: it may have been deleted elsewhere |
| `absent_vault`        | the vault is `novel`, with no passphrase yet, and the call needs one: `del()`, `putWayin('passkey')` | Set its passphrase first (`ensureUnlocked()` or `putWayin()`) |
| `absent_wayin`        | a passkey was asked for -- to unlock with, or to remove -- and the vault has none: it may have been removed on another device | Offer the passphrase; the snapshot's `gate.passkey` is null |
| `whisper_too_large`   | a whisper over the vault's `maxWhisperBytes`                     | Tell the user it is too large; a host that means to allow more passes a larger `maxWhisperBytes` |
| `box_too_large`   | a box -- its whisper, sidecar and boxlabel together, as the UTF-8 bytes of its JSON -- over its storage's `maxRecordBytes`; only a backend with small records meets it | Tell the user to store a smaller whisper or sidecar |
| `vault_full`          | a new box in a vault already holding its `maxBoxes`, a new box whose names would take the vault past its storage's `maxVaultBytes`, or a write the storage backend has no room for | Tell the user to remove a box first; the host may raise `maxBoxes` where the backend allows. The backend's own refusal carries how full it reckons the vault as `meta.capacity` |
| `stale_write`         | storage changed since this call read it, so the write was refused and nothing was written: another call, here or on another device, wrote, created or deleted the box a `putBox()` was writing; a `delBox()`, `putWayin()` or `del()` into a vault deleted, made anew, or with its ways in changed elsewhere | Nothing is read after the refusal and nothing is tried again by itself: `hello()` to see what is stored now and, if the change still applies, repeat it (*Two devices storing at once*, below). A `putBox()`'s refusal carries the box that won as `meta.box_stored`, and a second `putBox()` reads the box afresh |
| `vault_mismatch`      | a box write or read met a vault record other than the one it expected: the vault deleted, made anew under another `vault_tok`, or its vaultKey replaced, on another device. Storage's word, from a `VaultDB`'s `putBox` or `getBox` called directly, or a vault's box read that met it; nothing was written or read | The device that expected that vault is out of date: read the vault again (`hello()`), and unlock the vault stored now before reading or writing a box |
| `not_permitted`       | the storage backend refused the signed-in user, still the vault's own, this one call | Tell the user they may not; signing in again will not help |
| `storage_unavailable` | the storage backend could not be reached, or failed; or this device's own store failed for a reason that may pass | Try again shortly; a storage adapter's own error is the `cause`, unless it may quote the call (Convex's). Of the device store's error only its `name` is kept, ending the message, as the error may quote a lease record |
| `vault_gone`          | the Vault object is gone: the vault was deleted, here or on another device, or the bank let the Vault object go (`closeVault`, `closeVaults`, `reopenVault`, `clearCachedVault`). A call under way found so at one of its own steps, and did nothing more; every later call on it refuses so. A box read also refuses so when storage no longer holds the vault this device read | Ask the bank for the vault again (`bank.ensureVault`): it hands out a new Vault object, novel where the vault was deleted |
| `vault_remade`        | the vault was deleted and made anew on another device: what the call held belongs to the vault that was deleted. The Vault object is gone, and every later call on it refuses so | Ask the bank for the vault again (`bank.ensureVault`), and unlock the one stored now, with the passphrase chosen there |
| `gate_moved`          | a vault unlocker changed while a call was under way -- the passphrase or passkey was changed, here or on another device -- so what the call held, proven under the old ones, opens nothing now | Unlock again: the vault asks for the passphrase as it is now |
| `gating_landed`       | a gating's attempt under way, or made, was for a gating that ended meanwhile -- a `lock()` landed, or it was settled or declined -- so it attached no lease | Nothing: the user asks again when they want the vault |
| `attempt_in_flight`   | a gating's attempt was made while another of its attempts was under way, so it was not tried | Disable the dialog's submit while an attempt runs |
| `same_passphrase`     | a `change_passphrase` attempt whose next passphrase is the current one; the gating stays open | Show it in place, and ask for a different one |
| `no_whisper`          | a `putBox()` left out the whisper, to keep the one the box holds, and no box is stored under that label | Hand `putBox()` the whisper to store |
| `storage_blocked`     | this device's own store (its device store, or a vault kept on the device, as `safebyok-indexeddb`'s) refused for a reason that holds until something outside the app changes: the browser withholds storage from the page (site data blocked, a sandboxed frame), has no room for it (a quota of zero, as some private windows give, or a full disk), or offers no IndexedDB at all | Do not offer a retry: tell the user this browser is keeping the app from storing anything on this device. The app may open the vault again with `memoryDeviceDB()`, which keeps no lease here. For a vault kept on the device, the browser's own error is the `cause`; of the device store's error only its `name` is kept, ending the message, as the error may quote a lease record |

### Bad news: tell the user

Something the app is told whether or not the call was refused: storage found damaged, a copy older
than this device has seen, a user signed out. Each may reach the user; none is the code's to fix.

Give `Bank.make` an `onBadNews` handler and it is told each piece, once, before the call that
learned it settles -- a background read's included, which has no caller -- and a box a listing
shows damaged the first time it does, as `damaged_box` news whose `meta.box_listed` is the box,
though the listing itself succeeds. It changes nothing the caller gets, and is never awaited. The
vault's `trouble` keeps the latest piece, with or without a handler, until a read finds nothing
amiss; what the handler throws lands there instead, as `bad_option`. Conditions never reach it.

```ts
const bank = Bank.make({ ...opts, onBadNews: (news) => { telemetry.report(news.refusalkind) } })
```

| Kind                  | What happened                                                    | What to do                                              |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `damaged_vault`       | the vault's record, read from storage, failed its checks (not a shape this package writes, or naming another vault), so no way in can be tried: `hello()` refuses it, as a `VaultDB`'s `getVault` does | Nothing was changed, and a retry will not mend it. Tell the user the vault cannot be opened; restore its record from a backup, if there is one, or, if the user chooses to start over, `delDamagedVault()` (see *A vault that cannot be opened*) |
| `damaged_wayin`       | a way in is stored in a form this package never writes (a salt of the wrong length, or not base64url), so it cannot be tried: the passphrase, or the passkey. The other is still tried | A damaged passkey: unlock with the passphrase, and add the passkey again. A damaged passphrase: unlock with the passkey, if there is one, to read what the vault holds; it cannot be changed, so the vault is then removed and made again |
| `damaged_box`     | a box failed its checks as read from storage (a `VaultDB`'s `getBox` refuses it so too), or would not open under the vault's own vaultKey, or opened to no whisper: altered in storage, moved there from elsewhere, or written by a vault deleted and made anew on another device since this one read it. A `putBox()` refuses so a box listed damaged that names no revision, damaged beyond naming, writing nothing | Nothing was changed. Read the vault again, `hello({ staleMinutes: 0 })`: a vault made anew elsewhere relocks this device. A box still damaged: offer `delBox()`, or a fresh `putBox()` over it while it names a revision (see *Damaged boxes*) |
| `damaged_lease`       | this device's lease would not open under its leaseKey: damaged where the device keeps it. It was erased, and the vault locked, at the first call that used it | Unlock again: that grants a new lease. Reading the vault (`hello()`) does not mend it |
| `newer_format`        | the vault's stored record is in a form this version does not know -- a `format` -- which a newer safebyok may have written: `hello()` and `delDamagedVault` refuse it | Nothing was changed. Tell the user to update the app; never offer to start over |
| `vault_behind`        | this device has already seen the vault at a higher `vault_epoch` than storage offers now (storage restored from a backup, or altered), so it won't use this one, and the vault locked, or was not born: nothing was unlocked or written | Tell the user this device has seen a newer copy of the vault than storage holds. If the storage was restored from an older copy on purpose, accept it on this device with `bank.clearCachedVault` (see *A vault behind this device*, below); otherwise the app's support should look at its storage |
| `identity_revoked`    | the storage backend no longer serves the user this vault was opened for: signed out, or another user signed in. The vault has locked itself (see *When the user signs out*) | Have the user sign in again, then open the vault for whoever that is |

`Bank.make` itself throws `bad_option`, `bad_scope` or `insecure_context`, at once.
`bank.ensureVault`, as it reads the vault from storage, can refuse with `storage_unavailable`,
`not_permitted`, `identity_revoked`, `newer_format`, `vault_behind` or `damaged_vault` (a damaged
box never stops it), and no Vault object is born: the refusal reaches its caller, the bad news
among them `onBadNews` too, and the bank's listing keeps it: `bank.bankVaultOf({ vaultlabel })` is
`refused`, the refusal its `err`.
So can `storage_blocked`, from this device's own store or a vault store on it, which asking again
will not mend. Ask with `bank.ensureVault` again to try again. Once born, a refused `hello()`
leaves the Vault object as it was, its storage watch live, so the host calls `hello()` again, or
simply carries on: an unlock, and every call that needs the vault unlocked, reads again first.
`bank.closeVault` lets it go.

### Two devices storing at once

A `putBox()` writes only over the revision of the box it read (or over none, for a new one),
in the vault and under the vaultKey it read; one given both the sidecar and the whisper reads
nothing, and writes over the revision the snapshot lists. When another call, here or on another device,
writes, creates or deletes that box in between, storage refuses the write, and `putBox()` throws
`stale_write` at once, without waiting or reading anything more: nothing was written, and the
refusal's `meta.box_stored` is the box as storage now holds it. The vault never tries again by
itself and never merges two writes -- in a store of secrets, a write that lost must be seen -- so
show the user what is there now, and call `putBox()` again if their whisper should still replace
it: the second call reads the box afresh, and writes over it. A write into a vault deleted or
made anew elsewhere is refused as `stale_write` too, writing nothing; the snapshot shows the
change at the next `hello()`. A `delBox()`, a passphrase change or a `del()` that meets another
device's write is refused as `stale_write` the same way.

Do not overlap your own `putBox()` calls on one box: await the first before the second.
Both would read the same revision, so whichever write lands second is refused as `stale_write`
-- not always the call you made second -- and its message words it as another device's write,
because storage cannot tell your app's other call from another device's.

### A vault that cannot be opened

A stored vault record that fails its checks makes `bank.ensureVault` (and a born vault's `hello()`)
refuse with `damaged_vault`, and with no Vault object born there is no `del()` to call.
`delDamagedVault` is the way to clear such a vault and start over. It takes the options
`Bank.make` took beside the vault's `vaultlabel` (only the vault's names and its two stores
matter) and deletes that vault's stored record and boxes through the `VaultDB`, and this
device's lease of it through the `DeviceDB`, raising its device record to the tombstone: what
`del()` does, for this one case. Whatever the vault held is gone for good, so ask the user first.

```ts
const choice = { vaultlabel: 'main' }
const { ok, val, err } = await bank.tryEnsureVault(choice)
let vault = val
if (! ok) {
  if (! isVaultError(err, 'damaged_vault') || ! await userAgreesToStartOver()) { throw err }
  await delDamagedVault({ ...bankOpts, ...choice })   // bankOpts: what Bank.make took, user_id among them
  vault = await bank.ensureVault(choice)   // a new life, novel: the next unlock sets its passphrase
}
```

It refuses a vault that is sound, with `bad_option` and nothing removed: a vault that opens is
deleted through its Vault object's `del()`. With no vault stored it erases only the device's
lease, so a call cut short can be made again. It needs the stored record's `vault_tok`
to aim the deletion, so a vault record too damaged to show one is refused as `damaged_vault`
still, with nothing removed: the backend's own tools can clear it (`localVaultDB`'s vault record
that is not JSON at all is one case). A record this version cannot read may instead have been written by a **newer**
safebyok, which opens it; so one in a `format` this version does not know is refused with a kind of its
own, `newer_format`, by `bank.ensureVault`, `hello()` and `delDamagedVault` alike, nothing removed, with a message
telling the user to update the app: never offer to start over on it. That is all this version can tell from damage, which rests on a rule: **any change to
what a stored record may hold -- a field, a shape, or a range a check accepts -- bumps
`format`**, so an older build can tell "newer" from "damaged". Where it cannot
tell, it refuses rather than deletes. So is any backend that checks a record before
it hands it over, as `safebyok-graphql`'s server does: there a damaged row is the backend's to
clear; so is a typed backend's (Convex's, Postgres's), whose rows cannot hold a damaged vault record.
A bank deletes one with its own stores, `bank.delDamagedVault({ vaultlabel })`, which
`safebyok-react`'s `useBank()` reaches. Storage decides, by the checks only it can make, so the
bank need not hold the vault, or have refused it, first, and nothing asks for an unlock. Once
storage deletes the vault, and on `stale_write` too, the bank lets go its entry for the scope,
whichever stores that was born from, so the next `bank.ensureVault` births what is stored; any other
refusal leaves the entry as it was. A `VaultDB` that wraps
another's public verbs hands `VaultDB.delDamagedVault` on too (`VAULTDB.md`, line 3.5). The
deletion aims at the stored `vault_tok` alone, so a vault record rewritten under that same
`vault_tok` between its read and the deletion goes too: it is the same vault, the one the user
asked to delete.

### A deleted vault's tombstone, and restoring a backup

A vault carries a counter, its `vault_epoch`, which its storage moves up on every write of its gate
(the passphrase and passkey ways in) and on its deletion; a box write never moves it. Deleting a
vault leaves a **tombstone** in the scope, holding that counter plus one, and the next vault made
there carries the counter on: it never goes back, so a device that has seen a vault at some
`vault_epoch` can tell a copy older than that from the vault it knows. A tombstone is no vault:
`bank.ensureVault` births a new, `novel` vault past it, and every write over it from a Vault object
of the life deleted refuses as stale.

Two things this asks of a host that handles its storage itself:

* **A server that restores a backup must wipe the restored vaults** (their records, their boxes and
  their tombstones) rather than serve them: a backup holds the counters of its day, so a restored
  vault shows a `vault_epoch` older than the one devices have seen, a vault deleted since comes
  back to life, and a backup taken between the writes of a deletion can hold both a vault and its
  boxes' successors. Each user then makes their vault anew, and the devices that held the old one
  forget it (*A vault behind this device*, below, for a device that must accept an older copy).
  A restore that rolls back boxes alone, under a gate that did not change, shows no sign of it
  to any device: the counter does not move with a box write.
* **A host deleting a user's data signs the user out first**, then removes their rows, tombstones
  included, and their devices with them: rows removed straight from the tables leave no tombstone
  and no counter to carry on.

### A vault behind this device

Each device keeps a record of each vault's scope (its device record, in the `DeviceDB`): its own
id there, and the highest `vault_epoch` it has seen the vault at, raised at every read and every
write of its own, and never lowered, whichever tab writes it. A vault storage serves below that
epoch is refused with `vault_behind`: a birth births nothing, and a Vault object already born
takes nothing from it, writes nothing, and locks, as for a user signed out (*When the user signs
out*). That holds for a Vault object that itself holds the newer copy too: it refuses the older,
keeping the newer in hand, as another tab and the next birth do. Storage handing back an older
copy could otherwise bring back a way in that was removed, or, once a vaultKey can be replaced, a
vaultKey too. A device that never saw the newer copy, or whose site data was cleared,
cannot tell, and takes the older copy as it is; nor does a box restored alone move the
counter (*A deleted vault's tombstone*, above).

When the vault's storage was restored from an older copy on purpose, each device that saw a newer
one accepts it with `bank.clearCachedVault`, which erases its record and its lease of the vault
and lets the Vault object go -- the one way out, by design -- and asks the bank for the vault again.
Whether the restore was on purpose is for the app to know, from its own backend or its operators,
and not for the user to guess: storage that rolls a vault back on its own meets the user with the
same refusal, so a prompt asking "was your vault restored?" turns the check off for whoever the
check is there to stop.

```ts
const choice = { vaultlabel: 'main' }
const { ok, val, err } = await bank.tryEnsureVault(choice)
let vault = val
if (! ok) {
  if (! isVaultError(err, 'vault_behind') || ! await storageWasRestoredOnPurpose()) { throw err }
  await bank.clearCachedVault(choice)
  vault = await bank.ensureVault(choice)
}
```

It touches this device's store alone, as clearing the browser's site data would: nothing in
storage, no unlock, no passphrase. So a vault the bank holds no entry for, or that storage does not
hold, is no refusal: whatever this device keeps of it is erased. The bank lets go its entry for the
scope, whichever stores that was born from, once the record and the lease are both erased; a device
store that fails refuses (`storage_unavailable`, `storage_blocked`) and leaves the entry as it was,
and a second call finishes.

Whatever the older copy holds is what the vault holds then, so tell the user what that means: ways in removed
since, and passphrases since changed, open the vault again, and a passphrase added or changed
since opens it no longer. This device's lease is erased with its record, and the user enters a
passphrase again. The device takes a new `device_id` for the vault, so the ways in it adds from
then on carry a different one than those it added before. A restore for a vault refused as
`damaged_vault` meets the same refusal on every device that saw a newer copy than the backup.

### Damaged boxes

A box whose stored record does not read back -- not JSON, a malformed time, a missing sidecar,
a record naming another boxlabel than the one it is stored under, one from a newer
safebyok or an older one -- is listed in the snapshot's `damagedBoxes`, never among its `boxes`:
`{ boxlabel, revision_tok, damage }`, each list sorted by boxlabel. Its `revision_tok` is the one its
record holds, when it holds one as text, and null otherwise; nothing else of it is trusted. Its
`damage` is `newer_format` for a record in a `format` this version does not know, which a newer
safebyok may have written, and `damaged` for any other. The rest of the vault opens and works as
ever. A damaged box holds room in the vault (`capacity` counts it). `getBox()`, `getWhisper()` and
`useWhisper()` refuse it with `damaged_box`; `delBox()` removes it by the name it is listed under,
and `putBox()` writes a fresh box over one that names its revision. A damaged box's boxlabel is
the name it is stored under, a label. A row stored under a name that is no label, which no call
could reach, is not listed. Show a damaged box as removable, and one of a newer format as a
reason to update the app, not to delete what a newer version wrote:

```ts
const { boxes, damagedBoxes } = vault.getSnapshot()
for (const box of boxes) { showSummary(box.boxlabel, box.sidecar, box.written_at) }
for (const box of damagedBoxes) {
  if (box.damage === 'newer_format') { showUpdateTheApp(box.boxlabel) }   // a newer safebyok wrote it: updating opens it
  else { showDamaged(box.boxlabel) }   // offer delBox(box.boxlabel), or a fresh putBox() while box.revision_tok names one
}
```

Damage the listing cannot see -- altered ciphertext, a missing ciphered field --
shows only when the box is read: the listing reads each record's shape and never opens its
ciphertext, which would cost deciphering the whole vault at every refresh. Such a box lists
as sound, `getWhisper()` refuses it with `damaged_box`, and `delBox()` removes it. The vault
names it so at once, with no second look at storage, so a box written by a vault deleted and
made anew on another device since this one read it is refused the same way: reading again,
`hello({ staleMinutes: 0 })`, refuses `vault_remade` and the Vault object is gone:
`bank.ensureVault` births the next, locked, and the user unlocks the vault stored now.
`putBox()` starts afresh over any record it cannot read as a
box -- every one the snapshot lists as damaged, and one missing or mangling a ciphered field --
carrying nothing from it, neither its sidecar nor when it was first stored. It writes over the
revision the listing names, in one write that lands only while that record is still stored, so a
sound box another device wrote there meanwhile is never deleted: the store is refused as
`stale_write`, as over any box written meanwhile, and a second store writes over theirs. A store
is that one write, always. A record the snapshot lists as damaged naming no revision -- one that is
not JSON, say -- is damaged beyond naming: there is no revision to write over, so `putBox()`
refuses it with `damaged_box`, writing nothing: the user deletes it with `delBox()`, then
stores again.
A record that reads but will not decipher -- its ciphertext, sidecar or times altered -- is written
over its revision, and carries nothing forward either: nothing vouches for its visible fields, so
its sidecar becomes `{}` unless you give one, and its first-stored time is now. A storage adapter's `doGetVault` hands each box row to `splitStoredBoxes` as a
`StoredBox`, the boxlabel it is stored under beside its record exactly as stored, so a record
too damaged to name itself is still listed under the boxlabel that reaches it.

A deletion within the vault wins over any revision, damaged or sound. A `delBox()` that finds
the box written over since the snapshot showed it, on another device or tab, deletes that
write all the same, and the vault warns through your logger that a different revision than the
one it showed was deleted, naming neither: the other device's whisper is gone, and only the log
says so. When the box the vault showed was a damaged one, the warning says that, and its story
carries `damaged: true` beside `call`, so a host can branch on it. A `delBox()` that finds nothing
left to delete -- another device or tab deleted the box first -- is `absent_box`, as storage
answers it: the vault reads no box beforehand.

In code, `err.family` is each kind's family, as `RefusalFamilyForKind` gives it (`refusalFamilyVals`:
`misuse`, `condition`, `bad_news`), and `isCondition(err)` is true for a `VaultError` of the
condition or bad news family: show or retry those, and let anything else reach an error boundary.
