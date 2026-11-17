# Title nominations: specimens of the test-title register in `packages/safebyok/tests/`, one fault each, for the Coach's Gallants
Harvest read at commit b7bacb68 (working tree as found); titles verbatim, line numbers are the `it(`/`describe(` lines.

Counts: 1148 `it`/`test` titles (328 `describe`). Quoted kind 248 (234 in quotes). "as" trailer 84 (68 of them `as ... example shows`). Outcome chain 430 (`: ` 231, `, and ` 248, `;` 23, `then` 16; overlapping). Condition stack (3+ comma parts) 291. Added: reason chain 77; `label:` lead 67.

## 1. The quoted kind
The title names a refusal kind (quoted or bare) that the assertion already checks.

- `tests/models/vault.test.ts:179` — "refuses a maxMillis out of range as 'bad_option'"
- `tests/models/vault.test.ts:179` — "maxMillis out of range refuses 'bad_option'"

If 3 or above, group:
  describe("refuses 'bad_option' for", () => {
    it("a stamp with no vault_tok") {...}
    ...
    ...
  })


## 2. The "as" trailer
A trailing `as ...` clause pointing at an example, a sibling that does the same, or a reason.

// @fable -- (fix to your recommended gallant)
- `tests/helpers/logger.test.ts:37` — "falls back to the console when given none, as its second example shows"
- `tests/refusals/errors.test.ts:26` — "puts the same kinds in each family as the doc block in errors.ts does"
- `tests/refusals/report-error.test.ts:15` — "does nothing where the platform has no reportError, as Node has none"

## 3. The outcome chain
Two outcomes in one title, joined by `, and`, `;` or a colon. These should be different tests
(is that the sin here?)
- `tests/models/listing.test.ts:203` — "lets a listener go, and tells none after"
- `tests/models/listing.test.ts:203` — "lets a listener go"
- `tests/models/listing.test.ts:203` — "tells none after"
- `tests/models/vault-gate.test.ts:226` — "answers at once with no passkey held: nobody asked, nothing moved"
- `tests/models/storable.test.ts:233` — "notifies nobody when it changes nothing, and keeps the snapshot"

describe("BoxListing", () => {
  describe("listing.create(dna)", () => {

- `tests/models/box-listing-create.test.ts:48` — "listing.create(dna)=> "refreshes the world once, puts once, and fetches nothing, then takes the world"
... is this an example


```ts
  it("refuses 'bad_option' fed a put's ifAbsent, and 'disabled' once vacated", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.get(held.mw.boxscope(Label), { ifAbsent: 'add' } as never), 'bad_option')
    listing.vacate()
    await TH.expectRefusal(listing.get(held.mw.boxscope(Label)), 'disabled')
  })
```

## 4. The mechanism narration
The title narrates the steps the code takes (what it calls, in what order) rather than naming the behaviour.

- `tests/models/storable-ops.test.ts:103` — "waits on the world's ensureTimely before it fetches"
- `tests/models/storable-ops.test.ts:103` — "becomes timely before it fetches"
- `tests/models/box-putting.test.ts:76` — "fetches the full record of a box held sparse before its seal"
- `tests/models/box-putting.test.ts:76` — "before sealing, a sparse box -- even if recent -- must fetch the full record"

I think my rewrites may somewhat more adhere to the accusation than the remedy, thoughts?

## 5. The condition stack
Three or more comma-separated conditions or qualifiers hung on one verb.

- `tests/models/vault-lease.test.ts:106` — "with no onPanic, on a platform with no reportError, still vacates the vault"
- `tests/models/box-listing.test.ts:159` — "makes one void box for a slot with nothing held, timely, in things and not the snapshot, asking storage nothing"
- `tests/models/listing.test.ts:131` — "tells a refusal met on the way, with no onBadNews given, to nobody and still resolves"

do we have eslint rules against deep nests? That may be forcing things

## 6. The lost referent
`one`, `it`, `its own` stand for a noun the title never names.

@fable What does this even do so I can rewrite it (or propose one yourself):

- `tests/models/box-putting.test.ts:227` —
"box.put holds its patch to boxPatch before any demand (the Coach, 2026-10-31)" => "refuses it after the one fetch its ensure asks of a box held sparse"

## 7. The citation
A ruling, a date, a gate code or a section tag in the title: omit
This:
* had like a zillion tests under it;
* the describe blocks it should have are clear ( ifPresent, including default; applying patch; etc)
* Mild glossolalia
* names the means not the outcome
* the date

"box.put: the versioned replace, with or without ifPresent 'repl'"=>
- `tests/models/box-putting.test.ts:219` — "box.put holds its patch to boxPatch before any demand (the Coach, 2026-10-31)"

- `tests/models/box-putting.test.ts:219` —
"box.put performs a versioned replace"=>
 "checks preconditions"
 "assembles a combined record before any demand"

## 8. The template title
A `${...}` title that restates its inputs or reads as a table row in the runner's output.
(these are encouraged actually)

- `tests/models/storable.test.ts:42` — "reads ${String(post.revision_seq)}/${post.revision_tok} against 2/rev-c2 as '${age}': ${blurb}"
- `tests/models/storable-receiving.test.ts:86` — "older | ${rcvdShape} | ${centralShape} takes 'older', central as it was"
- `tests/models/box-putting.test.ts:106` — "refuses 'stale_write' for a box that moved in storage, handing the box the revision stored, with opts ${JSON.stringify(opts)}"

## 9. The reason chain (added)
A trailing `so`, `which` or `because` clause giving the why, not the behaviour; not on the seed list.

I don't mind it; user story specs, would you look at the tests and see if there's a describe block that should be  happening?

- `tests/models/vault-boxes.test.ts:49` — "starts the box listing's watch, so another session's put reaches the box held"
- `tests/refusals/errors.test.ts:180` — "narrows to a VaultError, so the caller can read its kind and message"
- `tests/models/vault.test.ts:107` — "binds the deviceDB's lease verbs to the vault's scope, so no verb takes one"

## 10. The verbless lead (added)
A `label:` or noun phrase stands as the title with no finite verb for the behaviour; not on the seed list.

There may be bad ones but this is fine; I won't bother to polish because it's not a good  goofus

"Box snapshot" => "for a box in each state" =>
- `tests/models/box.test.ts:175` — "sparse: present and not full, the sidecar null"

## Already good
One plain clause naming the behaviour: no kind, no chain, no referent to reconstruct.

- `tests/shapes/shapes-vaultish-box.test.ts:36` — "hands back a plain copy of a full record"
- `tests/models/vault.test.ts:152` — "always fetches under a maxMillis of zero"
- `tests/models/proving.test.ts:329` — "draws a fresh salt for each passphrase proving"
- `tests/storage/device-db-new.test.ts:57` — "caches a new vault_tok over the old row of the scope"
- `tests/helpers/crypto.test.ts:30` — "randomId mints distinct ids"
