# Thread: type aliases in safebyok-big (2026-11-17)

Branch `20261117-type_aliases_big`, PR #720, cut from origin/main (193708df9), outside any sprint. The adapters and `safebyok-react` follow in a later thread stacked on this one. Proved: `pnpm --filter safebyok-big typecheck`, `lint` and `test` (3025 passed) before `pnpm justify` (see the PR for that run).

* **Built**: `packages/safebyok-big/src/helpers/aliases.ts`, plain aliases with a one-line doc block each: `UserID`, `Banklabel`, `Vaultlabel`, `Boxlabel`, `BankTok`, `GateTok`, `VaultTok`, `BoxTok`, `RevisionTok`, `DeviceTok`, `RevisionSeq` (number), `KeyDeriverLabel`, `EpochMillis` (number). Exported as types from `src/index.ts` and, flat, from `src/internals.ts`. `EpochMillis` moved there from `shapes/primitives.ts` (which re-exports it) and is now `number`, no longer `Z.infer<typeof epochMillis>`.
  Used in field declarations of the model classes, record, snapshot and ask shapes, bank-classifier, memory-bank-db (`Map<Boxlabel, ...>`, `Map<Vaultlabel, ...>`), `nowMillis` and the clock, the `Phrases` and throwers' label parameters, and the test helpers (worlds, batteries, builders).
* **`as const satisfies`**: `ActOnBank` (gating.ts), `BuildPolicies` and `GatePolicies` (bank-classifier.ts), and the tests' `Centrals` (storable-receiving.test.ts). Already so: `throwers`, `errors`, `listing`, `policies`, `PurposeForWayinkind`, `bank-db`.
* **Decisions made**
  * The aliases live in `src/helpers/`, not `src/shapes/`: `validator.test.ts` requires every file in `src/shapes/` to be a module of checkers, and this one holds none.
  * `gate_revision_tok` is a `RevisionTok`, as VOCABULARY.md defines it ("the `revision_tok` of the gate row"), not a type of its own.
  * Test constant `DeviceTok` (proving-world) became `WorldDeviceTok`, since the alias took the name; a value and a type of one name cannot share an import.
  * Left `tests/index.test.ts` and `validator.test.ts:305` spelling `string`: they assert the public shape literally.
* **Rejected**: `Gatelabel` (always the literal `main`, a lit already), `Wayinlabel` (a literal union, one declaration), `GatingTok` (two sites, one module), `credential_id`, the `salt_b64` family (branded already), `lifeTok` parameters (any of four tokens), the `*Vals` arrays (they define the union they would satisfy), `WhisperFieldAttributes` (no known key set), `Map<string, ...>` keyed by a ckey, and durations (`maxMillis`, `leaseMillis`), which are not instants.
* **Deviations**: none beyond the above. No runtime change, no validator change; `notes/guarantees-big.md` untouched (type-only).
* **For the Coach**: the plain aliases check nothing, so `Vaultlabel` and `Boxlabel` still trade places silently; only the validators judge. A brand would change that, and would break hosts writing a string.
