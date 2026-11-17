# Thread 3: passkey_unlock (2026-10-15)

Branch `20261015-passkey_unlock`, PR [#76](https://github.com/mrflip/safebyok/pull/76), stacked on [#71](https://github.com/mrflip/safebyok/pull/71). Justify green: root 105, core
804 (was 759), Convex 272 (was 269), React 47 (was 28), demo 61; `pnpm size` within the raised
limits.

* **Built**:
  - **The envelope** (`types.ts`): `PasskeyEnvelope` `{ method: 'passkey', unlock_id, unlocklabel,
    credential_id, prf_salt_b64, vault_key_wrapped }` joins the union; `UnlockMethodVals` gains
    `passkey`; no two passkey envelopes may share a `credential_id` (checked on read).
    `PasskeySaltBytes = 32`. `UnlockSummary` is a union: a passkey's adds `credential_id` and
    `prf_salt_b64`. `PasskeyProof` `{ credentialId, prfSaltB64, prfBytes }` is what the host hands in.
  - **The construction** (`crypto.ts` `deriveWrappingKey`, `envelope.ts`): passkeyKey = HKDF-SHA256
    (WebCrypto) over the 32-byte PRF answer, empty salt, `info` = `cipherBinding('safebyok-vault-v1',
    'vault_key_passkey_wrapped', credential_id)`. Wrap AAD as for a passphrase, purpose
    `vault_key_passkey_wrapped`. A test checks RFC 5869 A.3 byte for byte.
    `Envelope.sealPasskey`, `openWithPasskey`, and `open` (dispatches on the proof).
    `openWithPassphrase` now passes over passkey envelopes.
  - **The vault**: `unlock(proof, { unlockId? })`, `addPassphrase(proof, ...)` and
    `removeUnlock(proof, ...)` take a passphrase or a `PasskeyProof`; `addPasskey(proof, passkey,
    { unlocklabel })` is new. All go through `reviseUnlocks`, the proof generalized. The vaultKey
    stays non-extractable.
  - **Errors**: `wrong_passkey`, `passkey_unavailable` (conditions). `last_unlock` now means "the
    last passphrase". A malformed proof or a credential already in the vault is `bad_option`.
  - `safebyok/utils` exports `toB64`/`fromB64`; `safebyok/testing` gains `passkeyOf`,
    `passkeyEnvelopeOf`. Convex `PasskeyEnvelope` validator in the union.
  - **`safebyok-react`**: `src/passkey.ts` (`createPasskey`, `askPasskey`, `passkeysAvailable`, no
    React import), `PasskeyUnlockButton`, one line in `PassphraseModal`. `tests/test-helpers.ts`
    (new) re-exports `safebyok/testing` and adds `installFakeAuthenticator` (a fake
    `navigator.credentials`, PRF as HMAC-SHA256).
  - Demo `WaysIn.tsx` ("Add fingerprint"); READMEs; VOCABULARY; three `notes/security.md` entries;
    changeset (all three packages minor).
* **Decisions taken**:
  - **HKDF, not a direct import of the PRF bytes.** The bytes are already uniform; HKDF adds domain
    separation, so the same credential and salt put to another use make another key. Orchestrator's
    expected shape, followed.
  - **The salt is minted by the helper**, checked (32 bytes, base64url) by the core at `addPasskey`
    (`bad_option`) and at unlock (`corrupt_record`, in `envelope.ts`, as #71 does for passphrase
    salts). A proof whose salt differs from its envelope's is `wrong_passkey` before any unwrap.
  - **One proof type for adding and unlocking** (`PasskeyProof`, salt included), so the helper
    returns one shape from both calls.
  - **A passkey is found by `credential_id`**, not tried in turn: at most one envelope per credential.
    `unlockId` may narrow it further.
  - **A vault always keeps a passphrase** (`last_unlock`), and is created with one (a passkey
    `unlock()` on an absent vault is `absent_vault`). Conservative and easy to relax later;
    tightening later would strand vaults.
  - **`changePassphrase` stays passphrase-only** (a passkey proof is `bad_option`). Recovery with a
    passkey is `addPassphrase(passkey, ...)` then `removeUnlock(passkey, oldId)`.
  - **The helper lives in `safebyok-react`**, exported from its main entry, framework-agnostic.
    Cheaper than a new package; a Vue binding would want it moved to its own.
  - **WebAuthn choices**: `userVerification: 'required'` everywhere (hmac-secret answers
    differently without UV); a random 16-byte user handle per passkey (an authenticator would
    otherwise replace a sign-in passkey with the same handle); `residentKey: 'discouraged'`; random
    unverified challenges; algorithms Ed25519, ES256, RS256. If PRF is enabled at creation but not
    answered, the helper asks again with `get`. Dismissal (`NotAllowedError`, `AbortError`) resolves
    null; `SecurityError` is `bad_option`; anything else `passkey_unavailable` with the cause.
  - `PasskeyUnlockButton` throws misuse into render (error boundary), the pattern gripe_fixes'
    react_dialog recommends; conditions go to `onGripe`.
  - *Orchestrator's YOLO call, after review:* `createPasskey`'s doc block and the React README say
    that a dismissed second touch, like a missing PRF, leaves the new credential on the
    authenticator.
* **Deviations**:
  - Size budget raised again: `openVault` 17.5 to 18.5 kB (measured 18.27), everything 24.5 to
    25.5 kB (25.24). Most of it is the new verbs' messages.
  - `PassphraseModal`'s hunk is two lines (an import, one JSX line), uses the page's own rpId; a
    host with a custom `rp.id` renders `PasskeyUnlockButton rpId=...` in a dialog of its own.
  - No `eslint-disable` or `ts-expect-error` added.
* **Discoveries**:
  - jsdom has no `getHTML`, and `instanceof ArrayBuffer` fails across its realm: the helper uses
    `ArrayBuffer.isView`. The core's proof check stays `instanceof Uint8Array`, like its
    `instanceof CryptoKey`.
  - `Iterator#toArray` is not in the TS lib the React package targets; lint's prefer-spread and
    prefer-iterator-to-array then conflict on `Array.from(map.keys())`.
  - The removed-passkey-is-not-revoked test (`vault.test.ts`) shows a copy of an old bundle still
    opening: the same fact as for passphrases.
* **Review** (thread-reviewer, `fixed`): one commit, `d2fc435` -- the demo's "Add fingerprint" made a
  passkey before refusing an empty passphrase, orphaning it; it now asks for the passphrase first.
  Construction and proof paths found sound. Left, as open questions in the PR:
  - **HKDF `info` leaves out `vault_id` and the scope** (purpose and credential only); separation
    across vaults rests on the per-envelope PRF salt plus the AAD. A construction call for the Coach.
  - `addPasskey` checks its proof only after the passkey exists, so a wrong passphrase orphans one;
    avoiding it means proving first, an API-shape change.
  - One damaged passkey envelope makes `askPasskey` throw `corrupt_record` for every passkey.
  - `PasskeyUnlockButton` reads the snapshot without subscribing, as `PassphraseModal` does.
  - Cleanups: `sealPasskey`'s unused `sessionKey`; `saltLengthOf` (vault.ts) duplicates
    `saltBytesOf` (envelope.ts).
* **For the Coach**:
  - Confirm **"a vault always keeps a passphrase"**: it rules out passwordless vaults for now.
  - Confirm **any way in proves any change**: one passkey can set a new passphrase and remove the
    others (the recovery story depends on it; the security note says so).
  - Public surface additions: `PasskeyEnvelope`, `PasskeySaltBytes`, `PasskeyProof`,
    `toB64`/`fromB64` in `safebyok/utils`, two error kinds, React's four exports.
  - A real authenticator has not touched this code: the tests mock `navigator.credentials`. Worth
    one manual pass in Chrome (platform passkey) and Safari before release.
