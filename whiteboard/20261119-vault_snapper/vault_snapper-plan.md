# vault_snapper: the sprint's plan

* **Date:** 2026-11-19. **Mode:** YOLO. **Issued by:** the Coach, in chat ("write the plann and /sprint YOLO
  /turbochat").
* **Levels, by default:** review `medium`; the worker and the reviewer on their agents' own model and effort; the
  style pass on `style-reviewer`'s pin. **Threads at once:** 3.
* **Status:** threads 1, 3 and 4 filed ([#769](https://github.com/mrflip/safebyok/pull/769), [#768](https://github.com/mrflip/safebyok/pull/768), [#770](https://github.com/mrflip/safebyok/pull/770)); #769 and #770 out of draft; threads 2 and 5 ready ([#771](https://github.com/mrflip/safebyok/pull/771), [#772](https://github.com/mrflip/safebyok/pull/772)), in review; thread 6 building on thread 5.

The design behind this sprint is in this directory: `vault-pieces.md` (the threads' specs, section by section, with
the Coach's rulings marked *Settled*), `dream-interface-2.md` (the interface aimed at), `comparable-wiki-drafts.md`
(what a regular React Query user would build, for comparison) and `exemplar-docblocks.md` (doc blocks from peer
libraries). Where this plan and `vault-pieces.md` disagree, this plan is newer: the Coach's last message before the
sprint changed several sections, quoted below.

## Read first

Every worker, beyond CLAUDE.md, by section:

* VOCABULARY.md: *car*, *newest*, *fullest*, *listing*, *minder*, *minded*, *givable*.
* The class doc block of `ThingMinder` (`packages/safebyok/src/minding/thing-minder.ts`), its `## Invariants`.
* `vault-pieces.md`: *Before starting*, then the section its thread names.

## Ground rules

The Coach's guidance for the sprint, verbatim (2026-11-19). It was offered as a suggestion, not a directive; the
preferences are medium-strong:

> I propose:
>
> 1. to start, leave verbs on the places where they are, and use as much of the implementation as  it stands, where
>    it works. It's ok to expand it:
>   - eg adding attemptReplacePassphrase
>   - and making it not refuse or be a jerk
>
> 2. make some version of the **interface** you want, and prove that you actually want it, and where. I'm not going
>    to disagree with anything you say is correct.
>   - Use all the fudge you want to make that interface work but **do not spread out the fudge**. Either by
>     coincidence or *explicit* cheating, make one be where you need it. (explicit cheating would be a method called
>     cheatSetupGating or something)
>   - Only add sequences or tokens once they line up directly with the existing oneAtATime and feel natural. But, for
>     instance, you can also just pretend that the right token was passed in and not have to worry about how it got
>     there.
>
> My medium-strong preferences:
> 3. No major refactoring of the gating flow, or if you do, do it in a way that we can diff cleanly
> 4. limit, first, to only gatings that can be called on a bank that is already born and is still born when finished
> 5. questions of crossings, what if this dies or that locks, anything like that, is 100% out of bounds

And, from the same message:

> To be  clear every verb on bank needs to be clear if it's a prompt or a re-entry point

And, during planning:

> wherever I said "not yet later" you have green light to do it if *needed*.  You can see where the costs are: making
> me nail down an interface where we don't know either side, or anything with concurrency or path dependence

So, for every thread:

* **Deferred work is open where a thread needs it.** Something the Coach marked "not yet" or "later" may be built if
  the thread truly needs it, unless it means settling an interface neither side of which is known yet, or involves
  concurrency or path dependence. Say so in the thread file.

* **Gatings in scope:** unlocking, replacing the passphrase, adding a passkey, revoking it. Not birth, not deleting:
  nothing with a chicken-and-egg startup problem.
* **A Bank verb's name says which it is:** a *prompt* opens a gating (or joins the open one) and waits for it to
  conclude (`launch…Prompt`, `ensureUnlocked`); a *re-entry point* hands cleartexts in (`attempt…`).
* **Fudge in one place.** Where startup or wiring is missing, cheat once, explicitly, in a method named for it
  (`cheatSetupGating`), never in a scatter of special cases.
* **Out of bounds:** crossings (what if this ends, or that locks, meanwhile), startup and shutdown, new concurrency
  machinery, retries, abort controllers.
* **Library first:** es-toolkit has `deepFreeze` and `isEqual`.
* **Before 1.0:** no compatibility shims or migrations; a changeset says what a host will see.
* **The base checkout is the Coach's.** It holds uncommitted hand edits (in `thing-minder.ts`, its keys test, and
  `packages/safebyok-react/src/giver/react-giver.ts`). Never touch it.

## Threads

### 1. car_agerank

> "call it agerank or age ?" / "Worth the cost." / "With the shape you had, but use the liveness directly: void >
> gone > full > cold > bare (if you don't like cold use bhnd ...)" / "you need the string to be constant length hence
> bhnd." / "To check: is deep freezing car in the plan?" (the Coach, 2026-11-19)

*Gloss.* `vault-pieces.md`, *Fixes riding along*: the entries *Each car carries its `agerank`*, *A car's records are
not frozen*, and *A get resuming after `goodbye` and `hello` joins the new listing*. So:

* `agerank` on every car, made in `carOf`: newest's lifepath, newest's revseq, the liveness, the revseq of `fullest ??
  newest` (none for a bare car), joined by `'~'`, every field of fixed width, revseqs padded as lifeseq is.
* The liveness `behind` is renamed `bhnd` everywhere: `carLivenessVals`, the minder, the giver, VOCABULARY.md's *car*
  row, tests and doc blocks.
* Records deep-frozen as they land (es-toolkit's `deepFreeze`).
* The `goodbye`-then-`hello` listing join: investigate, reproduce in a test, and fix; or show it cannot happen.
* Apply `thread-1-minder-invariant.patch` (this directory) first, its own commit: the invariant that a listener's run
  never goes back, with its test, as the Coach worded it.

*Touches:* `minding/thing-car.ts`, `shapes/shapes-minder.ts`, `minding/thing-minder.ts`, their tests, the giver's
reads of `liveness`, VOCABULARY.md. *Depends on:* nothing (origin/main). *Look-ahead:* thread 2 decorates each event
with the car's `agerank`; thread 8 uses it as the host's structural sharing. *Size:* M. *Status:* filed, #769, at 2e14d2b61; out of draft.

*Review:* fixed (medium): realigned two test tables after the rename (whitespace). Kept: one `eslint-disable-line
unicorn/prefer-simple-sort-comparator` in the agerank ordering test. Left, minor: `list` and `tryWrite` land answers
after a `goodbye` then `hello`, against `tryWrite`'s doc (given to thread 2); `carOf` freezes a bhnd pair before
its check refuses it (a bug path already); records freeze in place, so a vaultDB that mutates what it answered with
throws (thread 8's notes); doc blocks of `agerankOf` and `ThingCar.agerank` recite their recipe, and `Revseq.padded`
has no direct test, nor do two long test titles fit one clause (Cleanup). Dropped: a void car sorting below a live
one, correct.

### 2. minder_feed

> "each one is pretty much a spread of the TSQ event into our own. Decorate it also with the ...scope fields, agerank,
> revtok, revseq, am, lifeseq and lifepath. If they're there, and agents don't use them, we know to remove them. if
> they're not there, and agents write bad code, we don't learn that." / "'sok': change on both" (the Coach,
> 2026-11-19)

*Gloss.* `vault-pieces.md`, *F. The feed*. Each `MinderEvent` is TanStack's cache event spread into ours: its
`type`, its action's type, `queryKey`, and a frozen shallow copy of `state`, never the live `Query`; an invalidation
is a listing event with `state.isInvalidated`. Decorated with the scope's fields, and for a thing event the car's
`agerank` and its newest's `revtok`, `revseq`, `am`, `lifeseq`, `lifepath`. `listen(listener, version)` takes
`ThingFormat` and refuses any other. The key's head is `'sok'` in the minder. The giver's `minder-bank.ts` reads the
new event, so its tests pass; nothing else in the giver (thread 8).

*Touches:* `shapes/shapes-minder.ts`, `minding/thing-minder.ts` (`listen`, `#minderEventOf`, `#bankKeyHead`), the
minder's tests, `packages/safebyok-react/src/giver/minder-bank.ts`. *Depends on:* thread 1 (`agerank`; same files).
*Look-ahead:* thread 8's bridge copies `state`. *Size:* M. *Status:* ready, #771 (branch `20261120-minder_feed`); in review (one compaction before ready). *Orchestrator:* given, in YOLO, the same per-stretch check for `list` and `tryWrite` that thread 1 gave `#doGet`.

### 3. format_string

> "change the constant (fmt, postgres's version, listener version) to a string, 'v010501'" / "format: v010501 =>
> a010501" (the Coach, 2026-11-19)

*Gloss.* `ThingFormat` (`100_501` in `shapes/shapes-thing.ts`) becomes the string `'a010501'`, and so does every
constant that serves with it: `fmt` in every Thing, safebyok-postgres's version, and (once thread 2 lands) `listen`'s
version, which reads `ThingFormat`. A stored-shape change: a row written before fails today's checks and reads as
damaged; the changeset says so. *Levels:* worker on `sonnet`; review `low`. *Status:* filed, #768.

*Review:* fixed (low): realigned two test tables (whitespace). Left, minor: `TableVersion` now holds a format string, a loose name, kept (exported; my call, Cleanup); `ThingFormat`'s doc block describes big's numeric fmts, a sibling (STYLE `#three-questions`), for a documentarian pass (Cleanup). Not checked: the `fmt` column's `text` type against a real Postgres. *Touches:* `shapes/shapes-thing.ts`,
`safebyok-postgres`, every adapter or test that spells the number. *Depends on:* nothing (origin/main). *Size:* S.

### 4. vault_writes

> "V1: whatever works, and if that doesn't, just make it work somehow, and we'll figure out who and when does it
> later." / "putBoxOnce and delBoxOnce / no others yet" / "Sorry right -- the bank can't call back to the minder. (it
> might right now, we'll cure that later). You will still get the guarantee, because vaultDB will land the bank and
> gate updates to all subscribers, and then the return. I can see your forehead crinkling -- can we try it first?"
> (the Coach, 2026-11-19)

*Gloss.* `vault-pieces.md`, *V* and *W*, as amended:

* A `Vault` class, born with its minder; how it is made is the worker's call. It carries the host-facing box verbs and
  no reactive machinery.
* The Bank's `tryGetBox`, `tryListBoxes`, `tryPutBox` and `tryDelBox` go; the changeset says so.
* `sealBox` returns the write ask; a tombstone's seal, the delete ask.
* `vault.putBoxOnce(cited | labelpath, patch, secrets)` and `vault.delBoxOnce(labelpath)`, each one attempt through
  `minder.tryWrite`. No `putBox`, no other verbs.
* VOCABULARY.md's *vault* row gains the new core's sense beside safebyok-big's.
* **Try it first:** the Bank's `put` and `#putGate` keep writing to the vaultDB themselves. A test shows the minder's
  bank and main-gate cars carry what they wrote before the verb resolves, the vaultDB having notified before it
  returned. If it does not hold, report it; do not route the Bank through the minder.

*Touches:* `models/bank.ts` (its boxes sections), a new `models/vault.ts`, its tests, VOCABULARY.md. *Depends on:*
nothing (origin/main). *Look-ahead:* thread 7 puts `withWhisper` on the Vault; thread 5 edits `bank.ts`'s prompts,
stacked on this. *Size:* M to L. *Status:* filed, #770, at 7cc13c3f8 (one compaction before ready); out of draft.

*Review:* flagged, nothing blocking (medium): added the `// putBoxOnce @example` marker to the birth test. Left:
a sparse newest by labelpath refuses `sidecar_missing` (taken in YOLO, thread 7); no re-check of the bank before
`tryWrite` while `sealBox` awaits (a crossing, out of bounds); a vault's minder is not ended at a bank sweep (the
cascade, later); `notes/security.md` says the Vault takes the bank's lease, which it does not (thread 7); doc-block
register of `putBoxOnce` and `sealBox`'s first line (Cleanup); a doomed by-labelpath call costs a get, harmless.

### 5. bank_gatings

> "device.unlock(gatingScope, { passphrase }) / This has to be bank, or take the bank / only do gatings that don't
> have chicken-egg startup problems" / "To be  clear every verb on bank needs to be clear if it's a prompt or a
> re-entry point" (the Coach, 2026-11-19)

*Gloss.* `vault-pieces.md`, *U*, read through the ground rules: the verbs stay where they are, the gating flow is not
refactored (or is, in commits that diff cleanly), and the four born-bank gatings alone.

* **Joining, not refusing:** a prompt on a bank whose gating is already open joins it (`whenConcluded`), where
  `attachGating` refuses `already_asking` today. Two `withWhisper`s on a locked bank then share one dialog.
* **Re-entry points on the Bank:** `attemptUnlock(cleartexts)`, and likewise `attemptReplacePassphrase`,
  `attemptAddPasskey`, `attemptRevokePasskey`: each hands its cleartexts to the open gating of its kind, so those
  waiting on it resume, and where none is open does what it can directly, or refuses plainly. A form calls one with
  the passphrase from `FormData`, never through a callback.
* `gatingseq` only if it lines up with the one-at-a-time rule and feels natural; a test may pretend the right one was
  passed.
* `device.lock()` locks every bank, forwarding to `bank.lock()`.

*Touches:* `models/bank.ts` (prompts), `models/gating.ts`, `models/device.ts`, their tests. *Depends on:* thread 4
(same file, stacked). *Look-ahead:* thread 6's snapshots tell of the gating; thread 9 drives `attemptUnlock` from a
form. *Size:* M. *Status:* ready, #772 (branch `20261120-bank_gatings`); in review, `high` on `opus` (cleartexts now enter
outside a gating).

### 6. snapshots

> "OK that basically sounds like just device and bank offer getSnapshot() and subscribe(); the giver re-exposes those
> as the interface. device and bank need an #align function that calls #makeSnapshot; it or align (which?) determines
> if there are any change and if so tells the subscribers. it carries the stage and isFoo flags. It doesn't report a
> lease duration, just an expiry." / "bank, however should be the only thing that carries a stage or isLocked etc
> flags." (the Coach, 2026-11-19)

*Gloss.* `vault-pieces.md`, *S. Snapshots, on the Device and the Bank*, with S1 and S2 settled. `getSnapshot()` and
`subscribe()` on the Bank and the Device; a pure `#makeSnapshot`, and `#align`, which compares (`isEqual`) and tells.
The Bank alone carries `stage`, `isLocked`, `isEnded`, `endCause`, `leaseEndsAt`, `lastErr`; the Device forwards the
current bank's snapshot and adds the open gating, `{ gatingkind, isAttempting, lastRefusal }` or null. The stages
reachable without startup (`locked`, `unlocked`, `swept`) are built; the type holds the rest. `isWatching` and
`heardAt` wait until the vaultDB can tell them. *Touches:* `models/bank.ts`, `models/device.ts`, `models/gating.ts`.
*Depends on:* thread 5 (stacked). *Size:* M. *Orchestrator:* `gatingseq` handed here from thread 5, only if it lines
up with one-at-a-time. *Status:* building, branch `20261120-snapshots`, cut from thread 5's tip f7091958a.

### 7. with_whisper

> "tbh I'm back on team withWhisper. It's clear what's exposed, and it's the most common thing to unseal for." /
> "device.withWhisper('anthropic', ({ whisper: { apiKey } sidecar: { tokensCount, callCount }, ...a few other fields
> }) => askHaiku(apiKey, phrase))" (the Coach, 2026-11-19)

*Gloss.* `vault-pieces.md`, *Wh*. `vault.withWhisper(labelpath, fn)`: `bank.ensureUnlocked()` (a prompt, joining any
open gating), the box's whole record through the minder, `bank.unsealBox`, then `fn` with the unsealed box (its
whisper, sidecar and record fields). Nothing of it is returned, cached or put in a snapshot. A box never stored, or
deleted, refuses `absent_box` (the recommendation of open matter Wh1, taken in YOLO). *Orchestrator:* also, from
thread 4's review: `#newestAt` gets the whole record when the car is neither `full` nor `gone`, so a write over a box
known only from a list keeps its sidecar (taken in YOLO); and `notes/security.md`'s thread 4 line says
`Vault.putBoxOnce` takes the bank's lease, which the Vault does not hold: correct it through a `sonnet` subagent, as
the file's header says. *Touches:* `models/vault.ts`, its tests. *Depends on:* thread 6 (the line through threads 4 and 5). *Size:* S to M.

### 8. giver_feed

> "We take the hosts' RQ (if they don't have one we'll make it); we offer a keys factory, default settings and a
> default select that extracts the `fullest` record. Pin a design note: assume they can override any of those. Our
> bridge sends MinderEvents, which look basically just like TSQ.Events." (the Coach, 2026-11-19)

*Gloss.* `dream-interface-2.md`, rule 1 and its *Records* notes, and `vault-pieces.md`, *Fixes riding along*. The
giver adopts the feed: the bridge copies each event's `state.data`; host keys are the minder's (`'sok'` head); its
query defaults are `networkMode: 'always'`, `structuralSharing` keeping the greater `agerank` (prior on a tie),
`staleTime` 0 for a `bhnd` or `bare` car, `select` picking `fullest`, each a default a host may override.
`GiverBank.getBoxCar`'s doc block is corrected. *Orchestrator:* records freeze in place as they land (thread 1), so
the giver's docs say a host's vaultDB must not mutate the objects it answered with. The giver's bank snapshot hook reads the Device's snapshot.
*Touches:* `packages/safebyok-react/src/giver/`. *Depends on:* threads 2 and 6, restacked into one line; and the
Coach's uncommitted edits to `react-giver.ts` (*For the Coach*). *Size:* M.

### 9. knock_knock

> "Hue sit down at the knock-knock app ... the vault is locked. Hue types a phrase and hits enter. ... describe the
> places there is a naked passphrase." (the Coach, 2026-11-19)

*Gloss.* Prove the interface end to end, in `packages/safebyok-react/tests/`, against the real core over a
`MemoryVaultDB`: a locked bank; a `useMutation` whose `mutationFn` calls `vault.withWhisper`; a dialog component that
reads the Device's snapshot and, in a form action, calls `bank.attemptUnlock` with the passphrase from `FormData`;
the mutation resumes with the whisper. A second submission while the dialog is open joins it. The test asserts the
passphrase is never in React state or a snapshot. Any wiring the core lacks is one explicit `cheat…` method. *Depends
on:* threads 7 and 8. *Size:* M.

## Order

Threads 1, 3 and 4 start at once. Thread 2 follows 1; 5 follows 4, then 6 and 7 on that line. Thread 8 waits on 2 and
6 restacked into one line, and on the Coach (*For the Coach*); thread 9 on 7 and 8.

## For the Coach

* **TOP: your uncommitted edits to `react-giver.ts`** (and to `thing-minder.ts` and its keys test) sit in the base
  checkout. Threads 1 and 2 rewrite `thing-minder.ts` from origin/main, and thread 8 rewrites the giver. Thread 8
  waits until you commit them, or say to go ahead without them.
