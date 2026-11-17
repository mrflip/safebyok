# Sprint fixup_sprint: resolutions

The Coach's rulings and the orchestrator's calls from the fixup sprint, 2026-10-27, swept from the sprint doc (https://claude.ai/artifact/Qvwd1KJxaAJKZtMtgaMNBg).

## The Coach's rulings

Newest first. Each is quoted word for word.

### Approve the restack's one force-push

* **Matter:** #298's branch, rebased cleanly onto #299 to make the line main → #297 → #299 → #298, had to replace origin's with a lease on 954e6290; the permission check had refused the push.
* **Coach, in chat:** "you are authorized to push where you need to on prs you are confident another session doesn't own"
* **Date:** 2026-10-27.
* **Raised:** at the restack.
* **Work:** pushed with the lease at 9b780d04 (justify green at the top); #298's first line says it is stacked on #299; thread 4 cut from it.

### Nothing stops a DeviceDB from overriding a public verb

* **Matter:** Explained there. There is no adversary: VaultDB's verbs are no better guarded, and the demo overrides one on purpose. The revised Rec was no check.
* **Coach:** "yay"
* **Date:** 2026-10-27.
* **Raised:** in #298's review.
* **Work:** no check added.

### safebyok/testing gains spyOnDeviceHook

* **Matter:** Explained there: a DeviceDB's public verbs resolve an Outcome and never reject, so a test makes the store's own hook throw.
* **Coach:** "yay"
* **Date:** 2026-10-27.
* **Raised:** on #298 (thread 3).
* **Work:** kept, as built.

### raisedDeviceRecord and deviceOutcomeOf leave the exports

* **Matter:** Explained there: the rule keeps a device's newest `vault_epoch` seen, never lowered, as the rollback watermark behind `vault_behind`.
* **Coach:** "yay"
* **Date:** 2026-10-27.
* **Raised:** on #298 (thread 3).
* **Work:** as #298 built it.

### putLease and raiseDeviceRecord still don't check what they're handed

* **Matter:** putLease and raiseDeviceRecord still don't check what they're handed.
* **Coach:** "What's the threat model? If there are already in-module defenses, rely on them. If not, defend"
* **Date:** 2026-10-27.
* **Raised:** on #298 (thread 3).
* **Answer, as written in the doc:**
  * **Who writes:** only the core's own calls write to a DeviceDB, and nothing from outside reaches those writes.
  * **The in-module defenses:** every record handed over is already built and checked in the module. `deviceRecordOf` checks a device record with `DeviceRecord.parse`. `sealLeaseRecord` parses a lease's grant and checks its wrap.
  * **Work:** rely on those defenses; no new checks.

### DeviceDB hooks take scopepaths, where VaultDB's take scopes

* **Matter:** DeviceDB hooks take scopepaths, where VaultDB's take scopes.
* **Coach:** "Whatever's convenient, or add a scopeOrScopepath helper if callers of both persuasions exist. ( overload the signature if it's a good idea to do so)"
* **Date:** 2026-10-27.
* **Raised:** on #298 (thread 3).
* **Answer, as written in the doc:** only the base class calls the hooks, and always with a scopepath. With no callers of the other persuasion, there is no helper or overload.
* **Work:** as #298 built it.

### A host's unreadable lease now goes without a word

* **Matter:** A host's unreadable lease now goes without a word.
* **Coach:** (empty: took the Rec, accept it).
* **Date:** 2026-10-27.
* **Raised:** on #298 (thread 3).
* **Work:** as #298 built it.

### TOP: removing adapterAnswer's check opens a silent overwrite

* **Matter:** A storage adapter that forgets `valOf` on `doGetBox` alone makes `putBox` overwrite a sound box as damaged, dropping its sidecar.
* **Coach:** "Do we have a generic test battery for device db like we do for vaultDB? Don't defend against a future programmer writing bad code by writing bad code in a critical path. If that's what's happening here, remove the check; otherwise explain"
* **Date:** 2026-10-27.
* **Raised:** on #297 (thread 1's review).
* **Answer, as written in the doc:**
  * **The battery:** yes. `describeDeviceDB` runs every DeviceDB through its contract, as `describeVaultDB` does every VaultDB; both are in `safebyok/testing`.
  * **The adversary:** none. The check defended against one party only, the friendly author of a host's own storage adapter who forgets `valOf` on `doGetBox` and never runs `describeVaultDB`. No user, backend or attacker can make an adapter wrap its answers. So it is the case you name, and the check goes.
  * **Work:** the check stays removed, as #297 built it. Thread 1 files once its worker confirms that `describeVaultDB` fails such an adapter.

### Refusals.unexpectedError, a new public name

* **Matter:** Keep both it and the top-level `unexpectedError`.
* **Coach:** "I'm perfectly happy for every refusal type to have a functional form"
* **Date:** 2026-10-27.
* **Raised:** on #297 (thread 1).
* **Work:** both stay, as #297 built them.

### When the documentarian's vault.ts rewrite lands

* **Matter:** It sits in `stash@{0}` and collides with threads 2 and 4.
* **Coach:** "the documentarian run was mostly for evaluating documentarian. Ignore it. Would you please add a thread to run it agains the core src/ directory?"
* **Date:** 2026-10-27.
* **Raised:** on #295.
* **Work:** the stash is ignored. Thread 5, a documentarian run on `packages/safebyok/src/`, joins the plan after thread 4.

### For coach: the fixup folder on your local branch

* **Matter:** Drop `whiteboard/20261026-fixup/`, or the four plan-only commits, from `20261027-fixup` before filing it.
* **Coach:** "will do, you have copied the relevant files out and I should not include vacuous commits"
* **Date:** 2026-10-27.
* **Raised:** on #295.
* **Work:** the Coach's.

## The orchestrator's calls

These are calls left to the orchestrator: matters that needed no decision from the Coach.

| Matter | The call | Lands in |
| --- | --- | --- |
| codePointsOf keeps its regex | Keep `text.match(/./gsu) ?? []`: the linter refuses both `[...text]` and `Array.from(text)`, and the one helper now serves mask.ts and the strength checker alike. | #299, as built |
| #vaultPartsFor serves two calls, not four | Keep it as built: clearCachedVault and delDamagedVault need the checked scope by itself, so they call vaultPartsOf with it. | #299, as built |
| #freshGatedRecord has no verb (gating.ts) | Rename it #freshenGated: it reads storage through freshen, and its doc block's first line says so. | thread 4 (retire_standing) |
| The restack's order | main → #297 → #299 → #298: threads 1 and 2 already stack, and #298 on top needs one rebase, where isOutcomeShaped goes once neither caller is left. | the restack, before thread 4 |
| #storedBase becomes #fillFromStored | Rename: STYLE.md's worked example already calls it that, so the code is what lags. | the post-sprint rename PR |
| Proving.wrongProof becomes wrongCleartext | Rename: VOCABULARY.md retires "proof". | the post-sprint rename PR |
| stableJsonify sorts keys by UTF-16 code unit | The doc says code unit, as safe-stable-stringify does; either order is stable across devices, so no stamp changes. | #303, as built |
