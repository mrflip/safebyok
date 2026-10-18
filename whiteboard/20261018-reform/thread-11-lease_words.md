# Thread 11: lease words (2026-10-18)

Branch `20261018-lease_words`, PR #PR, stacked on #158. Justify: green (core 2161 passed, 35
skipped; convex 258; react 227; e2e 81; every package green).

A follow-up thread on the Coach's rulings over the sprint's open matters: renames and wording only.

* **Built**:
  * `packages/safebyok/src/vault.ts`: `takeUpLease` → `fetchLease`; `takeUpVaultKey` →
    `grantLease`; `forgetLease` → `revokeLease`; `forgetsSoFar`/`forgetsThen` →
    `revokesSoFar`/`revokesThen`; `forgetUnreadableLease` → `revokeUnreadableLease`. Doc
    blocks, comments, test titles and the logger warning that said a lease was "forgotten" say
    "revoked" (also in `device-db.ts`, `idb.ts`, `types.ts`, the READMEs, `notes/wontfix.md`,
    VOCABULARY.md's *lock generation* entry). Where it is the store that drops a record
    (`eraseLease`, `eraseAll`, a device store failing), the word is "erase", the storage verb.
  * Refusals a user may be shown say "remove", not "retire" (list in *Decisions*).
  * The sidecar is "guaranteed unchanged" where it was "authenticated": README bullet and opening
    line, VOCABULARY.md's sidecar entry, the `Sidecar` and `storeBox` doc blocks.
  * Changeset `.changeset/20261018-lease_words.md`: patch, safebyok and safebyok-convex.
* **Decisions taken**:
  * **The old inner `grantLease` is folded into the new one.** It had one caller, and the fold
    reads as one act: check, mint and wrap, write under the lock generation, take up the key.
    The `try` now wraps only `writeLease`, the one call that can refuse `stale_write`.
  * **`revokeUnreadableLease` erases as well as warns**, so the revoke- name is true: it was a
    logger call that followed an erase at both of its callers. Same order as before: erase, then
    warn.
  * **"An end user sees it" = the `condition` family.** `isVaultCondition` is documented as
    "one the app may show the user", and react's dialog shows a condition's message. Changed:
    `vault_full` (core, `Refusals.vaultFull`, and the Convex component's own copy, the subject of
    the ruling), `damaged_lockbox` (four), `stale_write` (lockbox written or removed; a removal
    into a vault gone; the `retire` refusal's "this removal was refused"), `absent_wayin`,
    `last_wayin` ("remove the vault"), `vault_locked` ("locked or removed on this device"),
    `damaged_vault` (unnamed vault props). Kept: `bad_option` and `bad_whisper` messages, which
    are misuse and name the method. React's own messages never said "retire". The README's error
    table row for `vault_full` says "Tell the user to remove a lockbox".
* **Deviations**:
  * Touched VOCABULARY.md's *lock generation* entry (forgotten → revoked) beside the sidecar
    entry; neither is in *Old names*.
  * The Convex component's `vault_full` message changed with the core's, though the ruling named
    core and react: it is the same refusal, word for word.
* **Discoveries**:
  * VOCABULARY.md's *Old names* rows still map `rememberDevice` → `grantLease`,
    `rememberedUnlock` → `takeUpLease`, `takeUpUnlock` → `takeUpVaultKey`. Left for the thread
    moving that section: they should read `grantLease`, `fetchLease`, `grantLease`.
  * `leaseDeadlineOf` and `holdNextLease` (test helpers) carry no "forget" and keep their names.
* **For the Coach**:
  * **eraseLease stays.** The DeviceDB verbs are storage verbs; the vault revokes, the store
    erases. Recommendation: keep `eraseLease`.
