# Closer Look

Copied as text from the doc's *Closer Look* tab (https://claude.ai/artifact/NJ79cHNaiWKs2MNcRPegmD) on 2026-11-27, headings and findings as they stood. The Coach had answered no finding in the tab (no highlighted reply, no comment thread) at the time of the copy, so every finding below, E1 to E10, still awaits him.

A cold read of the filed line, threads 1–3, at `517463cf4` (main was `0a860f282`): the new core's vaultDB layer, the memory datastore, IndexedDB, and `notes/vault-adapter-contract.md`. Not read: Postgres (thread 4, #940) and Convex (thread 5, #941), still in review. The reader knew your rulings, so they are not reported as discoveries; it ran throwaway probes against copies of both trees. Flavours: guidance gap, guidance wrong, solution off, redesign?, can't tell. Reply beside any item, as highlighted text.

## 1. Eyebrows, ranked

### E1. A write under a storage policy now lands over a gate whose wayins fail their checks; before, it refused `damaged_row`

- **Where.** `manifest-tags.ts:96`: `const message = GatePolicies[policy](ask, anteWayinsOf(ante))` and `policies.ts:29`: `if (ante['passkey0'] === null) { return BigPhrases.NoPasskeyStored }`. The policies now run in the datastore over the raw ante row (`AnteWayins = Record<string, unknown>`); before, the wayins went through `storedWayinsChecker.parse(raw)` first.
- **Probe.** A gate whose `passkey0` is the string `'garbage'` (or `{}`), then `revoke_passkey` citing it exactly. Old: refused `damaged_row`, row left. New: `ok: true, act: 'replaced'`, row overwritten: `ante['passkey0'] !== null` reads garbage as "a passkey stored". Without a policy, old and new both overwrite such a gate.
- **The general shape.** On a written write nothing ever checks the ante row against its kind. The only guards against overwriting an incompatible row are the predicate's equality clauses (fmt, lifeseq, revision pins, born_at, lifetok); the contract admits "the tags see … not `fmt` or `lifeseq`, so the loss of one of those goes uncaught". Nothing in `notes/wontfix.md` records this loosening.
- **Origin.** Drawn ("a datastore reads no check"); the behaviour change is new this sprint.
- **Cost.** A security reviewer reasons about guardrails over unchecked input, and trusts two clauses three-way cannot see.
- **Flavour.** Guidance gap: the draft never says whether a write may land over an incompatible ante row.
- **Settles it.** A ruling: is "a write over an incompatible row refuses" a guarantee of the new core? If yes, the write manifest needs something about the ante row; if no, a wontfix row.

### E2. The answer is built from tags not yet checked against the row; a listing whose tags lie answers `storage_unavailable`

- **Where.** `manifest-acts.ts:323`: `` const lifepathUnder = `${parent.lifepath}/` `` runs before `three-way.ts:43`: `if (! isEqual(ManifestTags.getTagsOf(manifest.actual), manifest.tags)) { throw Throwers.tagsOfOtherRow() }`. `scribe*Act` narrows by assertion (`ScribedListManifest` promises `actual: ThingRecord`); the check that the tags fit the row comes after `*AnswerOf` has used that type.
- **Probe.** `tags: { presence: 'live' }, actual: null` crashes `listAnswerOf` on `parent.lifepath`, answering "could not be reached…try again shortly", where the contract promises `storage_issue`. The same lie on a get survives to three-way and refuses correctly. Birth's `actual: BankRoots` is established by a throw in `scribeBirthAct` for `passed` (`throw Throwers.bankRootsMissing()`) but by three-way for `born`. The listing test covers only one direction.
- **Origin.** Drawn: the draft puts "unwritten: the tags are the actual row's" in three-way, after the answer.
- **Cost.** Every `*AnswerOf` and `Scribed*` type is a promise a later function keeps; `listAnswerOf` cannot trust its own types.
- **Flavour.** Guidance wrong, or a small redesign: tags-vs-row is a precondition of scribing, not a cross-check of the answer.
- **Settles it.** Whether the unwritten tags-vs-row check moves into `check*Observations`, before scribing. (This is the Open Matters row on a self-contradicting listing.)

### E3. Your complaint ("stack depth is large and it dips in and out of methods doing a lot of extra work"): half cured

Traced `tryWriteThing` for a `replaced` gate in memory, then and now (V8 coverage for counts; depth and checks by hand).

|  | then (`0a860f282`) | now (`517463cf4`) |
| --- | --- | --- |
| Deepest chain | 8, bouncing: tryWriteThing → doWriteThing → AdapterVaultDB.classifyWriteThing → Classifier.classifyWriteThing → demandBornAtKept → storedCitedOf → storedOf → writtenOf | 8, one direction: tryWriteThing → doWriteThing → MemoryDatastore.writeThing → #bankObservedOf → #rootsOf → #rowAt → #thingsOf → ckeyOf; the base side's deepest is 6 |
| Distinct functions entered | 61 | 69 |
| Calls into src/ | 164 | 160 |
| Calls into safebyok-big | 110 | 99 |
| zod parse / parseConsistent | 31 / 5 | 14 / 0 |
| Checks of the gate row | 5 (ante ×2 storedCitedOf, tracked parse; written row, tracked parse) | 2 parses of the written row, 2 address compares, 1 pin compare; the ante row never checked, read by ~19 raw fieldOf reads |
| Root rows read | twice | once |
| Ancestor read | always | only where no row |

- **Reading.** The bounce (base → subclass → base) is gone; re-checking the same slice is gone; parses more than halved. Depth unchanged, call volume flat: work moved from parses to raw reads and three-way compares.
- **Weight.** `if`s and ternaries 86 → 119 (+35%; three-way alone adds 21). Lines ~923 → ~1,277. `shapes-manifest.ts` has a three-rung type ladder per verb (base, `Checked*`, `Scribed*`): 23 names.
- **Origin.** Ladder drawn by the accumulator; extra branches mostly drawn by three-way.
- **Cost.** Debugging one write walks adapter, datastore, acts, three-way, plus manifest-tags.
- **Flavour.** Can't tell.
- **Settles it.** Whether you measure the complaint by bouncing and re-checking (cured) or by depth and volume (not reduced).

### E4. "The answer copies its manifest" re-runs the answer's own expressions: our code checked against itself

- **Where.** `three-way.ts:106`: `expected: manifest.actual ?? Shell.under(ask, manifest.ancestor)`, the same expression as `manifest-acts.ts:289`/`:298`; `three-way.ts:48` repeats `listAnswerOf`'s; `three-way.ts:65` repeats `birthAnswerOf`'s via `worldRootsOf`. A bug in `Shell.under` passes. A listing compares only `parentlife`. World and stats write `answer.ok ? answer.val : answer.dbhas` (`:72`, `:78`) for answers always ok. The `Copy` (`{ carried, expected }`) and `RowAt` types exist to feed one shared function.
- **Origin.** Drawn ("the answer copies the manifest"); Copy and RowAt new.
- **Cost.** Each verb's answer derivation exists twice, edited together.
- **Flavour.** Guidance wrong: "expected" needs the derivations.
- **Settles it.** Whether the copy check compares only the fields copied verbatim (actual, banktok, tracked, read_tc).

### E5. `answerForThrown` keeps a branch and comment for a `dbhas` source that no longer exists

- **Where.** `adapter-vault-db.ts:160`: `// Only a refusal made from a checked manifest sets rows.dbhas…` then `const dbhas = (Errors.rowsOfRefusal(err).dbhas ?? null)`. The three throwers that set `rows.dbhas` are now returned in an answer's `err`, never thrown; the only source left is a concrete adapter throwing its own `VaultError` with an unchecked `rows.dbhas`, which the comment says cannot happen. `PoliciedMeta`'s `act: 'policied'` is now written into both the error's meta and the scribed act.
- **Origin.** Branch carried; comment rewritten this sprint.
- **Flavour.** Solution off (a leftover).
- **Settles it.** Whether a host-thrown `rows.dbhas` should reach an answer at all.

### E6. The banktok check is strict about the key and lenient about its value

- **Where.** `manifest-acts.ts:113`: `if (! ('banktok' in manifest)) { throw Throwers.banktokMissing() }`; the contract then coaches transports to keep a key whose value may be undefined. A missing key refuses `storage_issue`; any garbage value reads as void. (Thread 5's branch already makes `banktokOf` return null.)
- **Origin.** New.
- **Cost.** A refusal, phrase and thrower, plus a paragraph of guidance, for a value that is "news only".
- **Flavour.** Guidance gap: banktok's error handling was never specified.
- **Settles it.** Whether a missing banktok should differ from a bad one at all.

### E7. The write predicate, the CAS a security reviewer cares most about, sits at the bottom of the memory file, and IndexedDB imports it from there

- **Where.** `memory-datastore.ts:153`: `export function isWritable(ask: WriteAsk, ante: unknown): boolean {`; `idb-datastore.ts:108`: `const written = DB.isWritable(ask, ante)`. In one step `isWritable` calls `ManifestTags.policiesOf` and `writeTagsOf` calls it again (that doubling is drawn: SQL's WHERE plus its tag SELECT).
- **Cost.** "May this write land" lives in three expressions across three files (`isWritable`, `putActOf`/`isPolicied`, three-way's `writtenOfOtherAct`), one in a module named for memory.
- **Flavour.** Solution off (location only).
- **Settles it.** Whether the TypeScript predicate moves beside `ManifestTags`, as part of the datastore contract.

### E8. The `tracked` comparison is split across the two sides

- **Where.** `manifest-acts.ts:138`: `const isVoidSame = (row === null) && (pair.revseq === Shell.Cited.revseq) && …`. The datastore's `trackedRowOf` cannot say "no row, tracked at the void revision, is the same", so it hands back null and the base turns that into `'same'`; the contract states the rule as the datastore's.
- **Origin.** Carried.
- **Flavour.** Can't tell.
- **Settles it.** Whether the void rule moves into `trackedRowOf`.

### E9. Minor duplicates

- Five raw-row checkers open with `if (! CX.isPlainBag(row)) { throw Throwers.storageIssue() }`; `checkedRowOf` and `checkedRootOf` differ only in where the check comes from. `_cheat_things` and `ckeyOf` exist on both `MemoryVaultDB` and `MemoryDatastore`. Mostly carried; solution off, low.

### E10. A test asserting less than its title

- `three-way.test.ts`, "refuses a row at another address than asked: the actual row, or a root in tracked", asserts only `'storage_issue'`, not which check fired. Solution off.

## 2. Undergrowth

- **Control primitives: little, nothing new.** `idb-datastore.ts:32`: `let isQuotaPending = true` (carried); `memory-datastore.ts:75`: `queueMicrotask(() => {` and the `#watchers` Set (carried); IndexedDB's BroadcastChannel (carried). No new queue, counter, token, timer, abort controller, retry, lock or stored promise.
- **New mechanisms.** `MemoryDatastore` drawn; `IdbDatastore` drawn-ish. Files `manifest-acts.ts`, `manifest-tags.ts`, `three-way.ts`: the draft names the functions, not the files. The `Checked*`/`Scribed*` ladder drawn by the accumulator. New and undrawn: `Copy`/`RowAt` (`three-way.ts:86`), `ProposedPins`, `RootLabelpaths` exported from shapes-asks, the predicates exported for IndexedDB.
- **Non-standard JavaScript.** `Object.assign(manifest, …)` under `asserts` in every check/scribe (drawn). `GatePolicies[policy](…)`, dispatch by name (carried). New: `three-way.ts:117`, `rows.filter((rowAt): rowAt is Extract<typeof rows[number], readonly [ThingRecord, Labelpath]> => rowAt[0] !== 'same')` (type gymnastics); `three-way.ts:61`, `for (const [{ record }, rootckey] of [[puts[0], 'bank'], [puts[1], 'gate'], [puts[2], 'root']] as const)` (tuple golf); `manifest-acts.ts:205`, `putActOf(put, { ...tags, revseq_cmp: 'birth', lifepath_eq: true })` (fakes tags the datastore never sent, to reuse the put table).

## 3. New names outside the draft

114 (95 module level, 15 locals, 4 checker keys).

AnswerOfOtherManifest, AnteWayins, BankObserved, BanktokMissing, BirthManifest, BirthTags, CheckedBankObserved, CheckedBirthManifest, CheckedGetManifest, CheckedListManifest, CheckedManifestRows, CheckedRoots, CheckedStatsManifest, CheckedWorldManifest, CheckedWriteManifest, Copy, GetTags, ListManifest, ListedChild, ManifestChecks, PolicyVerdicts, ProposedNotWritten, ProposedPins, RootRows, RootTags, RowAt, SameCmp, ScribedBirthManifest, ScribedGetManifest, ScribedListManifest, ScribedWriteManifest, StatsManifest, TagsOfOtherAsk, TagsOfOtherRow, WorldManifest, WrittenOfOtherAct, anteWayinsOf, bankObservedOf, banktokMissing, banktokOrVoidOf, birthAnswerOf, birthTagsOf, bornAtCmpOf, checkBirthObservations, checkGetObservations, checkListObservations, checkStatsObservations, checkWorldObservations, checkedAncestorOf, checkedBankObservedOf, checkedChildrenOf, checkedRootOf, checkedRootsOf, checkedRowOf, checkedRowsOf, checkedTrackedOf, checkedWatchedOf, demandBirthConsistency, demandListConsistency, demandProposedWritten, demandStatsConsistency, demandTagsOfActual, demandTagsOfAsk, demandWorldConsistency, fieldOf, getAnswerOf, getTagsOf, isGoodAct, isPolicied, lifetokCmpOf, listActOf, listAnswerOf, policiedRefusalOf, policiesOf, policyFailureOf, policyVerdictOf, proposedNotWritten, recordCopyOf, refusedroot, rootActOf, rootRowsOf, rootTagsOf, scribeBirthAct, scribeGetAct, scribeListAct, statsAnswerOf, tagsOfOtherAsk, tagsOfOtherRow, trackedRowOf, trackedRowsOf, voidParentOf, worldAnswerOf, writeTagsOf, writtenOfOtherAct.

Locals: aboves, anteRevseq, banktokReport, childReport, isBirthOfShell, isBornAtSame, isCited, isCopied, isFlagged, isLifetokSame, isOfFormat, isPoliciesExact, isPolicyMet, listedpaths, tableAct. Checker keys: policyVerdict, policyVerdicts, rootTags, sameCmp.
