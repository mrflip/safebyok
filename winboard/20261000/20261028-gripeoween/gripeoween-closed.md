# gripeoween: closed

Answered since the sources were written: built, ruled, or overtaken. Each says what closed it.
Checked against `main` at `f2af68e4`, not against the PR's claim.

## Open Matters rows (the fixup sprint doc), done

- GW-30 **Changeset for reworded "standing" messages**: #300 merged with the empty changeset the Rec asked.
- GW-31 **`fitsLease` takes `vaultRecord`, not `held`**: kept as built, #300.
- GW-32 **One lock rule for every Vault call**: #304's class doc says it once; the Coach: "yes one rule
  please". Only the pinning test is left (GW-04).
- GW-33 **What holds the vaultKey between calls**: nothing unwrapped; #303's wording confirmed against
  `lease.ts`, `crypto.ts`, `proving.ts`; `notes/guarantees.md` (#306) states it as G5/G6.
- GW-34 **'gate_made_elsewhere' reaches the caller**: kept, documented by #304; the Coach: "yes".
- GW-35 **`getWhisper` refuses 'absent_box' where a get answers null**: kept; STYLE.md's verb table
  (l.123) names the exception. The Coach's aside, whether a whisper may be `null` at all, is GW-60.
- GW-36 **`vaultMadeUnderShape` becomes `VaultMadeUnder` beside its type**: done by #301
  (`src/shapes/vault.ts:192-204`, exported from `index.ts`). The Coach's "what is VaultMadeUnder?" is
  answered in `gripeoween-context.md` under GW-18 for the record.
- GW-37 **"Would you have someone look at all these check functions and see if they should be using
  validators?"**: #301 (validator_ducks, two rounds) was that sweep; `sweep-rules.md` holds the rules.
- GW-38 **`onBadNews` throwing during birth is the contract**: accepted; #303's doc says it. The TODO
  the Coach asked for is GW-06.

## The fixup preplan and sprint

- GW-39 **Items 1-3** (`outcomeOf` defaults to `unexpectedError`, `answering` gone, `adapterAnswer` drops
  its Outcome check and `hookname`, `unexpectedError` in `refusals.ts`, `isOutcomeShaped` deleted):
  #297 and the restack. `Refusals.unexpectedError` stays beside the top-level export (the Coach:
  "perfectly happy for every refusal type to have a functional form").
- GW-40 **Item 4, DeviceDB a base class**: #298. Every open question settled as built: the silent discard,
  scopepath hooks with no helper, no new checks in `putLease`, `spyOnDeviceHook`, no guard on an
  overridden verb ("yay").
- GW-41 **Items 5 and 8** (`vaultTok` off the box path, `#boxUnder` inlined, `#leaseInForce`,
  `#holdLease` one worker, `#damagedBase` on `#listedBase`, `src/text.ts`): #299.
  `#freshGatedRecord` is `#freshenGated` (`gating.ts:310`).
- GW-42 **The silent-overwrite worry on #297** (`damaged_box` from a wrapped `doGetBox` answer letting
  `putBox` write over a sound box): ruled, the check stays removed; `describeVaultDB` is the defence
  ("Don't defend against a future programmer writing bad code by writing bad code in a critical path").
- GW-43 **`retire_standing`**: #300; seven `stand*` hits left in `src/`, all kept idioms.
- GW-44 **`proving_tidy`**: #311; `checkWayin` is `demandOpens` by the ruling; `notes/guarantees.md` names
  the `provingTools` accessor (l.265), so thread 5's G9 worry is moot.
- GW-45 **The Coach's own `fixup-changes.md` questions**: each answered by the preplan and built, bar
  the two STYLE items (GW-07). "Why is idb an object, not a class?" became #298.
- GW-46 **Cleanup tab's checked items**: the restack, #289's security.md reconciliation,
  `isOutcomeShaped`, the two local tags, the `deviceOutcomeOf` correction.

## The restyle's leftovers

- GW-47 **Every "Left to the orchestrator" call** in `winboard/20261025-restyle/restyle-resolutions.md`
  landed where it says (#271 to #293). The three that became TODO entries are TODO.md's *After the
  restyle* item (GW-29).
- GW-48 **After the close**: `Validators` trimmed to 66 names and the vault bag strict (#293); then #301
  loosened the bag again to "any carrier, refusing only a store", by the Coach's round-2 rules.
  `bank.err` not added (the Coach took the Rec).

## Catchsweep rulings already taken (2026-10-28)

- GW-49 **#316**: the throwing form owns the catch that fixes its refusals; the `try` form is one
  `outcomeOf` hop. Thread 2 applies it to Lease and Box; thread 7 to Vault and Bank.
- GW-50 **#317**: a Zod `ParseContext` handed to a validator's `parse` refuses 'bad_option'; keep.
- GW-51 **#318**: convex-helpers 0.1.129 a day early, exempted by exact version; the peer keeps its caret.
- GW-52 **#315, #319**: no open questions.

## security.md sentences overtaken, already marked in place

Nothing to do; listed so nobody reopens them.

- GW-53 l.2023, "binding the whole header … not yet built": the entry itself says "(Built since …)",
  and #280 binds `registered_at`.
- GW-54 l.1927, IndexedDB's one-transaction delete "ruled TODO, not yet built": "(Built when the store
  moved to `safebyok-indexeddb` …)".
- GW-55 l.3150, the "do not yet" on the stores' locks: "is superseded".
- GW-56 TODO.md *Sand*: the Postgres `InsertBoxOutcome` name is gone (the type is `BoxAnswer`); the
  looseness it named is not, so that half stays open as GW-28.
