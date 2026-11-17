# Thread 5: mask_utils (2026-10-15)

Branch `20261015-mask_utils`, PR [#37](https://github.com/mrflip/safebyok/pull/37), cut from `origin/main`. Justify: green after the rework (core 404
tests, convex 213, react 7, demo 24, root 91).

* **Built**: `safebyok/utils`, a new entry point (`src/utils.ts`, a `tsdown.config.ts` line, the
  `exports` entry tsdown wrote, and a hand-kept `typesVersions` line beside `idb`'s) exporting
  `mask(whisper, { head = 2, tail = 4, minStars = 6, maxLen = 15 })` and the `MaskOpts` type.
  The code is `src/mask.ts`; tests are `tests/mask.test.ts` (a bulk table with every `@example`,
  the short end, `maxLen`, spaces, bidi and invisible characters, marks, emoji, right-to-left
  letters, a property test over adversarial and random input, refusals) and `tests/utils.test.ts`.
  A real changeset, `.changeset/20261015-mask_utils.md` (minor). A `notes/security.md` line.
* **The contract (the Coach, in chat, after review; it supersedes the orchestrator's earlier YOLO
  calls on grapheme handling, the `maxLen` floor and the narrow strip list)**: `mask` gives "a
  whiff of interesting text from each end, best effort, safely viewable in a log or reminder", one
  plain line; fidelity gives way to safety. Not a faithful copy.
* **Decisions taken**:
  - **No `Intl.Segmenter`, no `Intl` guard.** The whisper is cut by code point (`/./gsu`, which
    never splits a surrogate pair; `Array.from` and `[...str]` are both refused by the linter).
    A cut may part an emoji sequence, a flag or a skin tone: what is left is visible text.
  - **The final stage is `plainLine`, private to `mask.ts`** (not exported: it would be public
    surface to carry, and the property test exercises it through `mask`). It runs `normalize('NFC')`,
    strips `\p{M}` (every combining mark that remains, which defeats stacked "Zalgo" marks), `\p{C}`
    (controls, format characters, lone surrogates, private-use, unassigned), `\p{Z}` (every space
    and the line and paragraph separators), `\p{Default_Ignorable_Code_Point}`, `\p{Bidi_Control}`,
    U+2800 (blank braille), U+1D159 (musical null notehead, drawn blank), U+FFFC (object replacement,
    drawn as a box); then composes and strips a second
    time, so jamo parted by an invisible compose. Strip, never escape. U+FFFD stays (visible).
  - **Three stages**, named in the doc block: make the whisper safe to butcher (`plainLine` over
    the whole input, before it is counted, so invisibles and marks do not count and a cut cannot
    orphan a mark), butcher (`butcher`, by code point, head and tail with stars between), and check
    it is safe (`plainLine` again over the result). The last stage is the guarantee; it is today
    nearly always a no-op, because the pieces were clean and stars and the marker are ASCII, and
    if it ever changed the result the result may be shorter than intended.
  - **Whitespace is removed entirely, not collapsed to one space**: a key has no meaningful
    spaces, and a result with none cannot start or end on a blank or wrap.
  - **Strong right-to-left letters and numbers are kept again** (the Coach, 2026-10-15; see
    *The Coach's rulings*, below): decision 13, which stripped them, is reversed. The `StrongRtl`
    pattern is gone. Every bidi control and direction mark is still stripped, so a mask may reorder
    neighbouring neutral characters in a display (stars, punctuation) and nothing worse. The tests
    assert, for each right-to-left script by the engine's own script data, that its letters and
    numbers come through.
  - **Cost of stripping `\p{M}`**: scripts whose vowels are combining marks (Devanagari, Thai,
    Arabic with harakat) lose them in the mask. Accepted by the Coach's "fidelity left the
    building"; flagged here so it is a known consequence.
  - **`maxLen` too small never throws**: the collapsed form (`head***...***tail`) that does not
    fit gives `'*'.repeat(maxLen)`, no head, no tail, no ellipsis; `maxLen: 0` gives `''`.
    `Infinity` never collapses. **`head`, `tail` and `minStars` are capped at 1000** (a whiff, not a
    copy), refused as `bad_option` above it, so no option builds an unbounded string (a vast
    `minStars` with `maxLen: Infinity` was a bare `RangeError` with no kind); `maxLen` may be any
    safe integer or `Infinity`, and the message names both limits. The default is 15 again (it no longer grows with `head` and
    `tail`, so `{ head: 4 }` alone on a long whisper gives 15 stars). `maxLen` counts code points
    and wins over `minStars`. Nonsense (negative, fractional, NaN, text) is still `bad_option`
    at the entry.
  - **Nothing left**: `''` for an empty whisper; a non-empty whisper that is entirely stripped
    gives `minStars` stars (clamped by `maxLen`), as if it were a short whisper.
  - **Give-up order**: of what may be shown (`length - minStars`), `tail` is kept first and
    `head` gives way.
  - **`maskAll` struck**, not exported: `mask(w, { head: 0, tail: 0 })` is the stars-only variant.
  - **Validation**: `Z.object` with defaults at the entry (matches every other schema in `src/`),
    `bad_option`; a non-string whisper is `bad_whisper`. Neither message quotes the whisper.
* **Library search** (CLAUDE.md): `maskdata` 1.3.4 (238 kB unpacked, Node-oriented; no
  control-character stripping, no minimum star count); `mask-string` and `string-mask` (pattern
  formatters, a different job); the `react-input-mask` family (input fields); `redact-pii` (finds
  PII in prose). Nothing does the job; hand-rolled display formatting, no dependency.
* **Deviations**: TODO.md on `main` does not hold the `mask` spec (it is on #26's branch); I worked
  from the preplan and commit `030d7fb`. No `eslint-disable`, no `@ts-expect-error`.
* **Discoveries**: tsdown's `exports: true` writes the `exports` entry but not `typesVersions`;
  attw (node10) fails the build until the new entry is added there by hand. Thread 2's
  `safebyok/browser` needs the same line (a mechanical conflict). `unicorn/prefer-spread` and
  `@typescript-eslint/no-misused-spread` together refuse `Array.from(str)` and `[...str]`, hence
  `text.match(/./gsu)`. The remote branch had been rebased by the orchestrator onto a newer main
  while this worktree was gone; the local branch was reset to the remote tip. Not rebased again at
  filing (the Coach said not to; the PR was mergeable).
* **For thread 8**: a size-budget entry for `import { mask } from 'safebyok/utils'` waits on this
  merging; it ships `errors` and `zod` (core's peer), not the vault.
* **The Coach's rulings (2026-10-15, after #37 was filed)**, verbatim:
  1. "there was a questin about mask -- export safebyok/utils, with mask in there": confirmed, the
     branch already exports `mask` from `safebyok/utils`; nothing changed.
  2. "yes #37: keep Z.object": option validation stays `Z.object`, so `mask` ships zod. Settled.
  3. "can we strip the text direction markers and then chomp where things land? The right approach
     is 'make the string safe to butcher, then butcher, then check it is safe'. Add to the
     documentation for mask is that 'mask is intended for plain text. Calling it with arbitrary
     blobs may give unusual behavior'". This answered "Keep stripping right-to-left letters?".
  4. "yes note in #37": `mask`'s doc block, the core README and VOCABULARY.md now say, as a known
     limitation, that `mask` strips every combining mark (`\p{M}`), so scripts that write vowels
     as marks lose them (Hindi नमस्ते comes out as नमसत; Thai สวัสดี as สวสด; Tamil, Bengali,
     Khmer, and Latin accents with no precomposed form alike). Marks are stripped because they
     stack without limit and smear across lines, and a mark left at a cut would land on the
     stars; API keys are ASCII. This closes the `\p{M}` item under *For the Coach*.
  5. "Add a NOTYET to TODO for maskCarefully": a bullet under `## NOT YET` in TODO.md: a variant
     that keeps at most one or two marks per base character, with a final scan that also drops a
     mark orphaned at a cut edge.
  **The orchestrator's reading of 3, which is what was built** (for the Coach to correct): stop
  stripping right-to-left letters and numbers (this **reverses sprint decision 13**); keep
  stripping every bidi control and direction mark and every invisible; restructure `mask` into
  the three stages; add the sentence to `mask`'s doc block, the core README and VOCABULARY.md;
  update `notes/security.md` and the changeset.
* **Commits after the last review** (the reviewer's last were 492ecc4, f9f8406 and 2b76f54): the
  `api:` and `docs:` commits that strip right-to-left letters, U+FFFC, double-compose, cap
  `head`/`tail`/`minStars`, and widen the property test; and the three-stage rework above. They
  were not reviewed.
* **For the Coach**: confirm the reading of ruling 3 above. Also: the `\p{M}` cost to Indic and Thai
  text, whitespace removed rather than collapsed, and the 1000 cap. The changeset is `minor`. #37
  conflicts with `main` (`notes/security.md`, the core README, `package.json`, `errors.ts`,
  `tsdown.config.ts`); the rework was added as fast-forward commits, with no rebase.

*Orchestrator, after the squash:* at the Coach's word the branch's 26 commits became four (`api:`,
`docs:`, `tools:`, `plan:`) over `23e38a2`, the tree unchanged; the SHAs above, and the
fast-forward-without-rebase note, describe the history before it. The Coach confirmed the reading
of ruling 3: right-to-left letters kept, only the direction markers stripped. The rebase onto
main was done before the squash, so #37 no longer conflicts.
