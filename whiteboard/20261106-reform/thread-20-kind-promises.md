# Thread 20: kind promises (2026-11-06)

Branch `20261106-kind_promises`, PR (to come), stacked on #531. Justify: (to come).

**Status: blocked on size, by design.** The inventory runs to about 55 sites in prose and some 570
quoted kinds in the tests, past the handoff's sixty. This branch lands the inventory and the
VOCABULARY and README strips; the doc-block strip (a) and the test strip (e) are for later
threads. The tests are listed in [`thread-20-test-sites.md`](thread-20-test-sites.md), for
whoever strips them.

## The rule applied

A kind is a contract only where a host branches on it in normal use (CLAUDE.md *Doc blocks at a
glance*; STYLE.md `#no-refusal-catalog`), sorted with `refusals/errors.ts`'s families and the
verdicts of `whiteboard/20261102-newdesign/refusal-kinds.md`.

* **Contract, kept**: `vault_locked`, the correctable four (`wrong_passphrase`, `wrong_passkey`,
  `weak_passphrase`, `same_passphrase`, which `gating.ts` routes on), `declined`, `stale_write`,
  `camped` (the answer `ifPresent: 'fail'` asks for), `storage_unavailable` (retry), `vault_full`,
  `box_too_large`, `absent_box`, `absent_vault`, `absent_wayin`, `identity_revoked` (the core
  routes on it), and the bad news a host is told and may show: `damaged_box`, `damaged_lease`,
  `damaged_row`, `newer_format`.
* **Incidental, stripped**: the misuse family (`bad_option`, `bad_scope`, `bad_record`,
  `unexpected_error`, `gate_issue`, `disabled`, `insecure_context`), the impossible
  (`record_conflict`, `vault_empty`, `vault_mismatch`) and the UI bug guards (`gating_landed`,
  `attempt_in_flight`).
* **Unsure, left**: `already_asking` and `locked_while_asking` (the survey's own unsure rows), and
  `vault_gone` except on a verb of a vault already known deleted, the Coach's case, which strips.
* **Definitional, kept**: where the kind is the member's subject rather than a situation's
  outcome: a validator made with a kind throws it (`validator.ts`), `storageTroubleOf` and
  `refusalOf` make the kinds they are named for (`outcome.ts`), a phrase names its kind.
  `refusals/errors.ts` and `throwers.ts` are out of scope by the handoff.

## (a) Doc blocks in `packages/safebyok/src`: 32 strip, 27 keep, 2 left

| file:line | kind | verdict |
| --- | --- | --- |
| `helpers/passphrase-strength.ts:15` | unexpected_error, bad_option | strip: a host checker that throws or answers no verdict |
| `helpers/passphrase-strength.ts:23` | unexpected_error | strip: a `load` that fails |
| `helpers/passphrase-strength.ts:68-70` | bad_option, unexpected_error (2) | strip |
| `helpers/passphrase-strength.ts:94` | unexpected_error | strip |
| `helpers/validator.ts:65, :124, :155, :233, :241` | bad_option | strip: a story, opts, bag or refusal that is none |
| `helpers/validator.ts:77, :88-97, :109, :113-114, :121, :133-139, :243, :294` | the kind passed | keep, definitional |
| `helpers/logger.ts:41` | bad_option | strip |
| `helpers/crypto.ts:59` | unexpected_error | strip: a package-bug guard (guarded file: read its *The guarantees* first) |
| `storage/vault-db-new.ts:367` | unexpected_error | strip: a record the package prepared |
| `storage/vault-db-new.ts:374`, `storage/device-db-new.ts:84` | storage_unavailable | keep |
| `shapes/shapes-enums.ts:34` | camped | keep (`:12`'s `damaged_row` is a damagekind, no refusal) |
| `shapes/shapes-storage.ts:135` (a `//`) | gate_issue | strip |
| `shapes/shapes-storage.ts:178` | vault_full | keep (its `meta.capacity`) |
| `shapes/shapes-storage.ts:180` | bad_record | strip |
| `shapes/shapes-core.ts:14, :26, :48` | bad_record | strip |
| `shapes/shapes-core.ts:91, :120, :173, :181, :187, :196` | bad_option | strip |
| `shapes/shapes-core.ts:151, :156` | bad_scope | strip |
| `shapes/primitives.ts:25` | bad_scope | strip |
| `shapes/shapes-gateish.ts:24, :73, :84, :88, :106, :109, :123` | bad_option | strip |
| `shapes/shapes-gateish.ts:134` | weak_passphrase | keep |
| `models/gating.ts:132` | declined | keep |
| `models/gating.ts:135` | locked_while_asking | **left, unsure** |
| `models/bank.ts:205, :267`, `models/listing.ts:293` | identity_revoked | keep |
| `models/vault.ts:347` | absent_box, for a healthy box | **left**: fenced with the `absentBox` throwers; strip once they settle |
| `helpers/phrases.ts:461` | storage_unavailable | keep, definitional |
| `refusals/host-error-sanitizer.ts:21` | the kind passed | keep, definitional |
| `refusals/outcome.ts:31, :46, :49, :53, :57` | unexpected_error, storage_unavailable | keep, definitional |

`bank.ts:139` ("disabled") and `:176` ("declined") use the words as adjective and verb, not kinds.

## (b) VOCABULARY.md: 5 strip, 13 keep, 1 left (done here)

* **vault** (row 13): `vault_gone`, `disabled`: stripped, per the Coach.
* **passkey** (16): `bad_option` (`addPasskeyPrompt()` while one is held): stripped; `camped`: kept.
* **gating** (19): `gating_landed`: stripped; `already_asking`: **left, unsure**.
* **vaultTok** (98): `vault_mismatch`: stripped.
* Kept: lease (`damaged_lease`), revisionTok and read/write (`stale_write`), sidecar
  (`box_too_large`), damaged (`damaged_row`, `newer_format`, `damaged_box`), camped (2),
  strengthChecker (`weak_passphrase`), fmt (`newer_format`). The act row's `declined` is an act.

## (c) The core's README.md and CUSTOMIZATION.md: 4 strip, 3 keep (done here)

* `CUSTOMIZATION.md:25, :27` (a checker that throws, or answers no verdict), `:31` (a `load` that
  fails), `:84` (a chunk that will not load): `unexpected_error` and `bad_option`, stripped.
* `CUSTOMIZATION.md:12, :102`, `README.md:76`: `weak_passphrase`, kept. The README line is the
  no-checker misconfiguration, kept because it tells a developer why every passphrase is refused.
* The root README names no kind.

## (d) `notes/guarantees.md`: listed only, nothing changed

`:219` bad_option (a passkey answer handed in again); `:226` wrong_passkey; `:255, :261, :297`
damaged_lease; `:293-294, :305, :307` unexpected_error (a host getter or WebCrypto that throws);
`:298` damaged_box; `:319` weak_passphrase; `:363` newer_format. Each is a security claim: a
change wants a finding first. Of them, the four `unexpected_error` lines and `:219`'s `bad_option`
are incidental by the rule above, should the Coach want them stripped.

## (e) Tests: listed in `thread-20-test-sites.md`, nothing changed

569 quoted incidental kinds in 47 files; the helpers have no kind-less matcher yet.

## For the Coach

* **Split** the rest: (a) is one small thread (32 strips, three guarded-adjacent files); (e) is
  two or three by folder (`models/`, then `storage/`, `shapes/` and `helpers/`).
* **Bad news counted as contract**: `damaged_*` and `newer_format` are kept because a host is told
  them and may show them. Say if a host is not meant to branch on them.
