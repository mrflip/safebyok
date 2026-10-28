# Thread 2: The Validator factory and scope checks (2026-10-26)

Branch `20261026-validator`, PR [#273](https://github.com/mrflip/safebyok/pull/273), stacked on
#267. Justify: green at every commit (core 3122 passed, 37 skipped; every package green).

* **Built**:
  - `src/checks/validator.ts`: `Validator(kind, build, sources?)` and its `Kit`, after
    `good/checks/validator.ts`, plus `meta.fieldnames` on each refusal (the paths it names, up to
    eight), Zod's English passed per parse (a host's `z.config` error map, which could quote the
    input, never shapes a message), and no `cause`.
  - `src/checks/primitives.ts` (`label`, `user_id`, `LabelPattern`, `MaxLabelChars`,
    `UserIdPattern`, `MaxUserIdChars`), `src/checks/core-checks.ts` (`bankScope`, `vaultScope`,
    `boxscope`, each `.readonly()`, the three scopepath tuples and the `*ScopepathFieldnameVals`,
    all refusing `bad_scope`), `src/phrases.ts`, `src/consts.ts`. Tests in `tests/checks/` and
    `tests/phrases.test.ts`.
  - `bad_scope` replaces `bad_label` everywhere. The `validators` option, `src/validators.ts`, the
    `safebyok/validators` entry, `NameFloor`, `checkValidators` and the rest are gone; `names.ts`
    keeps only `sameScope`. `BankProvider` refuses a `validators` prop as any unknown option.
  - Classic `zod` `^4.6.7` is the peer in the core and safebyok-indexeddb (the Coach's ruling, the
    2026-10-25 restyle session). The core's lint lets `src/` import `zod`; every package's lint
    comment says classic's cost is its size (NEWSTYLE §10), not tree-shaking.
  - README *Names* is the preplan's paragraph; VAULTDB.md *Names*, VOCABULARY, the adapters'
    READMEs and `notes/security.md` (an entry and an amendment) follow.
* **Where each check went** (no check removed): `Names.checkScope` → `CX.vaultScope.parse` in
  bank.ts, vault-opts.ts, del-damaged-vault.ts and vault-db.ts (`heldScope`). `Names.check` /
  `checkFloor` of a boxlabel → `CX.boxscope.parse` (vault.ts `#checkedBoxlabel`, vault-db.ts
  `heldBoxlabel`), and one-field `bad_scope` validators for Bank.make's applabel (`bankApplabel`)
  and Box.seal (`sealBoxlabel`). `NameFloor` in the record schemas (types.ts, box.ts) and the
  listing's `isNameable` → `label` / `user_id`. Every floor rule (no `^`, no control character,
  NFC, 1 KiB) is implied by them; `maxNameBytes` still holds.
* **Decisions taken**:
  - `phrases.ts` and `consts.ts` sit at the top of `src/`, not in `utils/`, which would sit beside
    `src/utils.ts`, the `safebyok/utils` entry.
  - The main entry exports `label`, `user_id` and their bounds; the scope validators stay
    internal until threads 5 and 8 settle `Scopepath` and `VaultScope`.
  - The `safebyok/validators` entry goes rather than re-pointing at the primitives: classic Zod is
    most of any import of them.
  - types.ts keeps its zod/mini `VaultScope` schema and type (now with classic `label`/`user_id`
    fields, which compose); `CX.VaultScope` is the readonly type of the new validator. Making
    types.ts's type the readonly one broke the Convex type test; thread 8 unifies them.
* **Deviations**:
  - The `Kit` has no `zod` (NEWSTYLE §2 lists it): holding the namespace object kept every locale
    Zod ships, 49 kB brotlied on `everything`. A maker the kit lacks is a named import beside the
    call. The kit gains `custom` and `lazy` (src/ uses `Z.custom` 28 times, `Z.lazy` once); null
    is `lit(null)`, strict and loose objects are `.strict()` / `.loose()`.
  - The good/ example built a record by `boxscope.extend(...)` from `sources`; the scopes are
    `.readonly()` here, which has no `extend`, so a record builds from the kit's names and slices
    its scope with `pick(...).strip()`, as the preplan's `vaultRecord` does.
* **Discoveries**:
  - A schema made from a wrapped validator outside a `Validator` call (`pick`, `omit`, `extend`,
    `.strict()`, `.optional()`) is plain Zod: its `parse` throws a ZodError (tested; the doc block
    says so). Made inside a call, each refuses the call's kind. A validator nested in another
    refuses with the outer call's kind.
  - Strict names make the vault's name-weight refusals unreachable: the longest names fit in
    `BoxFieldsBytes`, so `#checkRoomFor`'s byte branch and the names' share of `box_too_large`
    no longer trigger from a vault. The code stays; the three tests that drove it with kibibyte
    names became one test at the longest legal names.
  - A box row stored under a non-label name (once allowed by a host's validators) is skipped from
    listings and unreachable; `vault.del()` or `delDamagedVault` removes it. The changeset says so.
  - Size: `everything` 61.1 kB (budget 65), `Bank` 53.7 (57), `idbDeviceDB` 22.6 (26),
    `browserOpts` 28.3 (32): classic Zod rides in wherever a record schema holds a `label`. The
    rule also lowered three lines that had drifted (argon2idWebV1Deriver, BankProvider,
    reactEverything). Thread 3's removal of zod/mini should bring these down a little.
* **For thread 3**: the kit holds every maker src/ uses but `Z.core` types, `Z.locales`
  (options.ts's `InEnglish`), `Z.config` and `Z.pipe`/`Z.transform` (methods in classic). The
  one-field validators in vault-opts.ts and box.ts are interim.
* **For the Coach**: see the PR's *Open questions*. `.claude/agents/documentarian.md` still names
  `bad_label` in an example; left for a process PR.
