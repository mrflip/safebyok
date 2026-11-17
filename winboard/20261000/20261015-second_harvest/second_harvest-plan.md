# Sprint second_harvest -- plan

* **Date**: 2026-10-15
* **Mode**: YOLO, as the low_hanging_fruit sprint was (prefer recorded best judgment over blocking on minor calls)
* **Review level**: medium
* **At once**: every thread whose base exists (the Coach: "go on all five of those")
* **Issued by**: flip (the Coach), after the low_hanging_fruit sprint
  ([#51](https://github.com/mrflip/safebyok/pull/51)'s closing note described the four small threads)
* **Status**: done -- threads 1-7 filed, all in the merge stack; see `winboard/20261015-second_harvest/20261015-sprint_second_harvest_done-human.md`

## Read first

* `winboard/20261015-low_hanging_fruit/low_hanging_fruit-plan.md` and `-progress.md` on
  [#51](https://github.com/mrflip/safebyok/pull/51)'s branch (`origin/20261015-low_hanging_fruit`): what the last sprint built
  and why. Not on main yet; read with `git show origin/20261015-low_hanging_fruit:<path>`.
* TODO.md roadmap 5 (*Expiry and the unlock window*) and roadmap 7 (*zod/mini*), and
  `winboard/20261014-crypto/rulings.md` (*Expiry*, *The unlock window*) for threads 4 and 5.
* `packages/safebyok/src/vault.ts`: threads 3, 4 and 5 all change its unlock path.

## Ground rules

* **Push only with an explicit refspec**: `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin <branch>:<branch>`.
  The branches have no upstream on purpose; never set one.
* **No force-push**, ever, by a worker. A rewrite of a pushed branch is the orchestrator's, with the Coach's yes.
* Threads stacked on [#53](https://github.com/mrflip/safebyok/pull/53) file their PR against `main` and say
  "Stacked on #53" first thing in the body; their diff includes #53's commits until it merges.
* Open PRs that touch the same files, so expect a later conflict and keep hunks small:
  [#37](https://github.com/mrflip/safebyok/pull/37) (`mask`, `safebyok/utils`, uses zod),
  [#45](https://github.com/mrflip/safebyok/pull/45) (`vault.ts`'s `retryStale`),
  [#46](https://github.com/mrflip/safebyok/pull/46) and [#50](https://github.com/mrflip/safebyok/pull/50)
  (`errors.ts`'s doc block and `vault_full` comment, the READMEs' *Errors* sections),
  [#53](https://github.com/mrflip/safebyok/pull/53) (`vault.ts`'s deadlines, `FarFuture`).

## Threads

### 1. zod_mini

> Please start the zod-mini thread. If it isn't finding what we think it will, pause and we'll discuss

*Gloss.* TODO.md roadmap 7, whose baseline is the size budget [#42](https://github.com/mrflip/safebyok/pull/42)
(merged: `pnpm size`). What we think it will find: zod classic is about three quarters of every bundle and does not
tree-shake; `zod/mini` (same runtime core, interoperable with classic) cuts that substantially, and with the schemas
off module top level, a bare `stableJsonify` import pulls no zod at all. **Spike first**: convert enough to measure
each `pnpm size` entry before and after, and check that the zod peer range (`^4.0.0`) has `zod/mini` at its floor.
If the savings are small (say, under a third of the zod share), the tree-shaking claim does not hold, the peer
range must move, or `zod/mini` costs real clarity, **stop and report `blocked` with the numbers** -- the Coach wants
to discuss before the thread goes on. Otherwise finish it: every schema in `src/` of each package on `zod/mini`,
the audit (`sideEffects: false` true, nothing at module top level that defeats it, each entry pulling only what it
uses), the budget limits lowered to match, and a report of what `zod/mini` cost in authoring clarity.
*Touches*: `types.ts`, `vault.ts`'s parse helpers, `device-db.ts`, `idb.ts`, the size config, maybe the React
binding. *Base*: `origin/main`. *Look-ahead*: [#37](https://github.com/mrflip/safebyok/pull/37)'s `mask` uses
`Z.object`; whichever lands second moves it. Leave it alone here and note it.

### 2. provider_conditions

> provider_conditions -- yes sounds great.

*Gloss* (from the description the Coach approved). When opening the vault fails, `VaultProvider` throws to the app's
error boundary whatever the reason. Right for a bug; wrong for "storage unreachable" or "signed out", where the
boundary tears down the vault UI, the app must reset it to retry, and each reset leaks one storage watch. The
provider's context gains an `openError` (name the worker's call), and the app renders "Can't reach your vault --
Retry" in place, with a way to retry the open. Misuse (`bad_label`, `bad_option`, ...) still goes to the boundary.
*The family split*: [#50](https://github.com/mrflip/safebyok/pull/50) documents the families in `errors.ts` but
exports nothing; this thread needs them in code, so it exports the split from the core (the TODO's *Error
families* entry asked for that: "errors.ts exports the split") -- additive surface, recorded in the changeset.
Place it away from #50's hunks (the top doc block and the `vault_full` comment) so the two merge. Check the leaked
watch is really closed on retry. The demo shows the in-place message. *Touches*: `safebyok-react`, the core's
`errors.ts` and `index.ts`, the demo. *Base*: `origin/main`.

### 3. remembered_deadline

> remembered_deadline -- yes.

*Gloss.* A remembered device keeps the deadline it was given, so lowering `forcePassphraseReentryHours` (say from
`Infinity` to one hour) leaves devices already remembered unlocked under the old setting -- #53's significant
finding and #43's first question. When a remembered unlock is read, cap its deadline at now plus the current
setting (`deadlineAfter`, so `Infinity` never shortens anything); when that shortens it, rewrite the stored record,
or the cap would slide forward on every reload. Read #53's clamp on read (commit `c5b8861`) first: build on it.
Also export `LockboxNote` (in `types.ts`, not yet in `index.ts`) so a host's form can check a note before
`store()`. No stored shape changes. *Touches*: `vault.ts`'s `rememberedUnlock`, `index.ts`, tests.
*Base*: [#53](https://github.com/mrflip/safebyok/pull/53)'s tip, `544088d`.

### 4. lock_race

> lock_race -- do the what you said, picking the side with lowest consequence. In the TODO NOTYET say that a more sophisticated unlock race analyser might distinguish a "Goons are here lock the vault" from a "typed in my password at 6d23h59m"

*Gloss* ("what you said"). `unlock()` waits on storage, the passphrase check (about a second) and saving the
remembered device; a `lock()` landing in those waits clears everything, then `unlock()` finishes and puts it all
back -- unlocked and remembered, though the user's last act was to lock. `lock()` bumps a generation counter;
`unlock()` and `changePassphrase()` check it after each wait and give up, writing nothing more and undoing a device
record they already wrote. **Lowest consequence**: the lock wins -- the cost of losing is retyping a passphrase,
where the other side's cost is a vault left open against the user's last act. Whether a lost `unlock()` resolves
or rejects (and with what kind) is the worker's call, documented and recorded. Tests drive the interleaving with a
controllable clock and deriver. TODO.md's NOT YET gets the Coach's sentence: a more sophisticated race analyser
might tell "goons are here, lock the vault" from "typed my passphrase at 6d23h59m". *Touches*: `vault.ts`'s
`unlock`, `lock`, `changePassphrase`, `destroy`; `notes/security.md`. *Base*:
[#53](https://github.com/mrflip/safebyok/pull/53)'s tip, `544088d` (it rewrites the deadline lines this thread
guards). *Look-ahead*: thread 5's shut timer calls the same lock path and must cancel on a fresh unlock; make the
counter the one mechanism both use.

### 5. screen_lock_recipe

> screen_lock_recipe -- implement and reference lockSoon.

*Gloss.* Build `lockSoon(graceSeconds = 5.0)` as ruled (rulings.md, *Expiry*; TODO roadmap 5): "no new secrets
from this instant; finish what is in hand; the key dies shortly". `askPassphraseAt` moves to now, so the entry gate
closes at once; the device record is erased at once (a remembered unlock past `askPassphraseAt` re-asks anyway,
and erasing it now is the lower-consequence reading of "shutting forgets both"); a timer nulls the key and flips
the snapshot at now plus grace; an `unlock()` within the grace cancels the pending shut. Then rewrite the core
README's screen-lock recipe: `lock()` for real lock signals (a button, Idle Detection's locked screen),
`lockSoon()` for tab-away and sign-out, and say plainly that both end this device's remembered unlock -- a host
wanting "stay unlocked for a week" should not lock on tab-away. Natural expiry's own timer (`askPassphraseAt` plus
60 s) stays with roadmap 5; if it falls out of the same lines, report it rather than build it. A `notes/security.md`
entry. *Touches*: `vault.ts`, `Vault`'s interface, the README, the React README if it names the recipe.
*Base*: thread 4's tip once filed, **and** [#53](https://github.com/mrflip/safebyok/pull/53) merged (else it would
stand on two unmerged threads).

### 6. clean_times

> Deciding not to validate anything because some things might fail isn't the right call, am I misunderstanding? II don't mind it being a real number as long as it's in bounds.
> I thought created_at/updated_at were leaving the repo altogether, and that nothing would be called expiry_at.
> I'd like to coerce Infinity to FarFuture at the first opportunity, and to disallow it after that. The customer can pass in clear intent, but we wil process clean data.
>
> Do not worry at all about backwards compatibility unil we are at version 1.0.0

*Gloss.* Three things, one thread, since all three are about times as the library keeps them:
* **The host clock is validated.** Every reading of `clock.now()` is checked against `FarPast`..`FarFuture`; a real
  number is fine in bounds (`EpochMillis` drops `.int()`; `deadlineAfter` keeps rounding down, so what is stored
  stays whole ms). A reading out of bounds is the host's misuse: `bad_option` (or the worker's better kind), checked
  once at `openVault` so a bad clock fails fast, and at each reading.
* **`Infinity` is coerced at the first opportunity**: `forcePassphraseReentryHours: Infinity` is accepted from the
  host and becomes a finite internal window at the option's parse (so `deadlineAfter` yields `FarFuture`); every
  internal schema and every stored field refuses `Infinity` after that.
* **The time fields of roadmap 3 land now**: `created_at`/`updated_at` leave the stored records; the lockbox gets
  `registered_at` and `changed_at` (the ruled semantics in TODO roadmap 3: `changed_at` moves only when the serialized
  whisper differs), the bundle `registered_at`, all `EpochMillis`; the device record's `expires_at` becomes
  `ask_passphrase_at`. Convex's tables and validators follow. **No backward compatibility** (the Coach's ruling until
  1.0.0): no migration, no reading of the old fields; an old record simply fails validation, safely. The rest of
  roadmap 3 (the envelope list, codec labels, binding the whole header, the public bag) is not this thread.
* CLAUDE.md's "A stored vault is a contract too" gets the Coach's pre-1.0 exception, if the Coach says yes.

*Base*: thread 3's tip once filed, after #57 merges (it rewrites `rememberedUnlock`'s `expires_at` lines, which thread
3 owns). *Look-ahead*: thread 1 (zod_mini) converts whatever schemas this adds.

### 7. pluggable_logger

> add a thread: accept a pluggable logger. it must offer log(message?: string, story?: Record<string, any>, err?: Error | null) , warn(...) and error(...)

*Gloss.* The host hands the vault a logger, and the package's only console write (thread 6's `lockSoon()` bad-clock
warning, ruled by the Coach: "console.warn, lock as if it's immediate") goes through it instead.
* **The interface**: an exported `VaultLogger` type with `log`, `warn` and `error`, each
  `(message?: string, story?: Record<string, …>, err?: Error | null) => void`. The worker may type `story`'s values as
  `unknown` rather than `any` if every object still fits (it should; report it), and decides whether the logger is
  `openVault`'s option alone or also the Convex adapter's and the React provider's (the provider passes it through).
* **Validated at the door** like every option: an object with the three functions, else `bad_option`; once parsed it
  is the vault's own (values inside the interface possess their final form). A logger that throws must not break a
  lock, an open or a store: the package catches and drops what a logger throws.
* **The default**: when the host passes none, the console is the fallback. The Coach, directly: "yes with no logger
  console is the fallback". Thread 6's direct `console.warn` (and its suppression) is removed; the fallback logger is
  the one place in `src/` that touches the console (a single module, the linter's `no-console` disabled there alone,
  reported, with a `notes/security.md` line). A host silences it by passing a no-op logger.
* **Nothing secret through it.** CLAUDE.md's side-door rule binds the logger hardest: no whisper, passphrase, key,
  ciphertext or option value quoted in a message or a story, and an `err` passed is one of our own `VaultError`s or a
  host's error, never one carrying secret material. A test sweeps every logger call for the fake secrets the tests
  use. A `notes/security.md` entry says so.
* Thread 6's `console.warn` becomes `logger.warn`. Other call sites worth a log line (a dropped storage watch, a
  record erased as corrupt, a remembered unlock forgotten) are the worker's call, kept few; list them in the report.

*Base*: thread 6's tip once reviewed (it owns the `lockSoon()` warning). Files on top of thread 6.

## Housekeeping beside the threads

* [#37](https://github.com/mrflip/safebyok/pull/37)'s 26 commits squash to a logical handful (the Coach), the final
  tree unchanged; the orchestrator force-pushes it with a lease. The Coach confirmed the reading of the RTL ruling:
  letters kept, only the direction markers stripped.

## Decisions taken in YOLO

1. Four threads run at once: the Coach said "go on all five".
2. Threads 3 and 4 stack on [#53](https://github.com/mrflip/safebyok/pull/53); thread 5 waits for 4 and for #53 to merge.
3. Thread 2 exports the error families from the core, rather than keeping a second list in the React binding.
4. Thread 4: the lock wins the race.
5. Thread 5: `lockSoon()` erases the device record at once, not at the shut; natural expiry's timer is not built here.
6. Thread 3: a remembered deadline past what the current setting allows from now is **erased** (the device re-asks once), not shortened and written back. The review found a blind write-back can resurrect an unlock another tab's `lock()` just erased; an atomic DeviceDB method would change the interface hosts implement.
9. Superseded by the Coach's ruling (no backward compatibility before 1.0.0): decision 8's question is moot; old records failing validation is the intended behaviour.
8. The bounds follow-up (`FarFuture` 2255, `FarPast` 1981, `EpochMillis`) stays strict: device records written by 0.1.0/0.2.0 with a window over about 229 years are erased (one more passphrase prompt), rather than clamped on read; the notes say so. It files as its own PR, `20261015-epoch_bounds`, since #53 merged without it.
7. Thread 4's reviewer may fix the older race the worker found (an unlock taking up the old key of a vault destroyed and remade elsewhere) if the fix stays inside `takeUpUnlock`.

10. Thread 6, by the Coach: `lockSoon()` with a bad clock warns and locks as if immediate, with no throw; there are no deployed vaults to worry about, so the changeset carries no clean-up instructions; "values inside our interface should possess their final form", so `maxVaultBytes` is coerced at the boundary like the times.
11. Thread 7 (added by the Coach mid-sprint) stacks on thread 6, since it reroutes thread 6's warning; the Coach approved thread 6's `console.warn` directly, to be removed by thread 7, whose fallback when the host passes no logger is the console (the Coach, directly).

## For the Coach

* Merging [#53](https://github.com/mrflip/safebyok/pull/53) frees thread 5 once thread 4 files.
* The Docs tools are not in this session, so there is no live sprint doc; these files are the record.
