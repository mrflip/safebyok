# safebyok — proposed README

A draft of the package README, rewritten (2026-10-14, crypto thread) against the implemented
interface; the original relic draft described an API that no longer exists. Still a whiteboard
document: promote it to the real README when the Coach says the surface has settled.

---

# safebyok

An end-to-end encrypted vault for the API keys and other small secrets your users bring to your
app. Whispers (the secrets) are encrypted on the user's device under keys that never leave it;
your backend — or this browser's own IndexedDB — holds ciphertext only. Holding the database,
the code, and the environment opens nothing.

## What it provides

- Passphrase-protected vaults, synchronized through a storage adapter you plug in
- Client-side cryptography: Argon2id (pinned `argon2id_web_v1` spec) for the passphrase,
  AES-256-GCM through WebCrypto for everything else
- Lockboxes: each whisper sealed under its own key, with a public label and note your UI may
  show while the vault is locked
- "Remember this device": unlocks survive a reload for seven days (your call), around a
  non-extractable browser key
- Passphrase changes that rewrite one small record, never your users' lockboxes
- A React binding (`safebyok-react`): provider, hooks, and an unstyled passphrase dialog

## What it does not provide

safebyok is not a request proxy. Your app decrypts a whisper on the user's device — inside
`vault.use(...)` — and calls the external API directly from there. If you route requests through
your backend instead, your backend sees the key during handling: a legitimate choice, but a
different trust model, and not this one.

safebyok also has no recovery path: a forgotten passphrase means an unrecoverable vault (the user
re-enters their API keys — annoying, not catastrophic). Say so in your UI.

## Install

```sh
npm install safebyok zod
```

`zod` is a peer dependency (your app very likely has it already). Runtime dependencies:
`@noble/hashes`, `@scure/base`, `idb-keyval`, `safe-stable-stringify`. The IndexedDB adapters
live in their own entry point, `safebyok/idb`.

## The security model, in five lines

```text
passphrase + passphraseSalt ──Argon2id──> passphraseKey
passphraseKey   wraps   vaultKey      (stored: the vault bundle, synced everywhere)
localUnlockKey  wraps   vaultKey      (stored: this device only, non-extractable key)
vaultKey        wraps   lockboxKey    (stored: one per lockbox)
lockboxKey      ciphers whisper       (stored: one per lockbox)
```

Every encryption is bound to its context (app, user, vault, lockbox, revision, purpose), so
ciphertext moved anywhere else refuses to open. A wrong passphrase is learned from the vaultKey
envelope refusing to decrypt — never from a comparison, and never from a stored verifier.

## Quickstart

```ts
import { openVault } from 'safebyok'
import { idbDeviceDB, idbVaultDB } from 'safebyok/idb'

const vault = await openVault({
  applabel:   'acme',
  userId:     session.userId,     // stable and opaque, from your auth; never an email
  vaultlabel: 'main',
  vaultDB:    idbVaultDB({ dbName: 'acme' }),    // or your backend's adapter
  deviceDB:   idbDeviceDB({ dbName: 'acme' }),
})

vault.getSnapshot().state                 // 'absent' | 'locked' | 'unlocked'
await vault.unlock(passphrase)            // on an absent vault, this first unlock creates it
await vault.store('anthropic_api_key', 'sk-ant-...', { note: 'personal account' })

const answer = await vault.use('anthropic_api_key', (whisper) => callAnthropic(whisper))
```

`use` hands the whisper to a callback and returns the result: the shape that discourages parking
a secret in state. Don't log it, don't put it in React state, don't throw it.

Snapshots are `useSyncExternalStore`-ready (`subscribe`/`getSnapshot`, identity-stable), and the
lockbox summaries — labels, notes, timestamps, no whispers — are readable while locked: that is
what public metadata is for.

Other verbs: `read(boxlabel)`, `erase(boxlabel)`, `lock()`, `changePassphrase(old, new)`,
`destroy()` (deletes the vault outright; deliberately works without unlock, because an
authenticated owner can always delete their own rows server-side), `close()`.

## Writing a storage adapter

Extend the abstract `VaultDB` and implement seven small methods against your backend —
`fetchBundle`, `saveBundle`, `trashBundle`, `fetchBox`, `saveBox`, `trashBox`, `fetchBoxes`.
Every record is plain JSON (binary fields are base64url text): store what you are handed, return
what you stored, never look inside. safebyok validates everything it reads back.

The verbs safebyok actually calls (`readBundle`, `listBoxes`, `createBundle`, `eraseVault`,
`subscribe`) are composed on your primitives for you. Each documents its default composition;
override the one your backend does better — an atomic create, a projected list that skips
hauling ciphertext, a push subscription.

Your backend should still enforce that a signed-in user reaches only their own rows, with
server-derived identity. Encryption protects the contents; your authorization decides who can
fetch or overwrite rows at all.

## Errors

Every refusal is a `VaultError`: a calm message and a `kind` to branch on, never carrying secret
material. `isVaultError(err, kind?)` narrows.

| kind | meaning |
|---|---|
| `vault_locked` | a whisper was asked for before unlock: prompt and retry |
| `wrong_passphrase` | the passphrase did not unlock the vault |
| `absent_box` | no lockbox under that label |
| `absent_vault` | the vault has never been created, and this call will not create it |
| `bad_label` | a label outside the Label rules |
| `bad_whisper` | a value JSON cannot carry (undefined, a Date, a bare null) |
| `corrupt_record` | a stored record failed validation or decryption verification; it is left in place |
| `unknown_key_deriver` | the vault names a deriver this package was not configured with |
| `vault_closed` | the handle was closed; open the vault again |

Treat `corrupt_record` differently from `wrong_passphrase`: the first is damage or tampering and
worth surfacing to support; the second is a typo.

## Browser notes

- Direct-from-browser Anthropic calls need the SDK's `dangerouslyAllowBrowser: true` (or the
  `anthropic-dangerous-direct-browser-access: true` header on a raw fetch) — by design here: the
  key is decrypted on-device and sent only to the provider.
- A strict CSP matters in an app handling user keys. safebyok itself needs nothing special — no
  WASM, no workers — so `script-src 'self'` plus `connect-src` to your provider host is a fine
  starting point.
- IndexedDB is best-effort storage. With `idbVaultDB` (the no-backend tier) the vault lives only
  in this browser: call `navigator.storage.persist()`, and tell users plainly that clearing site
  data deletes the vault.

## Honest limitations

- A compromised page (XSS, a malicious extension, a stolen unlocked device) can read whispers
  while the vault is unlocked. E2EE blinds your backend; it cannot blind the running page.
- The external provider receives the key on every request the user makes. Spend caps and
  revocation at the provider remain the user's real safety net.
- Forgetting the passphrase means re-entering keys; there is no recovery path, on purpose.
