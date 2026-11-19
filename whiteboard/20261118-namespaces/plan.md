# namespaces: plan (2026-11-18)

Branch `20261118-namespaces`, worktree `../byok-namespaces`, cut from #728's tip (`3f37e63db`); its PR is stacked on
#728. Goal: what a caller reaches for comes in groups, so completions and auto-import stay short, and a check never
takes the name of the variable it fills (`const labelpath = ThingChecks.labelpath.parse(raw?.labelpath)`).

Already on the branch: VS Code's auto-import leaves out es-toolkit and zod subpaths and Node built-ins named without
`node:`; `tryGetBox` answers by `act`, its `GetBoxAnswer<VoidT = null>` shaped as `GetThingAnswer` is.

## 1. Checker bundles

Each shapes module exports its checks only through its bundle: never destructured, never as standalone names, one
public name per check. A bundle also carries the few constants and helpers a caller reaches for beside those checks:
enough to show that a bundle is the place for them, not everything.

* `ThingChecks` (shapes-thing): the kind-generic checks (`thingScope`, `thingCited`, `thingRecord`, `storedCited`,
  `labelpath`, `lifepath` and the rest), plus `ofLabelpath(labelpath)` (today's `kindChecksOf`), `byKind` (today's
  `KindChecks`), `ThingFormats` and `thingkindVals`.
* `BankChecks`, `GateChecks`, `BoxChecks` (shapes-thing): each kind's `record`, `cited`, `stored`, `policies` (today's
  `KindChecks` entry) and `labelpath`; for a gate, `wayins` and `storedWayins`; for a box, `sealable`, `live`
  (`boxRecord`) and `liveOrShell` (`boxRecordOrShell`). A kind's check is read through its kind's bundle.
* `AskChecks` (shapes-asks): stop destructuring `thingWatchScope`, `watchArgs`, `trackShape`; take in `loggableAsk`;
  carry `world`, the check of an answer's world, if the module has one or can compose one from checks it has.
* `StampChecks` (shapes-stamps): `bankScope`, `bankStamp`, `gateStamp`, `stampedGate`, `boxStamp`, `leaseStamp`,
  `leaseRecord`; carries `LeaseFormat`.
* `MinderChecks` (shapes-minder): `queryCacheOpts`, `tsqStaleTime`, `minderFriend`, `minderListener`, `minderScope`,
  `minderLabelpath`, `minderTryAtOpts`, `minderGetOpts`; carries `DefaultQueryCacheOpts`, `MaxTimerMillis`.
* `GateishChecks` (shapes-gateish): `gateRevisionedStamp`, `provingDevice`, `strengthChecker`; carries `gatingkindVals`.
* `BankishChecks` (shapes-bankish): `deviceRecord`.
* `adapterVaultDBOpts`: only adapter-vault-db.ts parses it, so it moves to that file's foot `Checks`; its type stays
  exported.

A host-facing constant a bundle carries (`DefaultQueryCacheOpts`, `gatingkindVals`) stays exported on its own too. The
private `Checks` at a model file's foot are unchanged. `safebyok/core` and `safebyok/storage` export the bundles in
place of the names they export today.

## 2. Lifeseq, Labelpath, Shell

Companion objects beside the type of the same name (the lint config accepts a const and a type sharing a name). The
Lifeseq and Labelpath helpers are plain string work, so they move into primitives.ts beside their types (with
`MaxLabelsUnder`, and `Thingkind` by type import); `Shell` stays in shapes-thing.

* `Lifeseq`: `ofLifenum`, `lifenumOf`, `isTombstone`, `ofLifepath`, `leadingOf` (today `lifeseqOfLifenum`,
  `lifenumOfLifeseq`, `isTombstoneLifeseq`, `lifeseqOfLifepath`, `leadingLifeseqsOf`).
* `Labelpath`: `kindOf`, `isOfKind`, `labelOf`, `parentOf`, `MainGate`, `RootBox` (today `modelkindOf`,
  `isLabelpathOfKind`, the private `labelOfLabelpath` and `parentpathOf`, `MainGateLabelpath`, `RootBoxLabelpath`).
* `Shell`: `of`, `Cited`, `childCited`, `VoidLifeseq`, `RootVoidLifepath`, `labelpathWithParentage`,
  `lifepathWithParentage` (the last two need `ThingChecks`, so they stay with the shell they build).

## 3. Classifier

thing-classifier.ts is imported as `import * as Classifier`; `safebyok/storage` exports `* as Classifier` in place of
its named list.

## 4. Throwers

refusals/throwers.ts re-exports by name each of big's throwers the new core calls, taken from big's `Throwers`
namespace (re-exported, never redefined). Every new-core file imports the one namespace,
`import * as Throwers from '../refusals/throwers'`, and none imports big's `Throwers`.

## Also

safebyok-react's and safebyok-postgres's callers, VOCABULARY.md's rows naming a moved function, doc-block links, and
one changeset saying which names a host sees go.

## Next threads (the Coach's go, 2026-11-18; each stacked on the one before)

`FooRecord` is a plain object's type, always and only; `Foo` is a class (VOCABULARY.md *Shapes*: a type's shapes
are `Foo` plus their purpose). The new core drifted from that; these threads bring it back.

**2. records** (mechanical). `Thing` (the union, a tagged union) becomes `ThingRecord`; `BankThing`, `GateThing`,
`BoxThing` become `BankRecord` (absorbing today's alias of that name), `GateRecord`, `BoxRecord`. Today's
`ThingRecord` (the fields every kind has) becomes `Sparse<ThingRecord>`, its check `ThingChecks.sparse`. A box is
uniform with a gate and a bank, so its box-only forms become the generic ones every kind has: today's `BoxRecord` (a
live box) becomes `LiveOf<BoxRecord>`, `BoxTombstone` becomes `TombstoneOf<BoxRecord>`, `BoxShell` becomes
`ShellOf<BoxRecord>` (new: `Sparse<TombstoneOf<RecordT>>`). `LiveOf` and `TombstoneOf` become intersections
(`RecordT & { am: 'x' }`): `Extract` gives `never` for a gate, whose `am` is one field typed `'a' | 'x'`.
Built (PR #744), with a follow-up: one `ThingFormat` (100501) for every kind, and a box tombstone carrying
`sidecar: {}`, so `LiveOf` and `TombstoneOf` are the plain intersection. `AnyThingRecord` moves to thread 3: every field of every kind, the shared ones as they are, the rest optional, each literal a union
(type-fest's `AllUnionFields<ThingRecord>`). Built with the helper, never `&`, which gives `never` where two kinds'
literals differ. `BoxStamp`, `ThingScope`,
`ThingCited` and `VoidSentinel` already follow the rule and stay. VOCABULARY.md follows.

**3. the Thing classes**:

```
BaseThing      base-thing.ts: the boring preimage. Statics: modelkind = null, the guards, cmp, haveSameScope,
│              sparseOf; and the declared Thing fields with their doc blocks.
└─ Thing       thing.ts: what matters. Construction, the record, pickle, scope, stamp (today's BaseThing).
   ├─ Gate     static modelkind = 'gate'
   ├─ Bank     static modelkind = 'bank'
   └─ BaseBox  static modelkind = 'box'; abstract; the box's record operations and its sealer (today's CoreBox)
── the line between safebyok/core and safebyok ──
      └─ Box
```

The guards (`isLive`, `isTombstone`, `isGone`, `isVoidSentinel`, `isWhole`, `isSparse`) read the kind from `this`:
`static isTombstone<KindT, ValT>(this: { readonly modelkind: KindT }, val: ValT): val is ValT & Sparse<OfKind<KindT>>
& { am: 'x' }`, checking `am` and the labelpath's first segment. So `Gate.isTombstone(mixed)` narrows a mixed record
to a gate tombstone, `Gate.isTombstone(aBox)` narrows to `never`, and `BaseThing.isTombstone` takes any kind.
`@typescript-eslint/unbound-method` is on and catches a guard passed detached (write `(rec) => Gate.isTombstone(rec)`);
a detached call throws rather than answering for the wrong kind. The guard's return type gets a name for hovers.
STYLE.md is updated where this practice contradicts it (the Coach's go-ahead, 2026-11-18). Report where narrowing
from a mixed record comes up in thing-car.ts and the minder. Plain JavaScript at runtime: classes, static methods and
static fields; the `this:` parameter, type predicates and conditional types are TypeScript only, and erase. No
accessors standing in for methods, no mixins, class expressions, proxies or decorators.

The name stays `modelkind` (the static, the instance getter, an ask's field), and `Thingkind` stays for the kinds of
Thing alone. To consider, not to build:
every model might come to extend `BaseThing`.

Also in thread 3: `AnyThingRecord` (type-fest's `AllUnionFields<ThingRecord>`; type-fest becomes a runtime dependency,
the Coach's yes 2026-11-18). Its minor findings from #744's review: `ShellOf` pins the void revision and `VoidSentinel`
becomes `ShellOf<ThingRecord>`, removing tryGetBox's casts.

**4. exports** (the Coach's yes to the survey, `exports-proposal.md`, 2026-11-18). `safebyok` exports all of
`safebyok/core` and `safebyok/storage`, plus the minder and big's re-exports; `safebyok/core` stays the subset without
the minder and TanStack; `safebyok/storage` the adapter's contract. The front-door test's prohibition of six names goes;
the Proving values stay off every entry. Big's re-exports the new core's consumers import from big today join the
entries. `safebyok/browser` re-exports what `safebyok-big/browser` exports. notes/security.md is not touched here.

**5. tombstone round trip.** A tombstone's sidecar is forced to `{}`, so by the round-trip rule a caller may give it:
the box record's check enforces an empty sidecar on a tombstone, and `CoreBox.tombstoneOf` loses its
`tombstoneSidecarGiven` throw and its spread, accepting `sidecar: {}` (and refusing any other, through the check).

**6. per-kind bundles** (the Coach's go): `BoxChecks`, `GateChecks`, `BankChecks` also carry their kind's stamp and ask
checks, from a module above shapes-thing, shapes-stamps and shapes-asks.

**The line, built and reviewed (2026-11-19)**: main -> #740 namespaces -> #744 records -> #747 classes -> #748 exports
-> #749 round trip -> #750 per-kind bundles; all ready, all green; merge #750 with a merge commit and the line lands.

**Held**: what *sparse* names (the Thing fields, any liveness; or live and not whole), for a session with the Coach on
a ladder of names.

## Out of scope

* (Thread 1.) The guards and `cmpThings`, `haveSameScope`, `sparseOf` stay standalone until thread 3.
* Renaming locals; behaviour; safebyok-big.
