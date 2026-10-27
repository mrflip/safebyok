# Thread 20: validator case (2026-10-27)

Branch `20261027-validator_case`, PR #TBD, stacked on #307 (on #301). Justify: see the PR's
**Tests:** line.

The Coach's ruling: "unless it causes problems for the validator to be lowCamelCase and the type
to be ModuleCase, it makes it less confusing: import { fooThing, fooThingVals, type FooThing }".

* **Built**: every Zod validator the core makes that was ModuleCase is lowerCamelCase, its type
  keeping its ModuleCase name: the 30 shapes the public surface exports (`boxSparse`,
  `vaultRecord`, `epochMillis`, ...), and 15 internal ones (`vaultKin`, `leaseGrant`,
  `listedBox`, `readAnswer`, `baseShape`, ...). The index exports each value beside its type on a
  separate `export type` line; `Validators` holds values only. The 12 `*Vals` lists are
  lowerCamelCase too (`wayinKindVals`, `refusalKindVals`, convex's `safebyokErrorKindVals`).
  Every caller follows: core src and tests, the adapters and their tests, the demo, @examples,
  section banners, `describe` titles naming a validator, the READMEs, `notes/security.md` (through
  a sonnet subagent, per its header). STYLE.md's *Naming* rule is reversed to the ruling, with the
  Coach's import line. A changeset (minor, safebyok and safebyok-convex) lists every rename
  old -> new.
* **How**: a TypeScript-checker script renamed value positions only, by symbol, so types and
  safebyok-convex's own Convex validators of the same names were untouched; then tsc found each
  collision.
* **Collisions, each solved** (none needed a block):
  * `VaultScope`, a second export of `vaultScope`: dropped; the main entry exports `vaultScope`.
  * `Scopepath.bankScope` / `vaultScope` / `boxscope` (scope from a scopepath) would have sat
    beside the top-level `vaultScope` validator: renamed `bankScopeOf`, `vaultScopeOf`,
    `boxscopeOf`, STYLE's `fooOf` for "the foo derived from".
  * Locals and parameters that took a validator's name, renamed for what they are:
    `checkedWhisper(candidate)`, `checkedSidecar(candidate)` (box.ts); `boxCtxOf(vaultStamp,
    ownStamp, purpose)` (lease.ts); `putVaultRecord(record, expected)`, `fullChecked`'s `said`,
    `checkVaultRecord`'s `record` (vault-db.ts); the stamp duck's local `vaultAlone` (ducks.ts).
  * Tests whose fixtures share a validator's name (`vaultStamp`, `boxStamp`, `leaseStamp`,
    `vaultRecord` in ctx-bytes and wayin tests) keep the fixture and reach the validator as
    `Validators.vaultRecord`; two locals renamed instead (`record`, `given`).
* **Decisions taken**:
  * `*Vals` lists renamed: the ruling's import line names `fooThingVals`. Its own commit
    (`adcaa03f`), so it reverts alone if the Coach meant validators only.
  * Mechanical lowerFirst everywhere, so a host's find-and-replace is predictable:
    `WayinKindVals` -> `wayinKindVals`, beside the checker `wayinkind` (named for its stored field)
    and the type `WayinKind`.
  * `Validators` no longer carries types (`Validators.BoxRecord` as a type is gone): it is a
    namespace of validators, and every type is at the main entry by name.
  * Section banners and `describe` titles that named a validator now name it in lowerCamelCase.
* **Borderline, judged**:
  * safebyok-convex's Convex validators (`v.object`, `VaultRecord`, `BoxSparse`, ...): not Zod,
    and thread 18 rewrites them; left ModuleCase. See *For the Coach*.
  * `GateChecks` in validator.test.ts, a module of validators (a namespace), keeps ModuleCase.
  * `Phrases.*Shape` strings, format strings, `RefusalFamilyForKind` (a lookup table),
    `Argon2idWebV1` (a spec constant): not schemas, unchanged.
* **Deviations**: the commits go by area (core src, core tests, adapters, demo, the `Vals`
  lists, docs, changeset); a rename across the surface is red until its callers follow, so only
  the tip is justified green, not each commit.
* **Discoveries**:
  * The silent hazard is a local renamed by hand: types.test.ts's `sidecar.tags` went on reading
    the validator after the local was renamed, and passed vacuously; fixed (`given.tags`). A
    checker scan for locals sharing a validator's name in files using it found no other.
  * A host meets the same collision: `const vaultRecord = vaultRecord.parse(row)` is a TDZ error.
    STYLE.md now says to name the local for what it is, or go through `Validators`.
  * One React dialog test (`bank-provider-dialog`, "a dialog that meets misuse...") failed once
    under the full justify load and passes alone: a timing flake, untouched by this thread.
* **Look-ahead**: thread 18 (convex_helpers) derives Convex validators from the core's by their
  current names. Whichever merges second takes the rename: if #18 lands first, its derivations
  need the new names (`vaultRecord`, `boxSparse`, ...).
* **For the Coach**:
  * Should safebyok-convex's own Convex validators (`VaultRecord`, `BoxRecord`, `Gate`, ...)
    follow the ruling too? Recommend yes, folded into #18 or after it, since #18 rewrites them.
  * The `*Vals` rename: confirm it was meant (recommend keep).
  * `Scopepath.*ScopeOf`: a rename beyond the validators, to clear the name; confirm.
