# Thread 9: cipher_ctx (2026-10-26)

Branch `20261026-cipher_ctx`, PR [#280](https://github.com/mrflip/safebyok/pull/280), stacked on [#279](https://github.com/mrflip/safebyok/pull/279). Justify: green (core 3235 passed / 37
skipped, convex 350, graphql 339, postgres 322, react 308, indexeddb 165, fastkey 49, demo 227,
e2e 107, root 265). Size: no line moved (`everything` 62.2 kB, budget 66; `Bank` 54.6, 58).

* **Built**:
  * **`cipherCtx(stamp, purpose, ...header)`** (crypto.ts): `stamp` is one `CipherCtxRecord` or a
    list; the bytes are `stableJsonify([...stamps, purpose, ...header])`, today's encoding of a
    JSON array of parts (each a string or a flat record, keys sorted). Undefined or null parts and
    record fields refused `bad_option`, as before; an empty stamp list refused too. `header` is a
    rest tuple (`[] | [record]`), so an explicit `undefined` is refused rather than dropped.
    `CipherCtxPart` became `CipherCtxRecord` (internal).
  * **Wayin**: `wayinCtxOf(vaultStamp, header)` = `cipherCtx(VaultStamp, purpose, header)`, the
    stamp picked by `VaultStamp.strip()` (a vault record or `VaultSparse` passes whole).
    `Wayin.make(vault, vaultStamp, record)` (was `vaultTok`) keeps the stamp private (`#vaultStamp`),
    `vault_tok` read from it; `WayinVault` is `keyDeriver | now`; `GateVault` names its scope
    itself; `Gate.of` takes a record carrying the stamp. Provings keep `#vaultStamp` (the
    `VaultSparse` they were sealed under) with a protected getter for `sealWayins`.
  * **Box and lease** (lease.ts, exported internally for tests): `boxCtxOf(vaultStamp, boxStamp,
    purpose)` = `cipherCtx([VaultStampButFormat, BoxStamp with sidecar as its sorted JSON],
    purpose)`; `leaseCtxOf(vaultStamp, leaseStamp)` = `cipherCtx([VaultStampButFormat,
    LeaseStamp], 'vault_key_lease_wrapped')`. `VaultStampButFormat` = `VaultStamp.omit(format)
    .strip()`, a type of that name exported from lease.ts. The vault's stamp comes from the Vault
    object (`LeaseVault` gains `vault_tok`, `registered_at`) at use, and from `standing` (the vault
    record) at `sealLeaseRecord`, whose `standing` is now `VaultStampButFormat & { gate_epoch }`.
  * **Tests**: ctx-bytes.test.ts pins every ctx's literal bytes anew, and a `[Stamps]` section
    checks, field by field, that changing any one of `VaultStamp`'s six (wayin), the vault stamp's
    five (box, lease), `BoxStamp`'s nine and `LeaseStamp`'s seven stops the ciphertext opening, and
    that a vault `format` change leaves a box's and a lease's ctx byte-identical. Hand-mutating the
    builders to drop `registered_at` or `gate_epoch` failed those tests (checked, then reverted).
  * **Leftovers from #279**: thread 8's changeset says a demand on an empty `vault_tok` now refuses
    `bad_option`; `raisedDeviceRecord`'s doc block says it throws `bad_record` raising to an epoch
    that fails its check (never from the core), with a test.
  * **Words**: VOCABULARY's ctx, visible, unencrypted, sidecar, revisionTok, whisper codec and
    format rows, and its stamp paragraph (now the bound fields; "made under" split out as its own
    paragraph for what `demandConsistentWith` compares); the core README's ctx bullet; box.ts's
    and lease.ts's doc blocks. `notes/security.md` entry (sonnet subagent), with amended pointers
    on the older ctx entries.
* **Decisions taken**:
  * **Literal fields refuse at the parse.** A stamp whose literal field differs (a vault, box or
    lease `format`, `whisper_codec`, `whisper_schema_version`) is refused `bad_record` by its
    schema before any ctx is built; the binding tests count that as "does not open".
  * **A box's sidecar stays bound as its sorted JSON string** inside the box's stamp record, as
    today, so every ctx part stays a flat record (no nested values in the encoding).
  * **Scope and `vault_tok` appear in both stamps** of a box's and a lease's ctx: each stamp is
    bound whole under its own names, per the preplan; harmless redundancy.
  * **The box stamp parses strict, the vault's and lease's strip**: the box's is built exactly
    (visible fields plus `vault_tok`), so a stray field is a bug to refuse, not to drop unbound.
* **Deviations**: none from the preplan's ctx. `Wayin.make`'s second parameter changed type
  (public); `WayinVault` narrowed.
* **Discoveries**:
  * Old-sense "stamp" (what a thing was made under: scope, `vault_tok`, epochs) survives in box.ts's
    Box getters' doc blocks, `vault.stamp`, provings' `stamp` parameter, `StampedShape` and
    `checkedStamp`: thread 11 reshapes those (Box's own fields, `vault.stamp`'s rename), so they
    were left; VOCABULARY now calls that "made under".
  * VOCABULARY was edited as this branch has it, not #272's: apply the ctx/stamp/visible/
    unencrypted rows to #272's at the restack.
  * A wayin's ctx is built from a stamp handed in, never from the Vault object's getters: during
    `#picture` the snapshot is being rebuilt from the standing record, so the getters may lag.
* **For the Coach**:
  * **Every wayin, box and lease sealed before opens no more**; the changeset says so, beside
    thread 8's damaged-vault line.
  * `registered_at` was deliberately unbound before (a test said so: "vault_tok, random and never
    reused, names them alone"); the preplan binds it, and that test now asserts the reverse.
