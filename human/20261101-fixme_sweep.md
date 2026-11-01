# fixme_sweep: what the FIXMEs left open

Thread `20261101-fixme_sweep`, PR #422. Every FIXME in `trigger.ts`, `lease.ts` and `storable.ts` is
addressed. Second round, after the Coach's answers:

## Done

* **`taskCompleted(outcome?: { ok?: boolean, err?: Error })`** replaces `noteSuccessNow`. A success is the
  default, filled in by a zod check (`ok` true unless said, `err` an `Error`, the rest of an `Outcome` dropped).
  A failure keeps its `err` as `trigger.lastErr`; a success clears it; a launch the task refuses is noted as
  a failure the same way.
* **`notedInLaunch`, `unconfirmed` and `notesOwnSuccess` are gone.** Both booleans were derivable from
  `lastSucceededAt` and the interval, and only fed each other. `notesOwnSuccess` is gone because a launch
  that completes ok never reports success by itself now: the task calls `taskCompleted`. Before, only
  `Storable` set it true (its `receive` verdict decides, as a fetch can answer ok with an older record, and
  a put or a notice succeeds outside any launch); `Lease` and the tests left it false and wanted no
  success tracking at all. One behaviour changes: a launch that completes ok without a success no longer
  makes the thing untimely at once. The last success stands until its interval is up.
* **`Storable.fetch` is one fetch at a time**, by its own `oneAtATime` (now generic over the value a run
  resolves) around `doFetch`, the plain `listing.fetch(scope, { ifAbsent: 'nil' })` resolving whether storage held a
  record. `hydrate` is noop-if-timely-else-fetch, and `tryFetch` calls `fetch`. `ifAbsent` and the world horizon are
  judged for each caller, after the join. The trigger's launch is `tryFetch({ ifAbsent: 'nil' })`: it calls `fetch`
  like any caller, and keeps to timer and timeliness. (The trigger's own join of launches is now redundant for a
  Storable, as `fetch` joins beneath it.) Why joined: `Vault.refresh` is `oneAtATime` in `src/vault.ts`, and `Box`
  has no read of its own. No case for parallel fetches: `receive` ignores an older answer, so parallel is safe,
  but it costs requests and gains nothing.
* **Lease** keeps `isTimely`, with no time math of its own: it notes a success when it takes a lease in hand,
  and the trigger's interval is the lease's goal, so the timer fires, and the lease reads timely, for that
  long from that moment. A grant passes `leaseMillis`; `Lease.get` of a lease kept passes the time left to its
  stored `autolock_at`, the one subtraction.
* **`disarm()` is for good.** Before, an ok launch finishing after it armed the timer again. Now the Lease's
  autolock, whose interval is the lease's remaining time, would otherwise fire a second time.
* `Lease.unsealWith` is a try/catch that throws `unopenedWhisper()`.

## Open

None.
