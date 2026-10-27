# Thread 18: Convex validators from the core's Zod (2026-10-27)

Branch `20261027-convex_helpers`, PR #PRNUM, on main. Justify: green (core 3403 / 37 skipped,
convex 367 / 9 skipped, react 309, indexeddb 167, postgres 322, graphql 344, fastkey 49, demo 229,
e2e 107, root 266; every size budget within its limit, none moved: no budget measures
safebyok-convex).

A follow-up after the sprint closed, from the Coach's "yes" (flipped to proceed) on "Convex's
validators from the core's Zod".

* **Built**:
  * **`convex-helpers` is a peer of safebyok-convex** (`^0.1.128`), and a dev dependency of it and
    of `e2e`. **`zod` is a peer too** (`^4.6.7`, the core's own peer range): see Deviations.
  * **`src/component/validators.ts`**: every record, expectation and summary the core has is now
    `zodToConvex(Validators.X)` (from `convex-helpers/server/zod4`), imported through the core's
    public `Validators` namespace only: `Ciphered`, `VaultScope`, `Boxscope` (new, from
    `boxscope`), `Gate` (`GateRecord`), `VaultRecord`, `NovelVaultRecord` (`VaultDraft`),
    `BoxRecord`, `BoxSparse`, `VaultTombstone`, `Capacity`, and the six expectations and
    `BoxDeletion`. The component's own answer envelopes (`VaultAnswer`, `GetBoxAnswer`,
    `PutBoxAnswer`, `PutVaultRecordAnswer`, `VaultSignature`) have no core counterpart and stay
    `v.*` compositions around the derived records. The format, wayin and `Room` validators are gone
    (nothing used them alone).
  * `getBox` and `delBox` take `...Boxscope.fields` where they took `boxlabel: v.string()`.
  * **The parity test** (`tests/component/validators.test.ts`) holds 16 derived validators to the
    core's, field for field, and keeps the probe cases (both accept / both refuse / Zod refuses,
    Convex accepts), now with the sidecar cases and a new `Capacity` table (Infinity included).
  * README: install line and peers; the developing section says how the validators are made.
  * `notes/security.md`: the 2026-10-15 entry on structural checks amended (sonnet subagent).
* **Where Convex is looser than the core** (all listed in the test):
  * names (`label`, `user_id`: pattern, length) and tokens (`str.min(1)`): any text;
  * epochs and counts (`EpochMillis`, `uint`, `int.positive`): any number;
  * `VaultRecord`'s refinement tying a null `gate` to `gate_epoch` 0: dropped;
  * `sidecar` (the core's `custom` check of a plain JSON object): `v.any()`, where the hand-written
    one was `v.record(v.string(), v.any())`, so null, an array or text now pass Convex. **New
    loosening**; the rest were already loose by hand.
  * `Capacity.max` (a `pipe` of `int.positive() | Infinity`): `v.number() | v.literal(Infinity)`.
  * No `lazy` is converted: the core's only `lazy` (whisper JSON) sits inside the sidecar's custom
    predicate. Nothing failed to convert.
  * Stricter than the core, as before: Convex objects refuse fields the core's expectations strip.
* **Decisions taken**:
  * **`BoxRecord` and `BoxSparse` convert field by field** (`v.object(zodToConvexFields(X.shape))`):
    converted whole, their Convex type is the core's inferred type, whose recursive sidecar JSON
    type is too deep for Convex's document types (TS2589 in `_generated/dataModel.ts`). Same
    runtime validator.
  * **Peer, not runtime dependency**: the component already imports `safebyok` and `convex`, both
    peers, which the host's Convex CLI resolves from the host's `node_modules` at deploy.
* **Deviations**:
  * **`zod` declared a peer of safebyok-convex.** The derived types carry the core's brand on
    `salt_b64` and `prf_salt_b64`, so the emitted `.d.ts` imports `$brand` from `zod/v4/core`;
    as a mere dev dependency tsdown inlined a private copy of zod's `core.d.ts` into `dist/` (a
    different `$brand` symbol). A host already has zod, as the core's peer.
  * **`import type { $brand } from 'zod/v4/core'` in four files** (`validators.ts`, `schema.ts`,
    `vaults.ts`, `server.ts`), each with `// eslint-disable-line @typescript-eslint/no-unused-vars`
    and a `{@link $brand}` in a doc block. TypeScript's declaration emit cannot name `$brand`
    (TS4023: it lives in `zod/v4/core/core`, no exported path) unless each file binds it; the doc
    link is what makes `noUnusedLocals` count it. Four suppressions.
  * **`erasableSyntaxOnly: false`** in `packages/safebyok-convex/tsconfig.json` and
    `e2e/tsconfig.json`, an interim loosening: convex-helpers 0.1.128 ships its `.ts` sources,
    TypeScript checks them, and one class uses parameter properties. 0.1.129 ships none but is six
    days old (published 2026-10-21T23:13Z; passes `minimumReleaseAge` 2026-10-28T23:13Z). A
    follow-up raises both floors to `^0.1.129` and deletes the two overrides.
* **Discoveries**:
  * The matter's premise "the component still runs the core's write checks" is not so: the
    component runs no core parse. The client's VaultDB checks every record on every write and read,
    and a box whose sidecar fails reads back damaged. The new sidecar loosening lets a client
    damage its own user's box, which it could already do with ciphertext.
  * No committed esbuild bundle check of `dist/component/` exists in the repo. I ran one by hand
    (esbuild 0.27.0, Convex's settings: browser, ESM, `convex`/`module` conditions): it bundles.
    Against main the bundle grows ~34 kB unminified (convex-helpers 7 kB, the core's validators
    15 kB, zod 13 kB; zod was already 566 kB of it).
  * An install of the packed tarballs into a scratch pnpm host (to test peer resolution at deploy)
    was refused by the session's permission classifier; not run.
  * `Capacity`'s `v.literal(Infinity)` serializes as `{ $float: ... }` in the validator JSON;
    convex-test accepts it, a real deployment is untested.
* **For the Coach**:
  * The brand import hack, or strip the brands from the Convex types (needs a type-level mapper,
    machinery), or brand the core's salts differently. Rec: keep, until it bothers.
  * The sidecar loosening: keep `v.any()`, or override that one field with
    `v.record(v.string(), v.any())`. Rec: keep (the core judges it on every read).
