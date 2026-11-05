# Goofus and Gallant: test titles

Specimens of the test-title register in `packages/safebyok/tests/`, harvested 2026-11-05 at `b7bacb68`, one fault each,
with the rewrite. The rule is STYLE.md *Tests*: a title is one plain clause naming the behaviour; the assertions carry the
kinds; a pointer to an `@example` is a `// member @example 2` comment on the test's first line.

This file is for the agent fixing titles and the reviewer checking it. Each principle has a hashtag to cite.

**Read a title in its scope.** A `describe` names the subject, the member under test (`vault.ensureTimely(maxMillis)`),
and below it, where one is needed, the situation (`with no passkey held`). The `it` is the predicate. Read down the chain
they make a sentence: "vault.revokePasskey(), with no passkey held, is a no-op". A title is right or wrong only in that
chain, so read the chain, never the title alone, and a condition every sibling shares moves up into a `describe`. The lint
allows five levels before it warns; three is usually plenty. Titles in brackets below are the enclosing `describe`.

Contents: `#kind-is-the-assertion`, `#no-as-trailer`, `#outcome-not-action`, `#invariant-not-trace`, `#conditions-move-up`,
`#name-the-referent`, `#no-citations`, `#so-clause-is-the-behaviour`, `#templates-are-tables`

---

## The kind is the assertion's `#kind-is-the-assertion`

A kind in the title repeats the `expectRefusal` one line below. Keep it only where the kind is the behaviour under test, a
`stale_write` race, a `wrong_passphrase`: a *condition* kind in `RefusalKind`'s sort. A *misuse* kind (`bad_option`,
`bad_scope`, `bad_record`) never is. Three or more contiguous siblings refusing one kind group under a `describe` that names
it once; two, or siblings apart, just drop it.

| Goofus | Gallant |
|---|---|
| [vault.ensureTimely(maxMillis)] "refuses a maxMillis out of range as 'bad_option'" | "refuses a maxMillis out of range" |
| three siblings each ending "as 'bad_option'" | `describe("refuses 'bad_option' for", ...)` over `it("a stamp with no vault_tok")` and the rest |

## No "as" trailer `#no-as-trailer`

"As its second example shows" becomes a `// parseLogger @example 2` comment on the line above the `it(`, the member
being the one whose doc block holds the example and the number its position there. An "as X does" that
is the assertion itself is the predicate: say it as one. The reason for a fixture goes in a `//` by the fixture, or nowhere.

| Goofus | Gallant |
|---|---|
| "falls back to the console when given none, as its second example shows" | "falls back to the console when given none", with `// parseLogger @example 2` above |
| "puts the same kinds in each family as the doc block in errors.ts does" | "matches the family lists in the errors.ts doc block" |
| "does nothing where the platform has no reportError, as Node has none" | "does nothing on a platform without reportError" |

## The outcome, not the action `#outcome-not-action`

"X, and Y" is usually the setup and the outcome: name the outcome. Two unrelated behaviours in one `it` are two tests;
list those rather than split them.

| Goofus | Gallant |
|---|---|
| "lets a listener go, and tells none after" | "stops telling a listener once it unsubscribes" |
| [vault.revokePasskey()] "answers at once with no passkey held: nobody asked, nothing moved" | "is a no-op with no passkey held" |
| [settle] "notifies nobody when it changes nothing, and keeps the snapshot" | "changes nothing when there is nothing to settle" |
| "refuses 'bad_option' fed a put's ifAbsent, and 'disabled' once vacated" | two tests: "refuses a put's ifAbsent" and "refuses once vacated" |

## The invariant, not the trace `#invariant-not-trace`

A test of a call sequence is legitimate: the chute is a contract. Its title still names the guarantee, often as a "never",
not the steps in order. Where the sequence itself is the assertion, say so plainly and list it once.

| Goofus | Gallant |
|---|---|
| [storable.hydrate(opts)] "waits on the world's ensureTimely before it fetches" | "never fetches under a stale world" |
| [box.put(patch)] "fetches the full record of a box held sparse before its seal" | "never seals over a sparse record" |
| [listing.create(dna)] "refreshes the world once, puts once, and fetches nothing, then takes the world" | "goes straight through: ensureTimely, put, takeWorld, and no get" |

## Conditions move up `#conditions-move-up`

Three qualifiers on one verb are a `describe` waiting to be written: the situation goes up, the predicate stays short.
A property the assertions check is not a condition and leaves the title.

| Goofus | Gallant |
|---|---|
| "with no onPanic, on a platform with no reportError, still vacates the vault" | `describe("with no onPanic and no reportError")` over "still vacates the vault" |
| [boxListing.puttable] "makes one void box for a slot with nothing held, timely, in things and not the snapshot, asking storage nothing" | "hands a void shell for an empty slot, asking storage nothing" |
| "tells a refusal met on the way, with no onBadNews given, to nobody and still resolves" | `describe("with no onBadNews")` over "swallows a refusal met on the way and resolves" |

## Name the referent `#name-the-referent`

"It", "one" and "its own" for a noun a sibling test named. Each title stands alone in the runner's output.

| Goofus | Gallant |
|---|---|
| "refuses it after the one fetch its ensure asks of a box held sparse" | "refuses an empty patch over a sparse box, after its one fetch" |

## No citations `#no-citations`

A date, a Coach, a gate code or a section tag in a title is history (`#purpose-not-path`). A `describe` names the
behaviour; the ruling lives in the whiteboard.

| Goofus | Gallant |
|---|---|
| `describe("box.put holds its patch to boxPatch before any demand (the Coach, 2026-10-31)")` | `describe("box.put checks its patch before any demand")` |
| "… (G4)", "… (Contract: Shapes)" | the same title without the code: a gate code or a section tag is a citation too |

## The "so" half is often the behaviour `#so-clause-is-the-behaviour`

A reason chain usually has the mechanism in the main clause and the behaviour in the "so" clause. Keep the half the
assertions check.

| Goofus | Gallant |
|---|---|
| [vault.hello] "starts the box listing's watch, so another session's put reaches the box held" | "a put from another session reaches the box held" |
| [isCondition] "narrows to a VaultError, so the caller can read its kind and message" | "narrows to a VaultError" |
| [the friend a vault hands its leases] "binds the deviceDB's lease verbs to the vault's scope, so no verb takes one" | "calls the deviceDB under the vault's own scope" |

## Template titles are tables `#templates-are-tables`

A `${...}` title over a case list is right: it reads as a table row in the runner. The blurb slot carries the sentence and
the inputs are the columns. Leave them.

## Already good

"hands back a plain copy of a full record". "always fetches under a maxMillis of zero". "draws a fresh salt for each
passphrase proving". "caches a new vault_tok over the old row of the scope". "randomId mints distinct ids".

*Status: Planned, thread `20261105-test_titles`.*
