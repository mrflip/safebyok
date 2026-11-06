# Example audit: where an `@example` earns its tokens

2026-11-05. Asked by the Coach after PR #506 (`20261105-test_titles`) dropped pointers to examples that did not exist.
Read-only audit: no code or test changed.

**Base.** Doc blocks are read at the base checkout's `HEAD` (`b7bacb68`, branch `20261104-newdesign_plan`). Pointer
comments are read on the #506 branch, which is cut from `origin/main`. Two members differ between the two:
`invokeStrengthChecker` is `guardStrengthChecker` at `HEAD`, and `bankedVaultScope` is `vaultBag` and `bankBag`.

**Counting.** Tokens are words times 1.3, as asked. Code tokenizes heavier than prose: a characters-over-3.5 count
of the same `src/` examples comes to about 4,450, not 2,250. Read every figure below as a floor, nearly doubled in
practice.

## Headline

* 174 `@example`s: 123 in `src/` (about 2,250 tokens) and 51 in `tests/test-helpers/` (about 790).
* About half restate the first line or the `@param` beside them, or repeat another doc's example word for word.
  `VaultError`'s first example is `isVaultError`'s, verbatim.
* Proposed for `src/`: keep 51, trim or replace 3, drop 69. It falls from about 2,250 tokens to about 1,180
  (net -1,071). For the test helpers: keep 27, trim 1, drop 23, from about 790 to about 475 (net -314).
* One **add** now: `label`'s `0__b_`, replacing its uppercase example. One **replace**: `Checker`'s first example
  builds a strict object, which is `objCheck`'s job by `objCheck`'s own doc.
* Two **adds** wait for the models' doc blocks: `Bank`'s `make`, `hello`, `ensureVault` order, and `vault.putBox`'s
  bare-whisper refusal.
* The 19 dropped vaultish pointers stay dropped. `whisperHolder`, `boxDna`, `boxPatch` and `sparseBase` get no
  example: their case tables are the example.
* On #506's 62 pointer comments: 29 go with their examples, 11 are renumbered, 22 stay as they are.
* STYLE.md's "Don't be stingy with `@example`s" contradicts this. It wants the Coach's ruling (*Open points*).

## 1. Inventory

### 1a. The examples

L is lines, ~t is tokens. Each is listed under the export whose doc block holds it. A pointer marked "(same)" is
the one test the row above names, covering this example too. Test helpers carry no pointers: tests use them, they
are not tested by title.

**`src/helpers/consts.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 9 | `FarFuture` | 1 | 16 | display rule: compare with a minute's margin, not equality | none |
| 10 | `FarFuture` | 1 | 6 | its ISO date, restating the first line | none |
| 16 | `FarPast` | 1 | 6 | its ISO date, restating the first line | none |
| 22 | `MinuteMillis` | 1 | 20 | the margin test, repeating FarFuture's first | none |
| 30 | `ForeverMillis` | 1 | 21 | option value: `leaseHours: Infinity` read back from `gating.leaseMillis` | none |
| 31 | `ForeverMillis` | 1 | 23 | the definition as arithmetic, restating the prose | `@example 2`, consts.test.ts:24 |

**`src/helpers/crypto.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 32 | `toB64` | 1 | 6 | one call and its output | none |
| 38 | `fromB64` | 1 | 6 | one call and its output | none |
| 44 | `fromB64OrNull` | 1 | 5 | good input, its length | `@example`, crypto.test.ts:18 (both) |
| 45 | `fromB64OrNull` | 1 | 5 | failure: standard base64's `/` and `+` read as null | (same) |
| 69 | `cipherCtx` | 1 | 14 | shape: which header fields a passphrase wayin binds | `@example 1`, crypto.test.ts:51 |
| 70 | `cipherCtx` | 1 | 5 | shape: a list of stamps, a lease binding its vault's | `@example 2`, crypto.test.ts:61 |
| 123 | `deriveWrappingKey` | 1 | 8 | call sequence: `info` is a cipherCtx | none |

**`src/helpers/helpers.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 8 | `adorn` | 1 | 14 | one call; restates "hidden" | `@example 1`, helpers.test.ts:9 |
| 9 | `adorn` | 1 | 27 | pattern: a memoizing getter | `@example 2`, helpers.test.ts:19 |
| 18 | `tattooProp` | 1 | 17 | one call; restates "enumerable+readonly" | `@example`, helpers.test.ts:127 |
| 27 | `decorate` | 1 | 17 | one call; restates "hidden" | `@example` x2, helpers.test.ts:38, 45 |
| 44 | `tattoo` | 1 | 25 | option value: `configurable: false` over a spread scope | `@example`, helpers.test.ts:107 |
| 56 | `nextMicrotask` | 1 | 20 | one call; restates the first line | `@example`, helpers.test.ts:145 |

**`src/helpers/logger.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 17 | `VaultLogger` | 7 | 55 | shape: a telemetry logger, guessable from the type | none |
| 24 | `VaultLogger` | 1 | 27 | option value: a silent logger | none |
| 25 | `VaultLogger` | 1 | 23 | option value with a consequence: `console`, untagged | none |
| 54 | `parseLogger` | 1 | 21 | a binding's warn through it | none |
| 55 | `parseLogger` | 1 | 14 | consequence: the default tags 'safebyok:' | `@example 2`, logger.test.ts:37 |
| 56 | `parseLogger` | 1 | 13 | identity: null gives DefaultLogger, restating prose | `@example 3`, logger.test.ts:45 |
| 57 | `parseLogger` | 1 | 10 | identity: guarded once, restating prose | `@example 4`, logger.test.ts:52 |
| 106 | `DefaultLogger` | 1 | 29 | option values: storage to its own logger, the vault to the default | none |
| 117 | `setDefaultLogger` | 1 | 12 | one call; restates the first line | `@example 1`, logger.test.ts:152 |
| 118 | `setDefaultLogger` | 1 | 9 | `undefined` puts the console back; the `@param` says so | `@example 2`, logger.test.ts:162 |

**`src/helpers/one-at-a-time.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 8 | `oneAtATime` | 3 | 23 | call sequence: three calls share one run | `@example`, one-at-a-time.test.ts:76 |

**`src/helpers/passphrase-strength.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 28 | `StrengthChecker` | 2 | 34 | shape: the verdict a host checker answers | none |
| 30 | `StrengthChecker` | 2 | 18 | shape: a function carrying `load` | none |
| 57 | `DefaultStrengthChecker` | 1 | 26 | every passphrase weak, restating the first line | `@example`, passphrase-strength.test.ts:168 |
| 70 | `guardStrengthChecker` | 1 | 22 | failure: blank is weak, restating prose | `invokeStrengthChecker @example 1`, passphrase-strength.test.ts:41 |
| 71 | `guardStrengthChecker` | 1 | 16 | failure: a non-verdict refuses 'bad_option', restating prose | none |
| 98 | `loadStrengthChecker` | 1 | 13 | one call; restates the first line | `@example`, passphrase-strength.test.ts:156 |

**`src/helpers/stable-jsonify.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 7 | `stableJsonify` | 1 | 12 | keys sorted: the point of the function | none |
| 8 | `stableJsonify` | 1 | 12 | inside an array; the prose says arrays keep order | none |

**`src/helpers/validator.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 87 | `Checkers` | 9 | 133 | call shape of the kit; `where`/`advice` framing; `parseConsistent` | `@example 1`, validator.test.ts:42, 205, 231 |
| 96 | `Checkers` | 7 | 82 | the same shape again, with `omit` and the strict message | `@example 2`, validator.test.ts:53 |
| 103 | `Checkers` | 5 | 47 | `sources`: a module spread into the kit | `@example 3`, validator.test.ts:61 |
| 119 | `Checker` | 4 | 30 | an object, strict: what `objCheck` is for | `@example 1`, validator.test.ts:269 |
| 123 | `Checker` | 1 | 14 | a non-object validator, its kind given | `@example 2`, validator.test.ts:277 |
| 137 | `objCheck` | 7 | 48 | call shape, `sources`, the strict refusal's sentence | `@example 1`, validator.test.ts:321 |
| 144 | `objCheck` | 6 | 39 | option value: `extras: 'strip'` drops the rest | `@example 2`, validator.test.ts:331 |
| 244 | `consistent` | 1 | 18 | true case, restating the first line | `@example 1`, validator.test.ts:358 |
| 245 | `consistent` | 1 | 25 | surprise: a field undefined in one passes | `@example 2`, validator.test.ts:369 |
| 253 | `demandConsistent` | 1 | 23 | true case, repeating consistent's | `@example`, validator.test.ts:380 (both) |
| 254 | `demandConsistent` | 1 | 35 | option value: `message` as a function of the fieldnames | (same) |
| 266 | `verifyConsistent` | 1 | 25 | one call; restates the first line | `@example`, validator.test.ts:389 |

**`src/refusals/errors.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 97 | `RefusalFamilyForKind` | 1 | 5 | a table lookup; the table is the next lines | title "matches the @examples", errors.test.ts:86 |
| 98 | `RefusalFamilyForKind` | 1 | 5 | a table lookup | (same) |
| 99 | `RefusalFamilyForKind` | 1 | 5 | a table lookup | (same) |
| 100 | `RefusalFamilyForKind` | 1 | 5 | a table lookup | (same) |
| 195 | `VaultError` | 4 | 21 | host catch by kind: word for word isVaultError's example | none |
| 199 | `VaultError` | 3 | 27 | branching on `family` from a `try` outcome | `@example 2`, errors.test.ts:70 |
| 231 | `listedKindOf` | 1 | 14 | a listed kind, restating the first line | `@example`, errors.test.ts:240 (both) |
| 232 | `listedKindOf` | 1 | 10 | failure, for the security reader: a plain Error's text gives null | (same) |
| 242 | `thrownNameOf` | 1 | 9 | surprise: a DOMException's name is its own, not the class | `@example 1`, errors.test.ts:253 |
| 243 | `thrownNameOf` | 1 | 8 | a bare string gives null; the type says so | `@example 2`, errors.test.ts:260 |
| 257 | `isVaultError` | 4 | 21 | host catch, branching by kind | `@example`, errors.test.ts:201 |
| 269 | `isCondition` | 5 | 25 | call sequence: rethrow first, then show | title "matches the @example", errors.test.ts:188 |

**`src/refusals/host-error-sanitizer.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 19 | `HostErrorSanitizer.refusalFor` | 4 | 55 | catch-and-replace around the keyDeriver, a long message | `@example 1`, host-error-sanitizer.test.ts:44 |
| 23 | `HostErrorSanitizer.refusalFor` | 4 | 29 | the same around a storage client | `@example 2`, host-error-sanitizer.test.ts:59 |

**`src/refusals/outcome.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 7 | `Outcome` | 4 | 29 | shape: destructure `{ ok, val, err }`, narrow on `ok` | `@example`, outcome.test.ts:27 |
| 22 | `good` | 1 | 12 | one constructor call | `@example`, outcome.test.ts:10 |
| 28 | `bad` | 1 | 10 | one constructor call | `@example`, outcome.test.ts:17 |
| 40 | `outcomeOf` | 3 | 25 | option value: `storageUnavailable` as `otherwise`, in use | `@example 1`, outcome.test.ts:83 |
| 43 | `outcomeOf` | 1 | 18 | the default, restating the `@param` | `@example 2`, outcome.test.ts:64 |
| 44 | `outcomeOf` | 1 | 22 | `storageUnavailable` again, its cause kept | `@example 3`, outcome.test.ts:94 |
| 60 | `storageTroubleOf` | 2 | 40 | call order: inside `crossing`, where a server relays a verb | `@example`, outcome.test.ts:120 |
| 70 | `refusalOf` | 8 | 32 | placement: the catch that ends a throwing form, 8 lines of skeleton | `@example 1`, outcome.test.ts:159 |
| 78 | `refusalOf` | 1 | 17 | a VaultError as it came, restating the first line | `@example 2`, outcome.test.ts:143 |
| 79 | `refusalOf` | 1 | 20 | anything else as unexpected_error, restating the first line | `@example 3`, outcome.test.ts:149 |
| 85 | `valOf` | 1 | 21 | when not to use it: the throwing verb does it itself | `@example`, outcome.test.ts:111 |
| 86 | `valOf` | 4 | 31 | an adapter's hook, whose comment says it needs no valOf | (same) |

**`src/refusals/report-error.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 5 | `reportToPlatform` | 1 | 13 | one call in a catch; restates the first line | none |

**`src/refusals/throwers.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 25 | `storageUnavailable` | 2 | 18 | an adapter's catch: the common use | none |
| 27 | `storageUnavailable` | 1 | 21 | a message given; the `@param` says so | none |
| 35 | `unexpectedError` | 1 | 12 | one call | `Refusals.unexpectedError @example`, throwers.test.ts:39 |

**`src/shapes/primitives.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 19 | `LabelPattern` | 1 | 6 | two exports together: `pattern` plus `maxLength` in a form | `@example`, primitives.test.ts:71 |
| 27 | `label` | 1 | 5 | a good label | `@example`, primitives.test.ts:41 (both) |
| 28 | `label` | 1 | 8 | failure, one rule: uppercase | (same) |
| 37 | `UserIdPattern` | 1 | 5 | an auth0 id passes; user_id's examples show it again | `@example`, primitives.test.ts:144 |
| 46 | `user_id` | 1 | 5 | a Clerk-like id passes | `@example`, primitives.test.ts:120 (all four) |
| 47 | `user_id` | 1 | 5 | an auth0 id, its pipe, passes | (same) |
| 48 | `user_id` | 1 | 8 | failure: dots alone | (same) |
| 49 | `user_id` | 1 | 9 | failure with its remedy: percent-encode the slash | (same) |
| 60 | `epochMillis` | 1 | 8 | a good instant passes | `@example`, primitives.test.ts:207 (all five) |
| 61 | `epochMillis` | 1 | 9 | failure: epoch seconds, the common unit mistake | (same) |
| 62 | `epochMillis` | 1 | 9 | failure: epoch microseconds | (same) |
| 63 | `epochMillis` | 1 | 9 | failure: a fraction | (same) |
| 64 | `epochMillis` | 1 | 9 | failure: Infinity | (same) |

**`src/shapes/shapes-core.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 33 | `vault_tok, box_tok, ... (the tokens' Checkers)` | 1 | 22 | use in a kit by name, which Checkers' doc shows | none |
| 34 | `vault_tok, box_tok, ... (the tokens' Checkers)` | 1 | 18 | a parse where a record is made | none |
| 82 | `Whisper` | 1 | 3 | a literal string | none |
| 83 | `Whisper` | 1 | 9 | a literal object, null inside | none |
| 98 | `whisper` | 1 | 9 | a string passes | none |
| 99 | `whisper` | 1 | 14 | failure: a Date, which JSON flattens | none |
| 100 | `whisper` | 1 | 10 | failure: undefined | none |
| 101 | `whisper` | 1 | 13 | failure with its remedy: bare null, use delBox | none |
| 102 | `whisper` | 1 | 17 | surprise: null inside passes | none |
| 124 | `sidecar` | 1 | 10 | a plain object passes | title "passes the examples its doc block shows", shapes-core.test.ts:64 (all three) |
| 125 | `sidecar` | 1 | 18 | failure: a Date, as whisper's | (same) |
| 126 | `sidecar` | 1 | 21 | failure with its remedy: a string, wrap it as `{ note }` | (same) |
| 138 | `vaultScope` | 1 | 12 | surprise: a Vault object passes, as a frozen copy of its names | `CX.vaultScope @example 1`, shapes-core.test.ts:82 |
| 139 | `boxscope` | 1 | 18 | failure: a bad label, as Checkers ex1 shows | `CX.boxscope @example 2`, shapes-core.test.ts:109 |
| 161 | `vaultBag` | 1 | 13 | vaultlabel alone passes | none |
| 162 | `vaultBag` | 1 | 14 | a Vault object passes, as vaultScope's | none |
| 163 | `vaultBag` | 1 | 20 | failure: a store in the naming bag | none |
| 164 | `bankBag` | 1 | 12 | a Vault object gives its bank's names | none |
| 174 | `VaultBag` | 1 | 6 | where it is handed: `bank.ensureVault` | none |

**`src/shapes/shapes-gateish.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 26 | `wayinkind` | 1 | 5 | an enum member passes | `@example`, shapes-gateish.test.ts:8 |
| 80 | `passphraseCleartext` | 1 | 12 | a parse | none |
| 81 | `passphraseCleartext` | 1 | 21 | failure: a number; the type says string | none |
| 95 | `passkeyAnswer` | 1 | 4 | a parse of askPasskey's answer | `@example 1`, shapes-gateish.test.ts:37 |
| 96 | `passkeyAnswer` | 1 | 17 | failure no type shows: an answer used once, its bytes zeroed | `@example 2`, shapes-gateish.test.ts:53 |
| 110 | `PasskeyAnswer` | 3 | 32 | call sequence: askPasskey, null when dismissed, then attemptPasskey | none |
| 119 | `freshPasskeyAnswer` | 1 | 6 | a parse passes | none (no test at all) |
| 120 | `freshPasskeyAnswer` | 1 | 12 | failure: a salt too short | none (no test at all) |
| 202 | `isLeaseKey` | 1 | 6 | true case | none |
| 203 | `isLeaseKey` | 1 | 8 | failure, for the security reader: an extractable key is none | none |

**`src/shapes/shapes-storage.ts`**

| line | export | L | ~t | shows | pointer on #506 |
|---|---|---|---|---|---|
| 182 | `capacity` | 1 | 22 | shape: two `{ used, max }` pairs | none |

**`tests/test-helpers/builders.ts`**

| line | export | L | ~t | shows |
|---|---|---|---|---|
| 14 | `testDeriver` | 1 | 8 | which option it goes in; the name says |
| 32 | `anyStrengthChecker` | 1 | 8 | which option it goes in; the name says |
| 43 | `fakeCiphered` | 1 | 13 | shape: the fake fields it makes from a tag |
| 44 | `fakeCiphered` | 1 | 9 | in use beside boxOf |
| 54 | `scopeOf` | 1 | 16 | shape: the defaults `acme` and `main` |
| 55 | `scopeOf` | 1 | 17 | the second parameter, as the signature says |
| 63 | `wayinOf` | 1 | 12 | a call, its comment cryptic |
| 64 | `wayinOf` | 1 | 10 | an override |
| 89 | `passkeyOf` | 1 | 8 | in use with putWayin |
| 90 | `passkeyOf` | 1 | 6 | in use with unlock |
| 91 | `passkeyOf` | 1 | 14 | surprise: the same credential answering another salt |
| 108 | `tweakB64` | 1 | 5 | what "tweak" means: the next letter |
| 109 | `tweakB64` | 1 | 5 | the same again |
| 110 | `tweakB64` | 1 | 8 | failure: empty text throws |

**`tests/test-helpers/logging.ts`**

| line | export | L | ~t | shows |
|---|---|---|---|---|
| 21 | `spyLogger` | 4 | 27 | call sequence: hand it in, read the levels |
| 45 | `quietLogger` | 1 | 21 | consequence: memoryVaultOpts logs nowhere by default |
| 46 | `quietLogger` | 1 | 20 | a spy instead, as spyLogger's shows |
| 64 | `loggedText` | 1 | 3 | the leak assertion it exists for |
| 79 | `thrownText` | 1 | 3 | the leak assertion it exists for |
| 91 | `leafTexts` | 1 | 22 | shape: nested leaves flattened, numbers as text |
| 110 | `shownOf` | 1 | 17 | contrast with jsonOf: no private field, no getter |
| 117 | `jsonOf` | 1 | 17 | contrast with shownOf: through toJSON |

**`tests/test-helpers/models-world.ts`**

| line | export | L | ~t | shows |
|---|---|---|---|---|
| 65 | `fullBoxRecord` | 1 | 16 | overrides, guessable |
| 88 | `sparseBoxRecord` | 1 | 9 | overrides, guessable |
| 94 | `tombstoneBoxRecord` | 1 | 12 | a deleted box |
| 95 | `tombstoneBoxRecord` | 1 | 16 | option value: `'d'` makes a damaged_records entry |
| 271 | `makeModelsWorld` | 7 | 31 | call sequence: make, dispose, seed, fetch, count calls |
| 278 | `makeModelsWorld` | 1 | 20 | scripting a race: the next put loses |
| 394 | `useModelsWorld` | 3 | 18 | the `held.mw` indirection |
| 453 | `boxListingOf` | 1 | 12 | an override, guessable |
| 470 | `fakeSealBoxListingOf` | 1 | 30 | a rebirth from a tombstone |
| 471 | `fakeSealBoxListingOf` | 1 | 20 | option value: the third argument runs during each seal |
| 487 | `boxDnaOf` | 1 | 4 | in use with create |
| 488 | `boxDnaOf` | 1 | 12 | an override, guessable |

**`tests/test-helpers/proving-world.ts`**

| line | export | L | ~t | shows |
|---|---|---|---|---|
| 61 | `fakeLeaseFriendOf` | 3 | 18 | scripting a refusal, which the first line says |

**`tests/test-helpers/refusals.ts`**

| line | export | L | ~t | shows |
|---|---|---|---|---|
| 19 | `expectRefusal` | 1 | 5 | the canonical use |
| 20 | `expectRefusal` | 3 | 12 | the refusal handed back; `@returns` says so |
| 45 | `expectGood` | 1 | 4 | one call; the name says |
| 66 | `expectingGood` | 1 | 6 | the proxy form, not guessable |
| 99 | `expectBad` | 1 | 8 | a `try` verb and its kind |
| 117 | `expectSyncRefusal` | 1 | 14 | the thunk form, versus expectRefusal's promise |
| 141 | `omitting` | 1 | 9 | one call; the name says |

**`tests/test-helpers/timing.ts`**

| line | export | L | ~t | shows |
|---|---|---|---|---|
| 10 | `wakeupAtNextTick` | 1 | 16 | one call; restates the first line |
| 19 | `aWhile` | 3 | 16 | call sequence: wait, then assert nothing came |
| 31 | `eventually` | 1 | 9 | one call; the name says |
| 47 | `changeCounter` | 3 | 17 | subscribe with it; `@returns` says so |
| 63 | `makeLatch` | 7 | 62 | call sequence: wrap a seam, reach, lock, release (holdNextCall's again) |
| 97 | `beforeNextCall` | 2 | 9 | a race: another device's put lands first |
| 156 | `holdNextCall` | 6 | 39 | call sequence: hold, reach, act, release |
| 181 | `holdNextAnswer` | 6 | 46 | call sequence, contrasted with holdNextCall: the write landed, unheard |
| 206 | `readAfresh` | 3 | 31 | call sequence: a change elsewhere, then read afresh |

### 1b. Pointers on #506

62 `// member @example [N]` comments sit above an `it(`, outside `tests/test-helpers/`. Three titles point by
themselves: errors.test.ts:86 ("matches the @examples", `RefusalFamilyForKind`), errors.test.ts:188 ("matches the
@example: ...", `isCondition`), and shapes-core.test.ts:64 ("passes the examples its doc block shows", `sidecar`).

| test file | pointers | members |
|---|---|---|
| helpers/consts.test.ts | 1 | ForeverMillis 2 |
| helpers/crypto.test.ts | 3 | fromB64OrNull; cipherCtx 1, 2 |
| helpers/helpers.test.ts | 7 | adorn 1, 2; decorate (twice); tattoo; tattooProp; nextMicrotask |
| helpers/logger.test.ts | 5 | parseLogger 2, 3, 4; setDefaultLogger 1, 2 |
| helpers/one-at-a-time.test.ts | 1 | oneAtATime |
| helpers/passphrase-strength.test.ts | 3 | invokeStrengthChecker 1; loadStrengthChecker; DefaultStrengthChecker |
| helpers/validator.test.ts | 13 | Checkers 1 (three times), 2, 3; Checker 1, 2; objCheck 1, 2; consistent 1, 2; demandConsistent; verifyConsistent |
| refusals/errors.test.ts | 5 | VaultError 2; isVaultError; listedKindOf; thrownNameOf 1, 2 |
| refusals/host-error-sanitizer.test.ts | 2 | HostErrorSanitizer.refusalFor 1, 2 |
| refusals/outcome.test.ts | 11 | good; bad; Outcome; outcomeOf 1, 2, 3; valOf; storageTroubleOf; refusalOf 1, 2, 3 |
| refusals/throwers.test.ts | 1 | Refusals.unexpectedError |
| shapes/primitives.test.ts | 5 | label; LabelPattern; user_id; UserIdPattern; epochMillis |
| shapes/shapes-core.test.ts | 2 | CX.vaultScope 1; CX.boxscope 2 |
| shapes/shapes-gateish.test.ts | 3 | wayinkind; passkeyAnswer 1, 2 |

**The 23 removed or corrected.** All 82 pointers came from "as its Nth example shows" title trailers, moved into
comments in commits `223a607c`, `c626cded` and `890de534`. The review then took out what pointed nowhere:

* `3fa4a210`, 19 dropped: `VX.whisperHolder` 1 to 5; `VX.boxDna` 1, 2, 2, 4, 5, 6, 7, 8; `VX.boxPatch` 6, 7 and
  two unnumbered; `VX.sparseBase`. Each was a row trailer or a comment in shapes-vaultish-box.test.ts, or above
  "takes the six props from a record and strips the rest" in shapes-vaultish-records.test.ts.
  `src/shapes/shapes-vaultish.ts` holds no `@example`, so the trailers were already stale on `main`.
* `d5acf1a2` and `3fa4a210`, 4 corrected: `verifyConsistent` `@example 1` became `@example`, and its 2 and 3 went
  (it holds one); `ForeverMillis @example` became `@example 2`; `MaxLabelChars and LabelPattern @example` became
  `LabelPattern @example`.

Seven examples have no test at all on #506: the four on `vaultBag` and `bankBag`, both of `freshPasskeyAnswer`, and
`isLeaseKey`'s second (lease.test.ts:45 checks only a true case). Many others are tested but not pointed at; *Open
points* lists the ones the proposal keeps.

## 2. When an example earns its tokens

An example costs every reader of its file on every visit. An agent pays again on each turn the file stays in its
context, and most readers of `src/` are agents changing the code, not hosts. A test costs only whoever opens that
test, and a case table already shows the inputs, the verdict and why, for free. So an example earns its place only
when it shows what the first line, the signature and the `@param`s cannot. Four things qualify. **A failure that
reads several ways**: `0__b_` breaks three of `label`'s rules at once and still gets one sentence back. **A shape
the type hides**: `fakeCiphered`'s fields, `capacity`'s two `{ used, max }` pairs, a `StrengthChecker` that is a
function carrying `load`. **A call sequence whose order matters**: `oneAtATime`'s shared run, `holdNextCall`'s
reach, act, release, `isCondition`'s rethrow before showing. **An option value with a consequence**: `objCheck`'s
`extras: 'strip'`, `tattoo`'s `configurable: false`, `logger: console` printing untagged. A surprise counts with
them: `whisper` refuses a bare null but takes one inside an object. Nothing else qualifies. An enum validator's
type says it all (`wayinkind`). A table lookup sits on the lines right below its doc (`RefusalFamilyForKind`). A
constructor of one call (`good`, `bad`) or an example that repeats the first line in code (`refusalOf`'s second
and third) adds nothing. When a test already demonstrates the case, *the test is the example*: drop the doc's
copy and let the title name the behaviour.

## 3. Verdicts

*Keep*, *drop*, *add*, *move to the test* (no test shows it yet: write that test, then drop) and *the test is the
example* (a test shows it already: drop the doc's copy). Several examples on one export get one verdict each, by
number.

**`src/helpers/`**

| file | export | shows | verdict | why |
|---|---|---|---|---|
| consts.ts | `FarFuture` | 1 the "until locked" margin; 2 its ISO date | keep 1; drop 2 | 1 is a display rule hosts get wrong; 2 is the first line, and consts.test.ts checks it |
| consts.ts | `FarPast` | its ISO date | the test is the example | the first line gives the date; consts.test.ts checks it |
| consts.ts | `MinuteMillis` | the margin test | drop | `FarFuture`'s first example, again: say it once |
| consts.ts | `ForeverMillis` | 1 `leaseHours: Infinity` read back; 2 the arithmetic | keep 1; 2 the test is the example | 1 is an option with a consequence; 2 is the prose, checked at consts.test.ts:24 |
| crypto.ts | `toB64`, `fromB64` | one call each | the test is the example | name and type say it; crypto.test.ts round-trips |
| crypto.ts | `fromB64OrNull` | 1 a length; 2 `/` and `+` read as null | keep 2; drop 1 | 2 is the base64 versus base64url trap |
| crypto.ts | `cipherCtx` | 1 a wayin's header fields; 2 a list of stamps | keep both | which fields bind, and a lease binding its vault: the security reader's shapes |
| crypto.ts | `deriveWrappingKey` | `info` is a cipherCtx | keep | ties two members a reviewer must see together |
| helpers.ts | `adorn` | 1 one call; 2 a memoizing getter | keep 2; 1 the test is the example | 2 is a pattern no signature shows; 1 restates "hidden" |
| helpers.ts | `tattooProp`, `decorate` | one call each | the test is the example | each restates its first line; helpers.test.ts:38, 45, 127 |
| helpers.ts | `tattoo` | `configurable: false` over a spread | keep | an option with a consequence |
| helpers.ts | `nextMicrotask` | one call | the test is the example | restates the first line; helpers.test.ts:145 |
| logger.ts | `VaultLogger` | 1 a telemetry logger; 2 silent; 3 `console` | keep 2, 3; drop 1 | 2 and 3 are option values; 1 is the type spelled out |
| logger.ts | `parseLogger` | 1 a binding's warn; 2 the 'safebyok:' tag; 3, 4 identity | keep 2; drop 1; 3, 4 the test is the example | 2 is a consequence; 3 and 4 restate "It keeps identity", tested at logger.test.ts:45, 52 |
| logger.ts | `DefaultLogger` | storage to its own logger, the vault to the default | keep | option values, two loggers split |
| logger.ts | `setDefaultLogger` | 1 one call; 2 `undefined` | the test is the example | the first line and the `@param` say both; logger.test.ts:152, 162 |
| one-at-a-time.ts | `oneAtATime` | three calls share one run | keep | the call sequence is the contract |
| passphrase-strength.ts | `StrengthChecker` | 1 a verdict; 2 a function with `load` | keep both | a host implements it; 2's shape is not guessable |
| passphrase-strength.ts | `DefaultStrengthChecker` | every passphrase weak | the test is the example | the first line; passphrase-strength.test.ts:168 |
| passphrase-strength.ts | `guardStrengthChecker` | 1 blank is weak; 2 a non-verdict refuses | the test is the example | each restates a sentence of its prose; tests at :41 and :84 |
| passphrase-strength.ts | `loadStrengthChecker` | one call | the test is the example | the first line; test at :156 |
| stable-jsonify.ts | `stableJsonify` | 1 keys sorted; 2 inside an array | keep 1; 2 the test is the example | 1 is the function's point; 2 is the prose, tested at stable-jsonify.test.ts:11 |
| validator.ts | `Checkers` | 1 the kit, framing, `parseConsistent`; 2 `omit`, strict; 3 `sources` | keep 1, 3; 2 the test is the example | the kit is opaque, so its call shape earns; 2 repeats 1's shape, tested at validator.test.ts:53 |
| validator.ts | `Checker` | 1 a strict object; 2 a function | replace 1; keep 2 | 1 is `objCheck`'s job by `objCheck`'s own doc; replace it with a whole-value check, below |
| validator.ts | `objCheck` | 1 the call, its refusal; 2 `extras: 'strip'` | keep both | the call shape, and an option with a consequence |
| validator.ts | `consistent` | 1 a match; 2 an undefined field passes | keep 2; 1 the test is the example | 2 is the surprise; 1 restates the first line |
| validator.ts | `demandConsistent` | 1 true; 2 a `message` function | keep 2; drop 1 | 2 shows an option shape; 1 repeats `consistent`'s |
| validator.ts | `verifyConsistent` | one call | the test is the example | the first line; validator.test.ts:389 |

`Checker`'s replacement, real code from `src/shapes/shapes-core.ts:52`, a check of the value whole with a sentence
of its own, which is why a caller picks `Checker`:

```ts
 * @example
 *   export const prfSalt = Checker(() => prf_salt_b64.refine((salt) => fromB64OrNull(salt)?.length === PasskeySaltBytes, Phrases.prfSaltNotFresh(PasskeySaltBytes)), 'bad_record')
```

**`src/refusals/`**

| file | export | shows | verdict | why |
|---|---|---|---|---|
| errors.ts | `RefusalFamilyForKind` | four lookups | the test is the example | the table is the next lines; errors.test.ts:86 checks the four |
| errors.ts | `VaultError` | 1 catch by kind; 2 branch on `family` | keep 2; drop 1 | 1 is `isVaultError`'s example word for word; 2 is the one place `family` is used |
| errors.ts | `listedKindOf` | 1 a listed kind; 2 a plain Error gives null | keep 2; drop 1 | 2 is the security fact; 1 the first line |
| errors.ts | `thrownNameOf` | 1 a DOMException's own name; 2 a string gives null | keep 1; 2 the test is the example | 1 surprises; 2 is the type |
| errors.ts | `isVaultError` | a host's catch by kind | keep | the public guard, in the one form a host writes |
| errors.ts | `isCondition` | rethrow, then show | keep | the order matters |
| host-error-sanitizer.ts | `HostErrorSanitizer.refusalFor` | 1 around the keyDeriver; 2 around a storage client | keep 2; 1 the test is the example | the same call twice; the prose names the passphrase case; test at :44 |
| outcome.ts | `Outcome` | destructure, narrow on `ok` | keep | the `{ ok, val, err }` pattern works only through `err?: never`, which a reader would not guess |
| outcome.ts | `good`, `bad` | one call each | the test is the example | one-call constructors; outcome.test.ts:10, 17 |
| outcome.ts | `outcomeOf` | 1 `storageUnavailable` in use; 2 the default; 3 `storageUnavailable` again | keep 1; 2, 3 the test is the example | 2 and 3 restate the `@param`; tests at :64, :94 |
| outcome.ts | `storageTroubleOf` | inside `crossing` | keep | the order of the wrap matters to a relaying server |
| outcome.ts | `refusalOf` | 1 an 8-line skeleton; 2, 3 the first line in code | trim 1 to one line; 2, 3 the test is the example | placement is the point, not the skeleton; tests at :143, :149 |
| outcome.ts | `valOf` | 1 when the throwing verb suffices; 2 an adapter hook | keep 1; drop 2 | 2's own comment says it needs no `valOf` |
| report-error.ts | `reportToPlatform` | one call in a catch | the test is the example | the first line; report-error.test.ts |
| throwers.ts | `storageUnavailable` | 1 an adapter's catch; 2 a message given | keep 1; drop 2 | 1 is what an adapter author writes; 2 is the `@param` |
| throwers.ts | `unexpectedError` | one call | the test is the example | the first line; throwers.test.ts:39 |

`refusalOf`'s first example, trimmed:

```ts
 * @example catch (err) { throw refusalOf(err) }   // the last catch of a throwing form
```

**`src/shapes/`**

| file | export | shows | verdict | why |
|---|---|---|---|---|
| primitives.ts | `LabelPattern` | `pattern` plus `maxLength` in a form | keep | two exports together; the pattern alone does not bound length |
| primitives.ts | `label` | 1 a good label; 2 uppercase fails | keep 1; **add** `0__b_` in place of 2 | the Coach's anchor: one input, three rules broken, one sentence back |
| primitives.ts | `UserIdPattern` | an auth0 id | the test is the example | `user_id`'s examples show it; primitives.test.ts:144 |
| primitives.ts | `user_id` | 1, 2 ids pass; 3 dots alone; 4 a slash, percent-encoded | keep 2, 4; 1, 3 the test is the example | 2 shows the pipe passes; 4 shows the remedy; the table holds the rest |
| primitives.ts | `epochMillis` | 1 passes; 2 seconds; 3 microseconds; 4 a fraction; 5 Infinity | keep 2; the rest the test is the example | seconds is the mistake hosts make; `EpochMillisCases` holds every row |
| shapes-core.ts | the tokens' `Checkers` (`vault_tok`, ...) | use in a kit; a parse | drop | `Checkers`' own doc shows both |
| shapes-core.ts | `Whisper` | two literals | drop | the type is the union; `whisper`'s examples cover it |
| shapes-core.ts | `whisper` | 1 a string; 2 a Date; 3 undefined; 4 bare null; 5 null inside | keep 2, 4, 5; 1, 3 the test is the example | 2 mangles silently; 4 and 5 are the surprising pair, with a remedy; `WhisperCases` holds 1 and 3 |
| shapes-core.ts | `sidecar` | 1 an object; 2 a Date; 3 a string | keep 3; drop 1, 2 | 3 gives the remedy; 2 is `whisper`'s, said once there |
| shapes-core.ts | `vaultScope`, `boxscope` | 1 a Vault object, frozen; 2 a bad label | keep 1; 2 the test is the example | 1 surprises; 2 is `Checkers`' first; shapes-core.test.ts:109 |
| shapes-core.ts | `vaultBag`, `bankBag` | 1 vaultlabel alone; 2, 4 a Vault object; 3 a store refuses | keep 3; 1, 2, 4 move to the test | 3 is the mistake a caller makes; no test covers either bag |
| shapes-core.ts | `VaultBag` | `bank.ensureVault` | keep | says where the type is handed, in six tokens |
| shapes-gateish.ts | `wayinkind` | an enum member | the test is the example | the Coach's anchor: an enum validator's type says it all |
| shapes-gateish.ts | `passphraseCleartext` | a parse; a number refused | drop | the type says string; models tests feed it |
| shapes-gateish.ts | `passkeyAnswer` | 1 a parse; 2 a used answer refused | keep 2; 1 the test is the example | 2 is a failure no type shows |
| shapes-gateish.ts | `PasskeyAnswer` | ask, null when dismissed, attempt | keep | a call sequence with a null check |
| shapes-gateish.ts | `freshPasskeyAnswer` | 1 passes; 2 a short salt refused | keep 2; 1 move to the test | 2 is the failure the prose warns of; neither has a test |
| shapes-gateish.ts | `isLeaseKey` | 1 true; 2 extractable is false | keep 2; drop 1 | 2 is the security fact; lease.test.ts:45 checks 1, and 2 wants a test |
| shapes-storage.ts | `capacity` | two `{ used, max }` pairs | keep | the shape a host reads in `vault_full`'s meta, hidden in a builder |
| shapes-vaultish.ts | `whisperHolder` | (none; 5 pointers dropped) | the test is the example | its `holdsCases` table shows every input and verdict; the bare-whisper mistake belongs on `vault.putBox` |
| shapes-vaultish.ts | `boxDna` | (none; 8 pointers dropped) | the test is the example | the table, grouped by comments, is the documentation |
| shapes-vaultish.ts | `boxPatch` | (none; 4 pointers dropped) | the test is the example | its one surprise, a full record passing, is in `BoxPatch`'s prose and the table |
| shapes-vaultish.ts | `sparseBase` | (none; 1 pointer dropped) | the test is the example | a re-export of `SX.sparseBase`; its doc block is a SLOPDOC line, owed by the reform |

`label`'s examples, written from its rules. `LabelPattern` is `/^(?!.*__)[a-z][a-z0-9_]*[a-z0-9]$/`, and `label`
is `max(40)` then that pattern. `0__b_` is five characters, so the length passes. It breaks the pattern three
ways: it starts with a digit, not `[a-z]`; it holds `__`, which the lookahead refuses; and it ends on `_`, not
`[a-z0-9]`. Zod's `.regex` gives one issue for all three, `Phrases.LabelShape` ("A label is lowercase words of
letters and digits joined by single underscores, starting with a letter, two characters at least"). Checked by
running `zod` on it: one issue.

```ts
 * @example label.safeParse('anthropic_api_key').success   // true
 * @example label.safeParse('0__b_').success               // false three ways: a digit first, '__' inside, '_' last
 * @example label.safeParse('0__b_').error?.issues.length  // 1: one sentence names every rule, so show it whole
```

**Adds that wait for the models' doc blocks**

| file | export | would show | verdict | why |
|---|---|---|---|---|
| models/bank.ts | `Bank` | `make`, then `hello`, then `ensureVault` | add, with the class's doc block | the order matters: `ensureVault` before `hello` refuses 'bad_option' (`helloFirst`, through `#demandReady`) |
| models/vault.ts | `putBox` | `{ boxlabel, whisper: 'sk-...' }` refused, `{ val: 'sk-...' }` taken | add, when `putBox`'s doc block is rewritten | the one `{ val }` mistake a host makes, met at the public verb, not at `whisperHolder` |

`Bank` has no doc block yet, so the example waits for one:

```ts
 * @example
 *   const bank = Bank.make(opts)
 *   await bank.hello()                                             // first: ensureVault before it refuses 'bad_option'
 *   const vault = await bank.ensureVault({ vaultlabel: 'main' })
```

**`tests/test-helpers/`**

| file | export | shows | verdict | why |
|---|---|---|---|---|
| builders.ts | `testDeriver`, `anyStrengthChecker` | the option each goes in | drop | the option shares the type's name |
| builders.ts | `fakeCiphered` | 1 the fields from a tag; 2 beside boxOf | keep 1; drop 2 | 1 is a shape no signature shows |
| builders.ts | `scopeOf` | 1 the defaults; 2 a second vault | keep 1; drop 2 | `acme` and `main` are not guessable; 2 is the signature |
| builders.ts | `wayinOf` | a call; an override | drop | 1's comment is cryptic, 2 is guessable |
| builders.ts | `passkeyOf` | 1 with putWayin; 2 with unlock; 3 another salt | keep 2, 3; drop 1 | 3 surprises; one use suffices |
| builders.ts | `tweakB64` | 1, 2 the next letter; 3 empty throws | keep 1, 3; drop 2 | 2 repeats 1 |
| logging.ts | `spyLogger` | hand it in, read the levels | keep | a call sequence |
| logging.ts | `quietLogger` | 1 the default logs nowhere; 2 a spy instead | keep 1; drop 2 | 2 is `spyLogger`'s |
| logging.ts | `loggedText`, `thrownText` | the leak assertion | keep | what each is for, in three tokens |
| logging.ts | `leafTexts` | nested leaves, numbers as text | keep | a shape |
| logging.ts | `shownOf`, `jsonOf` | getters left out, versus `toJSON` | keep | the contrast picks the right one |
| models-world.ts | `fullBoxRecord`, `sparseBoxRecord`, `boxListingOf`, `boxDnaOf` | overrides | drop | `Partial<...>` overrides are guessable |
| models-world.ts | `tombstoneBoxRecord` | 1 deleted; 2 `'d'` | keep 2; drop 1 | 2 is an option with a consequence |
| models-world.ts | `makeModelsWorld` | 1 setup to `callsOf`; 2 scripting a race | keep both | a sequence, and a script no signature shows |
| models-world.ts | `useModelsWorld` | `held.mw` | keep | the indirection trips readers |
| models-world.ts | `fakeSealBoxListingOf` | 1 a rebirth; 2 the third argument | keep 2; drop 1 | 2 is an option with a consequence; 1 is a scenario, which a test holds |
| proving-world.ts | `fakeLeaseFriendOf` | scripting a refusal | drop | the first line says exactly this |
| refusals.ts | `expectRefusal` | 1 the use; 2 the refusal back | keep 1; drop 2 | 2 is the `@returns` |
| refusals.ts | `expectGood`, `omitting` | one call | drop | the name says it |
| refusals.ts | `expectingGood`, `expectBad`, `expectSyncRefusal` | the proxy; a `try` verb; the thunk form | keep | each form is the thing a reader would get wrong |
| timing.ts | `wakeupAtNextTick`, `eventually`, `changeCounter` | one call | drop | the first line or `@returns` says it |
| timing.ts | `aWhile` | wait, then assert nothing came | keep | a sequence |
| timing.ts | `makeLatch` | wrap, reach, act, release | trim | the sequence is `holdNextCall`'s; keep only the wrap, which is what `makeLatch` alone is for |
| timing.ts | `beforeNextCall`, `holdNextCall`, `holdNextAnswer`, `readAfresh` | races and their order | keep | the order is the contract |

`makeLatch`, trimmed:

```ts
 * @example
 *   const latch = TH.makeLatch()
 *   const slowDeriver = { ...TH.testDeriver, deriveKeyBytes: async (...args) => { await latch.pass(); return await TH.testDeriver.deriveKeyBytes(...args) } }
 *   // then as holdNextCall's: await latch.reached, act, latch.release()
```

## 4. Rebalance proposal

Net tokens per file are words times 1.3 (double them for the real cost). Pointer edits are on the #506 branch's
tests; renumbering follows from the drops.

**`src/helpers/`** (net -585)

* consts.ts, net -55: drop `FarFuture` 2, `FarPast`, `MinuteMillis`, `ForeverMillis` 2. Tests: the
  `ForeverMillis @example 2` pointer goes; `ForeverMillis` 1 wants a pointer where `leaseHours: Infinity` is tested.
* crypto.ts, net -17: drop `toB64`, `fromB64`, `fromB64OrNull` 1. Pointers stay. `deriveWrappingKey` wants one.
* helpers.ts, net -68: drop `adorn` 1, `tattooProp`, `decorate`, `nextMicrotask`. Pointers: `adorn @example 1`,
  both `decorate`, `tattooProp` and `nextMicrotask` go; `adorn @example 2` becomes `adorn @example`.
* logger.ts, net -120: drop `VaultLogger` 1, `parseLogger` 1, 3, 4, both of `setDefaultLogger`. Pointers:
  `parseLogger` 3, 4 and `setDefaultLogger` 1, 2 go; `parseLogger @example 2` becomes `parseLogger @example`.
* passphrase-strength.ts, net -77: drop `DefaultStrengthChecker`, both of `guardStrengthChecker`,
  `loadStrengthChecker`. All three pointers go, among them the stale `invokeStrengthChecker` one.
* stable-jsonify.ts, net -12: drop the second.
* validator.ts, net -153: drop `Checkers` 2, `consistent` 1, `demandConsistent` 1, `verifyConsistent`; replace
  `Checker` 1 with `prfSalt`. Pointers: `Checkers @example 2`, `consistent @example 1` and `verifyConsistent` go;
  `Checkers @example 3` becomes 2, `consistent @example 2` becomes `consistent @example`. Rewrite the test at
  validator.test.ts:269 around a `.refine` with its own sentence.
* one-at-a-time.ts: no change.

**`src/refusals/`** (net -316)

* errors.ts, net -63: drop the four `RefusalFamilyForKind` lines, `VaultError` 1, `listedKindOf` 1, `thrownNameOf`
  2. Tests: retitle errors.test.ts:86 for its behaviour ("sorts each kind into its family"); `thrownNameOf
  @example 2` goes; `VaultError @example 2` and `thrownNameOf @example 1` lose their numbers.
* host-error-sanitizer.ts, net -55: drop the first. Its pointer goes; the second loses its number.
* outcome.ts, net -152: drop `good`, `bad`, `outcomeOf` 2, 3, `refusalOf` 2, 3, `valOf` 2; trim `refusalOf` 1
  to one line. Pointers: `good`, `bad`, `outcomeOf` 2, 3 and `refusalOf` 2, 3 go; `outcomeOf @example 1` and
  `refusalOf @example 1` lose their numbers.
* report-error.ts, net -13: drop its one example.
* throwers.ts, net -33: drop `storageUnavailable` 2 and `unexpectedError`. The `Refusals.unexpectedError` pointer
  goes; `storageUnavailable` 1 wants one.

**`src/shapes/`** (net -253)

* primitives.ts, net -43: replace `label` 2 with the two `0__b_` lines; drop `UserIdPattern`, `user_id` 1, 3,
  `epochMillis` 1, 3, 4, 5. Tests: retitle primitives.test.ts:41 and assert `0__b_` fails with one issue,
  `Phrases.LabelShape`; the `UserIdPattern` pointer goes.
* shapes-core.ts, net -156: drop both token examples, both `Whisper` literals, `whisper` 1, 3, `sidecar` 1, 2,
  `boxscope`, `vaultBag` 1, 2 and `bankBag`. Tests: the `CX.boxscope @example 2` pointer goes;
  `CX.vaultScope @example 1` loses its number; a new `describe("vaultBag and bankBag")` takes the three dropped
  cases and the kept one; one `it` in `describe("whisper")` checks its three kept examples, as `sidecar`'s does.
* shapes-gateish.ts, net -54: drop `wayinkind`, both of `passphraseCleartext`, `passkeyAnswer` 1,
  `freshPasskeyAnswer` 1, `isLeaseKey` 1. Tests: the `wayinkind` and `passkeyAnswer @example 1` pointers go;
  `passkeyAnswer @example 2` loses its number; a new `describe("freshPasskeyAnswer")` takes both cases.
* shapes-storage.ts: no change. shapes-vaultish.ts: no change, no pointers.

**`tests/test-helpers/`** (net -314)

* builders.ts -77, logging.ts -20, models-world.ts -95, proving-world.ts -18, refusals.ts -25, timing.ts -79: the
  drops and the `makeLatch` trim in the table above. No pointers change.

**Totals.** `src/` from about 2,248 to 1,177 tokens (-1,071, 48 per cent). Test helpers from 790 to 476 (-314).
All 174 come to 1,653 (-1,385). Of #506's 62 pointer comments, 29 go, 11 lose or change a number and 22 stay.

## Open points

* **STYLE.md says "Don't be stingy with `@example`s"**, and "every `@example` has [a test] whose title points back
  to it". This audit argues the opposite default. A Coach ruling, then one edit to *Comments and doc blocks*: the
  criterion of *2* in place of the stingy line, and "*the test is the example*" as a named outcome.
* **Sequencing.** The pointer edits land on #506's tests, but the examples live at `HEAD`, ahead of `origin/main`.
  Doing the doc edits after #506 merges, in one thread with the pointer edits, avoids renumbering twice.
* **Three kept examples have no test at all**: `vaultBag` 3, `freshPasskeyAnswer` 2 and `isLeaseKey` 2. The
  proposal names new tests for the first two; `isLeaseKey` 2 wants one in lease.test.ts. More are kept with no
  pointer, tested or not: `FarFuture` 1, `ForeverMillis` 1, `deriveWrappingKey`, `VaultLogger` 2, 3, `DefaultLogger`,
  both of `StrengthChecker`, `stableJsonify` 1, `storageUnavailable` 1, `whisper` 2, 4, 5, `VaultBag`,
  `PasskeyAnswer` and `capacity`. They want a pointer pass.
* **`LabelShape` does not say "ends on a letter or digit"** in so many words: "words ... joined by single
  underscores" implies it. The `0__b_` comment names it; the sentence may want the clause.
