# Refusal kinds: the Coach's rules, and the plan for the mechanical pass

Companion to `refusal-kinds.md` (the agent's tables, with the Coach's `//` comments in the cells). This file is what the
mechanical pass and the chart rewrite work from. Written 2026-11-05 from the Coach's rulings; the recommendations are the
orchestrator's, trusted by the Coach "without much inspection for changes in refusal kind, as long as no code is added".

## The Coach's rules

* **A kind earns its place** one of three ways: the core or a host routes on it; it gives a material head start in
  debugging (this is a package bug for sure; the vault was not tombstoned but *disappeared*; a consistency check that should
  be impossible failed); or it groups throwers that tell one story. Guessing whether a strict object check means a box was
  passed where a vault should be is no head start.
* **The stronger rule is "don't make me read"**: turning one kind into a finer guess has to be worth the reading it costs.
* **Throwers everywhere, no inlined messages.** Every throw site uses a thrower from `refusals/throwers.ts`, with a phrase
  from `helpers/phrases.ts`, so the refusals are auditable and reviewable in one place. No strong pressure to reuse one: make
  a thrower, add the phrase; a later pass merges.
* **The names agree.** The thrower's name, its refusal kind and its phrase's property name agree; the phrase text is of a
  piece with the kind (mirrors, contains or elides its words); all of them read naturally at the call site.
* **Callers pass what they have on hand** and trust the thrower to sanitize and cherry-pick (an allow-list tool for that,
  bulletproofed by try/catch, is a later pass).
* **No "error" or "refusal" in a thrower's name**, and no namespace pollution; at a loss, append `issue`. The name is
  empathetic and frank to the person who trusted us with their data, and readable to the coder. Templated phrases encouraged.
* **Each thrower will carry a `refusal_label` matching its name**, the kind being the tag that groups them (a wrapped checker
  can do this from the key in its return bag). Later pass: not this one.
* **Later passes**, not this one: story metadata; the `outcomeOf` audit (where it wraps a body then unwinds with `valOf`, a
  try/catch is plainer); a gallant pass on the phrases and the labels; `bank.doctor()`.

## The mechanical pass: what changes

The pass adds no code: no branch, no try/catch/throw where none was, no `outcomeOf` to relabel. A kind change is a literal
change. A new thrower is one line in throwers.ts and one phrase in phrases.ts. Tests that assert a kind follow it.

### Cull (no site in the core; adapters and safebyok-react that name some run on safebyok-old and re-add them when they move)

`gate_made_elsewhere`, `passkey_unavailable`, `bad_whisper`, `whisper_too_large`, `invalid_box`, `damaged_vault`,
`damaged_wayin`, `crypto_failed` (the Coach's `bank.doctor()` idea is noted for later), `vault_behind`, `not_permitted`,
`storage_blocked`, `gate_moved`, `no_whisper`, `passphrase_required`: fourteen; and `corrupt_record` merges below.
`identity_revoked` stays: the core branches on it. `vault_remade` stays and gets used.

### Merge, rename, re-kind

| from | to | why |
|---|---|---|
| `storage_error` | `storage_unavailable` | one store failure, one kind; VaultDB's `adapted` and DeviceDB's agree |
| `vault_mismatch` | `vault_remade` | "a live vault stands here under another vault_tok" is the remade story |
| `delOfOtherLife` (`stale_write`) | `vault_remade` | says "deleted and made anew"; the Coach: "unless it requires hard work" |
| `otherVaultTok` (`storable.ts:198`, `unexpected_error`) | `record_conflict` | the Coach's note on the site: "record conflict". `otherVaultTokAtBirth` follows it where it is the same check |
| `corrupt_record` | `record_conflict` | the kind for what storage answered that cannot be: one revision two toks, a record of another scope, a put that answered nothing. `putAnsweredNothing` (`unexpected_error`) and `Listing.#demandRecordOfScope`'s inline `bad_record` move here; the latter gets a thrower |
| `damaged_record` | `damaged_row` | the Coach's rename: a row read from storage that fails its checks, on the way out |
| `invalid_input` | `bad_option` | VaultDB's name for the same misuse, on the way in. Exception: a VaultDB parse of what the adapter answered is on the way out and is `damaged_row`; report a validator that serves both directions, change nothing there |
| `bad_record` | `bad_option` or `damaged_row` by direction | the Coach wants bad-on-the-way-in told from damaged-on-the-way-out. A record the caller handed in: `bad_option`. A record storage answered: `damaged_row`. The 12 `refusingAs('bad_record')` relabels go where the base kind is already the target; report any site that cannot be decided without a branch |
| `unknown_key_deriver` | `newer_format` | same remedy, "update safebyok"; the Coach said yes |
| package-bug guards at `bad_option`: `vault.ts:79`, `vault.ts:396`, `proving.ts:78`, `proving.ts:86`, `crypto.ts:76` | `unexpected_error` | knowing for sure it is our bug is the head start |
| `proofMissing` (`gating.ts:176`, `unexpected_error`) | `bad_option` | a host attempt holding neither proof is the host's misuse |
| `noProofToUnlock` (`vault.ts:186`, `vault_locked`) | `bad_option` | the same missing `requestCleartext` that `noRequestCleartext` refuses as `bad_option` one call later |

### Keep, with a note

* `bad_scope` stays as the kind of a `parseConsistent` consistency failure (the input against the world): the Coach calls
  that a material head start, most of those being impossible. A site that says `bad_scope` for a plain shape failure, not
  a consistency check, becomes `bad_option`; report the list.
* `gate_issue` stays: VaultDB's integrity checks on a gate change (the epoch increments by one, and the like) pay for
  themselves behind a backend adapter. Report which of its four sites are parameter validation rather than integrity
  checks; change nothing there.
* `vault_empty` stays, earned: the vault was there and now no row is.
* `record_conflict` is the home of the impossible, as above.
* `insecure_context` stays (it means the page is not a secure context, so WebCrypto's `subtle` is absent; not broken
  libraries). `gating_landed`, `attempt_in_flight`, `already_asking`, `locked_while_asking`: unsure, untouched.
* The 38 `outcomeOf` defaults to `unexpected_error`: untouched, audited later.
* Duplicate throwers for one kind (`lockedError`/`unlockFirst`, `deletedVaultError`/`vaultGone`, `absentBoxError`/`absentBox`)
  and the nine `*Error` names: untouched; the gallant pass on labels decides.

### Throwers everywhere

* Every `throw new VaultError(...)` and every thrown inline `{ kind, message }` outside `refusals/` becomes a thrower in
  throwers.ts whose phrase lives in phrases.ts. The literal message strings inside throwers.ts (`vaultEmpty`, `vaultMismatch`,
  `camped`, `absentBox`, `staleWrite`, `boxTooLarge` and their neighbours) move to phrases.ts as named phrases.
* A validator's refusal options (`{ kind, message, advice }` handed to a `Checkers` call or `parseConsistent`) are not throw
  sites: leave them, except where the kind changes above.
* New thrower names follow the rules: no `Error`, no `refusal`; `issue` at a loss; empathetic and frank.

### Report, do not adjust

Throwers that guess or carry internal logic (a branch on their input choosing kind or phrase); any site where the direction
(way in or way out) cannot be told without reading the caller; validators that serve both directions; the `gate_issue`
split; the `bad_scope` plain-shape list.

## The rules text, for the top of `refusals/throwers.ts`

Placed as the module's doc block (above the imports), with one pointer line at the top of `refusals/errors.ts` and
`helpers/phrases.ts`: "The rules for a refusal, its thrower and its phrase are at the top of refusals/throwers.ts."

```ts
/** The throwers: every refusal the core raises is made here, from a phrase in helpers/phrases.ts, so they are audited in one place.
 *
 * A refusal kind earns its place one of three ways: the core or a host routes on it; it gives a material head start in
 * debugging (this is a package bug for sure; the vault was not tombstoned but disappeared; a check that should be
 * impossible to fail did); or it groups throwers that tell one story. Guessing which of two ways a strict object check
 * failed is no head start. The stronger rule is "don't make me read": a finer kind must be worth the reading it costs.
 *
 * A thrower's name, its kind and its phrase's name agree; the phrase is of a piece with the kind, mirroring, containing or
 * eliding its words; and all three read naturally at the call site. A caller passes what it has on hand and trusts the
 * thrower to sanitize and cherry-pick. A name carries no "error" or "refusal", ends in "issue" at a loss, and is
 * empathetic and frank to the person who trusted us with their data, and readable to the coder. Reuse is welcome, never
 * forced: a new refusal gets a new thrower and a new phrase. Templated phrases are encouraged. */
```

## The reviewers' note

One sentence in `.claude/agents/thread-reviewer.md` and `.claude/agents/style-reviewer.md`, where each says what it checks
the diff against: "`shapes/`, `refusals/` and `helpers/phrases.ts` state their own rules in their file headers; a change in
one of them is checked against those too." Coding agents are not pointed at the headers: the five lines above and below a
throw site say what is needed, and the reviewer corrects.

## Added after the chart rewrite (2026-11-05, 19:45 UTC)

The Coach's three notes in refusal-kinds.md's cells: `otherVaultTok` is a record conflict (above); `delOfOtherLife` moves unless it is hard work; the thrower at `listing.ts:320` is to be named `boxBecameDisabled` ("don't camp the namespace"), for the gallant pass if the mechanical pass does not touch it. A `verifyConsistent` or validator refusal spec is not a throw site: re-kind it, no thrower.
