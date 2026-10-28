# Thread B1: proof_wayin (2026-10-19)

Branch `20261019-proof_wayin`, [PR #201](https://github.com/mrflip/safebyok/pull/201), stacked on
[#195](https://github.com/mrflip/safebyok/pull/195) (`20261019-outcome_adapters`). Justify: green;
core 2457 (35 skipped), react 263, demo 215 (16 skipped), 0 failed.

* **Built**:
  * `src/proof.ts` (new): `abstract class Proof` (`kind`, `vault`, `static parse`, `toJSON` =
    `{ kind }`), `PassphraseProof` (`passphrase`), `PasskeyProof` (`credentialId`, `prfSaltB64`,
    `prfBytes`), each with `static parse(vault, given)` and `wayinKeyFor(wayin)`. The secret is
    attached by `decorate` (hidden, fixed) on a frozen instance. `passphraseKeyOf` (the key
    deriver's bytes: checked, imported non-extractable, zeroed) moved here from `wayin.ts`.
  * `src/wayin.ts`, rewritten: `abstract class Wayin` (every stored field first-class; `vault`,
    `holder`, `props` hidden; `summary`, `wayinCtx`, `isDamaged()`, `tryOpen(proof)`, `toJSON`),
    `PassphraseWayin`, `PasskeyWayin`, each frozen. Statics: `make(vault, record, holder)` (Zod,
    `damaged_wayin`), `listOf(vault, vaultProps)`, `tryOpenAmong(wayins, proof, wayinId?)` (the old
    `open`/`openWithPassphrase`/`openWithPasskey`, now over `tryOpen`), `sealPassphrase`,
    `sealFirstPassphrase`, `sealPasskey`. `summarize`, `tryPassphrase`, `tryUnwrap` became
    `summary`, `tryOpen` and the protected `unwrapUnder`.
  * `types.ts`: the record schemas renamed `WayinRecord`, `PassphraseWayinRecord`,
    `PasskeyWayinRecord` (as B3's `BoxRecord`); the host's passkey shape `PasskeyProof` renamed
    `PasskeyAnswer`.
  * `vault.ts`: `parseProof`/`parsePasskey`/`parseNewPasskey`/`parsePassphrase` gone for
    `Proof.parse`, `PassphraseProof.parse`, `PasskeyProof.parse`; `#unwrapWith` is
    `Wayin.tryOpenAmong` over the models; `vault.wayins` is `Wayin[]` and `vault.props` (and
    `snapshot.props`) the frozen vault props, both from one cache per props record (`#modelsOf`);
    `logger`, `clock`, `keyDeriver` getters, bodies as B3's. `damaged_wayin` news from a read
    (`#tellWayinNews`, `meta.wayin_listed`), told once per stored record; a read clears `trouble`
    only with no damaged box or way in.
  * `errors.ts`: `RefusalMeta.wayin_listed`. `index.ts` exports the classes (`Wayin` and its two as
    values, the proofs as types), the record schemas, `PasskeyAnswer`, the model slice types.
  * React: `createPasskey`/`askPasskey` return `PasskeyAnswer`.
  * Tests: `tests/proof.test.ts` (new, 26), `tests/wayin.test.ts` rewritten (60 to 98: each Does,
    Guarantees, Returns and Refuses line of *wayin.tryOpen*, and *Wayin*'s field table, by title),
    `vault-wayins.test.ts` section `[Ways in as models]` (64 to 73), `utils.test.ts` (3 to 9). Core
    2378 (35) to 2457 (35); every other workspace unchanged. `TH.vaultSliceOf(userId, keyDeriver?)`,
    the `Pick<Vault, ...>` stub the model tests use. `ctx-bytes.test.ts` passes unchanged in its
    literals: no wrap moved a byte.
  * Docs: README (*Several passphrases*, *Fingerprint unlock*), VOCABULARY (**proof**, **passkey
    answer**, **wayin, as stored**), STYLE (*Imports* example), `notes/security.md` (one entry, four
    folds; sonnet subagent). Changeset `minor` for safebyok and safebyok-react.
* **Decisions taken**:
  * **The passkey's names: the Contract's two.** `PasskeyAnswer` is what a host hands in (the
    authenticator answered); `PasskeyProof` is the checked class the vault makes of it, beside
    `PassphraseProof`. The Contract's `Ask.attempt` and *Proof* blocks already read this way.
  * **`adorn`/`decorate` are B3's, byte for byte** (second commit): `adorn(obj, val)` attaches each
    of `val`'s own entries to `obj`, hidden and fixed (non-enumerable, non-writable,
    non-configurable), and returns `val`; `decorate(obj, props)` attaches each of `props`' and
    returns `obj`. My first commit took the Coach's triquet form, `adorn(obj, ckey, val)`; B3's
    reading fits the Contract's two-argument signature, and identical files make the restack clean.
  * **A way in carries its holder** (drift 1): the wrap binds the vault props' `vault_id` and
    `registered_at`, and the vault's public fields lag the props a call is proving against.
  * **The search stays on `Wayin`** as `tryOpenAmong` (drift 3), with its aggregate messages; B4's
    one-passphrase policy will shrink it.
  * **`vault.wayins` is `Wayin[]`, `snapshot.wayins` stays summaries**: the fields-equal-snapshot test
    now exempts `wayins` and checks the summaries instead.
  * **The vault reads `proof.passphrase`** only to hand a new passphrase to the host's strength test.
  * **Proofs are exported as types only**: a host hands in a string or a `PasskeyAnswer`.
* **Deviations**: none from the thread text beyond the drift; the search functions became a
  static and private helpers rather than instance methods (they work across ways in).
* **Discoveries**:
  * **The vault's public fields lag its private state** until `#settle()`: `vault.vault_id`,
    `unlock_epoch`, `vault_key_epoch` read the published snapshot. A model reading them mid-call
    (B3's `BoxVault` picks `vault_id` and `vault_key_epoch`; B2's `Lease.grant` guess reads
    `vault_id` and `unlock_epoch` off the vault) may see the last published props, or null during a
    first unlock. B1 passes the holder instead; B2 and the restack should look.
  * A frozen proof cannot be spied per instance; tests spy on the prototype.
  * The Contract's *Proof* Guarantee "the vault keeps no reference to a proof past the attempt" has
    no test: nothing observable holds it, and a GC-based test would be flaky.
* **For the Coach** (Open Matters):
  * **Contract drift**, eight items in [thread-B1-proof_wayin-drift.md](thread-B1-proof_wayin-drift.md).
    Recommend: carry each.
  * **Passkey names** `PasskeyAnswer` (host's shape) / `PasskeyProof` (class). Recommend: keep.
  * **`adorn`'s form**: B3's `adorn(obj, val)`, not triquet's `adorn(obj, ckey, val)`. Recommend: keep.
  * **`adorn`/`decorate` are public** on `safebyok/utils`, a contract for hosts. Recommend: move
    them to an internal module (not an entry) at B5.
  * **CLAUDE.md's *Conventions At A Glance*** still shows `Wayin.open(...)` as the star-import
    example; STYLE.md now shows `Names.check(...)`. Not mine to edit. Recommend: the same swap there.
  * **The untested Proof guarantee** above. Recommend: accept.
* **Looked up**: the progress doc's B1 rows and *Interim shims standing* (no shim added here); B3's
  worktree for its helpers and getters, per the orchestrator's message.
