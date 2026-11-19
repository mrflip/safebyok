# giver_needs: what a verb works on, and what the vaultDB notifies (2026-11-19)

The plan for reworking #766 (thread 7), from the Coach's ruling in chat, set by the Coach and Fable (*Settled*,
below). Its table and the worker's findings stand, except where *Settled* says otherwise; *Settled* answers the
questions.

## The rule

A verb's answer carries its subject and what it found beside it; the minder's operation method works on the subject
alone; every other record reaches the minder through the watch, and only when it changed.

> the operation method see { world val dbhas err } ... it is asked to work on exactly and only val or err; not dbhas
> ... vaultDB notify of dbhas when it comes along; vaultDB notify of tracked items, only when they change: right now,
> the three roots (gate, bank, box) ... Only the direct record in question is worked on in the operation method. The
> other records don't notify unless they change. (the Coach)

## What each layer does

| Layer | Today, on #766 | After the rework |
|---|---|---|
| A verb's answer | `{ ok, act, val \| (dbhas, err), world, tracked? }` | unchanged: the minder sees it all |
| The minder's `tryWrite` | lands `val`, or a refusal's `dbhas` (#765) | lands `val` only; a refusal lands nothing and is answered as it came |
| The minder's `get`, `list` | land their records (`val`) | unchanged |
| `AdapterVaultDB`: an answer's `dbhas` | not notified | notified, the record alone |
| `AdapterVaultDB`: `tracked` | each non-`'same'` root, then the bank and gate from `world` | each non-`'same'` root alone |
| `AdapterVaultDB`: a store's change (`Received = { record, world }`) | three notices: record, bank, gate | one notice: the record; `world` ignored |
| `ThingNotice` | `{ ok, act, val }` | unchanged |

What the adapter hands the wrapper (`Received`, each store's `doWatch`) does not change.

## Order

Each wrapper notice (`dbhas`, a changed tracked root) is queued with `queueMicrotask` inside the verb, before it
returns. So it reaches every watch after the verb's body and before the verb's caller resumes. The minder's watch
callback lands synchronously, so when `await minder.tryWrite(...)` returns `stale_write`, the car already holds the
reported `dbhas`, as M3 wanted, though the verb itself landed nothing. A handler never runs inside a verb, so it
cannot re-enter the vaultDB mid-verb. A store's own change feed (Postgres `LISTEN`) arrives when the store delivers it.

## Settled (the Coach and Fable, 2026-11-19), as given

### AdapterVaultDB (`packages/safebyok/src/storage/adapter-vault-db.ts`)

1. Add `notifyDbhas(answer)`. It tells each watch of the answer's bank one notice of `answer.dbhas`,
   when the answer is refused and its `dbhas` is a Thing. A null `dbhas` sends nothing.
2. Call it on both paths that make a refused answer, in `tryGetThing`, `tryWriteThing` and
   `tryBirthBank`: before `return answer`, and in the catch, on what `answerForThrown` returns.
   `stale_write` arrives on the first path (`answerOf`), not the second. `tryListThings` never calls
   it: its `dbhas` is a listing, not a Thing.
3. Go out to in, in every verb: the bank, the main gate, the root box (each only where `tracked`
   does not say `'same'`), then the `dbhas`. Name the three in that order in `notifyTrackedRecords`;
   do not lean on `Object.values`.
4. Queue every notice with `queueMicrotask` in the verb's last synchronous stretch, after its last
   `await` and before its `return`, as `notifyTrackedRecords` does now.
5. There is no switch: every tracked Thing found changed, and every `dbhas`, is notified.
6. A good answer's `val` is never notified. Where the same Thing is also a changed tracked root, it
   is notified as tracked. Add no check for the repeat, and no dedupe.

### ThingMinder (`packages/safebyok/src/minding/thing-minder.ts`)

1. `tryWrite` lands `answer.val` on a good answer and nothing on a refusal, then answers as the
   vaultDB did. It stays a `try*` method.
2. `#fetchCar` and `list` keep `if (! answer.ok) { throw answer.err }` as their whole refusal path.
3. No operation delivers `dbhas`, `tracked` or `world`. No operation invalidates a car, retries, or
   uses TanStack's mutation machinery.
4. The watch handler in `hello` stays synchronous.

### Running comments, as worded

- Above the notify calls in `tryWriteThing` (the other verbs need none):
  `// Out to in: the bank, the main gate, the root box, then the dbhas. By the time a listener is notified of the subject Thing, it has already been notified of the bank and main gate.`
- Above `notifyTrackedRecords`, replacing the comment there:
  `// Queued before the verb returns. That means each watcher's synchronous work is done before the verb's caller resumes -- no handler runs inside the operation verb.`
- Above `notifyDbhas`:
  `// The verb's caller gets the refusal and never lands its dbhas, so the watch notifies it. A good answer's val is the caller's to land, and is not notified.`
- Above the handler in `ThingMinder.hello`:
  `// Synchronous on purpose: the vaultDB notifies of a refusal's dbhas and each changed tracked Thing before its verb returns. An await here would cache them after the operation resumes.`
- In `ThingMinder.tryWrite`, above the line that lands `val`:
  `// Only the record written lands here. A refusal's dbhas, and any tracked and updated bank, main gate or root box, land through the watch.`
- In `ThingMinder.#fetchCar`, above `if (! answer.ok) { throw answer.err }`:
  `// Thrown as it came. The `dbhas` is delivered through the watch, never from here.`

### Invariants to pin

In the doc block of `VaultDB.watch` (`storage/vault-db.ts`), replacing what it says of `tracked`:

- A watch is notified of one Thing per notice. A store may pass the adapter several at once; each is notified as
  a notice of its own.
- A notice reports a change, never a plain observation: a Thing written, a tracked Thing found
  changed, or a refusal's `dbhas`. A bank's `world` is never notified.
- A verb never sends a notice on purpose for the `val` of its good answer: its caller has that. Where
  the same Thing is notified for another reason (a put of the root box by an ask that also tracks it),
  it is notified again, and nothing looks for or avoids the repeat.
- Every notice a verb causes reaches each watch before the verb's answer reaches its caller, so a
  handler's synchronous work is complete by then. Rely on nothing stronger.
- A verb's notices come "out to in": the bank, the main gate, the root box, then the `dbhas`.
- A handler will never be run inside the progress of a verb. What a handler awaits happens after the verb's caller resumes.
- A notice goes to every watch of the bank, whoever sent the ask.
- A watch may be notified of a Thing again at a revision it has notified, or at an older one.
- A change the store itself reports arrives when the store delivers it, in no promised order
  against a verb's answer.

In the `ThingMinder` class doc, replacing the two bullets that begin "While the minder is minding,
a write's own record" and "Nothing of a write's ask is cached":

- An operation caches only its own good answer: the record got, written or listed. Nothing of a
  write's ask is cached.
- Every other record an answer carries (a refusal's `dbhas`, the bank, the main gate, the root box)
  is cached only as the watch notifies it.
- Under a vaultDB that keeps `watch`'s order, a refusal's `dbhas` and each changed tracked Thing are
  cached before the operation answers or refuses. A listener has heard of them by then.
- A refused write changes no car and marks nothing stale.

### Tests, beside those the plan's *Then* lists

- A refused write that tracks: the watch hears the bank, the main gate, the root box, then the
  `dbhas`, in that order.
- A thrown refusal that carries a `dbhas` (`gate_issue`) notifies one notice of it.
- ~~With `doNotifyTracked: false`, a `stale_write` still notifies its `dbhas`.~~ Struck: the switch is removed.
- After `await minder.tryWrite(...)` answers `stale_write`, the car holds the `dbhas`, and a `listen`
  listener heard of it first.

### Wording changed by the orchestrator, for the build (each to be confirmed by the Coach)

Ruled (the Coach, 2026-11-19): the `tryWriteThing` comment keeps *Settled*'s sentence, with one phrase naming the
synthetic notifications the operation dispatches; and `AdapterVaultDB.watch` says: "The order and timing of an
*adapter*'s notifications relative to reads, writes, or other notifications is unspecified, even for a datastore that
provides assurance. The synthetic notifications (for tracked and dbhas) generated at the end of a VaultDB operation are
assured to complete before the calling verb resumes." The first item below is superseded by it.

Ruled (the Coach, 2026-11-19), on the rest: `VaultDB.watch`'s timing bullet and `notifyDbhas`'s comment keep *Settled*'s
wording. The minder's bullets read "A refused write itself changes no car and marks nothing stale. (Its `dbhas`,
delivered via notify, may update its car.)" and "Records accompanying an operation (updates in `tracked`, or a record in
`dbhas`) will be delivered to the Minder -- and therefore cached -- before returning to the operation." The two
calibrated `VaultDB.watch` bullets and the handler bullet go; `AdapterVaultDB.watch` says "A VaultDB notification carries
one Thing per notice. If a datastore pushes several records to its adapter in a notification, they will be split and
sent individually." The adapter paragraph sits above `MemoryVaultDB#notify` and `PostgresVaultDB.doWatch`. No rule on
`doWatch` about calling `receive` synchronously.

The store's own notice of a write (`MemoryVaultDB`'s `#notify`, queued inside `doWriteThing`, and a real store's
change feed) is not one of the wrapper's notices, and comes in no promised order against them. So:

- **`tryWriteThing`'s comment**: "By the time a listener is notified of the subject Thing, it has already been
  notified of the bank and main gate" does not hold for a good write, whose subject reaches a `MemoryVaultDB` watch
  first, through the store's own notice; and the bank and gate are notified only where they changed. Built as:
  `// Out to in: the bank, the main gate, the root box, then the dbhas. A listener notified of a refusal's dbhas has already heard of whichever of the bank and main gate changed.`
- **`VaultDB.watch`, "Every notice a verb causes reaches each watch before..."**: a store's own change feed is also
  caused by the verb, and the last bullet promises it nothing. Built as: "Every notice the vaultDB sends for a verb's
  answer (a changed tracked Thing, a refusal's `dbhas`) reaches each watch before the verb's answer reaches its
  caller, ..."
- **`notifyDbhas`'s comment**, "A good answer's val ... is not notified": the store's own feed does notify a written
  Thing. Built as: "A good answer's val is the caller's to land, and the vaultDB sends no notice of it."
- **`ThingMinder`, "A refused write changes no car"**: the watch does change the car, with the `dbhas`. Built as:
  "A refused write itself changes no car and marks nothing stale."
- **`VaultDB.watch`, the first two bullets** (calibrated at the Coach's word, 2026-11-19): they describe what a notice
  carries today, not a law that a notice may never carry more than one record; and they keep the vaultDB from
  echoing back what a verb's caller already has. Built as:
  - "Each notice carries one Thing, as `ThingNotice` is shaped today. Where a store passes the adapter several at
    once, each goes out as a notice of its own."
  - "A notice tells of a Thing that changed: one written, a tracked Thing found changed, or a refusal's `dbhas`. The
    vaultDB does not echo back what a verb's caller already has: a good answer's `val` is not notified, and neither
    is a bank's `world` as such; a bank or main gate that changed is notified as a Thing of its own."
- Every comment and doc block built follows the same calibration: say what is notified and why, never "only one
  record, ever", and never in words that would let a good answer's `val` or `world` be sent back as a notice.

## Questions (answered by *Settled*)

1. **Is "not `dbhas`, because it needs to throw correctly" the reason?** Landing `dbhas` does not stop a verb
   refusing or throwing. The difference is only who lands it. With the order above, the car holds it by the time the
   caller resumes either way. Rec: your rule as stated, for one rule with no exception.
2. **Which `dbhas` are notified?** A get's refusal carries the record found (a Thing under `gone`, null under
   `void`), a write's the record found (`stale_write`), a birth's the record found. A list's `dbhas` is a listing
   (`[]` or null), never a Thing, so a list sends nothing. A thrown refusal carries the classifier's `rows.dbhas`,
   set only under `gate_issue` and born_at's `bad_record`, in practice on writes; Postgres throws these too. Rec:
   notify a get's, a write's and a birth's `dbhas`, the catch path's included, as one notice of that Thing; nothing for
   a good answer or a null `dbhas`. Only the minder's `tryWrite` reads `dbhas` outside `storage/` today.
3. **Under which switch?** *Answered (the Coach, 2026-11-19): the switch is removed. `AdapterVaultDB` takes no
   options, and every watch hears each changed tracked Thing and each `dbhas`.* `doNotifyTracked: false` turns tracked notices off (a store whose own feed already hears
   every change, or a test that wants silence). Rec: the same switch covers `dbhas`, its doc widened; renaming it
   (`doNotifyAnswers`) touches safebyok-postgres's options, so only if you want the name exact.
4. **A store's `world` ignored.** A bank or gate that changed reaches the watch as its own record, when it is written,
   and through `tracked` when a verb finds it stale. Rec: ignore `world` in a store's notice; it loses nothing.
5. **Answers keep `world`.** Nothing outside `storage/` reads it today. Rec: keep it, as your rule has the operation
   method see it; dropping it is a later question.
6. **The minder's write invariant can't promise `dbhas` before the caller resumes.** That holds only where the
   vaultDB's watch tells it first: `AdapterVaultDB` with the switch on. A host's own `VaultDB`, or a test's
   `QuietVaultDB` (no watch), lands it later or never. Rec: the invariant says "the record written lands before the
   write resolves; a refusal's `dbhas` and the tracked roots land as the watch tells of them".
7. **One repeat survives.** A write that tracks the root box and is refused `stale_write` on the root box sends the
   same record twice: once as a changed tracked root, once as `dbhas`. Rec: leave it; the car merge makes it a no-op,
   and a dedupe by labelpath is machinery.

## The rework worker's findings (paused before any edit)

* `Feed` becomes `{ scope, tell(raw) }`; `doWatch` gets `({ record }) => tell(record)`, so a store still sends
  `Received = { record, world }` and the world is ignored. `worldThingsOf` and its loop go.
* `notifyTrackedRecords(ask, { tracked })` drops `world`; each non-`'same'` root goes alone to each matching feed's
  `tell`, in `queueMicrotask`.
* A new `notifyDbhas(answer)` finds the watches by `answer.ask`'s userid and banklabel (which `LoggableAsk` carries
  even for a thrown answer), called before `return answer` in `tryGetThing`, `tryWriteThing` and `tryBirthBank`, and
  in their catch on what `answerForThrown` returns, so a subclass overriding it keeps the notice.
* `MemoryVaultDB`'s own `#notify` also queues inside `doWriteThing`, so its notice of a write lands first too.
* The watch battery's "hears nothing of a refused write" becomes "hears the refusal's `dbhas` alone".

## Then

A fresh worker reworks #766 as commits on top. The tests: a store's change makes one notice; a changed tracked root
one, an unchanged none; a `dbhas` one; after `await tryWrite` answers `stale_write`, the car already holds `dbhas`;
the Postgres watch battery stays green. Its review follows, then #752 is rebased onto it, carrying this plan and the
namespaces sprint's `plan.md` and `exports-proposal.md` in its plan commit.
