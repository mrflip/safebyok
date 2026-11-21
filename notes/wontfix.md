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

* current outcome: when a get's answer lands after a newer record from another source, the ThingMinder keeps the newer
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

### The ThingMinder detects no conflict among the records it holds

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

* current outcome, as built, and promised nowhere: a `get`, `list` or `write` the ThingMinder began before `goodbye`,
  answered after `goodbye` and a fresh `hello`, may land in the new cache; one whose fetch had settled may join its Thing
  to the new root box's listing. What a get still waiting at `goodbye` refuses, even with no `hello`, is unspecified.
  A list sets its listing and caches its sparse records, and a good write caches the record written, as though
  begun after the `hello`. Each answers its caller as the vaultDB answered it. A bank's sweep calls `goodbye` on the
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
