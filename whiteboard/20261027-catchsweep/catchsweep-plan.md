# Sprint catchsweep: error handling, flattened (2026-10-27)

Mode: normal. Review level: `medium`, `high` for thread 2 (it touches `proving.ts` and
`lease.ts`, two of the six files `notes/guarantees.md` names). Threads at once: 3. Issued by the
Coach (flip), 2026-10-27, after a sonnet audit of every `try`/`catch` under `packages/*/src` and the
orchestrator's reading of the wrappers in `vault-db.ts`, `lease.ts` and `proving.ts`.

**Status:** merged to main 2026-10-28: #316, #317, #324, #321 (01:56) and #327, #330, #328 (02:56); main `f84d61bb`. The last line, each PR's base `main`: #333 (`0c2a6278`, on main) → #331 (`ce9769fe`); merging #331 merges both. 2 (#325, `7b4c99ed`, second review fixed) is filing with its catch-up and the sprint's two folds (bank.ts `refusalOf` onto outcome.ts's; the DeviceDB doc's cause clause), then restacks onto #331 as the top. Ten threads.

**Base.** Every thread stands on PR [#311](https://github.com/mrflip/safebyok/pull/311)
(`20261027-proving_tidy`, rebased onto main by a separate agent first). The Coach: "stack if they
are naturally run serially, or else just off 311 and we'll restack the git history later." So
thread 2 is cut from thread 1's tip (same lines of `lease.ts`); threads 1, 3, 4 and 5 are cut from
#311's tip and restacked into one line at the wrap-up.

## Read first

* CLAUDE.md whole; STYLE.md *Naming*, *Comments and doc blocks*, *Tests*; PROCESS.md *Threads*,
  *Commit messages*, *Pull requests*, *Releases*.
* `notes/guarantees.md`, *The guarantees* (G8 above all: nothing secret through a log line or an
  error) and *Where the guarantees are kept*. Threads 1, 2 and 5 touch files it names.
* `packages/safebyok/src/outcome.ts`: `outcomeOf`, `unexpectedError`, `good`, `bad`, `valOf`.
* `packages/safebyok/src/vault-db.ts` l.700-720 and l.850-870: `answering`, `asStorageTrouble`,
  `adapterAnswer`, `startedWatch`, `readStoredVault` (l.1020).

## Ground rules

* **Names follow the return shape** (the Coach, 2026-10-27): a function resolving an `Outcome` is
  `tryVerbFoo`; one that throws, or returns the foo itself, is `verbFoo`. "That includes vaultDB --
  remember, there's no back-compat needed." Every public pair keeps the body in the throwing form;
  `tryVerbFoo` is `try { return good(await this.verbFoo(...)) } catch (err) { return bad(...) }`.
  A renamed export is a contract change: the changeset is `minor` and names each rename.
* **Behaviour is kept** except where a thread's text says what changes, and then the changeset says
  it. Refusal kinds, their order relative to each await, and every demand stay where they are.
* **Catch exactly one foreign call.** A `try` around a `crypto.subtle` call, an adapter hook or a
  host function holds that one call: the arguments are computed before the `try`, so a bug in
  building them never reads as a wrong passphrase, a damaged box or storage trouble.
* **One wrapper per edge, never nested.** `outcomeOf` is applied once, at a public method; inside,
  plain `try`/`catch`. A prepared closure is one hop, `(x) => this.#method(x)`.
* **`read` and `write` are category words, never a function's name** (the Coach, 2026-10-28): "read"
  and "write" are reserved exactly for "any operation that views: get, ensure, find, list, etc"; likewise
  write for "put, replace, patch, delete, etc". A function or method is named for the one operation it
  does; a kind or field covering the whole category may say write (`stale_write`, `written_at`).
* **Shapes and their types** (the Coach, 2026-10-28): "It's an easy rule, unless there's a good reason:
  use Z.infer (eg recursive types); put in the common checks folder (weird and module-local and good idea
  to put it near where used); use Validator; namespace it, using Validator or a star-import."
* **No cause carrying secret material** reaches a host's logger or a thrown error. A device-store
  record holds a key handle; the vault record and box records hold ciphertext and headers.
* **Don't be chary with the exports** (the Coach, 2026-10-28): "It's really frustrating for a lib
  contributor to be denied things at arms reach. It's a lil baby tiny library right now, we can be
  forgiven churn but not surliness." A type an exported signature names is exported; the `minor`
  changeset names it.
* Each export's doc block is written for its caller; a changed refusal is named in it.
* A `@ts-expect-error` or `eslint-disable-line` is reported in the PR and the thread file.

## Threads

### 1. trythrow: the body lives in the throwing method

Coach: "would you have an agent find and migrate all cases where the body of an outcomeOf(blah)
could be moved to the throwing version, with try wrapping it?"

Gloss: today `tryX` holds the body inside `outcomeOf(async () => { ... })` and `X` is
`valOf(await this.tryX())`. Flip each pair: `X` holds the body and throws; `tryX` is
`try { return good(await this.X(...)) } catch (err) { return bad(<as the pair maps it today>) }`.
The sites: `lease.ts` `tryCipheredWith`/`cipheredWith`, `tryDecipherWith`/`decipherWith`,
`trySealProps`/`sealProps`; `box.ts` `trySeal`/`seal`, `tryExtractWhisper`/`extractWhisper`. The
inner `outcomeOf` calls inside those bodies (the AEAD mapping) are thread 2's: leave them as they
are, moved whole. `vault-db.ts`'s verbs return Outcomes with no throwing twin: not in scope.
`KeptLease.read` (`lease.ts`) resolves an Outcome: it becomes `tryRead`, its two callers in
`vault.ts` and `bank.ts` renamed; a throwing `read` only if a caller wants one. The stores'
verbs (`vault-db.ts`, `device-db.ts`) are thread 6's, not this thread's.
`vault.ts` and `bank.ts` pairs already keep the body in a hand `try`/`catch` whose `#badOutcome`
also tells bad news to listeners; flipping them would skip that news for a caller of the throwing
form unless the throwing form catches, tells and rethrows. **Report those, with a recommendation;
do not flip them** unless the one-catch form keeps the news on both paths and the worker is sure.
Doc blocks move with the body (STYLE.md: the doc block sits on the throwing one). Empty changeset
unless a refusal changes. Size: small. Depends on: nothing beyond #311. Look-ahead: thread 2 edits
the same methods right after; keep the inner `outcomeOf` calls intact so its diff is small.

*Review:* (medium, 2026-10-28) fixed: the changeset said a bug leaves every throwing form raw, where
`Box.seal`, `extractWhisper` and `sealProps` reach the step below through its `try` form, so only a
bug in a throwing method's own lines comes raw; reworded (`7e568558`). Left, minor: `notes/security.md`
l.248 names `Lease.tryCipheredWith` for a body now in `cipheredWith` (to thread 2, through the sonnet
subagent); no test of the raw path or of the `try` forms' mapping (to thread 2, after the Coach's
ruling that the throwing form owns the catch); #305's pending changeset still introduces
`KeptLease.read` (release notes show the name born and renamed in one release; left).

### 2. aead_narrow: catch the one call, and no cause from the device store

Orchestrator's proposal, accepted by the Coach ("implement your other proposals").

Gloss: (a) `proving.ts` `#unwrap`: compute `wayinCtxOf(...)` before the `try`; the `try` holds only
`unwrapKeyUnder`. (b) `lease.ts`: `#vaultKeyOrNull`, and the inner `outcomeOf` calls in the cipher
and decipher bodies, become plain `try`/`catch` around exactly the one `subtle`-backed call each
(`wrapKeyUnder`, `cipherBytes`, `unwrapKeyUnder`, `decipherBytes`), ctx computed outside; the
`damaged_box` and `unexpected_error` mappings stay as they are, per call. (b2) By the Coach's
ruling of 2026-10-28 ("I'm happier with the throwing body doing a try catch to fix its refusals --
that's most of its job, it belongs there; then having the try version wrap as usual"): each
throwing form thread 1 made (`cipheredWith`, `decipherWith`, `sealProps`, `Box.seal`,
`extractWhisper`) ends with one catch that maps a non-VaultError to `unexpectedError` and rethrows,
so no bug leaves it raw; the `try` form stays one `outcomeOf` hop. (c) `device-db.ts`
`deviceTrouble`: the condition no longer carries the store's throw as `cause` (keep its
`name` in the message or `meta` if that helps a host, never its message), since a custom
`DeviceDB`'s throw may quote stored lease text and the logger hands the error to the host whole
(`vault.ts` l.1098, l.1306, l.1415; `bank.ts` l.571; `gating.ts` l.424 on main). Check
`Refusals.storageUnavailable`'s doc, which says causes hold only ciphertext: true of VaultDB
adapters, not of the device store; say so there. (d) `notes/guarantees.md`: a sentence under G8
saying a device-store failure's cause never crosses to the host, and *Where the guarantees are
kept* if `device-db.ts` now keeps one. Changeset: patch, saying a device-store condition's `cause`
is gone. Size: medium. Review `high`. Depends on: thread 1 (same lines of `lease.ts` and `box.ts`).

*Review:* (high, 2026-10-28) flagged: fixed one (a Proving-side `bad_record` test, `5e486337`); left the
two declared deviations for the Coach (no inner catch in the cipher body, so a failing cipher step refuses
`unexpected_error` before the post-wait demand; a vault stamp failing its check is `bad_record` and the
vault stays unlocked), both rows. Minor, left: G8's wording falsifiable as written (orchestrator's call:
restate as the checkable invariant, on resume); the Lease/Box class docs claim "any method" while the
argument parses sit before the try (orchestrator's call: narrow the claims, parses stay; thread 7 puts
whole bodies inside the try); `deviceTrouble`'s message tail is developer prose (row); `PasskeyProving.seal`
keeps the old shape (later thread, Cleanup); internals narrated in doc blocks (documentarian). The thread
waits unfiled at `5e486337` until the Coach rules; its worker is then resumed with the rulings and the two
doc fixes, and files.

*Review, round 2* (5e486337...6e2f1927, high, after the rulings): fixed at `7b4c99ed`, 4 fixes (`crypto_failed` tests for `Box.seal` and `vault.putBox`, with G6's zeroing asserted; `decipherWith`'s doc says a WebCrypto fault there reads `damaged_box`, never `crypto_failed`; `thrownNameOf`'s doc and G8 say a host's own store error carries whatever name the host gave it, kept until a redact lands; double-quoted test inputs), 7 minor: the inner catch takes any throw inside the WebCrypto wrappers (the design); `leaseBound: ciphered.ok` skips the lease demand for every bad outcome (Your calls: as ruled); the "… threw Name." builder duplicated (redact thread); `let` through the inner try (taste); `putBox`'s doc lacks `crypto_failed` (taken at filing); the kind's place in `RefusalKindVals` (taste); the sibling sites (Cleanup).

### 3. db_hooks: the VaultDB's hooks adapted once

Orchestrator's proposal, accepted by the Coach.

Gloss: `vault-db.ts` wraps each subclass hook at every call,
`readStoredVault(() => adapterAnswer('doGetVault', () => this.doGetVault(asked)))` three deep inside
`answering`. Adapt the hooks once at construction into a private `#hooks` object (each entry
`adapterAnswer` applied to one hook), so a verb reads `await this.#hooks.doGetVault(asked)`; drop
`readStoredVault` (one caller, `delDamagedVault`) by making its message at the throw site. Export
`asStorageTrouble` (from `vault-db.ts` or beside `unexpectedError` in `outcome.ts`; the worker
decides and says why) and use it where `safebyok-graphql`'s `crossing` (`vault-resolvers.ts` l.241)
hand-rolls the same line. `vault-resolvers.ts` `vaultDBOf` (l.98): a VaultError from the host's
`vaultDBFor` passes through as today; anything else becomes `unexpected_error` with the cause kept
server-side and no diagnosis, where today it is `bad_option` "its own setup is wrong, retrying will
not help". Changeset: `safebyok-graphql` patch naming the kind change; `safebyok` patch if an
export is added. `pnpm size:budget` may move `vault-db`'s line; follow the rule. Size: medium.
Depends on: **thread 6** (it rewrites the same verbs): cut from thread 6's tip once it files.
*Orchestrator (2026-10-28):* the Coach has asked that `read` and `write` names go (thread 8).
The ones inside `vault-db.ts` are this thread's, since it rewrites those lines: the private helper
`readVault` (backs `getVault` and `getVaultRecords`) pairs with `ensuredVault` as `gottenVault`;
`readStoredVault` goes as above; `checkWrittenVaultRecord`/`checkWrittenBox` become
`checkPutVaultRecord`/`checkPutBox` with their `written` parameter `put`; the `writing` parameters
of `withMissChecked` and `withStaleVaultRecordChecked` become `putting`; locals named `read` become
`answer` or `got`; the validator `ReadAnswer` becomes `StoredVaultAnswer`; and the exported type
`VaultReadResponse` (the answer of `doGetVault` and `doEnsureVault`, so not a "get") becomes
`StoredVault`, every adapter and `safebyok-graphql`'s `vaultReadOf` following (the worker checks it
does not clash with `StoredBox`/`StoredVaultTok` usage). The doc example at l.735
`this.readVaultRows(scope)` becomes `getVaultRows`. The `safebyok` changeset turns `minor` and names
`VaultReadResponse` → `StoredVault`. Nothing else of thread 8's touches `vault-db.ts` but the two
`staleWrite(...)` call sites (l.466, l.500), which thread 8 renames; the restack reconciles.

*Review:* medium, clean at `5cdf957e`: 0 fixes, 7 minor left. Every hook goes through the static table once; `asStorageTrouble` is the old line verbatim; `delDamagedVault`'s `damaged_vault` refusal is made at the call in its old position; `crossing` keeps its kinds; no old name survives outside historic changesets. Left: `notes/security.md` l.981/2071/2122 stale (amended by the orchestrator's `sonnet` pass, `60698c5a`); `unexpectedError`'s shared message misdescribes a crossed cause (settled by the pass-through ruling below); STYLE.md `Stored-` wording and `asStorageTrouble` vs `storageTroubleOf` (Open Matters rows); doc blocks of `asStorageTrouble`, `adaptedHook`, `#hooks` (documentarian, Cleanup); `vaultReadOf` → `storedVaultOf` (thread 8 did it); the `Object.create` pattern already broken by `#logger` (pre-existing, in *Discoveries*).
*Ruling (the Coach, 2026-10-28):* "Pass errors through": `vaultDBOf` passes every VaultError from `vaultDBFor` as itself, a non-VaultError as `unexpected_error` carrying the thrown message. Reopened: a worker reworks the branch before a second review and filing.
*Review, round 2* (60698c5a...854be0c6): fixed at `8a9f83ed`, 2 fixes (a `{@link}` to private `hostThrew` made backticks; the README and `vaultDBFor`'s doc say the thrown message reaches every browser, so the host throws no credential or connection string there), 5 minor left: `String(thrown)` can itself throw (null-prototype object; not guarded); `isVaultError`'s `instanceof` loses a second-copy VaultError's kind (pre-existing); empty-message and cross-realm cosmetics; `hostThrew`'s doc and name (documentarian, Cleanup); the crossing sentence living in the graphql package by decision. G8 holds: `vaultDBFor` sees the request's context only, never a field's args; the cause never serializes on either leg. One `eslint-disable-line @typescript-eslint/only-throw-error` in `vault-resolvers.test.ts`, by precedent.


### 4. where_prefix: one parse, said where

Orchestrator's proposal, accepted by the Coach.

Gloss: seven sites catch a `Validator` refusal and rethrow the same kind with a "where" prefix,
dropping the cause: `bank.ts` `parseVaultBag` (`bad_scope`), `options.ts` `optionsCheck`,
`vault-opts.ts` `checkMakeBankOpts` and `checkBankVaultOpts`, `idb-opts.ts` `parseDbName` in the
core and its near-copy in `safebyok-indexeddb/src/idb-opts.ts` (all `bad_option`). Give `Validator`
one way to say where (the worker proposes the shape in its thread file before building: an option
on the `Validator` call, or a parse variant taking the place; STYLE.md *Validation* rules), and
delete the seven catches; the duplicate `idb-opts.ts` becomes one file re-exported, if the
packages' boundary allows, else say why not. Messages a host sees keep their wording. Empty
changeset unless wording changes. Size: small. Depends on: nothing beyond #311.

*Review:* (medium, 2026-10-28) fixed: `Saying` and `VaultBagAdvice` doc blocks lead with what each is;
`Refusing.parse`'s doc says a saying that is none refuses 'bad_option' (`04a0208c`); the changeset counts
six converted checks, not seven, and names the ParseContext refusal (`9f4f3690`). Significant, left:
a Zod `ParseContext` handed to `parse` now refuses 'bad_option'; the Coach ruled keep it (2026-10-28).
Minor, left: `Saying`/`Refusing` not importable from `safebyok` (row); `Saying` near the strength
checker's `PlainSaying` (row); hand-written `Saying` beside `SayingShape` (pattern row, with
`ConsistencyRefusal`); `framed` a participle beside `fooOf` names (taste); `checkBankVaultOpts`'s
message untested (Cleanup); `optionsCheck`'s `said` parameter now passed as `advice` (Cleanup).

### 5. one_sanitizer: a host function threw and may have heard a secret

Orchestrator's proposal, accepted by the Coach.

Gloss: three core sites hand-roll "the host's function threw; drop what it threw, since it may
have been handed a passphrase": `passphrase-strength.ts` l.99 (`guardStrengthChecker`),
`vault-opts.ts` `requestThrewError` (l.348), `proving.ts` `deriverThrewRefusal`; and
`Sanitizer.refusalFor` (`sanitizer.ts`) names the pattern but ignores its argument, used by
`safebyok-react`'s `adviceFailed`, `forBoundary` and `safebyok-convex`'s `refusing`. Make one
sanitizer of them, in `sanitizer.ts`, and call it from all six; `deriverThrewRefusal`'s branch on
`listedKindOf` (a closed list) stays as its one allowed inspection. If `Sanitizer` is exported from
an entry point and its shape must change, that is a contract question: syndicate it and keep the
shape. Empty changeset otherwise. Size: small. Depends on: nothing beyond #311; touches
`proving.ts` beside thread 2's `#unwrap`, different region, restacked at the wrap-up.

*Review:* (medium, 2026-10-28) fixed: the sanitizer's Proxy-trap test armed `get` and `ownKeys` alone,
now every trap throws and `instanceof` is shown to bite first (`66753376`); the guarantees note's G8
paragraph rewrapped whole (`36ca8621`). Nothing significant. Minor, left: `listedKindOf(err)` runs before
the sanitizer at the two logging sites, so a host throw whose prototype or `refusalkind` getter throws
escapes raw (unchanged from the base; row for the Coach); `sanitizer.ts`'s module doc lists its callers
and `refusalFor`'s last sentence runs long (documentarian, Cleanup).

### 6. store_trynames: the stores' verbs named for what they resolve

Coach: "functions returning outcomes <=> named tryVerbFoo ; functions that throw or return a foo
<=> named verbFoo. That includes vaultDB -- remember, there's no back-compat needed".

Gloss: `VaultDB`'s public verbs (`getVault`, `ensureVault`, `putVaultRecord`, `getBox`, `putBox`,
`delBox`, `getCapacity`, `delVault`, `delDamagedVault`, and any other resolving an Outcome; not
`subscribe`, which throws) and `DeviceDB`'s (`getLease`, `putLease`, `delLease`,
`getDeviceRecord`, `raiseDeviceRecord`, `delDeviceRecord`, `delAll`) become `tryVerbFoo` resolving
the Outcome, each with a throwing `verbFoo` that holds the body (the `answering`/`guarded` wrapper
moves to the `try` form, applied once, per the flip of thread 1). The subclass hooks `doVerbFoo`
throw already: unchanged. Callers follow: `vault.ts`, `bank.ts`, `del-damaged-vault.ts`,
`gating.ts`, `RefusalPolicy.heed` (which unwraps Outcomes into throws: where a throwing verb now
exists, `heed` may call it and the `outcomeOf` rewrap in `vault.ts` may go; take that only where it
falls out plainly, and report the rest), every adapter package's tests and its README,
`safebyok-graphql`'s resolvers (`served` calls a verb for its Outcome), `safebyok-convex`,
`demos/`, `e2e/`, the core README's VaultDB and DeviceDB sections. Changeset `minor` for `safebyok`
listing each rename, `patch` per adapter whose docs or tests changed. Size: large, mechanical:
`sonnet` may do it if the orchestrator judges so at cut time; default model otherwise. Depends on:
nothing beyond #311. Look-ahead: thread 3 rewrites these verbs' insides right after; keep each verb's
body whole so its diff stays small.

*Review:* (medium, 2026-10-28) fixed: `deviceRecordFor`'s example unwrapped the throwing form with
`valOf` (`d5cf3fb3`); the demo's `OutageVaultDB.delDamagedVault` override lost its `async` with the
Outcome (`16aea6b8`); six `return await` outside a try in the demo (`999d9ce0`, style). Nothing
significant. Minor, left: `delDamagedVaultIn`'s `bad_option` names `tryDelDamagedVault` where the class
doc says override `delDamagedVault` (thread 3 aligns); ~70 test locals hold a try form under the throwing
verb's name (a sweep after the sprint, Cleanup); try-twin doc examples in `vault-db.ts`/`device-db.ts`
show the other twin's answer (documentarian after thread 3, Cleanup); `return await` outside a try on
dedented lines; `#readableOf`'s `doDelUnreadable` failure reported under the reading verb (as before);
conformance suites exercise the try forms only (recorded decision).

### 7. vault_bank_flip: the Vault's and Bank's try pairs in the one-catch form

Coach, 2026-10-28, on thread 1's open matter: "I'm happier with the throwing body doing a try catch
to fix its refusals -- that's most of its job, it belongs there; then having the try version wrap
as usual".

Gloss: the 18 `vault.ts` pairs and 5 `bank.ts` pairs keep the body in `tryX` inside a hand
`try`/`catch` whose `#badOutcome` maps a non-VaultError to `unexpectedError`, tells bad news to the
listeners, and returns `bad(err)`; `X` is `valOf(await this.tryX())`. Flip each: `X` holds the body
and ends `catch (err) { throw this.#heardRefusal(err) }` (or the name the worker finds right: it maps,
tells the news once, and rethrows), and `tryX` is one `outcomeOf(() => this.X(...))` hop. Bad news is
told exactly once on both paths; a `useWhisper`-style caller that composes keeps its behaviour.
Every demand, every `#demandNotGone`, and every refusal kind stays where it is; doc blocks move to
the throwing form. The `Vault[provingTools]` route that hands `#badOutcome` to a proving (thread 1's
note) follows the same one-catch form. Empty changeset unless a refusal changes. Size: medium,
mechanical but wide. Depends on: thread 6 (it renames the store calls inside these same bodies): cut
from thread 6's tip once it files.

*Review:* (medium, 2026-10-28) clean: every body moved whole, bad news told once on both paths
(`#hearBadNews` dedupes on `#told`), the gating's catches hand the proving the same Outcome, gating.ts
keeps G1 and G8. Minor, left (Cleanup, after the restack): `clearCachedVault`'s `valOf` over the device
store's try forms; `lock()`/`hello()`'s Outcome round trips through `#lockNow`/`#initialize`; no test of a
throwing form rejecting with `unexpected_error`.

### 8. read_names: no operation is a `read` or a `write`

Coach (2026-10-28): "I keep trying to stamp out `read` in favor of a specific semantic: find (get
first by criterion), get (fetch by a unique key, composite is ok), ensure (get, creating first if
absent). Would you have some thread fix the name read, and write if it's also broken?"

Gloss, from a survey of every identifier under `packages/*/src` (2026-10-28; line numbers on
#311's tip). Rename each operation for what it does; a mutation takes its own verb (`put`, `raise`,
`del`); the try-pair rule holds (`tryVerbFoo` resolves an Outcome, `verbFoo` throws or returns the
foo). The renames that need no ruling:

* `string-store.ts` `StringStore.read`/`write` → `get`/`put` (`erase` → `del` for the set), in
  `memoryStore`, `domStore`, the doc example, the validator at `local-vault-db.ts` l.57 and its nine
  callers there; `local-vault-db.ts` `readJson` → `getJson`.
* `lease.ts` `KeptLease.tryRead` (thread 1's name for `read`) → `KeptLease.tryGet`: this device's
  kept lease for the scope, by its unique key. Callers `bank.ts` l.550, `vault.ts` l.976 and l.1450;
  `notes/guarantees.md` names it (fix there too).
* `held-lease.ts` `readers` → `leaseGetters`, `registerLeaseReader(vault, read)` →
  `registerLeaseGetter(vault, getLease)`.
* `refusals.ts` `staleWrite(what)` → `staleDel()`, dropping `StaleWriteVals`/`StaleWrite` (the list
  holds only `'del'`) and renaming `StaleWriteSaid` → `StaleDelMessage`, like `StaleBoxMessage`;
  callers `vault-db.ts` l.466, l.500. The *kind* `'stale_write'` waits on a ruling (below).
* `device-db.ts` `#readableOf` → `#parsedOrDel` (parses a fetched row, deleting it if it does not
  parse). `doDelUnreadable` waits on a ruling (below).
* `vault.ts` (all private): `#readBox` → `#getBox` (it gets the box by label through
  `VaultDB.getBox`; a `#` name sits apart from the public `getBox`; `#fetchBox` if the worker finds
  it confusing), `#boxReadRefusal` → `#boxGetRefusal`, `#writeOver` → `#putOver`, `#takeOwnWrite` →
  `#takeOwnPut`, `#gateWriteRefusal` → `#gatePutRefusal`, local `readFirst` → `getFirst`, locals
  `read`/`written` holding Outcomes → `got`/`put`. The refresh family, `#readStorage`, `#readRefused`,
  `#readAt`, `#judgeRead`, `#takePicture`'s `readAt` field, `BirthRead` with its `readAt`, and
  `bank.ts` l.547 `readAt`: the operation is the vault's refresh (one `VaultDB.getVault`, judged
  against the picture), none of find/get/ensure, so name it for the refresh: `#refreshOnce`,
  `#refreshRefused`, `#refreshedAt`, `#judgeGotten`, `refreshedAt`, `Birth`; the worker takes these
  or proposes better in its thread file, one name per thing. Section banners `[Reading storage]`
  and `[Writing boxes]` follow.
* `idb.ts` local `reading` → `getting`; `vault-opts.ts` l.354 local `reading` → `now`.
* `safebyok-graphql` `vaultReadOf` → `storedVaultOf` (as postgres names it), `WriteAnswer` →
  `PutAnswer`; `safebyok-convex` `ReadOutOfDateMessage` → `GetBoxOutOfDateMessage` (and
  `OutOfDateMessage` → `PutOutOfDateMessage` beside it); `safebyok-react` `readListed` → `getListed`.
* Doc examples: `vault-record.ts` l.24 and `box.ts` l.30 `myBackend.readRow(id)` → `getRow`.

Keep: `clockReading` (the noun "a clock reading", public through `Validators`); the Convex platform
limits `ConvexTransactionReadBytes`/`ConvexTransactionWrittenDocuments`; `DatabaseReader`/`Writer`
and `ReadableStream` (platform types); `readonly`. Not this thread: the ~700 prose uses of "read"
and "write" in doc blocks and messages (a documentarian run, after the renames settle); the
`vault-db.ts` internals (thread 3's, above).

Waiting on the Coach, each a row; the worker leaves them as they are until the orchestrator sends
the ruling, and takes them in this thread if it comes before `ready`: the stored field `written_at`
(a format bump; Rec keep); the refusal kind `'stale_write'` (a wire value; Rec `'stale_del'`, named
in the changeset); Convex `GetBoxAnswer.read` (a protocol field between component and client; Rec
`got`, in lockstep); `doDelUnreadable(scopepath, isReadable)` (a protected adapter hook in every
DeviceDB; Rec `doDelUnparsed(scopepath, isSound)`).

Changeset: `safebyok` minor naming `StringStore.get`/`put`/`del`, `Refusals.staleDel`,
`registerLeaseGetter`; patch for each adapter package touched. Size: medium, mechanical. Depends on:
**thread 6** (`device-db.ts`, `lease.ts`'s `tryGetLease` line) and thread 1 (`KeptLease.tryRead`):
cut from thread 6's tip once it files, beside thread 3; restacked at the wrap-up. Review `medium`.

*Review:* medium, fixed at `b1ec666f`: 3 fixes (doc blocks of `Birth` and `StaleDelMessage` lead with the thing; three test titles say deletes/getter; the demo's `readSession` → `getSession`), 6 minor left. Pure rename under `-w`; `lease.ts` touched only at `tryGet`'s name and doc. Left: `notes/security.md` `#takeOwnWrite`/`#judgeRead`/`#boxReadRefusal` stale and `one-at-a-time.ts`'s `readStorage` example (the worker, in its rulings pass); `#parsedOrDel` named for what it returns (settled with `doDelUnparsed`); the trythrow changeset introducing and retiring `tryRead` in one release (Cleanup, restack); STYLE.md l.596/699 "Read and open the box" (Open Matters row); umbrella prose around renamed members (documentarian).
*Review, round 2* (b1ec666f...795701d2): fixed at `c0c83fda`, 4 fixes (convex README's `getBox` shape said `read`; a release-note line saying `doDelUnparsed(scopepath, isSound)` replaces `doDelUnreadable`, since `20261027-device_db_class.md` is unreleased and names the old hook; an `UnknownReadAnswers` row for the retired `{ read: true, box_stored }` shape, refused `corrupt_record`; `GetBoxAnswer`'s doc opener), 6 minor left, all prose for the documentarian (Cleanup): `GetBoxOutOfDateMessage`, idb's "unreadable" message, `UnreadableCases` and test titles, `PutBoxAnswer`'s and four other "What a" openers, `isGetBoxAnswer`'s doc, `.changeset/20261022-lease_box.md`'s `{ read, box_stored }`. The e2e convex assertion was not run (needs a deployment).

### 9. saying_story: the saying is a Story, exported, inferred from its shape

Coach (2026-10-28), on three rows from #317's review: "yes export"; "May we use 'Story'?"; and the
shapes rule above.

Gloss: in `packages/safebyok/src/checks/validator.ts` (and wherever #317 left them), `Saying` →
`Story` and `SayingShape` → `StoryShape`, the parameter and doc blocks of `parse(val, story?)`
following ("saying" in prose becomes "story"); `Story` and `Refusing` exported from `src/index.ts`
(minor changeset naming both); `Story` and `ConsistencyRefusal` written as `Z.infer<typeof ...Shape>`
rather than by hand, their shapes living in the common checks folder and made in a `Validator` call,
namespaced as the rule says (the worker reads STYLE.md *Shapes and duck typing* and *Validation*, and
writes the Coach's rule into STYLE.md *Shapes* in the same PR, quoting it). Tests follow the renames;
`tests/checks/validator.test.ts` gains nothing but names unless a type test is natural. Size: small.
Depends on: #317 (in the line); cut from the top of the line (#321's tip, or higher once threads file)
when a slot frees. Review `medium`.

*Review:* medium, fixed at `a984cea5`: 1 fix (STYLE.md's glosses of the rule marked "Read as:", a reading pending the Coach), 1 significant left: `ConsistencyRefusal` unexported though public `Refusing.parseConsistent` names it (Open Matters row; the thread waits unfiled on it). Verified: the alias form `type Story = Z.infer<...>` fails (293 errors, TS7022 on `Validator`), so the interfaces stand; the type test pins both to their hand-written shapes. Minor left: `message`'s bare `custom` (Cleanup); `#327`'s changeset says "saying" (the worker edits it in #331 on resume); `Story` absent from VOCABULARY.md (row); STYLE.md bullet overlap and the namespacing clause beside a destructuring codebase (row); field tours in the two doc blocks (documentarian).
*Review, round 2* (a984cea5...393cbef6, after the rulings): fixed at `881c1bbe`, 3 fixes (the changeset's `ConsistencyRefusal` wording; `Merged`'s doc states a relation, not its consumer; the `[Kit]` banner lists `Merged`), 2 minor (Cleanup): README *Validators* says nothing of the consistency exports or `parse(val, story?)`; the surface test pins runtime exports only. The two red commits c16df6f7/f02d2b88 fold into 3d4dcc8b at filing.

### 10. host_error_sanitizer: the sanitizer named for what it sanitizes; `storageTroubleOf`

Coach (2026-10-28), on the sanitizer row: "let's call it hostErrorSanitizer, there's all sorts of things
need sanitizing"; and on #330's review row, `asStorageTrouble` → `storageTroubleOf` (took the Rec).

Gloss: `packages/safebyok/src/sanitizer.ts` → `host-error-sanitizer.ts`, the namespace export
`Sanitizer` → `HostErrorSanitizer` (`src/index.ts`, `passphrase-strength.ts`, `proving.ts`,
`vault-opts.ts`, the test file, `notes/security.md` through its sonnet pass); `refusalFor` keeps its
name. `asStorageTrouble` → `storageTroubleOf` in `outcome.ts`, `vault-db.ts`'s hook table, the
graphql `crossing`, tests and notes, with #330's changeset amended in this branch to announce the new
name. Names only; `safebyok` minor. Size: small. Depends on: the line's top (#328); cut from `0e48262e`
2026-10-28. Review `medium`.

*Review:* medium, clean at `5fcdc037`: 0 fixes, 2 minor. Every added line is the one-word substitution of its removed twin; old names survive only in spent CHANGELOGs and `human/`; #330's unspent changeset announces `storageTroubleOf`; G8 and *Where kept* point at `host-error-sanitizer.ts`. Left: `notes/security.md`'s seven renamed lines carry no amended marker (Open Matters row: state the exemption in the header, or add markers); two `notes/guarantees.md` lines a few characters over the prose wrap.

## Not in this sprint

* `safebyok-react` `askAuthenticator`'s `SecurityError` branch: the audit called it a guess; the
  orchestrator read it as a spec'd WebAuthn error with the spec's meaning. Kept.
* Private Outcome-returning helpers (`loadLibs`, `deviceOutcomeOf`, `outcomeOf` itself) keep their
  names unless a thread meets one in passing; a verb-shaped one may take `try` then.

## For the Coach

* ~~Thread 1 will report, not flip, the `vault.ts` and `bank.ts` pairs~~: ruled 2026-10-28, thread 7 flips them.
* Thread 5's sanitizer shape, if `Sanitizer` is an exported type.
