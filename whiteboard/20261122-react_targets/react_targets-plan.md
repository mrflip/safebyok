# react_targets: the workshop's plan

A workshop (`/workshop`) between the Coach and one session, begun 2026-11-21. Its goal: `safebyok` and
`safebyok-react-lean` make a security expert nod and a React developer sigh with joy.

## How the Coach wants it run

* This thread's PR is the line: each worker's PR stacks on it, and it closes last, as one squashed commit of them all.
* The session edits in this worktree (`/workspace/byok-react_targets`); the `base-sync` agent carries the Coach's
  fingerpainting in the base checkout into it, and the line back to the base. Workers use worktrees of their own.
* Agents liberally, to keep the session's context roomy, and every spawn names its model.
* Out of bounds: every ending (lock, sweep, vacate, delete, sign-out), autolock, the adapters, the deviceDB, and the
  demos' looks for their own sake. A demo may change, or gain a feature, to show a library offering.

## The steps

1. **Set the target.** Four guides in `docs/`, one for each audience of `docs/react-overview.md`: pencil sketches, no
   longer than the dream interface (132 lines), each over the same three apps (one API key, Doppler-lite, a
   device-only password manager). Done: `guide-react_query.md`, `guide-suspense.md`, `guide-nextjs.md`,
   `guide-headless.md`.
2. **Clear the low-hanging fruit** in `safebyok-react-lean` that needs no change of architecture (below).
3. **Make the apps exemplary**, and say where the library prevents it. The same, for the four guides. The Coach is
   reading this step.

Meanwhile the Coach triages the large matters: the two TanStack caches and the bridge between them, whether the giver
exists, and who owns what at startup.

## Rulings

* **The sketch stands** (the Coach, 2026-11-22: "Sketch sounds great"), as a pencil target:
  * No giver. `<SafebyokProvider userid vaultDB keyDeriver>` owns the device; hooks are imported by name; `useVault()` is
    the one handle for the calls and the query factories.
  * One bank, labelled `'main'`: no call names a bank, and a second bank would wrap a subtree.
  * Gate verbs take the form: `vault.unlock(form)` reads `passphrase` and deletes it before it first awaits. A host
    never sees a gating.
* **The invariant to hold**: cleartexts and semi-cleartexts are seen only within private methods of gating, proving and
  lease. The threat it answers is an agent filing bug reports, not an attacker in the page: a small horizon lets a
  reviewer finish. It may be loosened where a React interface needs it, and only then.
* **Supported targets**: React 19.0, ES2022, Next.js 16 LTS, Node 22 to 26.
* **`useEffectEvent` comes from a ponyfill dependency, a peer** (the Coach, 2026-11-22), not hand-rolled.

## Step 2: the fruit

One thread, `react_fruit`, stacked on this line:

1. `WhisperText`'s Hide leaves the whisper in the page when `masked` is an element: both branches are a `span` in one
   slot, so React never unmounts it. A `key` on each, and a test with an element `masked`.
2. The React 19.0 floor: `useEffectEvent` from `use-effect-event` in `useStageChange` and `WhisperMask`; the peer
   range of `react` and `react-dom` to `^19.0.0`.
3. `'use client'` on the three entries.
4. `takeText` exported from the kit as `takeField`.
5. `PutBoxActionResult.err` typed `Error`.

Held, because the target deletes or reshapes them: the gatings' `onSettled` doc lines, `boxQuery`'s advice to use it
outside the provider, explicit types for the giver, hooks passed as props, and `initialData` for a box's query.

## Open

* The third app, the device-only password manager, has no demo. Built now, it would stand on the demos'
  `localStorage` vaultDB, since no browser vaultDB is ported.
* Still to come from the Coach: the two caches and the bridge.
