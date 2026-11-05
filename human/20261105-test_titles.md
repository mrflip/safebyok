# 2026-11-05: Test titles done -- 234 changed, 3 describes added, a list left alone

Branch `20261105-test_titles`, titles only: no assertion, fixture, helper, import or test order moved
(checked by diffing everything that is not a title, a `// member @example` comment, or the indent of
a wrapped test). `pnpm justify` is green. An opus review followed (below), which opened the PR.

## Tally

Titles changed (234; a title can carry two faults, counted under its main one):

* `#no-as-trailer` 101: 82 `@example` pointers (some on tests whose title was fixed for another fault) became a `// member @example [N]` comment above the test (at
  the row's end, for a blurb in a bulk list); the rest dropped a reason ("as a model freezes
  itself") or became the predicate.
* `#kind-is-the-assertion` 93: nearly all `'bad_option'`, `'bad_scope'` or `'bad_record'` on a misuse.
* `#no-citations` 18: `(Contract: Shapes)`, `(G2)`, `(G4)`, `(G8)`, `(the Coach, 2026-10-31)`.
* `#so-clause-is-the-behaviour` 7, `#name-the-referent` 6, `#invariant-not-trace` 3,
  `#outcome-not-action` 3, `#conditions-move-up` 2.

By folder: helpers 55, refusals 28, shapes 37, storage 4, models 110, loosened 0.

Gallant's own rewrites applied verbatim: ensureTimely/box.put/listing.create/puttable/settle/
revokePasskey/unsubscribe/hydrate/vault.hello/friend/isCondition/errors.ts family lists/reportError.

## Describes added (3)

* `tests/helpers/crypto.test.ts`, cipherCtx: `refuses 'bad_option' for` over four contiguous refusals.
* `tests/shapes/shapes-gateish.test.ts`, passkeyAnswer: the same, over three.
* `tests/models/vault-lease.test.ts`: `with no onPanic and no reportError` over the one test
  `still vacates the vault` (its sibling, with an onPanic absent but reportError present, stays out).

Four existing describes lost a citation tag in their titles (box-listing, box-putting, box-whisper,
box tests: "(the Coach, 2026-10-31)").

## Left alone

* **Citation, by design** (`#no-citations`, but the folder's doc block says each `it` names its
  source and line): all 10 titles in `tests/loosened/` (lease.test.ts:12; loosened.test.ts:20, 29,
  58, 67, 80; vault.test.ts:12, 32, 51, 64). Say if they should go the way of the others.
* **Templates** (`#templates-are-tables`): kinds or trailers survive in logger.test.ts:32, 188;
  passphrase-strength.test.ts:82 ("as its second example shows"), 96, 108; box-listing-rows.test.ts
  69, 80, 87; box-listing-create.test.ts:296; and the `${blurb} as 'bad_option'` lists in
  lease.test.ts, proving.test.ts, box-whisper.test.ts, box.test.ts, listing-verbs.test.ts.
* **`#outcome-not-action`, two behaviours in one `it`**: models/box-listing.test.ts:145 ("refuses
  'bad_option' fed a put's ifAbsent, and 'disabled' once vacated"); storage/device-db-new.test.ts:166
  (empty list, and a bad cutoff; I only dropped its kind).
* **`#conditions-move-up`, siblings not contiguous**, so a describe would move a test: bank-ending.test.ts
  54, 79, 95 ("past autolock, ..."); vault-listing.test.ts:246, 268, 276, 285 ("Vault.launchBirth
  refuses ...", with 262 between).
* **`#so-clause-is-the-behaviour`, both halves are asserted or I cannot tell**: bank-ending.test.ts:33,
  95, 284; storable.test.ts:86, 208, 218; box.test.ts:90, 164, 202; lease.test.ts:104, 137, 275;
  vault-gate.test.ts:103; proving.test.ts:417; validator.test.ts:240 (also "X, and Y").
* **Several clauses, each asserted**: passphrase-strength.test.ts:63; validator.test.ts:106.
* **Title is the pointer**: shapes-core.test.ts:64, errors.test.ts:86, 188 ("matches the @example(s)");
  the behaviour is not nameable without opening the doc block.
* **`'unexpected_error'` kept** (a bug, not a misuse: is the kind the behaviour?):
  proving.test.ts:405, 417, 424, 432.
* **Unclear**: box-listing-rows.test.ts:239 ("Bob's your uncle by any path"); vault-boxes-putting.test.ts:311
  ("is what putBox of a sidecar alone does to a box held"); logger.test.ts keeps a fixture type named
  `CoachsLogger`.
* **Condition kinds kept on purpose** (`stale_write`, `camped`, `absent_box`, `vault_locked`,
  `damaged_box`, `wrong_passphrase`, `storage_unavailable`, `record_conflict`, `invalid_input` ...):
  they are the behaviour.

## The opus review

Checked mechanically that nothing but titles, blurbs, `@example` comments and the three wrappers moved (a script
normalizing those away left both sides identical in all 44 files). Then, past the worker's 234:

* **Pointers to examples that do not exist, dropped** (19): `VX.whisperHolder` 1-5, `VX.boxDna` 1, 2, 2, 4-8,
  `VX.boxPatch` 6, 7 and two unnumbered, `VX.sparseBase`. `src/shapes/shapes-vaultish.ts` holds no `@example` at all: the
  "as its Nth example shows" trailers they came from were already stale. If those checkers should have examples, that
  is a documentarian run, and the tests can point at them then.
* **Pointers corrected** (4): `verifyConsistent` holds one example, so `@example 1` became `@example` and the pointers
  to a second and a third went; `MaxLabelChars and LabelPattern @example` became `LabelPattern @example`;
  `ForeverMillis @example` became `@example 2`, the one its test checks.
* **Titles fixed that the first pass missed** (6): stable-jsonify.test.ts:18 ("as JSON.stringify does" became
  "matches JSON.stringify on primitives and null"); vault-db-new-dels.test.ts:70, 83 and vault-db-new-puts.test.ts:207
  ("refuses as a read does" names `'damaged_record'` or `'newer_format'`, the condition kinds asserted);
  vault-boxes.test.ts:122, 133 (dropped "as its dbhas is the vault's").
* **Changeset commit** reworded from `tools:` to `tests:` (a changeset rides with its change; `b7ef4069` is the
  precedent), and the two `plan:` commits for this entry folded into one.

## Ambiguities in notes/gallant-test_titles.md

* Which kinds are "the behaviour"? I read misuse kinds (`bad_*`) as never, condition and tamper kinds
  as always, and `unexpected_error` as undecided.
* Dropping the kind vs the grouping describe: the file shows both. I dropped it, and grouped only
  three or more contiguous siblings in one describe whose own name was not already about refusal.
* "As its example shows" with no number: I wrote `// member @example` with no N. And the comment goes
  on the line above `it(`, not inside the body.
* A "(Contract: Shapes)" or "(G2)" tag is a citation here; if it is a house marker, restore it.
* Wrapping a single test in a describe (the onPanic case) follows the file's example but is not
  "siblings".
