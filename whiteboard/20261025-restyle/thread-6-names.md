# Thread 6: names (2026-10-26)

Branch `20261026-names`, PR pending, stacked on #276. Justify: in progress.

* **Built** (so far):
  * `user_id` for every `userId`: a vault's draft (`VaultDraft`, `VaultChoice`), `delDamagedVault`,
    safebyok-react's `BankProvider` prop and its internal `Provided`, `postgresVaultDB`'s option
    and its private field, `safebyok/testing`'s `memoryVaultOpts` and builders, the READMEs, the
    demo's auth and session, e2e. A draft still naming `userId` refuses `bad_option` naming
    `user_id` (new test in `tests/bank.test.ts`).
  * `PasskeyAnswer` is `{ credential_id, prf_salt_b64, prfBytes }` (types.ts, proving.ts,
    safebyok-react's `passkey.ts`).
  * `ask_passphrase_at` for the snapshot's field and the Vault object's getter (vault.ts), the
    demo's lock chip, consts.ts and crypto.ts examples, README, VOCABULARY.
  * Limits keep the option's name once resolved: `ParsedBankOpts.maxWhisperBytes`,
    `VaultParts.maxBoxes` / `maxVaultBytes`, the Vault object's `#maxWhisperBytes`, `#maxBoxes`,
    `#maxVaultBytes` (were `whisperByteLimit`, `boxLimit`, `vaultByteLimit`).
  * `notes/old_vocabulary.md` retires each old name.
