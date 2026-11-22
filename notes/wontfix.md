# Won't fix

Behaviour the new core, `packages/safebyok`, leaves unspecified on purpose: cases a host can reach, whose outcome we do
not promise, test or design for. `notes/wontfix-big.md` is safebyok-big's. A reviewer reads `notes/security.md` for
what we decided, and this file for what we decided not to decide.

Each entry is a heading naming the case, then its current outcome, the alternatives (a line on why each plausible one
will not work), the workaround, the steps to reproduce it, and the reasoning. Add one at the end, with who ruled and when.

An entry covers the case its heading names, and nothing like it. Rarity alone never earns an entry: what earns one is
what the fix would cost against the Values, such as a retry or a lock in a primitive's critical path, a new state, or a
check outside its owner. Each entry's reasoning names that cost. Where a new case meets every reason an entry gives, as
strictly as the case it names, amend that entry: widen its heading and steps, and say so in your report. Where it meets
them only in part, and above all where its fix is cheap, it is a defect: fix it, or bring it to a Coach.

### A birth over a deleted bank refuses `stale` when another device built the bank again first

* current outcome: `tryBirthBank` refuses `stale` and writes nothing. Until a birth cites the bank it found, as big's
  does, every birth over a bank's tombstone refuses so, race or no race: rebirth waits on the coordinated delete.
* alternatives:
  - retry for the customer: belongs to the customer or to orchestration we provide, never the low-level call.
  - make the new record server-side: the server cannot make a sealed record.
  - lock the bank across the prompt: keeps storage locked while a user types a passphrase, and a lock is a last resort.
* workaround: the customer retries, or the user reloads the page.

Steps to reproduce: device A finds the bank deleted, and asks its user for a passphrase for a new one. Meanwhile device B
builds the bank again, and may delete it again, each with its own user's passphrase. A's user then submits: A's birth
cites the tombstone it found, which is no longer what is stored.

Reasoning for wontfix: it needs three passphrase prompts on two devices racing, and leaves a refusal that writes
nothing, which a retry clears. Mending it would put a retry or a lock in a primitive's critical path. Ruled by the
Coach, 2026-11-15, box_ops thread 1.

### A get's late, older answer keeps the newer record, but marks it fresh

* current outcome: when a get's answer lands after a newer record from another source, the VaultMinder keeps the newer
  record, and TanStack Query marks the item fresh as of the get's answer. The record reads as timely for longer, by
  however long that answer was in flight. A whole record older than the item from any other source (a notice, or a
  write's answer) is dropped, and leaves the item as fresh as it was.
* alternatives:
  - skip a get's answer that `newerThingOf` would refuse: a get's queryFn must return its record, and TanStack Query
    lands it itself.
  - deliver with the held record's `dataUpdatedAt` as `updatedAt`: TanStack Query dates a get's answer as it lands,
    and which record wins is known only inside `structuralSharing`, after the time has been chosen.
* workaround: none needed. A get with a short `staleTime` asks storage again.

Steps to create: a get starts; a notice of a newer revision lands; the get's answer, of the older revision, lands
after it.

Reasoning for wontfix: the gain is at most one answer's time in flight, against a `staleTime` of an hour, and the fix
would put a comparison outside `structuralSharing`. Ruled by the Coach, 2026-11-15, vault_minder; narrowed to a get by
the Coach, 2026-11-20, soon_item rework.

### The VaultMinder detects no conflict among the records it holds

* current outcome: `newerThingOf` returns the later record by lifepath and then revseq. Two records of one revision
  with different revtoks keep whichever landed first. A get that storage answers older than the record cached when
  the get began refuses `stale_read`, and the cached record stays.
* alternatives:
  - refuse `record_conflict` in the cache: `newerThingOf` must stay pure, since TanStack Query calls it for every
    observer's result, so a refusal would need a state of its own outside it.
* workaround: none needed. A write citing what the cache holds is refused by storage where storage holds otherwise,
  and the refusal carries the stored record.

Steps to create: storage restored from a backup, or two stores answering for one bank.

Reasoning for wontfix: storage is the ground truth, and the cache a copy. The store knows the record it holds, and
refuses a write that cites another, so a conflict is found where it can be settled, not in the cache. Ruled by the Coach,
2026-11-15, vault_minder.

### The value in `tracked` of a missing or damaged record

The return value in `tracked` of a missing or damaged record is unspecified behavior.

* current outcome: unspecified. No store, adapter or caller checks for it, and none may: no guard, no null, no refusal,
  and no test of the value.
* alternatives:
  - a sentinel for either case (null, a refusal kind, a left-out key): it extends the contract, so every caller must
    then handle it, and the handling cascades into code that second-guesses the store.
  - report it from `tracked`: a damaged row should already have refused, with `storage_issue` or a heavier error,
    where it was read; a missing one is not this field's to report.
* workaround: reload the page, or restart the system.

Steps to reproduce: a device's ask carries `track` for the bank and its main gate, whose revisions it was sent, after
the datastore has lost or damaged either row.

Reasoning for wontfix: the device was sent revisions of both rows, so either case means storage has gone wrong
underneath it: work stops until the page reloads, or until a developer catches the error and restarts the system.
Pinned by a type-level test that each `tracked` entry is exactly its record or `'same'`, and by a `//` comment at the
`tracked` type and at `notifyTrackedRecords` pointing here. Ruled by the Coach, 2026-11-15, lean_buttonup T1.

### Changing only a box's sidecar needs the bank unlocked and the whisper in hand

* current outcome: `vault.putBoxOnce` takes the whisper on every write, a change to the sidecar alone (its title, say)
  included, and seals the new revision under the bank's lease: without `secrets` it refuses `bad_record`, and on a
  locked bank `bank_locked`.
* alternatives:
  - carry the cited revision's sealed whisper into the new one: its seal is bound to the revision it was sealed in, so
    it would not unseal there, and unbinding it changes the construction, which is not ours to invent.
  - unseal the cited whisper inside the write: it still needs the lease, and hides an unseal inside a write.
* workaround: change the sidecar from inside `withWhisper`, citing the unsealed box:
  `vault.withWhisper(labelpath, (box) => vault.putBoxOnce(box, { sidecar: { ...box.sidecar, title } }, { whisper: box.whisper }))`.

Steps to reproduce: lock the bank, then put a box with a new sidecar and no `secrets`, or with the whisper but the bank
still locked.

Reasoning for wontfix: every revision is sealed under the lease, so a put needs the bank unlocked whatever it changes,
and a seal keeps none of the cited whisper; carrying it across would mean a new construction or an unseal hidden in a
write. Ruled by the Coach, 2026-11-20, vault_snapper W2: "A put needs unlock anyway. Document as won't fix".

### A lock, a sweep or a second form verb while a form verb runs

* current outcome, as built, and promised nowhere:
  - A lock while a form verb's attempt is in flight lands wherever the attempt's steps have reached: an `unlock` gating or a gate
    change that attaches its lease after the lock leaves the bank unlocked.
  - A sweep while an attempt is in flight: the attempt's write, if it has not yet begun, refuses `disabled`; one already
    sent lands in storage, and the lease the attempt then builds is evicted and the verb refuses `disabled`.
  - A `device.sweep()` while a `Bank.birth` on that device is in flight sweeps each bank made on the device then:
    a birth whose bank is not yet made goes on, and the device holds the bank it makes. A device stays usable after
    its sweep, so the birth is not refused.
  - Two gate changes on one bank at once each cite the gate they proved against: the first to reach the vaultDB is
    written, and the second refuses `stale_write`, changes nothing and unlocks nothing. Until the bank observes itself,
    its main gate stays the one it last wrote, so a gate change made on another device refuses `stale_write` here too.
* alternatives:
  - have a lock or a sweep wait for, or reach into, an attempt in flight, or have an attempt check the lock state between
    its steps: a lifecycle call reaching across an attempt, or new checks in a primitive's critical path, for a crossing.
  - a lock across the form verbs: a lock is a last resort.
  - take the gate stored from a `stale_write`'s answer and prove against it: the bank observing itself, which is later
    work, and which would still not let a proof made against one gate write over another.
* workaround: the host's form submits one verb at a time and awaits it before locking or sweeping the bank; after
  `stale_write`, the host makes the bank again from what is stored.

Steps to reproduce: call `bank.unlock(...)` and, before it resolves, `bank.lock()`: the bank ends unlocked. Or call
`bank.replacePassphrase(...)` twice without awaiting the first: the second refuses `stale_write`. Or call
`Bank.birth(device, ...)` and, while its passphrase is still being stretched, `device.sweep()`: the birth resolves a
bank, and the device holds it.

Reasoning for wontfix: each case is two of the host's own calls crossing over one bank, which the host sequences; what
lands is what the calls amount to in the order they ran, nothing is left inconsistent in storage, and a refused gate
change never unlocks. Specifying them would mean waits, dismissals or checks reaching across an attempt and the bank's
lifecycle: new machinery in a primitive's critical path, for crossings the host avoids by awaiting its own calls.

### A minder's answer that crosses a `goodbye` and a fresh `hello`

* current outcome, as built, and promised nowhere: a `get`, `list` or `write` the VaultMinder began before `goodbye`,
  answered after `goodbye` and a fresh `hello`, may land in the new cache; one whose fetch had settled may mark the new
  root box's listing stale. What a get or a list still waiting at `goodbye` refuses, even with no `hello`, is
  unspecified: as built, TanStack cancels it, and it rejects with TanStack's `CancelledError` (a `tryList` answers it as
  `unexpected_error`), its listing not set. The Things such a list answers are still notified to each watch open when the
  vaultDB answers, so a fresh `hello`'s watch caches them. A good write caches the record written, as though begun
  after the `hello`, and answers its caller as the vaultDB answered it. A bank's sweep calls `goodbye` on the
  minder of each vault made on it, so an answer crossing that sweep is this case too.
* alternatives:
  - a token for each stretch of minding, compared as each answer lands: a new state, and a check in the critical path
    of every get, list and write, for a crossing.
  - cancel each operation under way at `goodbye`: an abort controller in a primitive's critical path.
* workaround: the host awaits its minder's gets, lists and writes before calling `goodbye`.

Steps to reproduce: start a `list('box')` (or a write, or a get) on a started minder whose vaultDB answers late; call
`goodbye()` and then `hello()` while it waits; let the vaultDB answer. The new cache's listing, and the item, hold what
the earlier stretch asked for.

Reasoning for wontfix: what lands is a record the vaultDB did store, so the cache is never wrong about the bank, only
early to hear of it; and a `goodbye` and `hello` around an operation are two of the host's own calls crossing it, which
the host sequences. Guarding against it put a token and three checks into the common case for a case no host meets by
accident. Ruled by the Coach, 2026-11-20, vault_snapper: "The goodbye-then-hello token -- let's pull this out".

### A sparse record from a newer life leaves the old life's record in the item

* current outcome: when a Thing's soon is of a newer life than its item (a list or a notice tells of the Thing born again,
  sparse), the item keeps the old life's whole record, marked invalidated, until a get fetches the new life whole. `at()`
  answers the old life's record meanwhile, `tryAt` answers `untimely`, and `vault.withWhisper` refuses `stale_read`
  where its get leaves the item so.
* alternatives:
  - remove the item when such a soon lands: `at()` then answers nothing, and a host's bridge, which ignores a removal,
    keeps showing the old life all the same (TODO.md).
  - keep a whole record and a sparse one together in one entry, with a merge, a liveness and checks of its own.
* workaround: a get, which fetches the new life whole.

Steps to reproduce: get a box; on another device, delete it and put it again; list its parent before getting it again.

Reasoning for wontfix: the old record is marked behind, as any item behind its soon is, so nothing answers it as timely;
removing it would add a branch to every landing for a state a get already ends. Ruled by the Coach and the orchestrator,
2026-11-20, soon_item.

### A sparse record that lands while a get waits

* current outcome: a get holds the soonest record cached when it began, and refuses only an answer older than that. A
  sparse record that lands while it waits is cached as the Thing's soon; the get's answer lands in the item, older than
  the soon, and the item is marked behind it at once. The get answers that older whole record.
* alternatives:
  - refuse the get `stale_read` when a newer soon is cached as its answer lands: a check outside `structuralSharing`,
    against a record the get did not begin with, in a primitive's critical path.
* workaround: none needed. The next get fetches the newest whole record.

Steps to reproduce: start a get of a box; while the vaultDB answers it, list its parent after another device wrote the
box anew; let the get answer.

Reasoning for wontfix: it is a crossing of a get and a list or notice, which the host does not sequence and which no
retry, lock or abort may settle in a primitive's critical path; what each answer says is a revision the vaultDB did store,
and the cache marks itself behind before any later call reads it. Ruled by the orchestrator, 2026-11-20, soon_item.

### A box new to a listing that lands while a list read before it is under way

* current outcome: the box's first landing marks its parent's listing stale, which joins the list under way
  (`cancelRefetch: false`); that list lands without the box and leaves the listing current. The box shows at the next list.
* alternatives:
  - cancel and restart the list: a list's own children land while it is under way, and would restart it.
  - settle the listing against the cached children as it lands: surgery on a common path, for a crossing.
* workaround: none needed. The next list lists it.

Steps to reproduce: start `list('box')` on a vaultDB that answers late; write a new box through the minder after the
datastore has read; let the list answer.

Reasoning for wontfix: a crossing of a write and a list of milliseconds (CLAUDE.md, *Hours separate updates*); the
listing holds only what the vaultDB answered. Written by core_first thread 3, 2026-11-22.

### A lock that lands while a draft's field is on its way shows the field on a locked bank

* current outcome: in `safebyok-react-lean`, focusing a draft's field (`useDraft(...).whisperField(fieldname)`) asks
  `withWhisper` for the box. A `lock()` that lands after the bank is found unlocked, but before the callback writes the
  field into the input, leaves the field shown, as text, on a locked bank, until the user leaves it. `WhisperText`
  reveals the same way.
* alternatives:
  - have the callback ask whether the bank is still unlocked before it writes: a check for a crossing in the reveal's
    path, and the lock may still land between that check and the write.
  - have the lock reach into a reveal in flight: a lifecycle call reaching across a callback.
* workaround: none needed: leaving the field masks and empties it, and the next focus asks for the unlock form.

Steps to reproduce: focus a draft's field on an unlocked bank, and call `lock()` while the box is being unsealed, with
the key deriver or the vaultDB's get held.

Reasoning for wontfix: a lock comes a few times a day, and a reveal is in flight for milliseconds (CLAUDE.md, *Hours
separate updates*). The whisper shown is the one the user asked for a moment before, it stays in the input's DOM value
where it was going anyway, and nothing is written. A guard would sit in the reveal's path for a crossing. Written by
the react_life thread 9 worker, 2026-11-21, awaiting a ruling.

### A draft's field shown unedited while another device writes the box bases the draft on the newer revision

* current outcome: a draft is based on the box stored when it is first edited. A field revealed shows the whisper of the
  revision stored at the focus. When another device writes the box between that focus and the user's first keystroke,
  the draft is based on the newer revision, so `isBehind` stays false and `put` writes over it, though the user saw the
  older field.
* alternatives:
  - base the draft at the reveal: every focus would pin a base, and a draft merely looked at would go behind.
  - compare the revealed field with the newer revision's: holds the whisper outside its callback, where React, a cache and a FormData must never have it.
* workaround: none needed: the field the user typed is theirs to write, and the newer revision's other fields and
  sidecar are what the draft starts from.

Steps to reproduce: focus a draft's field, write the box from another device, then type into the field and put.

Reasoning for wontfix: it needs a write from another device inside the moment between a focus and a keystroke, and what
is written is what the user typed, over the newest revision. Catching it would mean a base pinned on every focus, or the
whisper held outside its callback. Written by the react_life thread 9 worker, 2026-11-21, awaiting a ruling.

### A lock that lands while `withLockableWhisper` takes its unlocked branch refuses `bank_locked`

* current outcome: in `safebyok-react-lean`, `Knock.withLockableWhisper` reads the stage once. At unlocked it unseals
  the box through the vault's `withUnlockedWhisper`, which never waits for an unlock. A `lock()` that lands after that
  read, while the box is being got, rejects the call `bank_locked` rather than answer through `ifLocked`. A lock that
  lands after the unseal lets the callback answer. An unlock that lands after a locked read answers through `ifLocked`.
* alternatives:
  - catch the refusal and fall back to `ifLocked`: a branch in the unseal's path for a crossing.
  - hold a lock across the read and the unseal: a lock where none was needed.
* workaround: none needed: a caller that asks again on a stage change, as the parts' `WhisperMask` does, answers under
  the new stage.

Steps to reproduce: call `withLockableWhisper` on an unlocked bank, and call `lock()` while the vaultDB's get is held.

Reasoning for wontfix: a lock comes a few times a day, and a get is in flight for milliseconds (CLAUDE.md, *Hours
separate updates*, `#no-slop-crossings`). Nothing is written, and the refusal shows no whisper. Written by the react_life
thread 12 worker, rewritten by the thread 15 worker, 2026-11-21, awaiting a ruling.

### A bank's sweep stops its device's minder, which the device owns

* current outcome: `bank.sweep()` sweeps each vault made on the bank, and `Vault.sweep` calls `goodbye` on the vault's
  minder. That minder is the device's: the device makes it at `Device.make` and hands it to the vault of its bank, and its
  `hello` starts it, once. After a sweep of the device's bank (`device.sweep()`, or `bank.sweep()` itself), the device
  stays enabled, but its minder is not minding: each `minder.get` or `minder.list` refuses `disabled`, and a second
  `device.hello()` answers the first and starts nothing.
* alternatives:
  - have `Vault.sweep` leave the minder be, and `device.sweep` stop it: the device then decides when its minder stops,
    which is part of the ends work below, not of this note.
  - have the device restart its minder after a sweep: a new path through bring-up for a device whose bank was swept,
    which nothing yet needs.
* workaround: make a new device after a sweep, as a page reload does.

Steps to reproduce: bring up a device whose bank is stored, sweep it with `device.sweep()`, then call
`device.minder.get` on the root box: it refuses `disabled`.

Reasoning for wontfix: who stops the minder belongs to how ownership is apportioned among device, bank and vault, which
is settled when the ends (vacate, delete, goodbye) are built; moving the `goodbye` now would build half of that design
ahead of it. Nothing stored changes, and no secret material is involved. Ruled by the Coach, 2026-11-21, react_life's
E5: "a note, no code, thanks"; then "lgtm".

### A gate change that lands while another gating unlocks leaves the lease citing the later revision

* current outcome: a gating unlocks the gate under a lease citing the revision the `Gate` object models when the lease
  is built. A gate change on this device that lands between a gating's proof and its unlock (a second gate verb, run
  concurrently) leaves the gate unlocked under a lease that cites the newer revision, though the proof was against the
  older one's wayins. The bankKey is the same in both, so every seal and unseal works as it would have. A gate change's
  own write still cites the revision it proved against, so two concurrent gate changes never both land: the later is
  refused as stale.
* alternatives:
  - have the unlock cite the revision read before the gating's first await: a second revision to carry to the unlock,
    and a lease citing a revision the gate no longer models.
  - refuse the unlock when the revision moved: a check, and a refusal the user did nothing to earn, in the unlock's path.
* workaround: none needed: the lease opens what the bank's key opens, whichever revision it cites.

Steps to reproduce: start `gate.unlock` and `gate.addPasskey` on one gate at once, and let the passkey's write land
while the unlock's lease is being built.

Reasoning for wontfix: a gate change comes a few times a day, and a lease is built in milliseconds (CLAUDE.md, *Hours
separate updates*, `#no-slop-crossings`). Nothing stored changes, and no secret moves. Written by the gate_super thread 1
worker, 2026-11-21, awaiting a ruling.

### A bank born again under the same scope is ignored by the IndexedDB copy where the old life's Things compare newer

* current outcome: `IdbVaultDB.overwriteThing` stores a record only where it is newer than the Thing stored at its
  `[userid, banklabel, labelpath]`, by `Thing.cmp`: lifepath, then revseq. A bank deleted and born again under the same
  userid and banklabel starts its Things at lifepaths that may compare older than the old life's, so the new life's
  records are ignored in IndexedDB until they pass the old ones. The copy there keeps the old life's Things.
* alternatives:
  - put the bank's lifetok in the key, or read it before each overwrite: a change to the stored scopepath, or a read in
    every copy, for a life that ends a few times in a user's history.
  - wipe the copy when a bank is born: a deletion, which the bridge does not do.
* workaround: none needed today. Nothing reads IndexedDB's copy back yet; when something does, it reads it as a cache
  that the vaultDB corrects.

Steps to reproduce: bridge a minder to an `IdbVaultDB`, so that it holds a box at a later lifepath than a new life's box
will carry; then land the new life's box through the minder. The stored box stays.

Reasoning for wontfix: the lifetok is under-used and the copy is a cache of what the vaultDB holds, never the ground
truth. A bank ends and is born again a few times at most (CLAUDE.md, *Hours separate updates*, `#no-slop-crossings`).
Nothing in the vaultDB changes, and no secret moves. Unspecified and unguarded, by the Coach's ruling, 2026-11-22.

## React

Cases in the React layer, `packages/safebyok-react-lean`, and in an app built on it.

### A form reset that the host cancels still makes a draft in that form forget what was typed

A `useDraft` whose inputs sit in a form forgets what was typed into them when the form is reset (`safebyok-react-lean`, `use-draft.ts`). A host
whose `onReset` calls `preventDefault()`, to ask "keep your changes?" say, leaves its form as it was, but the draft has
already emptied the fields typed into and forgotten them, though not its sidecar edits.

Current outcome: the typed text is lost, and nothing is written. The draft and the page agree.

Alternatives: hearing the reset after React's handlers, to see whether it was cancelled, means a listener on the root
in place of the form, kept in step with React's own delegation. Putting the typed text back is not possible: it lived
only in the input.

Workaround: ask before the reset is started, from the button that would start it, not in `onReset`.

To reproduce: `packages/safebyok-react-lean/tests/wontfix/form-reset-cancelled.test.tsx`, a draft's input inside a
`<form onReset={(event) => { event.preventDefault() }}>`, typed into, then a `<button type="reset">` pressed.

Reasoning for wontfix: a host that cancels a reset is rare, the outcome loses typed text and corrupts nothing stored,
and the fix moves a listener to where React's internals decide its order. Ruled by the Coach, 2026-11-22.

### A form's reset makes a draft forget what was typed into its inputs outside that form

A `useDraft` hears the reset of the form that contains one of its inputs, and then forgets every field typed into, in
whichever element it sits (`safebyok-react-lean`, `use-draft.ts`). So a host that puts one draft's inputs in two forms,
or one in a form and one outside any, loses the text typed into both when either form resets.

Current outcome: the typed text is lost from every input of the draft, and nothing is written. The draft and the page agree.

Alternatives: forgetting only the fields whose input is inside the form that reset means a draft that is partly
forgotten, with a base and an `isDirty` to work out for each part.

Workaround: put all of a draft's inputs in one form, or give each form a draft of its own.

To reproduce: `packages/safebyok-react-lean/tests/wontfix/form-reset-split-draft.test.tsx`, one `useDraft` with a
`whisperField` inside a `<form>` and another outside it, typed into, then the form reset.

Reasoning for wontfix: one draft split across forms is rare, the outcome loses typed text and corrupts nothing stored,
and `discard` has always emptied every input of the draft. Ruled by the Coach, 2026-11-22.

### A stage change that reveals a suspending subtree shows its fallback

The bank's stage reaches React through `useSyncExternalStore` (`safebyok-react-lean`, `useBank`). React's manual: an
update from an external store is never a transition. So when an unlock, or any other stage change, first renders a
subtree that suspends on a record, React shows that subtree's `Suspense` fallback, and a host cannot have it wait
behind the screen before by wrapping the change in `startTransition`.

Current outcome: the fallback shows until the record arrives. Nothing is wrong on the page, and nothing is stored.

Alternatives: a copy of the stage in React state, updated in a transition, gives a stage that lags the bank's, and a
screen that shows `'locked'` after the bank has unlocked. Holding the stage change back until the subtree's records are
fetched puts a wait in the path of every lock and unlock.

Workaround: place the `Suspense` boundary low, around the part that reads the record, with a fallback the size of what
it replaces; or read with `useBox`, which does not suspend. The package has no suspending hook yet, and
`useSuspenseQuery` over one of its query factories needs a cast, since the factory's `queryFn` may be `skipToken`.

To reproduce: `packages/safebyok-react-lean/tests/wontfix/stage-change-suspends.test.tsx`, a stage switch that renders at
`'unlocked'` a `useSuspenseQuery` over a box not yet fetched, then unlock.

Reasoning for wontfix: the stage is synchronous on purpose, so that no screen shows a stage the bank has left, and
that is worth more than one smoothed fallback. The limit is React's, stated in its manual. Ruled by the Coach,
2026-11-22.

### A refusal shown from a form Action's result outlives an Undo

A form whose action resolves its refusal as the action's state (`useActionState`) shows that refusal until the action
next runs. Where the draft is still dirty after a refused Save, as it is with a sidecar edit pending, Undo discards the
draft and leaves the message where it is. Envman's row, with its Save as a form Action, shows the message under the row;
there the bank locking discards the draft too, by the demo's own code.

Current outcome: a stale message under a row whose draft is clean again. The next Save replaces or removes it.

Alternatives: React gives an action's state no reset. Undo as a second submit through the same action makes Undo an
action that writes nothing, and a reader has to learn why. A copy of the refusal in state beside the action's, cleared
by hand, is two records of one fact.

Workaround: a host that minds remounts the form by a `key` it changes on Undo.

To reproduce: `packages/safebyok-react-lean/tests/wontfix/action-refusal-after-undo.test.tsx`, a draft's form Action
that resolves a refused put (`stale_write`) as its state, then Undo pressed.

Reasoning for wontfix: the message is true of the last Save and harms nothing, and each way of removing it costs more
code than it is worth in a demo meant to be read. Ruled by the Coach, 2026-11-22.

### A component inside a form that hands `mutate` its `FormData` can read the secret for one render

`putBoxMutationOptions` deletes the form's secret fields in its `mutationFn` (`safebyok-react-lean`, `react-giver.tsx`).
TanStack Query calls a `mutationFn` one turn of the microtask queue after `mutate`. Where the form is
`<form action={(form) => { put.mutate(form) }}>`, React renders the form's pending status before that turn, with the
same `FormData` as `useFormStatus().data`.

Current outcome: a component inside the form that reads the secret's field from `useFormStatus().data` reads the typed
secret on one render. Nothing retains it: the field is deleted from that `FormData` before the write begins, and the
mutation's `variables`, its result and the cache never have it. No part and no kit form reads `data`. Under
`putBoxAction` the fields are deleted before React renders, and no render reads the secret.

Alternatives: a form that submits from `onSubmit` with `preventDefault()` puts no `FormData` in React's form status,
and then every such form of a host's gives up `useFormStatus`, resets itself, and passes its button its pending state.
A hook of ours that deleted the fields before it called `mutate` would need the secret in a variable of its own for
that turn.

Workaround: write the form as an Action, with `putBoxAction`; or read no secret's field from `useFormStatus().data`.

To reproduce: `packages/safebyok-react-lean/tests/wontfix/form-status-twin.test.tsx`, which uses nothing a host could
not write.

Reasoning for wontfix: the only reader is a component the host wrote, inside the form the user typed the secret into,
where it could read the input itself; nothing retains the secret; and each alternative costs every host more than this
costs any. Ruled by the Coach, 2026-11-22.
