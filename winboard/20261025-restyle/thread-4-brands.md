# Thread 4: Type aliases and brands (2026-10-26)

Branch `20261026-brands`, PR [#275](https://github.com/mrflip/safebyok/pull/275), stacked on
[#274](https://github.com/mrflip/safebyok/pull/274). Justify: green (core 3144 passed, 37 skipped;
every package and e2e green; every size line within its budget, none moved by the rule).

* **Built**:
  - `src/types/`: `types.ts` moved in as `types/types.ts` (its test as `tests/types/types.test.ts`,
    its snapshot with it); `types/type-aliases.ts` is new. Every importer follows the move.
  - **Plain aliases** (a host writes these): `Applabel`, `Vaultlabel`, `Boxlabel` (`Z.infer` of
    `label`), `UserId` (of `user_id`), `VaultTok`, `RevisionTok` (of the new `vault_tok` and
    `revision_tok` validators), and `EpochMillis`, re-exported from `checks/primitives.ts`.
  - **Brands**, each from its validator's `.brand()`, the validator named for the field it checks
    (NEWSTYLE §8) so a record writes `obj({ salt_b64, vault_key_wayin_wrapped, ... })`:
    `PassphraseSalt` (`salt_b64`), `PrfSalt` (`prf_salt_b64`), `WhisperCiphered`, `BoxKeyWrapped`,
    `VaultKeyWayinWrapped`, `VaultKeyLeaseWrapped` (each `Ciphered.brand<...>()`), all in one
    'bad_record' call with the two tokens; `PassphraseCleartext` (`passphraseCleartext`,
    'bad_option', "A passphrase is the text the user typed, as a string"). The wayin, box and
    lease records and lease.ts's `CipheredShape` use them.
  - **Facets**: `Lifecycled<OT, LifecycleT = 'starting' | 'ready'> = OT & { readonly lifecycle }`,
    `Refused<OT> = OT & { readonly lifecycle: 'refused', readonly err: VaultError }`,
    `ConsistencyWith<OT> = OT & Pick<Vault, 'demandConsistentWith'>`. No `src/` user yet; type tests
    show thread 13's `Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>`
    narrowing on `lifecycle`, and a `Vault` passing as `ConsistencyWith<VaultScope>`.
  - **EpochMillis** moved to `checks/primitives.ts` (plain Zod, as `label`), its sentences to
    phrases.ts, and joined the kit as `epochMillis`; the records use the kit's name. `FarFuture`,
    `FarPast`, `ForeverMillis`, `MinuteMillis` moved to `consts.ts` (primitives cannot import
    types/types.ts without a cycle). Their tests moved path for path (`tests/consts.test.ts`,
    `tests/checks/primitives.test.ts`).
  - **Brands are had by a parse, never a cast**, in `src/`: `mintedPassphraseHeader`
    (`salt_b64.parse(toB64(...))`), `mintedPasskeyHeader`, `wrappedWith`, `tryCipheredWith` and
    `sealLeaseRecord` parse what they mint. `passphraseKeyOf` takes a `PassphraseCleartext`;
    `PassphraseProving.seal` parses (replacing its `typeof` check), and the gating's `checkText`
    uses the same validator.
  - Exported from the index: every new type (aliases, brands, facets). No new value export.

* **Decisions taken**:
  - **Brands stop at the proving layer for the cleartext.** `PassphraseProving.seal` and the
    gating chains still take `string`: branding them would cast at ~60 test sites. The brand
    starts where the passphrase meets the key deriver (`passphraseKeyOf`,
    `checkedPassphraseHeader`). A host's `KeyDeriver.deriveKeyBytes` and strength checker take
    `string`, unchanged.
  - **A salt's record check stays non-empty text**, not base64url: a garbled salt in the record
    would make the whole vault damaged, losing the other wayin. Its length (and base64url-ness)
    stays judged per wayin.
  - **Tokens are plain** (an adapter handles them), but have validators now: the linter's
    `sonarjs/redundant-type-aliases` refuses `type VaultTok = string`, so every alias is
    `Z.infer` of a validator. The token validators live in type-aliases.ts, not the kit:
    `index.test.ts` holds every `checks/primitives.ts` export public, and a host never checks a
    token.
  - **Tests**: planted damage is `as never` (the precedent in types.test.ts); valid fixtures parse
    (`salt_b64.parse(...)`); `TH.fakeCiphered` returns `FakeCiphered`, the four ciphered brands
    intersected, since a fake opens in no role (one cast inside it).
  - `DamagedVaultRecord`: **left to its first user**, thread 10's `VaultReadResponse` (thread 8
    names `VaultRecord`, which it aliases). Nothing today returns an outcome that overlaps another.

* **Deviations**: the plan said "a plain alias" for labels and times; the linter refuses
  `= string`, so each is `Z.infer` of its validator (same type). Flagged as a lint-versus-prose
  question below.

* **Discoveries**:
  - **Zod's brand is output-only** (`.brand()` returns the same schema; `Dir` defaults to `"out"`),
    so `Z.input<typeof boxRecord>` is unbranded. Thread 10, typing the adapters' halves "as what
    belongs there", should type what an adapter returns as the record's *input* type: a host's
    adapter builds records from rows and would otherwise cast. Convex's type test now compares
    its `BoxRecord` with the core's input type for this reason.
  - The modules split gave no size win to earn a boundary: every line that imports a record
    imports all the brands anyway. **Size** (brotlied): `everything` 61.10 → 61.21 kB, `Bank`
    53.63 → 53.82, `idbDeviceDB` 28.09 → 28.23, `browserOpts` 33.74 → 33.88, `mask` 25.21 →
    25.32, `argon2idWasmDeriver` 34.76 → 34.83: the new Validator call (eight schemas), the
    phrases, and the mint-site parses. No line crossed or moved under the rule; nothing written.
  - `notes/security.md` records the brands (a sonnet subagent wrote it).
  - Threads 5 and 8: import the aliases from `src/types/type-aliases.ts`; records take
    `vault_tok`, `revision_tok`, the salts and wraps by name from there, `epochMillis` from the kit.

* **For the Coach**:
  - **Lint versus NEWSTYLE §3**: `sonarjs/redundant-type-aliases` forbids the plain aliases the
    guidance asks for. `Z.infer` of the validator satisfies both; recommend keeping the rule.
  - **Facets exported unused**: `Lifecycled`, `Refused`, `ConsistencyWith` are public types with no
    public user until threads 11 and 13. Two-way door; recommend keeping them exported.
