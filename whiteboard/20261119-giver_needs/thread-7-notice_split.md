# Thread 7: notice_split (2026-11-19)

Branch `20261119-notice_split`, PR [#766](https://github.com/mrflip/safebyok/pull/766), stacked on [#765](https://github.com/mrflip/safebyok/pull/765). Proved: safebyok
storage and minding 408 green, typecheck and lint clean; safebyok-postgres 333 green (it runs the watch battery on PGlite,
against a rebuilt `safebyok/testing`); `pnpm justify` at the tip (see the PR's **Tests:** line).

The thread was built once (world split into bank and gate notices), then reworked to the settled notify plan
(`whiteboard/20261119-giver_needs/notify-plan.md`, *Settled (the Coach and Fable, 2026-11-19)*, with the orchestrator's four
wording changes). This file describes the rework; the first build is in commit `642e4f4d3`.

* **Built** (`packages/safebyok/src/storage/adapter-vault-db.ts`):
  - `watch` turns each `Received` into one notice of its Thing; the `world` is ignored. `worldThingsOf` is gone. A feed is
    `{ scope, tell(raw) }`.
  - `notifyTrackedRecords` queues the bank, main gate and root box by name, out to in, each not `'same'`. `doNotifyTracked`
    covers these alone.
  - `notifyDbhas` queues a refused answer's `dbhas` where it is a Thing, whatever the option, after the tracked Things. It
    runs for `tryGetThing`, `tryWriteThing` and `tryBirthBank`, on their returned refusals and on a thrown refusal that
    carries `rows.dbhas` (`gate_issue`). A refused listing's `dbhas` is a list and is not notified.
  - `#queueNotices` queues one microtask per watch of the bank, so every notice reaches its watch before the verb returns.
  - `ThingNotice` stays `{ ok, act, val }`. `VaultDB.watch`'s doc (`vault-db.ts`) states the settled bullets.
  - `ThingMinder.tryWrite` caches only a good answer's `val`; `#fetchCar` throws the refusal as it came. The class doc's four
    bullets are *Settled*'s, word for word but for the orchestrator's "itself".
* **Tests**: the watch battery (birth 3 notices; a box write 1; a refused write's dbhas alone; a thrown refusal's dbhas
  once; tracked out to in, then dbhas; `'same'` untracked); adapter (no world notice, dbhas before the answer for each verb,
  nothing for a good val, null dbhas, a dbhas-less throw or a refused listing); memory (`doNotifyTracked: false` still tells
  a stale_write's dbhas); minder writes (a stale_write's record is heard by a listener before `tryWrite` resolves, through
  the watch; under QuietVaultDB a refused write changes no car); staleness (a repeated main gate keeps its car, tells twice).
* **Decisions made**: the dbhas comes after the tracked Things in every verb, not only writes, so one rule holds. The thrown
  path notifies too: its refusal reaches the caller as an answer like any other.
* **Deviations**, all reported, none softened:
  - Left out of `VaultDB.watch`, false as built: (a) "A store may pass the adapter several at once; each is notified as a
    notice of its own." A store passes one record and a world, and the world is not notified; the interface also knows no
    adapter. (b) "A handler will never be run inside the progress of a verb. What a handler awaits happens after the verb's
    caller resumes." False for a store's own notice: `MemoryVaultDB#notify` runs between `doWriteThing` settling and the
    verb returning, and Postgres LISTEN arrives at any time. Proposed: "A handler of a notice the vaultDB sends for a verb's
    answer is never run inside the progress of that verb: what it awaits happens after the verb's caller resumes."
  - Kept as worded, flagged: `tryWriteThing`'s comment ("has already heard of whichever of the bank and main gate changed")
    and the minder bullet "each changed tracked Thing [is] cached before the operation answers" fail under
    `doNotifyTracked: false`, and a thrown answer carries no `tracked`.
  - Changed outside *Settled* to stay true: the minder's "Four sources" paragraph, `tryWrite`'s doc, `AdapterVaultDB`'s class
    doc, the `doNotifyTracked` opt doc.
  - `whiteboard/20261116-react_backwards/giver_needs.md` (M3's done-when) not edited: the Coach has uncommitted edits to it
    in the base checkout. M3's "a stale_write leaves the car's newest at the record the vaultDB reported" now holds through
    the watch, and is tested so in `thing-minder-writes`.
* **Discoveries**: TanStack's `setQueryData` dispatches `success` even when the car is kept, so a repeat tells `listen` an
  event. safebyok-postgres imports `safebyok/testing` from `dist`: build safebyok before its tests see a battery change.
* **Dropped**: the minder no longer lands a refusal's `dbhas` itself. A minder over a vaultDB that sends no notices sees a
  refused write change nothing.

Approaches set aside: notifying a good answer's `val` (the caller has it; *Settled*); `Object.values(tracked)` for order (not
named, and order is a promise); deduping repeats (the car merge makes them no-ops, and dropping by labelpath could drop a
newer record); notifying a refused listing's `dbhas` (a list, and no Thing to tell).
