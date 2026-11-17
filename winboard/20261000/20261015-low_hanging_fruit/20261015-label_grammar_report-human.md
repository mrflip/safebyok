# 2026-10-15: Label grammar -- all three labels can take a host grammar; colon is the one character that cannot, and a "floor" must stay fixed

Thread 11 of low_hanging_fruit, an investigation: no code changed. It answers what depends on
`Label` (`^[a-z](_?[a-z0-9])+$`, at most 40) so the *Soonish* "pluggable label validator" can
start from it. Branch `20261015-label_grammar_report`; PR [#35](https://github.com/mrflip/safebyok/pull/35).

## The answer in four lines

1. **The cipher binding does not constrain the grammar at all.** Applabel, vaultlabel and boxlabel
   are elements of a JSON array (`cipherBinding` -> `stableJsonify(parts)`, `crypto.ts`). A `"`,
   `\`, control character or lone surrogate is escaped inside its element, so no label can bleed
   into its neighbour; I checked with `safe-stable-stringify`. Only one rule follows: a label is
   compared byte for byte, so a validator may refuse a label but must never *change* one
   (lowercase it, trim it, normalise it): the binding would be rebuilt from different bytes and
   every ciphertext under it would stop opening.
2. **The ckeys do constrain it, by one character: the colon.** Both in-tree adapters (and
   `idbDeviceDB`, `memoryDeviceDB`) build `vault:APP:USER:VAULT`, `box:APP:USER:VAULT:BOX` and
   `unlock:APP:USER:VAULT` by plain concatenation; `user_id` is already free-form and may hold
   colons. Today `scopePath` is unambiguous *because* applabel and vaultlabel hold no colon (first
   and last segments are fixed; the middle is the user). Allow a colon in either and
   `(app "a:b", user "u")` and `(app "a", user "b:u")` write the same rows: one user's vault
   under another's ckeys. Allow it in a boxlabel and `isBoxCkeyOf` (which rejects a remainder with
   a colon, the 2026-10-15 fix in `notes/security.md`) stops seeing the box, so it is never
   listed or erased. The ckeys are "a stored contract, never reshaped" (`vault-db.ts`), so a
   colon in *any* label means a ckey migration. Everything else (space, uppercase, hyphen,
   non-ASCII, longer) is just text in a Map, IndexedDB or localStorage key.
3. **Convex is indifferent.** Labels are `v.string()` *values* in typed columns and index
   segments, never field names (Convex restricts field names to ASCII alphanumerics and
   underscores; that is why *stored* fields are underbar_case, and it does not touch labels).
   The component enforces no grammar today; I recommend it stays that way (below).
4. **What has to change is the read path, not a record.** `Label` is the type of `boxlabel` in
   `Lockbox`/`LockboxSummary`, of `applabel`/`vaultlabel` in `VaultScope`, `VaultBundle` and
   `DeviceUnlock` (`types.ts`). Those Zod records are how every stored row is read back
   (`checkRecord`, `checkScope`, `checkBoxlabel` in `vault-db.ts`; `DeviceUnlock.safeParse` in
   both device adapters). A host grammar wider than the default would make its own rows
   `corrupt_record`, and would make a remembered unlock silently stop working (the device adapters
   treat an unreadable `DeviceUnlock` as "none" and delete it). The JSON written is unchanged
   for any label that passes today; widening is only a schema edit.

## Which of the three can take a host grammar

All three, with no stored record and no binding touched, provided the colon rule and the
"validate, never transform" rule hold. They are not equally wise:

| Label | Who chooses it | Verdict |
| ----- | -------------- | ------- |
| **boxlabel** | often the end user (a name typed in a form) | The one a host wants to loosen ("Anthropic (work)"), and the safest: it is the last ckey segment, a Convex column, the third binding part from the end. Start here. |
| **vaultlabel** | the developer (`main`, or per workspace) | Safe once the colon is excluded. A host that builds vaultlabels from ids (`team_4f2a`) benefits from a longer maximum more than a new alphabet. |
| **applabel** | the developer, once, forever | Technically as loose as the others, but it namespaces every row on a shared backend and is the first ckey segment: a case-insensitive third-party backend would merge `App` and `app`. Allow a *narrowing* host grammar freely; widen with the most care. |

## The seam for the pluggable validator

**Two layers, one of them not pluggable.**

* **The floor (fixed, ours).** A new schema beside `Label` in `types.ts`, say `LabelFloor`: a
  string, non-empty, no `:`, no control characters (`\p{C}`), at most a fixed ceiling (I suggest
  64; the Coach's number). It is what the record schemas (`Lockbox`, `VaultBundle`, `VaultScope`,
  `DeviceUnlock`) and `VaultDB`'s `checkScope`/`checkBoxlabel` use, so **the read path never
  depends on host policy** and a stored vault can always be read, listed and erased. Adapter
  authors get one sentence in the `VaultDB` docs: "labels hold no colon and no control characters;
  escape anything else you build keys from".
* **The policy (pluggable, the host's).** `Label` stays exported unchanged as the *default*
  policy, so every current host and test behaves identically.

**Where the option lives.** `OpenVaultOpts` gains one optional field, for example
`labelRules?: { applabel?: LabelRule, vaultlabel?: LabelRule, boxlabel?: LabelRule }`, where a
`LabelRule` is a `Z.ZodType<string, string>` (plain Zod, per CLAUDE.md; input type equals output
type, so a `.transform()` does not type-check). `openVault` parses it once at the top, beside
`parseMaxWhisperBytes` (thread 2 is reshaping these lines: build on its result).

**What it receives and returns.** It receives the candidate string and returns it or refuses.
`parseLabel` in `vault.ts` today (the single funnel for `openVault`, `store`, `read`, `use`,
`erase`) becomes `parseLabel(slot, candidate)` that runs `LabelFloor`, then the slot's rule, then
checks `parsed === candidate` (belt and braces against a transform smuggled in with `any`). A
refusal is `bad_label`, with the rule's own calm message, **never quoting the candidate**
(labels are public, and a user may have pasted a key into the label field).

**What must stay fixed**: the floor; validate-never-transform; the binding's parts, their order
and their JSON encoding; the ckey shapes; `bad_label` as the kind; the refusal never quoting
its input; the record `format` literals (no new format is needed, since widening only widens what
the schemas accept).

**Where a rule applies (a decision for the Coach; my recommendation).** `applabel`/`vaultlabel`
at `openVault`, and `boxlabel` on `store`. `read`, `use` and `erase` accept anything the floor
accepts, so tightening a rule later never strands a box a user can no longer open or delete.

**The React package** only forwards `applabel` and `vaultlabel` (as `string`) and builds
`openVault`'s options with `satisfies Record<keyof OpenVaultOpts, unknown>`, so the compiler will
force the new option into `VaultProviderProps`; it must also join the `useEffect` dependency
list, and a rule object built inline in render would reopen the vault on every render (the same
trap as `keyDeriver` and `clock`). The provider's README should say: define the rules at module
scope. A rejected rule already reaches the error boundary (thread 3).

**Server-side grammar in Convex: recommend no.** The server holds only public strings the client's
Zod re-checks on every read; a bad row is self-inflicted and already recorded in
`notes/security.md`. The component cannot know a host's policy, and the host is already the trust
boundary (`SafebyokComponent.api({ getUserId })`). If an abuse limit is wanted, it is a length
ceiling on `v.string()` args (a handler check; Convex's docs name no index-key size limit, only
the 1 MiB document), in the host's `api()` wrapper, not a grammar.

## Things the investigation turned up

* **The strictness is partly a guard on secrets.** Labels are plaintext, shown while the vault is
  locked and stored in the open. Today's grammar (lowercase, no hyphen, 40 characters) rejects
  nearly every real API key pasted into a label field by mistake (`sk-ant-...` has hyphens and
  capitals). A looser boxlabel rule removes that accident-guard; the host's rule should keep a
  short maximum, and the docs should say a label is public. Worth a line in `notes/security.md`
  when the validator lands.
* **Ordering.** `listBoxes` sorts with `localeCompare` (`vault-db.ts`), which depends on the
  runtime's locale, while Convex indexes order by bytes (e.g. `a_b` sorts before `a1` under
  `localeCompare`, after it by bytes). Harmless today (the core re-sorts; the Convex order feeds
  only `watchVault`'s change signature) but with non-ASCII labels devices could list in different
  orders. The validator thread should sort by code point.
* **Normalisation.** A host allowing non-ASCII should require NFC in its rule: NFC and NFD
  spellings of one visible label are two labels, two ckeys, two bindings.
* **Old devices.** A vault with widened labels read by an older safebyok fails its `Label` regex
  as `corrupt_record` ("may be written by a newer version"). Hosts widen only after every client
  has upgraded.
* **Duplicated text.** The grammar is stated in three message strings (`vault.ts` `parseLabel`,
  `vault-db.ts` `checkBoxlabel`, and `checkScope`'s) beside `Label`'s own; the pluggable rule has
  to supply its own message, and the three collapse into one place. `scripts/newb-label.ts`
  carries a similar-looking `Label` of its own for branch names; it is unrelated to this one.
* **Tests that pin the grammar** (to change deliberately): `tests/types.test.ts` `LabelCases`,
  `tests/vault-db-suite.ts` (`'not:a:label'` must stay refused: that is the floor), `vault-db.test.ts`
  (the colon-`user_id` test), `idb.test.ts`/`vault-db.test.ts` (ckeys), and the Convex
  `validators.test.ts` cases, which *document* that the component accepts any string.

## For the Soonish thread: tests it will want

A boxlabel with a space and capitals through `store`/`read`/`list`/`erase` on both adapters; a
colon label refused at the floor whatever the rule says; a rule with a transform refused;
the old default-grammar vault read unchanged; a tightened rule that still reads and erases an old
box; the `DeviceUnlock` round trip under a widened applabel; the provider not reopening the vault
when re-rendered with the same rules.
