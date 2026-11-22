# Thread 6: opts_checked (2026-11-22)

**The pattern, for thread 5** (`WithLockableWhisperOpts`): keep the hand-written host-facing type with its doc blocks, and
put an equality assertion on the line after its checker:

```ts
true satisfies AssertEqual<PutBoxActionOpts, Readonly<CheckerInput<typeof Checks.putBoxActionOpts>>>
```

`AssertEqual` and `CheckerInput` come from `safebyok` (re-exported through `safebyok/storage` by this thread). `Readonly<>`
matches the type's `Readonly<{…}>`; an array field's check needs `.readonly()` to match a `readonly string[]`.

Branch `20261122-opts_checked`, PR #835, stacked on #823. Proved: safebyok-react-lean lint, typecheck, test (19 files,
291 tests); safebyok lint and typecheck.

* **Built**:
  * `packages/safebyok/src/storage.ts` re-exports `type AssertEqual, type CheckerInput` from `safebyok-big/storage`.
  * `react-giver.tsx`: the assertion above, after `Checks`; `putBoxActionOpts`' `secretFieldnames` is
    `arr(str.min(1)).readonly().optional()`, so its input is `readonly string[]` as the type says.
  * `use-draft.ts`: `true satisfies AssertEqual<DraftPutOpts, Readonly<CheckerInput<typeof Checks.draftPutOpts>>>`.
  * `shapes-giver.ts`: `true satisfies AssertEqual<Omit<GiverConfig, keyof DeviceOpts>, Readonly<CheckerInput<typeof ConfigChecks.giverConfig>>>`,
    with a `//` line saying the device's options are left to `Device.make`. `react-giver.tsx`'s `GiverConfig` use is untouched.
  * Base-32: VOCABULARY.md's *lifeseq* row and the `Lifeseq` type's doc block (`packages/safebyok/src/shapes/primitives.ts`)
    say it is lowercase `0-9a-v`, as `toString(32)` writes it; the doc block adds "not RFC 4648's base32, nor Crockford's".
    `Lifeseq.ofLifenum`'s doc block drops its repeated `(0-9a-v)`. `rg -i 'base-?32' .` finds no README or guide; the
    refusal phrase (`LifeseqShape`) and the Postgres SQL comments already spell out `0-9 and a-v`, and are left.
* **Decisions made**:
  * **Assertion, not `Z.infer`.** STYLE.md *Shapes and duck typing*: a host-facing contract keeps a hand-written type with a
    doc block on each member, and an equality assertion beside its checker (big's `DeviceOpts`, safebyok-react's
    `BankProviderProps`). Deriving the type from the checker was set aside: the `.d.ts` is the product.
  * **Kept `Readonly<{…}>` aliases, not `interface`.** STYLE.md says interface; every host-facing type in these files is an
    alias, and converting three of them is a sweep of its own (and would widen thread 12's diff). Open matter.
  * **Checkers left as they parse** (Zod's default strip): a stray key is dropped today, and a strict check would refuse
    it, which changes what a host may pass. Open matter.
  * **`GiverConfig` ties only its own part.** Its check (`ConfigChecks.giverConfig`) reads `banks`; the device's options
    are checked by `Device.make` when the provider makes the device. Checking them in `reactGiver` would refuse a bad
    option at module load rather than at sign-in: a change a host sees. The core's checker of them is private to
    `device.ts`. Open matter.
* **Discoveries**:
  * Verified the assertions bite: making `DraftPutOpts.sidecarOf` required, or adding a field to `GiverConfig`'s own part,
    fails typecheck with `TS1360: Type 'true' does not satisfy the expected type 'false'`.
  * The lean core's own `DeviceOpts` (`shapes-bankish.ts`) has no assertion against `Device`'s `deviceMakeArgs.opts`
    check, as big's had. Out of this thread's scope.
* **For the Coach**: the three open matters in the PR body.
