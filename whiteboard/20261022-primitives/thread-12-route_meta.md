# Thread 12: route_meta (2026-10-22)

Branch `20261022-route_meta`, PR [#252](https://github.com/mrflip/safebyok/pull/252), stacked on [#265](https://github.com/mrflip/safebyok/pull/265), in the line main → #265 → #252 → #250 (restacked 2026-10-24).
Justify: green at the restacked tip (core 3139, indexeddb 164, postgres 318, fastkey 49, react 300, convex 316, graphql 323, demo 227, e2e 107; `pnpm size:budget` within every budget, none moved).

* **Built**: the Postgres route recipe answers every call in one shape
  (`packages/safebyok-postgres/README.md`, *The route recipe*; run by `tests/route-recipe.test.ts`, which is the README's code with only the test's wiring changed).
  * `{ result, meta }` served; `{ refusal: { kind, message, meta }, meta }` refused. The main `meta` is on every answer (the 400 for a non-verb too).
  * **Main `meta`**: `box_stored`, `vault_props_stored`, `capacity` (a write's not-quite-error facts; records whole, as a read sends them). `{}` on a served call.
  * **`refusal.meta`** (error information): only `box_listed` and `wayin_listed`, rebuilt by an allowlist (`answerOf`, `boxShown`, `wayinShown`).
  * Client `checkedAnswer` validates the envelope fully (meta present and holding only main fields; result xor refusal; known kind; string message; refusal meta holding only error fields), else a plain Error that the base VaultDB meets as `storage_unavailable`, quoting nothing. It rethrows the `VaultError` with both metas merged. Records inside are the base VaultDB's to check, as before.
  * Changeset `.changeset/20261022-route_meta.md` (`safebyok-postgres` minor); `notes/security.md` amended through a sonnet subagent.
* **What is stripped, and why** (the YOLO judgment call): the error meta is rebuilt from an **allowlist**, not filtered by name, so a future field fails closed.
  * Crosses: a damaged box listing's `boxlabel`, `damaged`, `revision_tok`; a wayin listing's `wayinkind`, `device_id`, `registered_at`, `vault_tok`, and for a passkey `credential_id` and `prf_salt_b64` (what a locked vault's snapshot already shows).
  * Does not cross: `salt_b64` (a passphrase wayin's salt: not secret, but offline-guessing material beside the wrap), `vault_key_wayin_wrapped`, `vault_key_lease_wrapped`, every `Ciphered` field of a box, and anything else on a record. The refusal's `cause` never crosses.
  * Kept whole in the **main** meta: `box_stored` and `vault_props_stored`, which are the winning records the browser needs to recompose its picture (the Coach's "full record where-do-they-go" field).
* **Decisions taken**:
  * `capacity` is in the main meta, not the error meta: it is a fact about the vault the write learned, as the GraphQL half's #246 body treats it, and not error information.
  * A served call sends `meta: {}` rather than omitting it: one place to look on every answer, and the client can require it.
  * The helpers live in the README recipe (copy-paste code the host owns), not as a new export of `safebyok-postgres`: an export is a contract, and no ruling asks for one.
* **Deviations**: none. The GraphQL half is untouched, as the plan says, pending the open row.
* **Discoveries**:
  * The core's server-side VaultDB refusals carry only `box_stored`, `vault_props_stored` and `capacity`; `box_listed` and `wayin_listed` come from the `Vault` on the browser. So the real route's `refusal.meta` is `{}` today: the allowlist is a guard against an adapter's or future refusal, and its tests drive `answerOf` with crafted refusals.
  * `notes/security.md` has two other entries (2026-10-21 store_rulings amendment near line 639; the `stale_write`/`box_stored` entry near line 863) that still say the recipe sends `meta` whole. The subagent amended only the Postgres entry, as the header allows one entry; the Coach's audit should add the pointer.
  * The residual is unchanged: a stale update's `vault_props_stored` carries both wayins (salts, wrapped vaultKeys) in a response body, to the vault's own signed-in user only. A host that logs response bodies would log them.
* **Restack (2026-10-24)**: rebased from #251 onto [#265](https://github.com/mrflip/safebyok/pull/265) (`20261024-react`, 146 commits of core reshaping since the cut). Three conflicts, all side by side:
  * `notes/security.md`: the route_meta amendment and #265's line's 2026-10-22 (bank) amendment of the same Postgres entry, both kept, route_meta's first; no other entry touched.
  * `packages/safebyok-postgres/README.md` and `tests/route-recipe.test.ts`: the `safebyok` type imports take both sides (today's `BoxGetExpectation`, this thread's `DamagedBox` and `WayinSummary`); the client half's lead-in says `Bank.make`, today's name, where this thread had `Vault.make`.
  * Every stored-field and refusal-meta name the recipe uses (`box_listed`, `wayin_listed`, `box_stored`, `vault_props_stored`, `capacity`, the wayin and `DamagedBox` fields) is still today's; no behaviour needed a choice.
* **For the Coach**: see the PR's open questions.
