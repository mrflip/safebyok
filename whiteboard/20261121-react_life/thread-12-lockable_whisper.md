# Thread 12: lockable_whisper (2026-11-21)

Branch `20261121-lockable_whisper`, PR #808, stacked on #807. Proved: `safebyok-react-lean` lint, typecheck, test
(15 files, 239); `safebyok-demo-knockknock` lint, typecheck, test (4 files, 26); `safebyok-demo-envman` lint,
typecheck, test (3 files, 20). `pnpm justify` after the catch-up: see the PR's **Tests:** line. Nobody has clicked
through either page in a real browser.

* **Built**
  * **`Knock.withLockableWhisper(labelpath, fn, { ifLocked })`** (`src/giver/react-giver.tsx`, type
    `WithLockableWhisperOpts`). After `hello`, an unlocked bank goes through `vault.withWhisper` and calls `fn(whisper,
    box)`; a locked one reads the box's stored record through the minder (`getBoxShown`, `liveOf`) and calls
    `ifLocked(box)`, never asking for the unlock form. No live box refuses `absent_box` (new phrase
    `Phrases.BoxAbsent`). Tests: each branch, absent box, absent vault, bad args, and the doc block's example as a
    rendered `useQuery` keyed on `isLocked` and `box?.revtok`, checked with `TH.expectTextUnheld` while the tail-4
    reveal is on the page.
  * **`Knock.useStageChange((stage, prevStage) => …)`**: calls back after each render showing a new stage, never on
    the first render; the latest callback through `useEffectEvent`. Tests: once per change under StrictMode, not on
    the first or a same-stage render, the latest callback, refuses a non-function. It reads `useBank`, so it never
    touches the minder (GR7).
  * **`mask` re-exported** from `safebyok` (`src/index.ts`, with `type MaskOpts`); `src/mask.ts`, `maskOf`,
    `MaskSchedule`, `DefaultMaskSchedule` and their test are gone. `tests/index.test.ts` pins the binding and the
    tail-4 reveal on three fake key lengths.
  * **`PasskeyUnlockButton`** takes `bank: Pick<BankGiver, 'useUnlock' | 'usePasskeyHeader'>` and reads
    `bank.usePasskeyHeader()` when `passkeyHeader` is left out (undefined). An explicit `null` still renders nothing.
  * **`tests/giver/giver-context.test.tsx`** (ride-along g): `useGivenBank` and `useGivenGiver`, five each.
  * **Demos.** Knock-Knock's `KeyPanel` stores `mask(apiKey, { tail: 0 })` and shows a `KeyMask` query over
    `withLockableWhisper` (tail 4 unlocked, sidecar locked); its `LockedPanel` renders a bare `<PasskeyUnlockButton />`.
    Envman's `valMaskOf` is `mask(val, { tail: 0 })`, `valRevealOf` is tail 4, and `EnvRow`'s `useValMask` feeds the
    input's placeholder; `EnvEditor` discards its draft (and resets Save) on a lock through `Envman.useStageChange`.
    Tests in each App test: the stored mask while locked, the reveal while unlocked, `expectUnheld`; envman's "empties
    an open draft on Lock" fails with the callback removed (checked). READMEs updated.
  * **`notes/wontfix.md`**: a lock between `withLockableWhisper`'s stage read and `withWhisper`'s wait.

* **Decisions made**
  * **The stored mask drops the old `head: 7`.** Big's `mask` at `{ tail: 0 }` keeps its schedule's head (2 or 3
    characters, none at 12 or fewer). `head: 7` shows the whole of a short value: `mask('hunter2', { head: 7, tail: 0
    })` is `hunter2*****`. Visible strings change: `sk-ant-…` becomes `sk**********************`.
  * **Big's `mask` needed no broadening.** Tail 4 shows four characters at every length the demos use
    (`sk******************cdef` for a 28- or 29-character key); the floor eats nothing. A cold reader's claim that
    `{ head: 7, tail: 4 }` gives all stars does not reproduce: it gives `sk-ant-*************cdef`.
  * **A sparse record refuses `absent_box`** in the locked branch: it has no sidecar to hand `ifLocked`.
  * **The demos key their mask queries outside `Knock.keys`** (`['keyMask', isLocked, revtok]`,
    `['valMask', labelpath, isLocked, revtok]`): host queries over a giver call, not the giver's cache. `revtok` is
    unique per revision, so no userid is needed in the key.
  * **withWhisper's `await device.hello()`** gained a one-line comment on why it stays even once said.

* **Discoveries**
  * A child's query that calls the giver before the Provider's effect starts the slot is refused by `demandDevice` and
    retries; gating the query on `useBox`'s answer (`enabled: Boolean(box)`, or rendering under it) avoids that. The
    doc example does so.
  * No cheats added; no `eslint-disable` or `ts-expect-error`. Two `as` casts read a sidecar field as `string`.

* **For the Coach**
  * **Stored mask head**: the schedule's own head, not 7 (above). Say if the public `sk-ant-` prefix should stay
    visible on long keys.
  * **Wontfix row** for the crossing above, awaiting a ruling.
