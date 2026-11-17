# Reviewer experiments: the two roles on models/box.ts and models/vault.ts

2026-11-05, at `b7bacb68`. Two agents reviewed the same 70 doc blocks (21 in `box.ts`, 49 in `vault.ts`, 8 of them marked
`SLOPDOC:`) with the same rules (`notes/gallant-docblocks.md`, the reform draft's 3a and 3h), under the split proposed in
`docblock-reform.md` 3g. Neither repaired anything. The full reports are `reviewer-experiment-sonnet.md` and
`reviewer-experiment-opus.md`; the opus file holds eight rewrites for the Coach.

| | sonnet, detect and tag | opus, reads the code |
|---|---|---|
| role | block + signature + the list; no bodies | block + the code it describes, and what that calls |
| blocks with findings | 45 of 70 | 38 of 62, plus all 8 SLOPDOC |
| judged good | 17 | 24 |
| top tags | `#purpose-not-machinery` 19, `#one-verb-one-fact` 18, `#name-the-act` 16 | `#one-verb-one-fact` 9, `#say-the-guarantee` 8, then `#facts-from-the-code`, `#purpose-not-machinery`, `#name-the-act` at 7 |
| `#facts-from-the-code` | never applied: needs the body | 7, plus 2 in SLOPDOC blocks |
| `#say-the-guarantee` | once | 8 |
| needed the code to judge | not available to the role | 15 of 38, plus 4 SLOPDOC |
| tokens, wall time | ~81k, 2.4 min | ~151k, 7.8 min |

**What the split predicted held.** The cheaper role finds the register faults, over-tags a little (it was unsure of two class
blurbs and of `lock()`'s "a refused erase panics and does not throw", which is a guarantee), and cannot see a block that is
wrong or silent about the code. The reader found exactly those, and they are the findings that matter.

## Discoveries in the code as it stands (recorded, not repaired)

Opus's, with one confirmed by hand:

* **`vault.ts:340` and `:349`, `putBox` and `delBox`, point nowhere useful.** Both send the reader to `{@link BoxListing.put}`
  or `.del` "for important details on refusals and options". Confirmed: `BoxListing` has no `put`; its `del` is one line
  about damaged rows with no options. The jsdoc trial's `no-undefined-types` would catch the first.
* **`#landGate` says it attaches a lease**; it only renews one held throughout (`vault.ts:254`), so a locked vault stays locked.
* **`#exposed` says it lasts "until the host sets it null"**; sweep, vacate and setting `LOCKED` also clear it.
* Lesser: `lock` reads as if the erase is done before it returns; `ensureTimely` omits that a sparse vault is fetched;
  `box.ts:41` calls the codec and version fields "sealed parts".
* In SLOPDOC blocks: `delVault` says "nothing of it on this device", but the instance stays as a tombstone; the `whisper`
  setter holds the host's own value and opens nothing stored.

Guarantees no block states, which a security reviewer would look for:

* the exposed cleartext whisper stays in memory across a lock;
* the sidecar is unauthenticated until a whisper is opened;
* after a gate change, every other device must prove again at its next session;
* a lock that lands mid-unlock does not hold.

## What it says for the briefs

* The style-reviewer's list should drop `#facts-from-the-code` and `#say-the-guarantee`: it cannot apply them, and a tag it
  cannot apply invites a guess. Those two belong to the thread-reviewer, first on its list.
* The reader's two most valuable outputs, disagreements and missing guarantees, deserve their own headings in the
  thread-reviewer's report, above the register findings.
* Opus names one ambiguity in the rules: whether a race note ("a lock that lands mid-unlock does not hold") is a guarantee
  in the block or a `//` above it (`#reason-goes-above`). A ruling is needed; the rewrite of `#unlockByProof` in its file
  shows both forms.

## The Coach's rulings on the discoveries (2026-11-05, night)

* **`putBox` and `delBox` dangling links**: fixed in thread `20261105-vault_outcome_docs`. `putBox` now points at `Box.put`,
  which holds the options and refusals; `delBox` keeps `BoxListing.del`, which exists.
* **`#landGate`**: "a remaining morass, leave it."
* **`#exposed`**: name no method. The whisper is "hidden while the vault is locked, kept until the host forgets it or a vault
  modification clears the box" (sweep and vacate are vault modifications; the exit from the instance goes only through those
  turnstiles).
* **The race note is a guarantee**, in the block, not a `//` above: "A lock does not interrupt or reverse a put once its write
  has begun." Written into `Box.put`'s block; `#unlockByProof` says its own form plainly.
* **"before any demand" (`box-putting.test.ts:219`)**: the Coach's intent is *before validation*: a patch carrying both the
  whisper and the sidecar needs no full record, since both halves are clobbered, so a sparse box need not be fetched; a
  patch missing either must have the box refreshed to full even if timely; an empty patch is refused before anything.
  The code today (`box.ts:95`) runs `ensurePuttable` (the hydrate) first and parses the patch second, so the sparse test
  sees one fetch before its `bad_option`. Making the describe true means splitting the parse out of `demandPuttable`
  (which also asks enabled, unlocked and whole) and hydrating only when a half is missing. A small thread; not done here.
