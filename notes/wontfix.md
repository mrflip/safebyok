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

### A late, older answer keeps the newer record, but marks it fresh

* current outcome: the ThingMinder keeps the newer record it holds, and TanStack Query marks the entry fresh as of the
  late answer. The record reads as timely for longer, by however long that answer was in flight.
* alternatives:
  - skip a delivery that `mergedCarOf` would refuse: a listing's could, but a get's queryFn must return its car,
    so a get would still move the staleness on.
  - deliver with the held record's `dataUpdatedAt` as `updatedAt`: which record wins is known only inside
    `structuralSharing`, after the time has been chosen.
* workaround: none needed. A get with a short `staleTime` asks storage again.

Steps to create: a get starts; a notice of a newer revision lands; the get's answer, of the older revision, lands
after it.

Reasoning for wontfix: the gain is at most one answer's time in flight, against a `staleTime` of an hour, and the fix
would put a comparison outside `structuralSharing`. Ruled by the Coach, 2026-11-15, vault_minder.

### The ThingMinder detects no conflict among the records it holds

* current outcome: `mergedCarOf` returns the later record by lifepath and then revseq. Two records of one revision
  with different revtoks keep whichever landed first. A get that storage answers older than the record cached when
  the get began refuses `stale_read`, and the cached record stays.
* alternatives:
  - refuse `record_conflict` in the cache: `mergedCarOf` must stay pure, since TanStack Query calls it for every
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
