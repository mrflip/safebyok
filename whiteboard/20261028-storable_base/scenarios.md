# Scenarios: storable, box, listing, world

The models as they will stand when `sprint-box-contract.md` (as of 21253c09, 2026-10-30) is done, threads 1 to 8. Patent defects in the plan are judged as corrected and listed under *Plan defects*; gaps the plan leaves are under *Findings*.

## Key

| column  | values |
| ------- | ------ |
| central | `none` never stored (tombstone at NeverStoredSeq) · `sparse` · `full` · `gone` (am 'x') · `ouch` (am 'd') · `alive` sparse or full · `*` any |
| staged  | `—` none (null, t1) · `edit` full, sealed, next rev · `draft` rev 0, sparse, from `build(dna)` · `del` tombstone at next rev |
| device  | `unl` · `lock` · `→lock` the lock comes down mid-verb · `+flight` a launch, `put` or `del` of this box in flight |
| recent  | last success vs `maxMillisSinceRefresh` (none given: the trigger's schedule): `fresh` · `stale` · `never` · `h=0` · `h=∞` |
| storage | what storage holds when the call lands: `=c` central's revision · `newer` another device wrote · `none` |
| outcome | what the models do once the plan is done |
| plan    | `tN` thread N makes it so · `=` today's code, which the plan keeps · ✏️ `Pn` a plan defect, corrected here · 🤷 left to a thread or the adapter · `seal` outside this plan: the outcome is the spec's |
| claude  | ✅ fits the spec's aim · 🤷 defensible, see finding · ⚠️ against it, see finding |

## hydrate, fetch

| #   | central   | staged | device  | recent             | action          | outcome | plan | claude |
| --- | --------- | ------ | ------- | ------------------ | --------------- | ------- | ---- | ------ |
| H1  | full      | *      | unl     | fresh              | hydrate         | `world.ensureTimely`; no fetch; `this` | = | ✅ |
| H2  | full      | *      | *       | stale              | hydrate         | world first, then one launch | = | ✅ |
| H3  | *         | *      | lock    | *                  | hydrate         | as unlocked: a fetch takes no lock | = | ✅ F15 |
| H4  | sparse    | *      | *       | fresh              | hydrate         | forced fetch: central not whole | t4b | ✅ |
| H5  | none      | draft  | *       | never              | hydrate         | fetch; nothing stored → `same`, draft kept, no throw | t3, ✏️ P1 | ✅ |
| H6  | full      | *      | *       | never, h=∞         | hydrate         | no fetch (a box revived from the cache) | t4c | ✅ |
| H7  | none      | draft  | *       | h=∞                | hydrate         | no fetch: the never-stored central is whole | t4b, t4c | ✅ |
| H8  | sparse    | *      | *       | h=∞                | hydrate         | fetches: the spec's sparse exception | t4b | ✅ |
| H9  | *         | *      | *       | h=0                | hydrate         | always fetches | = | ✅ |
| H10 | *         | *      | +flight | *                  | hydrate         | joins the launch under way | = | ✅ |
| H11 | *         | *      | *       | last launch failed | hydrate         | launches again on demand; no timer re-armed, no retry | = | ✅ |
| H12 | gone      | —      | *       | stale              | hydrate         | fetch with `'nil'`; stays gone; resolves `this` | t3, ✏️ P1 | ✅ |
| H13 | *         | *      | *       | stale              | hydrate         | `world.ensureTimely` runs 3× (hydrate, `fetch`, `listing.fetch`) | = | 🤷 one would do |
| H14 | *         | *      | *       | timer due          | trigger fires   | background `tryFetch`; its refusal goes nowhere | = | 🤷 F8 |
| H15 | full      | *      | *       | horizon > MaxTimer | hydrate         | no timer armed; reads stale once passed | = | ✅ |
| H16 | gone/none | *      | *       | *                  | box.fetch()     | receives, then refuses `absent_box`; `box.fetch` can't pass `'nil'` | t3 | 🤷 F14 |
| H17 | alive     | *      | *       | stale, storage none | hydrate        | `record_conflict` (R3) | t2 | 🤷 F8 |

## edit (patch is sidecar-only unless it says)

| #   | central   | staged | device       | recent | action                    | outcome | plan | claude |
| --- | --------- | ------ | ------------ | ------ | ------------------------- | ------- | ---- | ------ |
| E1  | full      | —      | unl          | fresh  | edit({sidecar})           | staged: patch over central at next rev, `written_at` now, sealed parts carried; central untouched | = (spec: reseal) | ⚠️ F7 |
| E2  | full      | edit   | unl          | fresh  | edit                      | staged replaced, same tok until sent | t4f | ✅ |
| E3  | full      | —      | unl          | fresh  | edit({})                  | stages anyway, new revision | = | ✅ |
| E4  | sparse    | —      | unl          | fresh  | edit({sidecar})           | fetch, then E1 | t4b | ✅ |
| E5  | none      | draft  | unl          | never  | edit({sidecar})           | fetch, nothing stored → `bad_option`: a box needs a whisper | t3, = | ✅ |
| E6  | none      | draft  | unl          | never  | edit({whisper})           | fetch, seal at rev 0 | seal | ✅ |
| E7  | gone/ouch | —      | unl          | *      | edit({whisper})           | rebirth: alive at next rev, `registered_at` now | t4e, seal | ✅ |
| E8  | gone/ouch | edit   | unl          | *      | edit                      | over the staged rebirth; its `registered_at` stands | t4e | ✅ |
| E9  | gone/ouch | —      | unl          | *      | edit({sidecar})           | `bad_option`: nothing to carry | = | ✅ |
| E10 | *         | *      | lock         | *      | edit                      | `vault_locked`, after hydrate has fetched | = | ⚠️ F3 |
| E11 | full      | —      | →lock        | *      | edit                      | completes | t4d | ✅ |
| E12 | full      | *      | unl, exposed | fresh  | edit({})                  | seals the exposed whisper | seal | ✅ |
| E13 | full      | —      | unl          | *      | edit({}, {reseal: true})  | unseal stored, seal again | seal | ✅ |
| E14 | full      | edit   | unl          | after a failed send | edit         | fresh tok | t4f | ✅ |
| E15 | full      | —      | +flight      | answer lands during `makeStaged` | edit | staged at central's seq under another tok | = | ⚠️ F1 |

## send

| #   | central | staged | device  | recent | storage                         | action           | outcome | plan | claude |
| --- | ------- | ------ | ------- | ------ | ------------------------------- | ---------------- | ------- | ---- | ------ |
| S1  | full    | —      | unl     | fresh  | =c                              | send(patch)      | edit, `put` over central's rev; answer adopted, staged spent, timely; tok memo cleared; `this` | t4d, t4f | ✅ |
| S2  | full    | edit   | unl     | fresh  | =c                              | send(patch)      | patch over the staged, same tok; `put` | t4f | ✅ |
| S3  | full    | *      | unl     | fresh  | newer, `stale_write` carries it | send             | stored adopted (staged dropped), then throws `stale_write` | = | ✅ |
| S4  | full    | *      | unl     | fresh  | newer, carries nothing          | send             | throws; still timely at the old central: every retry refuses alike | = | ⚠️ F5 |
| S5  | full    | *      | unl     | fresh  | `put` fails (network)           | send             | throws; staged kept; the next edit mints a fresh tok | t4f | ✅ |
| S6  | none    | draft  | unl     | never  | none                            | send({whisper})  | fetch, seal rev 0, `put` with expected null | seal | ✅ |
| S7  | none    | draft  | unl     | never  | full, another device made it    | send             | hydrate adopts it; `ifPresent` judged there: `'fail'` throws `stale_write` carrying it | t8, ✏️ P3 | ✅ |
| S8  | none    | draft  | unl     | never  | full                            | send, `ifPresent: 'fetch'` | nothing written, stored adopted, draft dropped; `this` | t8, ✏️ P3 | ✅ |
| S9  | none    | draft  | unl     | never  | full                            | send, `ifPresent: 'replace'` | patch over it, `put` at its rev | t8, ✏️ P3 | ✅ |
| S10 | none    | draft  | unl     | h=∞    | full                            | send             | no fetch; `put` expected null; storage judges `ifPresent` (S7 to S9) | t4c, t8 | ✅ |
| S11 | full    | *      | unl     | fresh  | newer                           | send, any `ifPresent` | the compare-and-set stands: `stale_write` | t8 | 🤷 Coach's open question |
| S12 | sparse  | —      | unl     | fresh  | =c                              | send({sidecar})  | fetch, then S1 | t4b | ✅ |
| S13 | *       | *      | lock    | *      | *                               | send             | `vault_locked` at edit's guard, after hydrate | = | ⚠️ F3 |
| S14 | full    | edit   | →lock   | *      | =c                              | send             | completes | t4d | ✅ |
| S15 | full    | edit   | +flight | fresh  | newer (own send A)              | send B           | B's `put` refused `stale_write` carrying A; A adopted or `same`; throws | = | ✅ |
| S16 | full    | edit   | +flight | fresh  | answer lands between edit and `put` | send         | staged dropped; `put(this)` ducks central, re-puts storage's own record; patch lost, resolves | 🤷 adapter | ⚠️ F1 |

## del

| #  | central   | staged   | device | recent | storage           | action | outcome | plan | claude |
| -- | --------- | -------- | ------ | ------ | ----------------- | ------ | ------- | ---- | ------ |
| D1 | alive     | — / edit | unl    | fresh  | =c                | del    | staged := tombstone at next rev (an edit dropped), `present: false`; `store.del` at central's rev; answer → gone, staged spent, no refusal | t4f, ✏️ P2 | ✅ |
| D2 | gone/ouch | —        | unl    | *      | *                 | del    | deletes again at the tombstone's rev; the fake's answer is the thread's to pick | t4d | ✅ |
| D3 | *         | *        | lock   | *      | *                 | del    | `vault_locked`, after hydrate | = | ⚠️ F3 |
| D4 | full      | —        | unl    | fresh  | newer, carries it | del    | stored adopted, staged tombstone dropped → alive; throws `stale_write` | = | ✅ |
| D5 | full      | —        | unl    | fresh  | `del` fails       | del    | throws; staged tombstone stays: reads gone while storage holds it, a `same` refresh keeps it; a retry deletes | t4d | ⚠️ F4 |
| D6 | none      | draft    | unl    | never  | none              | del    | `store.del` with expected null; the answer is the adapter's | 🤷 | 🤷 F13 |
| D7 | *         | —        | unl    | *      | =c                | del    | storage mints the tombstone's tok; the staged tombstone's is never sent | = | ✅ |

## receive (age and shape of `rcvd` against central)

| #   | central   | staged           | rcvd                         | central after | staged after | plan | claude |
| --- | --------- | ---------------- | ---------------------------- | ------------- | ------------ | ---- | ------ |
| R1  | *         | *                | older · any                  | kept (`older`); a whole one notes it timely | kept | t4a | ⚠️ F9 |
| R2  | *         | *                | older · ouch                 | kept (`skip`) | kept | = | ✅ |
| R3  | alive     | *                | same · gone, or `null`       | throws `record_conflict` | — | t2 | 🤷 F8 |
| R4  | gone      | *                | same · alive                 | throws `record_conflict` | — | t2 | 🤷 F8 |
| R5  | *         | *                | same · sparse                | kept | kept | = | ✅ |
| R6  | gone/none | *                | same · gone, or `null`       | kept, timely | kept: a draft survives "nothing stored" | = | ✅ |
| R7  | full      | *                | same · full                  | kept, timely | kept | = | ✅ |
| R8  | sparse    | *                | same · full                  | rcvd (`fill`), timely | kept | = | ✅ |
| R9  | *         | *                | same · ouch                  | kept (`skip`), no news | kept | = | 🤷 F10 |
| R10 | full      | —                | newer · sparse               | rcvd: sidecar reads null until the next hydrate fetches; rare, notices come full | — | t3b, t4b | ✅ |
| R11 | *         | edit/draft/del   | newer · sparse or full       | rcvd (`adopt`) | dropped, silently | = | ✅ rule, ⚠️ F6 |
| R12 | *         | edit (own `put`) | newer · full, staged's tok   | rcvd | spent | = | ✅ |
| R13 | *         | *                | newer · gone                 | rcvd (`gone`), held as its tombstone | dropped | = | ✅ |
| R14 | *         | —                | newer · ouch                 | ouchstone: held sparse props, rcvd's rev, 'd'; no bad news | — | = | ⚠️ F10 |
| R15 | *         | edit             | newer · ouch                 | ouchstone | carried to next rev, not resealed | = | 🤷 F7 |
| R16 | *         | del              | newer · ouch                 | ouchstone | del tombstone carried; the `del` in flight answers over it | 🤷 | 🤷 |
| R17 | *         | *                | `vault_tok` ≠ world's        | adopted unchecked; own prop follows it | — | = | ⚠️ F7b |
| R18 | *         | —                | newer, other `registered_at` | own prop follows | — | t4e | ✅ |

## box: whisper and sidecar

| #   | central   | staged | device     | action                        | outcome | plan | claude |
| --- | --------- | ------ | ---------- | ----------------------------- | ------- | ---- | ------ |
| W1  | *         | *      | unl        | whisper (get)                 | exposed or null | = | ✅ |
| W2  | *         | *      | lock       | whisper (get)                 | `LOCKED` | t5 | ✅ |
| W3  | *         | *      | lock       | whisper = w                   | `vault_locked` | = | ✅ |
| W4  | *         | *      | unl → lock | (lock, whisper exposed)       | `#exposed` stays in memory, back on unlock; snapshot unchanged until a settle | = | 🤷 F2 |
| W5  | full      | *      | unl        | unsealWhisper                 | hydrate; unlocked, present, full; open; keep nothing | t4g, seal | ✅ |
| W6  | gone/ouch | *      | unl        | unsealWhisper                 | `absent_box` from its guard | t4g | ✅ |
| W7  | *         | del    | unl        | unsealWhisper                 | `absent_box`: the record in hand is a tombstone | t4g | ✅ |
| W8  | sparse    | *      | unl        | unsealWhisper                 | fetch, then open | t4b, seal | ✅ |
| W9  | *         | *      | lock       | unsealWhisper, expose, reseal | `vault_locked`, after hydrate | t4g | ⚠️ F3 |
| W10 | full      | *      | unl        | expose                        | open, keep on the instance, settle | seal | ✅ |
| W11 | *         | *      | unl        | seal(w)                       | = edit({ whisper: w }) | seal | ✅ |
| W12 | full      | *      | lock       | sidecar (get), snapshot       | `{ [LOCKED]: true }`; the snapshot's compare sees the change | t5, ✏️ P4 | ✅ |

## listing

| #   | held       | storage   | action                    | outcome | plan | claude |
| --- | ---------- | --------- | ------------------------- | ------- | ---- | ------ |
| L1  | —          | cache n   | hello                     | revive each (central, staged or null), write nothing back, settle, watch every box full, hydrateAll | t1, t3 | ✅ |
| L2  | any        | *         | hello again               | every held instance replaced (identity lost); watch kept | = | ⚠️ F12 |
| L3  | *          | *         | goodbye                   | watch ends; instances and their trigger timers keep running | = | ⚠️ F12 |
| L4  | *          | *         | at(scope)                 | instance or null; reads nothing | = | ✅ |
| L5  | —          | *         | build(dna)                | `boxDna` checked (`bad_option`); central never stored, no sidecar; draft at rev 0; held, settled, cached | t3, t5, t7 | ✅ |
| L6  | held       | *         | build(dna)                | new instance replaces the held one; pinned in the loosened file | = | ⚠️ sprint *For the Coach* |
| L7  | *          | *         | build(record)             | = a fetch delivering it; cached | t3 | ✅ |
| L8  | —          | none      | fetch(scope)              | `absent_box`; `'nil'` → null | t3 | ✅ |
| L9  | held alive | none      | fetch(scope)              | `record_conflict` (R3), before `ifAbsent` | t2, t3 | 🤷 F8 |
| L10 | —          | tombstone | fetch(scope)              | gone instance held; `absent_box`, `'nil'` → null | t3 | ✅ |
| L11 | *          | *         | put(record)               | over held's expected (null if not held), `ifPresent` passed on; answer delivered | t8 | 🤷 F1 |
| L12 | *          | *         | del(duck)                 | at held's expected; its tombstone answer refuses nothing | ✏️ P2 | ✅ |
| L13 | *          | *         | answer refused            | world taken; a stale record delivered; then thrown | = | ✅ |
| L14 | *          | *         | answer malformed          | `bad_record` before anything is delivered | t1 | ✅ |
| L15 | —          | *         | notice, scope unknown     | new instance held | = | ✅ |
| L16 | *          | *         | notice of a tombstone     | delivered; no `absent_box` news | ✏️ P2 | ✅ |
| L17 | *          | *         | notice refused on the way | bad news, never thrown | = | ✅ |
| L18 | *          | *         | cache save                | once per settle given a thing: each delivery, each build; not on edit or del | t3 | 🤷 F11 |
| L19 | *          | *         | snapshot                  | sparse forms of present things, same array until one changes | = | ✅ |
| L20 | gone       | *         | (any delivery)            | nothing evicted, tombstones never reaped | = | ✅ |

## world (the vault, as boxes see it)

| #  | event                      | outcome | plan | claude |
| -- | -------------------------- | ------- | ---- | ------ |
| V1 | world stale, any verb      | `world.ensureTimely` first; its answer may lock or take the vault | = | ✅ |
| V2 | an answer's world          | `takeWorld` before the record | = | ✅ |
| V3 | lock comes down            | `isLocked` live; snapshots stale (sidecar bag, `exposed`) until each box settles | = | ⚠️ F2 |
| V4 | vault evicted              | not written | = | ⚠️ |
| V5 | `lock()`, staged / exposed | not cleared by any verb: the lock's business | 🤷 vault thread | 🤷 F2 |

## Plan defects

Each is judged corrected in the rows above.

* **P1 (H5, H12): `'nil'` misses the trigger.** Thread 3 says `hydrate` passes `ifAbsent: 'nil'`, but `hydrate` fetches through the trigger, whose `doTryLaunch` calls `tryFetch()` with no opts. Uncorrected, hydrating a gone box, or a draft over nothing stored, refuses `absent_box`. Correction: `doTryLaunch` passes `{ ifAbsent: 'nil' }`.
* **P2 (D1, L12, L16): `ifAbsent` is judged in `#deliver`.** Every answer goes through `#deliver`: `put`, `del` and the watch's notices too. A `del`'s own answer is a tombstone, and so is every deletion notice. Under the default `'fail'`, every successful `del` would throw `absent_box`, and every deletion notice would arrive as bad news. Correction: only `fetch` judges `ifAbsent`, and `put`, `del` and notices deliver as `'nil'`.
* **P3 (S7 to S9): `ifPresent` is mostly unreachable.** Thread 8 judges it where expected is null, but `send` edits and edit hydrates first. Whenever storage holds the box, that fetch turns the draft's central into a stored one. The draft is dropped, the patch is staged over the stored box, and the `put` overwrites it. So the default is a silent replace, and `ifPresent` is reached only at h=∞ or in a race. Correction: `send` notes that central was never stored, then hydrates. If the hydrate turned up a record, `send` judges `ifPresent` itself before editing: `'fail'` throws `stale_write` carrying it, `'fetch'` resolves without a `put`, `'replace'` goes on.
* **P4 (W12): the `LOCKED` sentinel.**
  * `Symbol.for('LOCKED')` sits in the global registry, so any library that registers 'LOCKED' gets the same symbol. Correction: `Symbol.for('safebyok.locked')`.
  * `{ [LOCKED]: true }` has a symbol key, which `stableJsonify` and JSON drop. `sameSnapshot` then sees a locked sidecar and an empty `{}` sidecar as equal, so nobody is notified, and a host that serializes the snapshot sees `{}`. Correction assumed: the snapshot's compare sees the lock, for example a `locked` field beside `sidecar`.
* **P5: a stale path.** *Read first* names `src/utils/trigger.ts`, which has been `src/helpers/trigger.ts` since 7483a7b3.
* **P6: `demandFull` and its message.** t4d drops `demandFull` and `notFullError` "if nothing else calls them", but t4g's unseal guard calls `demandFull`, so both stay. Their message still says "cannot be sent", which stops being true at t4d.

## Findings

Gaps the plan leaves, most severe first. Each is a proposal; none is made.

1. **Revision races (E15, S16, L11).**
   * The race: `edit` mints its revision from central before `makeStaged`'s await, and reconciles against central after it. `send` ducks `this` to `put` after edit's await. An answer landing in either gap stages a record at central's seq, or re-puts storage's own record and resolves with the patch lost.
   * Proposal, three lines:
     * `reconcileStaged` 'edit' refuses `stale_write` unless `nextRevision.revision_seq === central.revision_seq + 1`.
     * `send` refuses unless `hasStaged` after the edit.
     * The `Store` contract says `put` refuses a record whose seq is not expected's + 1 (0 for null).
2. **The lock leaves stale snapshots and open secrets (V3, V5, W4).** Nothing settles the boxes when the lock changes, so t5's locked sidecar shows only at the next settle, and an exposed whisper stays in memory and returns on unlock. Proposal: the world gets one path that settles every listed box, and clearing `#exposed` belongs in that path.
3. **The lock is checked after the fetch (E10, S13, D3, W9).** `ensureReadyToX` hydrates, then demands. A lock never lifts by itself, so `demandUnlocked()` before the hydrate as well saves a pointless fetch.
4. **A failed `del` reads gone (D5).** After t4d a retry works, but until then the box shows deleted while storage holds it, and a `same` refresh keeps it so. Proposal: `del` stages nothing, and its answer makes the box gone.
5. **`stale_write` with no record (S4).** The box stays timely at the old central, so every retry refuses the same way. Proposal: the `Store` contract says `stale_write` always carries what is stored, null meaning nothing.
6. **A dropped staged edit is invisible (R11).** Proposal: `staged: boolean` (`hasStaged`) in the snapshot.
7. **The stamp and carried revisions (E1, R15).** The stamp binds the revision, so a carry-forward puts a seal that does not match its record. The `ouch` carry is harmless only while every `send` edits, which reseals. Waits on the seal.
   * **F7b: `vault_tok` drift is unchecked (R17).** Proposal: `#deliver` compares `vault_tok` with the world's, and a mismatch reloads the vault (CLAUDE.md).
8. **Background refusals go nowhere (H14, H17, R3, R4, L9).** A `record_conflict` met by the trigger is dropped, and every later hydrate throws it. Proposal: a launch's refusal goes to `tellBadNews`.
9. **An older record notes the box timely (R1).** t4a keeps this. An older record shows lag, not freshness. Proposal: note success on `same` and newer only.
10. **No code produces bad news (R9, R14).** Damage, at the same revision or newer, is never told to the host. Proposal: `damaged_box` from `settle` once, on the receive that made the ouchstone, and on same-revision damage.
11. **The cache holds a staged edit by chance (L18).** `edit` and `del` don't cache. A staged edit reaches the cache only when a later delivery leaves it standing (a `same` notice); an adopt drops it. Proposal: either `edit` settles the listing with the box, or `cacheable` leaves out the staged edit.
12. **hello and goodbye (L2, L3).** A second `hello` replaces every instance, and after `goodbye` the trigger timers keep fetching. Proposal: `hello` no-ops while watching; `goodbye` disposes each trigger.
13. **A `del` of a draft (D6).** It reaches storage with expected null. Proposal: drop the draft locally, with no storage call.
14. **`box.fetch()` can't say `'nil'` (H16).** It takes `TimelyOpts`, not `FetchOpts`. Proposal: `Storable.fetch` takes `FetchOpts`.
15. **Your sample row 1 (H3).** The models fetch while locked (spec: "A fetch needs only the world timely"). I agree: only ciphertext moves, and t5 hides the sidecar.
