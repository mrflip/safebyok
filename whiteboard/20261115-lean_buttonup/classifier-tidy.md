# The classifier tidy: call chain and proposals

For step 4 of `complete.md` (*The classifier tidy*). Whiteboarded 2026-11-16 and 2026-11-17, after #713. Nothing here is
ruled: each proposal is marked whose. The call chain below was drawn by an agent from the base checkout with #713's code;
its counts are an agent's, not checked by hand.

## The Coach's proposals

In close to the Coach's words:

* **Quickly separate null from not.** It will be a big win.
* **Prove early that the record is not damaged,** which gets rid of the `unknown` typing. Validate at entrypoints.
* **`storedCitedOf` is not what's stored, but a subset of it.** `const stored = storedCitedOf(ask, raw)` then
  `const act = writeActOf(ask, stored)`: "This line is a lie."
* **`classifyWriteThing`'s contract is to return the actual stored record,** which
  `return { ok: true, act, world: worldOf(ask, worldFetched), record: ask.record, ...trackedFieldOf(ask, worldFetched.tracked) }`
  violates.
* **`demandBornAtKept` is `demandConsistent(bag1, bag2, refusal, phrase)`,** or better `checker.parseConsistent(bag1, bag2,
  refusal, ...)`, which parses and compares: any shared key must be equal. No reason for another signature.
* **Policies, step by step:**
  ```ts
  const why = policyRefusalOf(ask, StoredWayinsCheck.parse(raw).wayins)     // today
  if (why !== null) { throw gateIssue(storedThingOf(ask, raw), why) }

  const why = policyRefusalOf(actual.row.wayins)                            // the unknown typing gone
  if (why !== 'met') { throw gateIssue(actual, why) }

  const why = policyRefusalOf(actual)                                       // a good signature
  if (why !== 'met') { throw gateIssue(actual, why) }

  demandMet(policyRefusalOf(actual))                                        // which suggests

  demandPoliciesMet(actual)                                                 // and why throw away from the condition?
  ```
* **A row damaged in its key fields cannot be retrieved,** so it is not a case. Reasoning from the memory store, where any
  value can sit under a key, is what makes it look like one.
* **For later:** Claude reasoning off the memory store may explain the fixation on damaged rows.
* The tree has 58 branches under `classifyWriteThing`: 2^58 paths is not a fair count, but it is a bit much (and an
  undercount, without try/catch).

## Claude's proposals

* **Parse each row once per call,** with the kind's full checker, at the top: the act tables read their cited fields from
  it, the policies read its `wayins`, and a refusal's `dbhas` is it. `demandBornAtKept` becomes `demandConsistent` on that
  row, and the `?.` it guards with goes. (Today `classifyWriteThing` parses one raw row up to four times.)
* **One `storedOf`.** `storedCitedOf` -> `storedOf` -> `writtenOf`, with `storedThingOf` beside them, is 4 lines of logic
  costing 10; `listedThingOf` (and `watchedThingOf`) spell the same guard a third way.
* **`worldOf` throws on a damaged or misscoped row,** with null only for absent, rather than `} catch { return null }`.
* **Dead branches go** once the row is parsed once: the `?.` in `demandBornAtKept`, `policyRefusalOf`'s
  `ask.options?.policies ?? []` (a repeat of `demandPolicies`' guard), and `unwrittenBirthOf`'s `(bank === null)`.
* **Left alone:** `putActOf` and `delActOf` sharing four rows (each verb reads as its own table); answers built twice
  differing only in `ok` (narrowing needs the literals); the birth's double classification (the birth is being redone).
* **For `whiteboard/20261116-world_function/world_function.md`:** a null tracked row throws `storage_issue` through
  `trackedEntryOf` -> `writtenOf`, failing every answer that tracks the bank. Today that is only a broken bank; once a
  void root box is legal, it must change.
* Withdrawn: a "contract question" about a write over a row damaged in its uncited fields. It was framed from the memory
  store (the Coach's point above).

## The call chain

Source: `/workspace/byok/packages/safebyok/src/storage/thing-classifier.ts`, base checkout (PR #713's code). Helpers come from `shapes-thing.ts` and `policies.ts`.

How the columns were counted:
- **Branches:** `if` (an `else if` counts as its own `if`), ternaries, `?.` and `??`. Every `&&`/`||` is listed separately, with a note where it short-circuits a call or a dereference. `for` loops and `try/catch` are listed separately too; they are not in the count.
- **Allows nulls:** `no` where a parameter typed `unknown` throws on null, with the reason in the note.
- **Null as a sentinel:** `no (consumes X's)` marks a function that tests a callee's sentinel and does not pass it on.
- **Lines:** the body's lines (statements, plus any `//` comment inside), `->` signature + body + closing line. A one-liner costs 3. Module constants used by only one function are given in its note.
- **Leaves** are marked `[parser]`, `[thrower]`, `[big]` or `[lib]`.
- **Alternatives:** where only one of several callees runs per call, the note says so.
- **Repeats:** under `classifyWriteThing`, a function reached again under a different parent is written out again. Under the later roots it is written `(see classifyWriteThing)` or `(see classifyGetThing)`.

### classifyWriteThing

```
thing-classifier.classifyWriteThing(ask, raw, worldFetched) (2: 2 if; yes; no; 8 -> 10)  (either unwrittenWriteOf, or [demandBornAtKept, demandPolicies when 'replaced'] + worldOf + trackedFieldOf)
- thing-classifier.storedCitedOf(scope, raw) (0; yes; no; 1 -> 3)  (only injects StoredCitedCheck into storedOf; +1 const line StoredCitedCheck)
   - thing-classifier.storedOf(check, scope, raw) (1: 1 ternary; yes; no; 1 -> 3)  (only a null guard over writtenOf)
      - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no (null raw throws storage_issue); no; 2 -> 4)  (destructures the scope and rebuilds the same three-field bag)
         - big CX.isPlainBag(raw)  [big]
         - big Throwers.storageIssue()  [thrower, big]
         - check.parseConsistent(raw, other, refusal)  [parser: StoredCitedCheck = storedCited.refusingAs('damaged_row')]
- thing-classifier.writeActOf(ask, stored) (1: 1 ternary; yes; no; 1 -> 3)  (one of putActOf / delActOf per call)
   - thing-classifier.putActOf(ask, stored) (13: 8 if, 5 ternary; plus 4 &&/|| in conditions, one || short-circuits isLifeMismatch; yes; no; 14 -> 16)
      - thing-classifier.presenceOf(stored) (2: 1 if, 1 ternary; yes; no; 2 -> 4)
      - thing-classifier.revseqCmpOf({ cited }, stored) (4: 3 if, 1 ternary; yes; no; 4 -> 6)
      - thing-classifier.revtokCmpOf({ cited, record }, stored) (4: 2 if, 2 ternary; yes; no; 3 -> 5)
      - thing-classifier.isLifeMismatch({ cited }, stored) (0; plus && guarding the null, ||; yes; no; 1 -> 3)  (called only when revtokCmp and revseqCmp are both 'eq')
   - thing-classifier.delActOf(ask, stored) (8: 6 if, 2 ternary; plus 3 &&/|| in conditions; yes; no; 10 -> 12)  (its first four rows are putActOf's, verbatim)
      - thing-classifier.presenceOf(stored) (2: 1 if, 1 ternary; yes; no; 2 -> 4)
      - thing-classifier.revseqCmpOf({ cited }, stored) (4: 3 if, 1 ternary; yes; no; 4 -> 6)
      - thing-classifier.revtokCmpOf({ cited, record }, stored) (4: 2 if, 2 ternary; yes; no; 3 -> 5)
      - thing-classifier.isLifeMismatch({ cited }, stored) (0; plus && guarding the null, ||; yes; no; 1 -> 3)
- thing-classifier.isWriteAct(act) (0; no; no; 1 -> 3)
   - big EX.writeActVals  [big const; .includes]
- thing-classifier.unwrittenWriteOf(raw, { ask, act, world }) (1: 1 ternary; yes; no; 4 -> 6)  (non-write acts only; its two branches differ only in `ok`; parses raw a second time, with another checker)
   - thing-classifier.storedThingOf(scope, raw) (0; yes; no; 1 -> 3)  (only injects the kind's checker into storedOf)
      - shapes-thing.kindChecksOf(labelpath) (0; no; no; 1 -> 3)
         - shapes-thing.modelkindOf(labelpath) (0; no; no; 1 -> 3)
      - thing-classifier.storedOf(check, scope, raw) (1: 1 ternary; yes; no; 1 -> 3)
         - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
            - big CX.isPlainBag(raw)  [big]
            - big Throwers.storageIssue()  [thrower, big]
            - check.parseConsistent(raw, other, refusal)  [parser: KindChecks[kind].stored]
   - thing-classifier.worldOf({ userid, banklabel }, fetched) (1: 1 ternary; plus || in condition, try/catch; yes; yes; 5 -> 7)  (the catch turns any throw into null, so null means missing, damaged, other scope or not an object)
      - thing-classifier.storedOf(check, scope, raw) (1: 1 ternary; yes; no; 1 -> 3)  (bank, KindChecks.bank.stored)
         - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
            - big CX.isPlainBag(raw)  [big]
            - big Throwers.storageIssue()  [thrower, big]
            - check.parseConsistent(raw, other, refusal)  [parser]
      - ...
   - thing-classifier.trackedFieldOf({ userid, banklabel }, fetched) (1: 1 if; plus || in condition; yes; no; 6 -> 8)  (the if tests both null and undefined, two spellings of "tracks nothing")
      - thing-classifier.trackedEntryOf(check, scope, raw) (1: 1 ternary; no (null raw reaches writtenOf and throws storage_issue); no ('same' string is its sentinel); 1 -> 3)
         - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
            - big CX.isPlainBag(raw)  [big]
            - big Throwers.storageIssue()  [thrower, big]
            - check.parseConsistent(raw, other, refusal)  [parser]
      - ...
      - ...
   - thing-classifier.isRefusedAct(act) (0; no; no; 1 -> 3)
      - big EX.refusedActVals  [big const; .includes]
- thing-classifier.demandBornAtKept(ask, raw) (2: 1 if, one ?.; yes; no; 2 -> 4)  ('replaced' only; this root can't reach the ?., since 'replaced' needs a live Thing stored)
   - thing-classifier.storedCitedOf(scope, raw) (0; yes; no; 1 -> 3)  (raw's second parse by StoredCitedCheck in this call)
      - thing-classifier.storedOf(check, scope, raw) (1: 1 ternary; yes; no; 1 -> 3)  (this root can't reach the null branch)
         - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
            - big CX.isPlainBag(raw)  [big]
            - big Throwers.storageIssue()  [thrower, big]
            - check.parseConsistent(raw, other, refusal)  [parser]
   - thing-classifier.storedThingOf(scope, raw) (0; yes; no; 1 -> 3)  (throw path only, for rows.dbhas)
      - shapes-thing.kindChecksOf(labelpath) (0; no; no; 1 -> 3)
         - shapes-thing.modelkindOf(labelpath) (0; no; no; 1 -> 3)
      - thing-classifier.storedOf(check, scope, raw) (1: 1 ternary; yes; no; 1 -> 3)  (this root can't reach the null branch)
         - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
            - big CX.isPlainBag(raw)  [big]
            - big Throwers.storageIssue()  [thrower, big]
            - check.parseConsistent(raw, other, refusal)  [parser]
   - new Errors.VaultError('bad_record', BornAtNotStored, { rows, meta })  [thrower, big]
- thing-classifier.demandPolicies(ask, raw) (4: 2 if, one ?., one ??; plus || in condition; yes (ask.options may be absent); no (consumes policyRefusalOf's); 3 -> 5)  ('replaced' only; +1 const line StoredWayinsCheck)
   - StoredWayinsCheck.parse(raw)  [parser: storedWayins.refusingAs('damaged_row'); raw's third parse; no isPlainBag guard and no scope check]
   - policies.policyRefusalOf(ask, stored) (3: 1 if, one ?., one ??; plus for loop; yes; yes (null = every policy allows); 6 -> 8)  (this root can't reach the ?. or ?? fallback: demandPolicies has already returned unless policies.length > 0)
      - policies.GatePolicies.replace_passphrase({ cited, record }, stored) (3: 2 if, one ?.; yes (cited.wayins may be absent); yes (null = allow); 3 -> 5)  (one GatePolicies entry per policy named)
         - es-toolkit isEqual, omit  [lib]
      - policies.GatePolicies.add_passkey({ record }, stored) (3: 3 if; yes (passkey0 null = none); yes (null = allow); 4 -> 6)
         - es-toolkit isEqual, omit  [lib]
      - policies.GatePolicies.revoke_passkey({ record }, stored) (3: 3 if; yes (passkey0 null = none); yes (null = allow); 4 -> 6)  (third row is add_passkey's third row, verbatim)
         - es-toolkit isEqual, omit  [lib]
   - thing-classifier.storedThingOf(scope, raw) (0; yes; no; 1 -> 3)  (throw path only, for rows.dbhas; argument to gateIssue)
      - shapes-thing.kindChecksOf(labelpath) (0; no; no; 1 -> 3)
         - shapes-thing.modelkindOf(labelpath) (0; no; no; 1 -> 3)
      - thing-classifier.storedOf(check, scope, raw) (1: 1 ternary; yes; no; 1 -> 3)  (this root can't reach the null branch)
         - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
            - big CX.isPlainBag(raw)  [big]
            - big Throwers.storageIssue()  [thrower, big]
            - check.parseConsistent(raw, other, refusal)  [parser]
   - policies.gateIssue(stored, why)  [thrower: builds the VaultError the caller throws]
- thing-classifier.worldOf({ userid, banklabel }, fetched) (1: 1 ternary; plus || in condition, try/catch; yes; yes; 5 -> 7)  (write acts)
   - thing-classifier.storedOf(check, scope, raw) (1: 1 ternary; yes; no; 1 -> 3)
      - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
         - big CX.isPlainBag(raw)  [big]
         - big Throwers.storageIssue()  [thrower, big]
         - check.parseConsistent(raw, other, refusal)  [parser]
   - ...
- thing-classifier.trackedFieldOf({ userid, banklabel }, fetched) (1: 1 if; plus || in condition; yes; no; 6 -> 8)  (write acts)
   - thing-classifier.trackedEntryOf(check, scope, raw) (1: 1 ternary; no; no; 1 -> 3)
      - thing-classifier.writtenOf(check, { userid, banklabel, labelpath }, raw) (1: 1 if; no; no; 2 -> 4)
         - big CX.isPlainBag(raw)  [big]
         - big Throwers.storageIssue()  [thrower, big]
         - check.parseConsistent(raw, other, refusal)  [parser]
   - ...
   - ...
```

### classifyGetThing

```
thing-classifier.classifyGetThing(ask, raw, worldFetched) (1: 1 ternary; yes; no; 5 -> 7)  (its two branches differ only in `ok`)
- thing-classifier.storedThingOf(scope, raw) (see classifyWriteThing)  (the storedOf null branch is reachable here)
- thing-classifier.getActOf({ ifAbsent }, stored) (4: 2 if, 2 ternary; yes; no; 4 -> 6)
   - thing-classifier.presenceOf(stored) (see classifyWriteThing)
- thing-classifier.worldOf({ userid, banklabel }, fetched) (see classifyWriteThing)
- thing-classifier.trackedFieldOf({ userid, banklabel }, fetched) (see classifyWriteThing)
- thing-classifier.isRefusedAct(act) (see classifyWriteThing)
```

### classifyListThings

```
thing-classifier.classifyListThings(ask, { parent, children }, worldFetched) (7: 5 if, 1 ternary, one ?.; plus for loop; yes; no (consumes listedThingOf's); 20 -> 22)  (its two early returns differ only in `ok`)
- thing-classifier.storedThingOf(scope, raw) (see classifyWriteThing)
- thing-classifier.getActOf({ ifAbsent }, stored) (see classifyGetThing)
- shapes-thing.sparseOf(record) (0; no; no; 1 -> 3)  (parent, when one is stored)
   - es-toolkit pick  [lib]
- thing-classifier.worldOf({ userid, banklabel }, fetched) (see classifyWriteThing)
- thing-classifier.trackedFieldOf({ userid, banklabel }, fetched) (see classifyWriteThing)
- thing-classifier.isRefusedAct(act) (see classifyWriteThing)
- thing-classifier.isChildLabelpath(ask, labelpath) (0; plus 2 &&, short-circuiting isLabelpathOfKind; no; no; 2 -> 4)  (once per child; the middle conjunct is implied by the other two; label is sliced before the prefix is tested)
   - shapes-thing.isLabelpathOfKind(labelpath, modelkind) (0; plus 2 &&; no; no; 2 -> 4)
      - big Validator.Kit.label.safeParse(label)  [parser, big]
- new Errors.VaultError('storage_issue', BigPhrases.rowOfOtherAddress(['labelpath']))  [thrower, big]
- thing-classifier.listedThingOf(scope, raw) (2: 1 if, 1 ternary; no (null raw throws storage_issue); yes (null = fails its checks); 3 -> 5)  (once per child; has writtenOf's isPlainBag guard, but safeParse + checkedConsistent where writtenOf has parseConsistent)
   - big CX.isPlainBag(raw)  [big]
   - big Throwers.storageIssue()  [thrower, big]
   - shapes-thing.kindChecksOf(labelpath) (see classifyWriteThing)
   - kindChecksOf(labelpath).stored.safeParse(raw)  [parser]
   - big Validator.checkedConsistent(data, scope, refusal)  [big]
- es-toolkit sortBy  [lib]
- ...  (sparseOf, once per living child)
```

### classifyBirthBank

```
thing-classifier.classifyBirthBank(puts, fetched) (1: 1 if; yes; no (consumes unwrittenBirthOf's); 5 -> 7)
- thing-classifier.unwrittenBirthOf(puts, fetched) (3: 3 if; plus 2 || in condition, for loop; yes; yes (null = the act tables let it write); 14 -> 16)  (re-classifies the bank's put on the loop's first pass)
   - thing-classifier.storedCitedOf(scope, raw) (see classifyWriteThing)  (bank)
   - thing-classifier.putActOf(ask, stored) (see classifyWriteThing)  (bank's put, tested for 'passed')
   - thing-classifier.storedOf(check, scope, raw) (see classifyWriteThing)  ('passed' path: bank, KindChecks.bank.stored; fetched.bank's second parse)
   - ...  (gate)
   - ...  (root)
   - new Errors.VaultError('storage_issue', BankRootsMissing)  [thrower, big]  (this root can't reach the `bank === null` disjunct: storedCitedOf just found the bank live)
   - thing-classifier.trackedFieldOf({ userid, banklabel }, fetched) (see classifyWriteThing)  ('passed' path)
   - ...  (storedCitedOf in the loop, up to 3 times; the first is the bank's again)
   - ...  (putActOf in the loop, up to 3 times; the first is the bank's again)
   - thing-classifier.isRefusedAct(act) (see classifyWriteThing)
   - thing-classifier.worldOf({ userid, banklabel }, fetched) (see classifyWriteThing)  (refusal path)
   - thing-classifier.storedThingOf(scope, raw) (see classifyWriteThing)  (refusal path)
   - ...  (trackedFieldOf, refusal path)
```

### Totals per root

Distinct new-core functions reached, the root included. Leaves are not counted. Branches and lines are summed once per distinct function.

| Root | Functions | Branches | &&/\|\| (also loops, try) | Lines replaced -> costed |
|---|---|---|---|---|
| classifyWriteThing | 26 | 58 | 12 (1 for, 1 try) | 90 -> 142 |
| classifyGetThing | 12 | 12 | 2 (1 try) | 30 -> 54 |
| classifyListThings | 16 | 20 | 6 (1 for, 1 try) | 53 -> 85 |
| classifyBirthBank | 17 | 32 | 10 (1 for, 1 try) | 63 -> 97 |

What each root reaches:
- classifyWriteThing: classifyWriteThing, storedCitedOf, storedOf, writtenOf, writeActOf, putActOf, presenceOf, revseqCmpOf, revtokCmpOf, isLifeMismatch, delActOf, isWriteAct, unwrittenWriteOf, storedThingOf, kindChecksOf, modelkindOf, worldOf, trackedFieldOf, trackedEntryOf, isRefusedAct, demandBornAtKept, demandPolicies, policyRefusalOf, GatePolicies.replace_passphrase, .add_passkey, .revoke_passkey.
- classifyGetThing: classifyGetThing, storedThingOf, kindChecksOf, modelkindOf, storedOf, writtenOf, getActOf, presenceOf, worldOf, trackedFieldOf, trackedEntryOf, isRefusedAct. Only classifyGetThing and getActOf are new to this root.
- classifyListThings: classifyListThings, storedThingOf, kindChecksOf, modelkindOf, storedOf, writtenOf, getActOf, presenceOf, sparseOf, worldOf, trackedFieldOf, trackedEntryOf, isRefusedAct, isChildLabelpath, isLabelpathOfKind, listedThingOf. Five are new to this root.
- classifyBirthBank: classifyBirthBank, unwrittenBirthOf, putActOf, presenceOf, revseqCmpOf, revtokCmpOf, isLifeMismatch, storedCitedOf, storedOf, writtenOf, trackedFieldOf, trackedEntryOf, isRefusedAct, worldOf, storedThingOf, kindChecksOf, modelkindOf. Two are new to this root.

### What stood out

1. **The same raw row is parsed several times in one classifyWriteThing call.** The first parse is `const stored = storedCitedOf(ask, raw)`.
   - Non-write act: `const record  = storedThingOf(ask, raw)` in unwrittenWriteOf parses it again, with the kind's checker: two parses.
   - 'replaced': `storedCitedOf(ask, raw)?.born_at` in demandBornAtKept parses it a second time with the same checker, and `StoredWayinsCheck.parse(raw).wayins` a third (a gate that names policies).
   - A throw out of either demand: `storedThingOf(ask, raw)` builds `rows.dbhas` from one more parse.
2. **The same bank row is parsed several times in one classifyBirthBank call.** `if (putActOf(bankPut, storedCitedOf(bankPut, fetched.bank)) === 'passed')` classifies the bank's put, and then the loop's first entry, `[bankPut, fetched.bank]`, runs `putActOf(put, storedCitedOf(put, raw))` on the same put and the same row again.
   - Bank refused: fetched.bank is parsed four times (StoredCitedCheck twice, worldOf's `KindChecks.bank.stored`, then `storedThingOf(put, raw)`).
   - 'passed': twice (`storedOf(KindChecks.bank.stored, bankPut, fetched.bank)`).
3. **Branches this root can't reach.**
   - From classifyWriteThing:
     - the `?.` in `storedCitedOf(ask, raw)?.born_at`, since 'replaced' needs a live Thing stored;
     - storedOf's `(raw === null) ? null` under demandBornAtKept and under the throw-path storedThingOf calls;
     - policyRefusalOf's `ask.options?.policies ?? []` fallback, since demandPolicies has already returned on `((ask.options?.policies.length ?? 0) === 0)`.
   - From classifyBirthBank: the `(bank === null)` disjunct of `if ((bank === null) || (gate === null) || (root === null))`.
4. **The same check, repeated up the tree.**
   - The options guard: `(ask.modelkind !== 'gate') || ((ask.options?.policies.length ?? 0) === 0)` in demandPolicies, then `const policies = ask.options?.policies ?? []` in policyRefusalOf.
   - The modelkind half: for an ask that went through checkedWriteAsk, isPolicyOwn's `(options?.policies ?? []).every((policy) => owned.includes(policy))` already rules out policies on a non-gate. classifyWriteThing does not check its ask itself.
5. **Helpers that only inject an argument.**
   - `return storedOf(StoredCitedCheck, scope, raw)` (storedCitedOf).
   - `return storedOf<Thing>(kindChecksOf(scope.labelpath).stored, scope, raw)` (storedThingOf).
   - `return (raw === null) ? null : writtenOf(check, scope, raw)` (storedOf, a null guard).
   - `return KindChecks[modelkindOf(labelpath)]` (kindChecksOf).
   - The chain storedCitedOf -> storedOf -> writtenOf is 4 lines of body and costs 10 lines.
6. **writtenOf takes the scope apart and builds it again.** The parameter is `{ userid, banklabel, labelpath }: ThingScope` and the call is `check.parseConsistent(raw, { userid, banklabel, labelpath }, RowOfOtherScope)`. Callers pass the whole ask as the scope.
7. **The null guard is spelled differently in different places.**
   - The plain-bag guard `if (! CX.isPlainBag(raw)) { throw Throwers.storageIssue() }` is in writtenOf and in listedThingOf (and in watchedThingOf, which these roots don't reach).
   - listedThingOf then uses `safeParse` + `Validator.checkedConsistent(parsed.data, scope, RowOfOtherScope)`, where writtenOf uses `parseConsistent`.
   - StoredWayinsCheck runs with no plain-bag guard and no scope check: `StoredWayinsCheck.parse(raw).wayins`. The same row has already passed storedCitedOf in that call.
8. **trackedFieldOf tests two spellings of absence:** `if ((fetched === null) || (fetched === undefined)) { return {} }`. The field is `tracked?: TrackedFetched`, and TrackedFetched itself includes `| null`.
9. **A null tracked row throws.** trackedEntryOf is `(raw === 'same') ? 'same' : writtenOf(check, scope, raw)`, so a null entry reaches writtenOf and throws storage_issue. TrackedRows' doc says its rows are "each null for none", and trackedRawOf (the store's helper, not reached from these roots) hands a row that isn't a plain bag back unchanged: `(CX.isPlainBag(raw) && ...) ? 'same' : raw`. Whether a store can send a null entry was not checked.
10. **worldOf's catch turns every throw into null:** `} catch { return null }`. A null world can mean a missing row, a damaged one, one of another scope, or one that isn't an object.
11. **Where null stands for a condition rather than for absence:**
   - worldOf (above);
   - listedThingOf: `parsed.success ? Validator.checkedConsistent(...) : null`, meaning damaged;
   - unwrittenBirthOf: the final `return null`, meaning "the act tables let it write";
   - policyRefusalOf and the three GatePolicies: `return null`, meaning allowed.

   Everywhere else in these trees, null means only that nothing is stored.
12. **Answers built twice, differing only in `ok`.**
   - classifyGetThing: `isRefusedAct(act) ? { ok: false, act, world, record: stored, ...beside } : { ok: true, act, world, record: stored, ...beside }`.
   - unwrittenWriteOf: `{ ok: false, act, world: checked, record, ...beside } : { ok: true, act, world: checked, record, ...beside }`.
   - classifyListThings: `{ return { ok: false, act, world, listed: [], parent, damaged_rows: [], ...beside } }`, then `if (stored?.am !== 'a') { return { ok: true, act, world, listed: [], parent, damaged_rows: [], ...beside } }`.
13. **putActOf and delActOf share their first four rows verbatim,** from `if (revtokCmp  === '=next')` through `{ return 'forked' }`, and both compute presenceOf, revseqCmpOf and revtokCmpOf.
14. **A row shared by add_passkey and revoke_passkey:** `if (! isEqual(omit(record.wayins, ['passkey0']), omit(stored, ['passkey0']))) { return BigPhrases.OtherWayinMoved }` is the third row of both.
15. **isChildLabelpath's middle conjunct is implied by the other two.** `(! label.includes('/'))` already follows from isLabelpathOfKind's `labels.length <= MaxLabelsUnder[modelkind]`, since MaxLabelsUnder is at most 1. Also, `const label = labelpath.slice(ask.labelpath.length + 1)` runs before the `startsWith` prefix test.
16. **Where this report reads the sentinel column differently from the Coach's example:**
   - storedOf: the example says `yes`. Its null means only `raw === null` (nothing stored), so this report has `no`.
   - storedCitedOf: `no` here, not `not itself`, because what it passes through is not a sentinel.
   - demandBornAtKept: `no` here. It returns void and passes no null; a null from storedCitedOf only makes it throw `bad_record`.
17. **Classified as leaves:** `policies.gateIssue(stored, why)` and `new Errors.VaultError(...)`. They return or construct the error and the caller throws it, so both count as throwers here.
