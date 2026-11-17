# Thread 11: label_grammar_report (2026-10-15)

Branch `20261015-label_grammar_report`, PR [#35](https://github.com/mrflip/safebyok/pull/35). Justify: green (safebyok 248, safebyok-convex 213, safebyok-react 7, demo 24, scripts 72); documents only, the changeset is empty.

* **Built**: an investigation, no code. The report is `winboard/20261015-low_hanging_fruit/20261015-label_grammar_report-human.md` (read it for the evidence); this file is its summary.
* **Decisions taken**: none that touch code. Recommendations, for the Soonish thread and the Coach:
  - **All three labels can take a host grammar** without touching a stored record or the cipher binding. Order of wisdom: boxlabel (user-typed, last ckey segment) first, vaultlabel next, applabel with most care (it namespaces every row on a shared backend).
  - **The binding is not a constraint.** The labels are elements of a JSON array in the additional data, so `"`, `\`, control characters and lone surrogates are escaped inside their element. The one rule: validate, never transform (a label is compared byte for byte).
  - **The colon is the one character that cannot be allowed** without a ckey migration. `vault:APP:USER:VAULT`, `box:APP:USER:VAULT:BOX`, `unlock:APP:USER:VAULT` are concatenated in both in-tree adapters and both device adapters; `user_id` is already free-form, so `scopePath` is injective only because applabel and vaultlabel hold no colon; `isBoxCkeyOf` needs a colon-free boxlabel. Those ckeys are a stored contract.
  - **The seam**: two layers. A fixed `LabelFloor` (non-empty, no colon, no control characters, a ceiling of about 64) used by every record schema (`Lockbox`, `VaultBundle`, `VaultScope`, `DeviceUnlock`) and by `VaultDB`'s `checkScope`/`checkBoxlabel`, so reading never depends on host policy. And a pluggable policy: `OpenVaultOpts.labelRules?: { applabel?, vaultlabel?, boxlabel? }`, each a `Z.ZodType<string, string>`, run by `parseLabel(slot, candidate)` in `vault.ts` after the floor, with a `parsed === candidate` check. `Label` stays exported as the default policy.
  - **Where a rule applies**: applabel/vaultlabel at `openVault`; boxlabel on `store`; `read`/`use`/`erase` accept anything the floor accepts, so a later tightening never strands a box.
  - **Convex: do not enforce the grammar server-side.** The component cannot know a host's policy; the client re-validates every read; a bad row is self-inflicted (`notes/security.md` already says so). At most, a length ceiling in the host's `api()` wrapper.
  - **React**: the new option must be added to the provider's props, `openOpts` and the effect's deps; a rule object built inline in render reopens the vault on every render, so document module-scope rules.
* **Deviations**: none. No change to `notes/security.md` (no decision taken); the report proposes a line for when the validator lands.
* **Discoveries**:
  - The widened-grammar hazard is in the *read path*: `Label` types the label fields of every stored record, and of `DeviceUnlock`, whose reads fail soft, so a remembered unlock would silently stop working.
  - The strictness is partly a guard on secrets: labels are public, and today's grammar rejects nearly every real API key pasted into a label by mistake.
  - `listBoxes` sorts by `localeCompare` (locale-dependent) while Convex orders by bytes; harmless today, wrong for non-ASCII labels. Sort by code point when the grammar widens.
  - A vault written with widened labels reads as `corrupt_record` on an older safebyok.
  - The grammar text is repeated in three error messages besides `Label`'s own.
* **For the Coach**: (1) the floor's maximum length (I suggest 64); (2) whether a rule applies to `read`/`erase` of existing boxes (I say no); (3) whether colons in boxlabels are wanted (the old relic README wanted `anthropic:personal`): that alone costs a ckey migration; (4) the Convex server-side question, answered no above.
