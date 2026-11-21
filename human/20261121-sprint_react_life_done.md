# Sprint react_life: done (2026-11-21)

Two apps, Knock-Knock and envman, run on the new core through a private React layer,
`packages/safebyok-react-lean`: a provider whose giver keeps its device, hooks that read stored records through the
host's React Query (fed by a bridge from the minder) and local state from the device's store, parts (`WhisperText`,
`WhisperMask`, the unlock and create-vault forms) and a kit. The device brings up its own bank, and birth is a device
verb. No verb outside the startup sequence awaits `hello`: each reads the stage and acts or refuses. The Coach
clicked through both apps in a browser and they run well. Rulings are in
`whiteboard/20261121-react_life/react_life-resolutions.md`; the Closer Look and its triage in
`react_life-closerlook.md`.

## PRs, in merge order

Merged (2026-11-21): #797 react_lean_pkg, #798 device_bring_up, #799 giver_slot, #800 parts_kit, #802 kit_ways_in,
#801 giver_boxes, #803 demo_knockknock, #804 giver_box_list, #805 use_draft, #806 giver_surface, #807 demo_envman,
#808 lockable_whisper, #809 giver_device, #810 whisper_mask, #811 stage_not_wait.

Open, one line: main → #813 birth_verb → #814 new_passphrase (stacked on #813) → #796 the sprint PR (plan, progress,
design, surveys, resolutions, Closer Look, TODO entries, notes/security.md entries; squashed). Merging #796 merges
the rest.

## YOLO decisions worth a look

* The bridge delivers each minder event a microtask later, flagged `#pragmatic-fix` (the Coach's directive), and
  catches each delivery into the device's `tellBadNews`.
* Queries run at `unborn` as well as locked and unlocked; the bridge skips the listing the minder seeds at hello
  (both ruled: keep).
* A birth at `starting` makes its gating, vacates it (zeroing the passkey answer) and refuses `disabled`
  (`BankNotBroughtUp`); `Bank.birthGating`'s `keep` is optional and checked (#813, after a flagged review).
* `WhisperText` resets on a change of box or field through a keyed inner part (React's idiom, #814).

## Still open

* **`Bank.birthGating` on the public surface** (#813): a direct caller bypasses the device's stage check and keeps
  no bank. Rec: keep it; it is safe now that `keep` is checked.
* **`keep` or `adopt`** (#813): `keep` is on VOCABULARY's vague-verb list.
* **A gating's own copies dropped unzeroed** (`gating.ts`, an earlier thread): when `CleartextChecks.gatingArgs`
  refuses inside `adoptedCleartextsOf`, the host's bytes are zeroed but `adoptedAnswers` are not. Rec: a two-line
  fix on the next thread in `gating.ts`, or a G2 drift line.
* **A non-function `keep` or a non-Device to `Bank.birth` leaves the passkey answer live** (#813): entry-point
  validation before any gating exists; recorded in notes/guarantees-drift.md. Rec: accept.
* **Export `useNewPassphrase`?** (#814) Rec: keep it private until a host writes its own new-passphrase form.
* **Quoted keys** (#814): STYLE.md says `"`, safebyok-big's `whisper-field.ts` uses `'`, and the rule is unlinted.
* **Two draft fields waiting on one unlock both reveal** (#814 review, pre-existing): only where the unlock form
  does not make the page inert. Rec: leave it.

## Seed for the next session

From the Closer Look triage, with the Coach's words (the export has them in full):

* **E1, the refusal's kind**: a box read before birth refuses `bad_record` with a lifepath message, from the
  stand-in root shell (`#rootShell`). Rec: `absent_vault`, "no bank yet", by retiring `#rootShell` (the nexus
  reply: "this sounds bad"). Thread 16 papered over the startup and left this.
* **E7** (the stage from stand-ins over stores, `swept` surviving): no reply yet. Thread 13 removed two stand-ins.
* **E11**: "Nothing this sprint; keep it on the list bravo!" The device as composition root, the core's unreachable
  subset.
* **E12**: "retire when the entire -big rewrite is done". The package's own knock-knock test app.
* **The bank's copies of minder records**: "this fits with upcoming changes, but it needs more design before
  anything should be rewritten, so leave the shim" (TODO entry).
* `Vault.forceTimelyUnlocked` waits on the unlock and nothing calls it; ask before removing it.
* Cleanup's *Finally* items still open, as listed in the resolutions file: the documentarian pass (react-lean, the
  demos' doc blocks, `withLockableWhisper`'s crossing stated as contract, `Vault.withWhisper` and
  `withUnlockedWhisper`, `useReveal`, `useNewPassphrase`), the e2e flake ("stops the server's watch once the browser
  stops watching"), and the rest.
