# restyle sprint: done, 2026-10-27

The restyle sprint built NEWSTYLE and the shapes preplan (`whiteboard/20261025-restyle/`) into the
code: Zod-built validators made in one `Validator` factory, duck-typed shapes picked from one
record, `Scopepath`, `user_id` everywhere, one bank per signed-in user, each ctx binding its
stamps, frozen Vault objects with a `useSyncExternalStore` snapshot, and the bank's listing. It ran
in YOLO from 2026-10-26 to 2026-10-27, paused twice for usage, and took the Coach's rulings from
the sprint doc as it went. Thread 16 (retiring "standing", the Coach's `unstanding.md`) was not
run, at the Coach's word; its prompt stays for a later session.

## The PRs

| Thread | PR | State |
|---|---|---|
| 1 guidance | [#272](https://github.com/mrflip/safebyok/pull/272) | merged |
| 2 to 12 | #273 to #283 | merged |
| 13 bank_listing | [#286](https://github.com/mrflip/safebyok/pull/286) | merged |
| 14 rulings | [#287](https://github.com/mrflip/safebyok/pull/287) | merged |
| 15 tidy | [#291](https://github.com/mrflip/safebyok/pull/291) | merged |
| 17 validators_trim (follow-up) | [#293](https://github.com/mrflip/safebyok/pull/293) | filed, reviewed `fixed`; ready to merge |
| docs: doc-block rules | [#290](https://github.com/mrflip/safebyok/pull/290) | merged |
| cleanup: changeset clauses | [#288](https://github.com/mrflip/safebyok/pull/288) | merged |
| cleanup: security notes | [#289](https://github.com/mrflip/safebyok/pull/289) | merged |
| the sprint PR | [#271](https://github.com/mrflip/safebyok/pull/271) | merged |

#293 came after the sprint PR merged, so it carries these documents' last edits itself, with
thread 17's file in `winboard/20261025-restyle/`.
#289 stands alone. The process change the sprint asked for landed as #284; the older
sprint PRs #242 (streamline) and #250 (primitives) are closed out for merge as history, each with
its folder to `winboard/` and its old tip tagged.

## The reviews

Every code thread had a `medium` review (thread 9's `high`). Real bugs the reviews caught and
fixed: vacuous Convex authorization tests (#277); BankProvider handing down the last user's bank
for one render (#278); `delDamagedVault` skipping its read-answer check (#281); `cipherCtx`
accepting a null field (#280); a host's own sidecar deep-frozen in place by `putBox` (#287).
Each thread's `*Review:*` line in the plan says what was fixed and left.

## Rulings and YOLO calls

The Coach's rulings, word for word, are in `restyle-resolutions.md`, beside their questions on
each PR, and the calls left to the orchestrator under *Left to the orchestrator*. Notable: the
Validator factory and every validator public; refusals repeat no key or value they were given;
`registered_at` bound into each way in (reversing 2026-10-21); strict stored records; no format
bumps before 1.0.

## Still open, for the Coach

In the sprint doc's Open Matters, `drafting`:

* **TOP: Convex's validators from the core's Zod** (#287): Rec `convex-helpers` as a peer of
  safebyok-convex alone, its `zodToConvex` (Zod 4 supported); your proceed is the yes.
* Adapters' box rows typed `unknown` (#287): Rec back to the input type you approved.
* Scope validators' case (#291): counted, no change, at your word.
* Vault objects as the bag naming a vault (#293): Rec the duck (scope required, a Vault's other
  fields allowed unchecked, anything else refused); with it, two refusal wordings (#293).
* Stamps kept in `Validators` (#293): Rec keep.
* Minor, for a later tidy: the Convex test helpers' `vaultRecordCkey` still names a storage address a ckey.
* Two Coach notes still drafting: a method on the validator wrapper; a `/**` first-line audit.

Your main checkout holds `whiteboard/20261025-restyle/` untracked (`unstanding.md` and older
copies): delete it before pulling, once you have checked it holds nothing newer.
