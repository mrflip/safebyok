# Thread 1: core_for_react (2026-11-07)

Branch `20261107-core_for_react`, PR (see below), cut from main (495cc5d6e). Justify: see PR.

* **Built**: re-exports in `packages/safebyok/src/index.ts` (file's grouping kept), tests in `packages/safebyok/tests/index.test.ts`, changeset `.changeset/20261107-core_for_react.md` (minor, additive).
  * Values: `correctablekindVals`, `PasskeySaltBytes`, `PrfAnswerBytes`, `MinuteMillis`, `HostErrorSanitizer` (the module as a namespace, as its own header says to import it).
  * Types: `Gatingkind`, `LockState`, `Wayinkind`, `Damagekind` (shapes-enums); `BankStage`; `DamagedBox`, `BoxSparse` (shapes-storage); `WayinHeader`, `PasskeyWayinHeader`, `PassphraseWayinHeader`, `PasskeyAnswer` (shapes-gateish).
* **Decisions taken**:
  * Correctable kinds: exported `correctablekindVals`, not an `isCorrectable(err)`. The core's `isCorrectable` is a private const in `models/gating.ts` (the shapes/models of the in-flight devicedb_idb line); exporting it would touch a model file, while the vals touch none. Cost: a consumer writes `(correctablekindVals as readonly string[]).includes(err.refusalkind)`; no `Correctablekind` type exists to export, and adding one would mean editing `shapes-enums.ts`. A later thread may add `isCorrectable` beside `isVaultError` once the line merges.
  * The passkey wayin header type is `WayinHeader` (`gating.passkeyHeader: WayinHeader | null`); `PasskeyWayinHeader` and `PassphraseWayinHeader` come with it as its members.
  * `PrfAnswerBytes` lives in `shapes-gateish.ts` (not `consts.ts`) and is exported with `PasskeySaltBytes`; both are 32 today.
  * `HostErrorSanitizer.refusalFor` is exactly what an error boundary needs: `(foreign, kind, message) => VaultError`, reading nothing of `foreign`. Exported whole as `HostErrorSanitizer`, the form its doc block already promises (`import { HostErrorSanitizer } from 'safebyok'`), which the index had not yet honoured.
  * Generous extras: `Wayinkind`, `Damagekind`, `BoxSparse`, `PasskeyAnswer`, the two member headers, since exported signatures (or `DamagedBox`, `PasskeyAnswer`) name them.
* **Deviations**: none; no core file touched beyond `src/index.ts`.
