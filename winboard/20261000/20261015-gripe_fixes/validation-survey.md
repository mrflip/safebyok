# Validation survey (thread 2, 2026-10-15)

Every module entrypoint of every published package's `src/`, on #66's tip (`dfdbbec`), and what
thread 2 did about each gap. For whoever next asks "is this validated?". The rule applied
(CLAUDE.md, STYLE.md *Validation*): check where a value enters from someone else -- a host's
call, a host's adapter, a stored record -- and trust it past that. A gap past the boundary is
recorded as **deliberately not**, with the reason.

Dispositions: **fixed** (this thread), **already** (on the base), **not** (deliberately not),
**coach** (left for a decision), **other** (another thread's).

## safebyok, main entry

| Entrypoint | Checked on the base | Gap | Disposition |
| --- | --- | --- | --- |
| `openVault(opts)`: the bag | -- | not an object: `TypeError` | **fixed**: `bad_option` |
| `applabel`, `vaultlabel` | `Label` | -- | already |
| `userId` | truthy only | `42` passed, failing later as a scope; `{}` too | **fixed**: non-empty string, `bad_label` |
| `vaultDB` | its declared limits only | missing: `TypeError`; short of a verb: `TypeError` at first use | **fixed**: shape check of the nine verbs, `bad_option`, keeps the instance |
| `deviceDB` | -- | the same | **fixed**: shape check of the four calls, `bad_option` |
| `keyDeriver` | shape | `salt_bytes` bounds | **other**: thread 1 |
| `forcePassphraseReentryHours`, `maxWhisperBytes`, `maxLockboxes`, `logger` | Zod, `bad_option` | -- | already |
| `clock` | shape (`parseClock`) and every reading (`readClock`) | the gripe's "defaulted, not shape-checked" | **already**: #64 (`vault.ts` `clockShape`, `readClock`) |
| `Vault.unlock(passphrase)` | empty or blank: `wrong_passphrase` | not text: `TypeError` from `.trim()` | **fixed**: `bad_option` |
| `Vault.changePassphrase(old, new)` | new blank: `wrong_passphrase` | either not text: `TypeError` | **fixed**: `bad_option` |
| `Vault.store(boxlabel, whisper, opts)` | label, `Whisper`, `note` | `opts` not an object is read as no note | **not**: generous, and harmless |
| `Vault.read`, `erase` | label | -- | already |
| `Vault.use(boxlabel, callback)` | label | callback not a function: `TypeError` after the whisper was deciphered | **fixed**: `bad_option`, before anything is read |
| `Vault.subscribe(listener)` | -- | a non-function broke a later operation's `bump()` | **fixed**: `bad_option` |
| `Vault.lockSoon(graceSeconds)` | Zod | -- | already |
| `VaultDB` read verbs: scope, boxlabel | `bad_label` | -- | already |
| `VaultDB` write verbs: the record | scope and boxlabel only; "outgoing records rely on TypeScript" | a record a read would refuse could be written (the over-long note bricked a vault once) | **fixed**: `VaultBundle`/`Lockbox`, `bad_option`; unknown fields stripped |
| `VaultDB` write verbs: `expected` | -- | unvalidated | **fixed**: three schemas, the exported types now inferred from them |
| `updateBundle`: `bundle.vault_id` vs `expected.vault_id` | -- | could differ | **fixed**: `bad_option` |
| `VaultDB.subscribe(scope, onChange)` | scope | a non-function broke a later write that rang it | **fixed**: `bad_option` |
| what an adapter returns | full records, scope and boxlabel matched | -- | already |
| `listBoxes`: what an adapter lists | the listed shape (no ciphered fields) | damaged ciphertext shows only at `read()` | **not**: see below |
| a remembered unlock read from a `DeviceDB` | `DeviceUnlock`, `vault_id`, epoch, deadline | scope not compared | **fixed**: compared, forgotten as unreadable, said through the logger |
| `localVaultDB(store)`, `domStore(webStorage, prefix)` | -- | a missing store fails at first use as `storage_unavailable` | **not**: see below |
| `StringStore.subscribe` (both stores) | -- | a non-function broke a later write | **fixed**: `bad_option` in the shared bell |
| `memoryDeviceDB()` calls | read validated | write and scope not checked | **not**: the vault is their one caller; a bad record written reads back as none, which costs one prompt |
| `mask`, the exported schemas, `isVaultError`, `isVaultCondition`, `stableJsonify` | Zod, or take `unknown` | -- | already |
| `new VaultError(kind, ...)` | -- | a host may construct an unlisted kind | **not**: typed, and a host's own error |

## safebyok/idb, safebyok/browser

| Entrypoint | Checked on the base | Gap | Disposition |
| --- | --- | --- | --- |
| `idbVaultDB(opts)`, `idbDeviceDB(opts)`, `browserOpts(opts)` | -- | `dbName` unvalidated: empty, a number, a bare string | **fixed**: one parser (`src/idb-opts.ts`, private), `bad_option` |
| `inspectIdb(opts)` | -- | `dbName`, `shelf` unvalidated | **fixed**: `bad_option` |
| `inspectIdb().subscribe(listener)` | -- | a non-function broke a later write | **fixed**: `bad_option` |
| `idbDeviceDB` reads | `DeviceUnlock`, dropped when bad | -- | already |

## safebyok-convex

| Entrypoint | Checked on the base | Gap | Disposition |
| --- | --- | --- | --- |
| `convexVaultDB(client, api)` | both shapes, `bad_option` | -- | already |
| its verbs | the core's base class, both ways | -- | already, and now the write checks too |
| server functions' arguments | Convex validators (types, fields, `format`) | the label grammar, lengths and time bounds are the client's | **not**: recorded in `validators.ts`; a modified client harms only its own vault, and authorization (`mustBe`) is checked |
| `SafebyokComponent(component)`, `.api({ getUserId })` | -- | a non-function `getUserId` fails at the first call, server-side | **coach**: a check would need the core's `VaultError` in server code, or a plain `Error`; low value |

## safebyok-react

`VaultProvider`'s props go to `openVault`, which checks them. `useVault()` outside a provider
throws a plain `Error`, the React convention. `withUnlockedVault(action)` and the dialog's props
are not checked: **other**, thread 3's file this sprint, and typed React props.

## The calls recorded

* **`listBoxes` validates the projected shape, not whole rows.** A projecting backend (Convex)
  never ships the ciphered fields, so checking them only when present would make adapters
  differ. And failing a listing on one damaged ciphertext would make `openVault` refuse the
  whole vault -- the brick the over-long note caused. A damaged box lists, and `read()` refuses
  it. *Discovery*: such a box also cannot be stored over or erased (both read it first), so its
  only remedy is `destroy()`. Erasing it needs no revision, so `erase()` could tolerate
  `corrupt_record`; a behaviour change, left for the Coach.
* **The write checks' kind is `bad_option`** (`bad_label` for a label), not a new kind: they
  are misuse, and a caller branches on the family. The README's row now reads "an option or
  argument out of its range".
* **`domStore` and `localVaultDB` stay unchecked**: in server rendering or a locked-down browser
  a host may hand them a missing `localStorage`, and meeting that as `storage_unavailable` at use
  is the right condition; refusing it as misuse at construction would break such hosts at load.
* **The size allowance** (`vault.ts`): the same check, reframed. `N × (W + 1 KiB) ≤ V/2` became
  `N × (2W + 2 KiB) ≤ V`, which admits exactly the same configurations. The 2 KiB now covers a
  lockbox's other fields alone: about 1,850 bytes of JSON at their largest (40-character labels,
  a note of 256 three-byte code units, a 512-byte `user_id`), shown by a test with real
  ciphertext. A JSON-text store that escapes a note of control characters (six bytes each) can
  exceed it; that is counted as the backend's own way of counting bytes. Raising the allowance
  for real, instead of moving the 2× onto the whisper, would refuse the defaults over Convex: the
  default 100 × 40444 leaves only 475 bytes of room per lockbox under Convex's budget.
