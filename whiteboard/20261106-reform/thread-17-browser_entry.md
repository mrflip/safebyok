# Thread 17: browser_entry (2026-11-06)

Branch `20261106-browser_entry`, PR #531, stacked on #529. Justify: green (core 1855 tests, 3 new in `tests/browser.test.ts`; every package passing; size budgets met; attw and publint clean in the build).

* **Built**: the new core's `safebyok/browser` entry. `packages/safebyok/src/browser.ts` re-exports `argon2idDeriver` and `argon2idWebV1Deriver` from `src/deriver/argon2id-webv1.ts`, and the types `KeyDeriver`, `Argon2idKeyDeriver` and `KeyDeriverSpec` (types a deriver's signature names). Wired as #529 wired `./utils`: `exports["./browser"]` (`@safebyok/source`, `import`, `require`), `typesVersions`, `publishConfig.exports`, and `src/browser.ts` in the tsdown entry list. `src/index.ts` and `deriver/*.ts` are untouched; neither deriver is on the front door (a test asserts it). Changeset `minor`.
* **Decisions taken**:
  - No `browserOpts` bag and no strength checker. The new core has no zxcvbn checker (`passphrase-strength.ts` only mentions `browserOpts()` in a doc block, about the old design), and the `deviceDB` the old bag held is the IndexedDB adapter, a package on the old core. The pieces that exist are exported alone.
  - `TestDeriverNotice` (`helpers/phrases.ts`) now says `argon2idWebV1Deriver (from safebyok/browser)`; it named no path before.
  - `CUSTOMIZATION.md`'s one import line for `argon2idWebV1Deriver` now reads `from 'safebyok/browser'` (the file otherwise still describes the old design's `browserOpts()`; left alone).
  - The test derives with the real `argon2idWebV1Deriver` once (length 32, label) and checks determinism with a cheap spec (8 KiB, one pass) through `argon2idDeriver`, so the suite stays fast.
* **Discoveries**: the Coach's question, whether the split moved the deriver: the old core exported `argon2idWebV1Deriver` from `safebyok` as well as bundling it into `safebyok/browser`; the new core's `index.ts` exports neither. The changeset's "prefer the WebAssembly one" points at `safebyok-fastkey`.
* **For the Coach**: whether `README`/`CUSTOMIZATION.md` should describe a `browserOpts`-less browser story for the new core is a docs thread's to take; not done here.
