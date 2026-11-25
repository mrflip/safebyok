# Thread 31: makes_validate (2026-11-25)

Branch `20261125-makes_validate`, PR (to come), stacked on [#896](https://github.com/mrflip/safebyok/pull/896). Proved:
`pnpm justify` green in full, nothing skipped: safebyok 1992 (1950 + 42 new), react-lean 338, idb-lean 115, postgres 365, dojo 111,
knockknock 26, envman 24, e2e 576, root scripts 331. React-lean and the three demos run again by hand, the same.

Built by hand (no /sprint), from the orchestrator's brief. The Coach: "Make sure all make methods validate". Thread 30
checked every `static make` but three; this thread checks those three at entry, the callee parsing.

* **Built**:
  * **`Vault.make(world, vaultTSQ)`** parses `VaultChecks.makeArgs` (`src/shapes/shapes-vault.ts`): the world by thread 30's
    duck `isWorld`, the vault TSQ by a new duck `isVaultTSQ` (`src/shapes/shapes-vault-tsq.ts`, beside `isQueryClient`,
    by `VaultTSQMembernames`: `itemQueryOptions`, `getOnce`, `listOnce`, `sweep`, `inspectable`), exported from `safebyok`
    beside `isQueryClient`. Signature unchanged. Phrase `VaultTSQExpected`.
  * **`PassphraseProving.make(parts, opts)` and `PasskeyProving.make(parts, opts)`** parse `Checks.passphraseMakeArgs` /
    `passkeyMakeArgs` (module-local in `src/models/proving.ts`, beside the builders' checks: `stored` names the Wayin
    class). Parts, strict: `bankStamp` by `BankChecks.stamp`, `gateStamp` by `GateChecks.stamp`, `header` by its kind's
    `WayinChecks.*WayinHeader.strict()`, `stored` `instanceof Wayin` or null. Opts: `GateishChecks.provingOpts`
    (`src/shapes/shapes-gateish.ts`), strict, `wayinKey` by `isWayinKey`: a `CryptoKey`, non-extractable, AES-GCM,
    256-bit, usages exactly `wrapKey` and `unwrapKey`, which is what both derivations (`importWrappingKeyBytes`,
    `deriveWrappingKey`) make. Phrases `WayinExpected`, `WayinKeyExpected`. The constructor is handed the parse's output.
  * `notes/security.md` has an entry for it (sonnet subagent).

* **Decisions made**:
  * **The header is checked strictly**, though `WayinChecks.*WayinHeader` strips: a header is a whole type, and both
    builders hand one with no extra field (minted by a parse, or a strict stored record less its wrapped bankKey).
  * **The proving keeps the parse's copies** of the stamps and header, not the caller's objects. The constructor froze
    what it was handed, so it froze the caller's objects; now it freezes its own. Equal for every valid input.
  * **The wayinKey check is new, not big's `isLeaseKey`**: same properties but another role, and it demands both usages
    and 256 bits.
  * **Set aside**: a refine that a stored wayin agrees with the header (and so is of the proving's kind). Not a field's
    check; the brief asked for the fields'. A mismatch fails at unwrap as a wrong passphrase or passkey. Open matter.

* **Discoveries**:
  * **The census regex misses generic makes**: `static make<…>(` in `VaultMinder` and `ThingCar`. Both check at entry.
    Use `rg -n 'static (async )?make\w*[<(]' packages/safebyok/src`.
  * **Not checked of a proving's parts**: that the wayinKey is the one derived for this wayin. No property of a
    `CryptoKey` shows it, and a leaseKey has the same properties and passes.
  * Statics left unchecked, taking outside input (not makes, so left): `BaseThing.shellOf(seen)`,
    `BaseThing.haveSameScope`, `BaseThing.cmp`, `BaseThing.nextLifeOf`, `MemoryVaultDB.ckeyOf`; `BaseBox.decode(text)`
    checks what the text parses to, not that it is a string.

* **For the Coach**:
  * **Stored wayin agrees with header?** Recommend adding it to the provings' make check: cheap, refuses an incoherent
    proving at make instead of at unwrap.
