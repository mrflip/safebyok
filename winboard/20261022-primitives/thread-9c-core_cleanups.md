# Thread 9c: core_cleanups (2026-10-23)

Branch `20261023-core_cleanups`, PR [#264](https://github.com/mrflip/safebyok/pull/264), stacked on
[#262](https://github.com/mrflip/safebyok/pull/262). Justify: green, every package (core 3128
passed, 37 skipped).

**Status:** ready. All three items built.

* **Built**:
  * **A key deriver's throw is kept nowhere** (`proving.ts` `deriverThrewRefusal`, used by
    `passphraseKeyOf`, which now takes the vault's `logger`; `ProvingVault` picks `logger`). A
    condition-family VaultError keeps only its kind, in safebyok's words, no cause, no meta;
    anything else refuses `unexpected_error`, no cause, and the logger hears
    `{ call: 'deriveKeyBytes', refusalkind }`, the kind only when listed. `listedKindOf`
    (`errors.ts`, not exported from the index) is shared with 9b's `requestCleartext` guard.
    `hostThrewRefusal` is gone from `outcome.ts`; its cases moved to `proving.test.ts`. Doc
    blocks fixed: `KeyDeriver.deriveKeyBytes`, the Vault class's refusal list, `unexpectedError`'s
    message (no longer names a key deriver). Security note amended in `notes/security.md`.
  * **Hooks checked**: the strength checker already dropped its throw whole; its `load()` hears
    nothing and keeps its cause. A passkey's PRF answer reaches only `checkedPasskeyAnswer` (fixed
    messages) and WebCrypto's HKDF (`unexpectedError`, a DOMException cause, which quotes no bytes).
    The stores, clock and validators hear no cleartext. A test per hook in `gating.test.ts`
    ("a host function that hears the passphrase throwing, quoting it"): deriver on unlock, deriver
    sealing a new passphrase, strength checker; `requestCleartext` was 9b's (`vault-lease.test.ts`).
  * **Stores by identity** (`bank.ts` `otherStoresError`, `checkSameStores`, `ensureVault`'s doc
    block, `VaultDraft`'s): the `bad_option` message says the draft must name the same vaultDB and
    deviceDB objects, not new ones over the same storage, and to make each store once.
  * **Maintainability** (M4), no behaviour change: `#gateWriteRefusal` (`vault.ts`) is now the one
    classifier of a refused gate write, `isGateMadeElsewhere`, `strippedOfStoredProps` and
    `StaleWayinsMessage` folded into it, and it returns `VaultError` (was `unknown`).
    `resealWayinFor` (`proving.ts`) is overloaded by the new proving's class, so `gating.ts`'s
    two casts are gone. `leaseRecordOf` stays in `lease.ts`, its doc block saying it is for tests
    alone: the record sits in a `#private` field, which only the module can reach, so a test
    helper could not read it. The doubled blank line in `gating.test.ts` is gone; `bank.test.ts`
    had none at #262's tip.
* **Decisions taken**:
  * A condition-family VaultError from a deriver keeps its **kind** (the contract
    `deriveKeyBytes` promised), but not its message or meta: those are the deriver's text. Dropping
    the passthrough altogether was the simpler choice; keeping the kind keeps more of the promise.
  * Conditions are not logged (they reach the caller with their kind); other throws log at `error`.
* **Discoveries**:
  * Doubled blank lines mid-file remain in `expectations.test.ts`, `vault-db.test.ts`,
    `vault-boxes.test.ts` and `types.test.ts`; many files have two after their imports, which
    looks deliberate. Left alone.
  * TODO.md's "Add "sensitive" and "host" flags to refusals" records the Coach's 2026-10-21 "Leave
    it, we will audit these" on exactly this cause. This thread is that audit for the deriver, at
    the orchestrator's direction; the flags themselves are not built.
  * safebyok-fastkey's useful `bad_option` messages (no WebAssembly; CSP without
    `'wasm-unsafe-eval'`) now reach a host only as `unexpected_error` plus the logged kind.
  * A strength checker's verdict `reason` becomes the `weak_passphrase` message as given; a checker
    quoting the passphrase there would put it in the refusal. Left as is (an answer, not a throw).
* **For thread 11** (lines made untrue): core README *Errors* table, `unexpected_error` row (a key
  deriver's throw "is its `cause`"; "the vault never logs either"); safebyok-fastkey README
  *Errors* ("arrives as `unexpected_error`, the `bad_option` its `cause`", and "what was thrown its
  `cause`"); safebyok-react README *React reports it to you* ("whatever a key deriver throws ... is
  the vault's `unexpected_error` with that throw as the cause"). Any README line saying a deriver's
  condition "passes as itself".
* **For the Coach**:
  * **Deriver conditions keep their kind** but not their words (rec: keep). The alternative,
    every deriver throw `unexpected_error`, is simpler but drops what `deriveKeyBytes` promised.
  * **fastkey's guidance lost**: its CSP and no-WebAssembly `bad_option`s now reach a host only
    as a logged kind. Rec: fastkey checks for WebAssembly and compiles at construction or in a
    `load()` that hears no passphrase, so its own refusal can carry its words (a later thread).
  * **A strength checker's `reason`** is shown as given; rec: document that it must not quote the
    passphrase (thread 11), and leave the code.
