# Thread 1: argon2_wasm (2026-10-15)

Branch `20261015-argon2_wasm`, PR #74, stacked on #68 (kdf_configs). Justify: green --
root 105, core 756, argon2-wasm 44, convex 265, react 28, demo 61. `pnpm size` within every budget.

* **Built**: `packages/safebyok-fastkey/`, a new public package (version 0.0.0, the
  placeholder; in the `fixed` group). `argon2idWasmDeriver(spec)` and `argon2idWasmWebV1Deriver`
  (`src/wasm-deriver.ts`) run Argon2id through `hash-wasm` 4.12.0 (the current release, 2024-11;
  MIT, no dependencies). `safebyok` is a peer. Each spreads its spec, as the core's derivers do.
  The core now exports `parseKeyDeriverSpec`, which the wasm factory calls. README, changeset,
  a `notes/security.md` entry, two `.size-limit.json` budgets.
* **The heart, the byte-for-byte tests** (`tests/wasm-deriver.test.ts`): the supplied spec against
  `argon2idWebV1Deriver`; Argon2id's reference vector (phc-winner-argon2 test.c: t=2, 64 MiB, p=1,
  "password"/"somesalt" -> `09316115...`), through *both* derivers; eleven cheap specs against
  `argon2idDeriver` (memory not divisible into lane segments, 2 to 8 lanes, 8- and 65536-byte
  salts, non-ASCII and long passphrases); and a vault made on each opening on the other. A
  mutation (one extra pass) fails 15 of them.
* **Timing, Node 24 here**: at `argon2id_web_v1`, about 130 ms through WebAssembly vs 580 ms
  through noble; at 1 GiB with a 64 KiB salt, 0.9 s vs 3.0 s (and the bytes match).

## Decisions taken

* **The core's spec parser was not exported, so I exported it** (`parseKeyDeriverSpec`, in
  `key-deriver.ts`, with a doc block and tests), rather than copy its bounds or call
  `argon2idDeriver` and throw its noble function away. Its refusal now begins "Argon2id cannot
  run that keyDeriverSpec" instead of naming `argon2idDeriver`, so it reads right from either
  factory. It stays in `key-deriver.ts`: a bundle of it alone carries no noble (a new test in
  `tests/index.test.ts`, and the wasm package's size budget, show it).
* **hash-wasm's own limits are no narrower than the core's**: salt >= 8, memory >= 8 KiB a lane,
  and under 4 GiB (wasm32; 1 GiB was run and matches). Iteration counts past 2^31 run (hang) as
  noble's do, with no signed wrap. So no extra bound.
* **Failures**: no `WebAssembly` -> `bad_option` (Hermes); a `WebAssembly.CompileError` (the CSP
  case, per the wasm CSP proposal) -> `bad_option` with the error as `cause`; anything else (out of
  memory) passes through as raised, as noble's do. An empty passphrase -> `wrong_passphrase`, since
  hash-wasm throws a plain Error where noble derives; openVault never hands one over.
* **Size budgets**: `argon2idWasmWebV1Deriver` 9.38 kB (limit 10), `argon2idWasmDeriver` 15.06
  kB (16, zod/mini for the parser). The root's `size` script now builds this package too.

## Deviations

* The core changed (one export, one message, a README bullet), outside the plan's *Touches*.
* `CLAUDE.md`'s *Layout* now names the package and its `pnpm size` line says "built packages",
  so the file stays true. A comment edit to `.github/workflows/ci.yml` was dropped at the
  orchestrator's word; its comment still says the budget is "each way of importing the core".

## Discoveries

* hash-wasm's Argon2 is C after Go's `x/crypto/argon2`, compiled to wasm and embedded as base64:
  no fetch, but no published audit (noble has one). Noted in `notes/security.md`.
* Its derivation is one synchronous wasm call: it holds the thread for its ~130 ms, where noble
  yields. The README says so.
* A test that re-imports the module after `vi.resetModules()` gets a fresh `safebyok`, whose
  `VaultError` is another class: check with the fresh core's `isVaultError`.

## The review

The thread-reviewer committed four fixes: a lone-surrogate passphrase among the byte-for-byte
cases (8e21f67), Buffer's hex encoder in the test (313391b), `tests/index.test.ts` pinning the
package's exports (a8c814e), and a security note that hash-wasm never zeroes its working memory
(3f0a30a). Its minor findings, left open: the 1 GiB refusal still names `@noble/hashes`;
`parseKeyDeriverSpec` takes a `KeyDeriverSpec`, not `unknown`; hash-wasm caches a failed compile,
and older Safari may need `'unsafe-eval'`; `pnpm size` builds the core twice; `refusalOf` is
duplicated between the core's tests and this package's.

## For the Coach (also PR #74's open questions)

* Confirm the new core export `parseKeyDeriverSpec` (public surface, minor).
* hash-wasm has no published audit; it is the dependency you named. Worth a look by a security
  reviewer.
* Open: whether `deriveKeyBytes` should also refuse a salt whose length differs from the spec's
  (a corrupt stored salt reaches hash-wasm as a plain Error, as it reaches noble today).
