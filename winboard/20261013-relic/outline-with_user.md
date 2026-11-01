# safebyok and the signed-in user

Rewritten (2026-10-14, crypto thread). The original was a chat answer to the question *"is the
vault tied well enough to the authentication of the user?"* — the answer was no, and its one
conclusion is now built: a vault's identity is its **VaultScope**, `{ applabel, user_id,
vaultlabel }` (`src/types.ts`). The relic's "principal" vocabulary did not survive; the name is
`user_id` (opaque and stable, from the host's auth — never an email).

What the scope touches, everywhere:

* **VaultDB and DeviceDB records and lookups** are keyed by the full scope. The motivating
  scenario: Alice unlocks `main` on a shared browser and is remembered; Bob signs in and opens
  his own `main`. Scope-keyed device records mean Bob's lookup can never find Alice's remembered
  vaultKey.
* **cipherAdditionalData** carries applabel, user_id, vaultlabel and vault_id in every
  encryption, so ciphertext copied between users refuses to open even if rows are moved in the
  database. The user_id is a binding value, not a secret.
* **The backend still authorizes.** An adapter is expected to let a signed-in user reach only
  their own rows, deriving identity server-side (Convex: `ctx.auth`), never trusting a
  client-supplied user_id. safebyok's encryption protects contents; the backend's authorization
  decides who can fetch or overwrite rows at all.

Sign-out and account switches are the host's call, with the pieces provided: `vault.lock()`
forgets this vault's unlock; `deviceDB.eraseAll()` is the device's part of a full reset. Local
cleanup never touches remote records — an account switch must not delete the other user's
encrypted vault.

One more ruling from the original survives, implemented this thread: **broken data is preserved,
not deleted.** A remote record that fails validation or AEAD verification refuses with
`corrupt_record` and is left exactly as it was — a deployment bug or migration accident must stay
a recoverable support problem, never become permanent loss. Only a device-local remembered unlock
is dropped on failure, because its loss costs one passphrase prompt. Destroying a vault remains
an explicit, user-confirmed `destroy()`.
