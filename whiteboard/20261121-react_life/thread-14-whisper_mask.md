# Thread 14: whisper_mask (2026-11-21)

Branch `20261121-whisper_mask`, PR #TBD, stacked on #809. Proved: safebyok-react-lean 247 tests, lint and typecheck
clean; knockknock 26, envman 24, each lint and typecheck clean; `pnpm justify` pending.

* **Built**: `WhisperMask` (`packages/safebyok-react-lean/src/parts/whisper-mask.tsx`, exported from the parts), the
  simple form of what `WhisperText` does. It renders an empty `<code className="whisper-mask">` always, and an effect
  keyed on the bank's `stage` and the box's `revtok` (from `useBox`) empties it and writes
  `withLockableWhisper(labelpath, (w) => mask(w[field], { tail }), { ifLocked })` into it. Props: `bank?` (provider's by
  default), `labelpath`, `field`, `tail?` (mask's own policy when left out), `ifLocked?` (default: the sidecar's `mask`
  field when a string, else empty), `onError?`. No `flushSync`, no React state, no query. Tests in
  `tests/parts/whisper-mask.test.tsx`: stored mask locked, live tail unlocked, stored again on lock, with
  `expectTextUnheld` on the key, the live mask and the tail (strings, all) and the tail checked out of the page; a write
  rewrites it; the default `ifLocked`; empty for an absent box; `onError`.
* **Demos**: Knock-Knock's `KeyMask` query is gone; `WhisperText`'s `masked` is a `WhisperMask`. Envman's `useValMask`
  and `ValInput` are gone, and `valRevealOf` with them.
* **`withLockableWhisper`'s doc** no longer teaches a query: its example writes the answer into an element, and the
  block points at `WhisperMask`. Its `@example` test does the same.
* **Ride-alongs from #809's review** (orchestrator's directive): `passkeyHeaderOf(gate)` exported beside `liveGateOf`
  (`giver-defaults.ts`, index), replacing the copies in the kit's `passkey-forms.tsx`, the demo's `WaysIn.tsx`, the
  giver and bridge tests and `useGate`'s example; `RevokePasskeyForm`'s example compares strictly; the Provider's doc
  says it renders in the browser only.

* **Decisions made**:
  - **Envman's mask leaves the placeholder.** The mask is now a visible `WhisperMask` beside the value's input, which
    keeps the draft's own placeholder. Set aside: a ref callback writing `input.placeholder`, which would compose with
    the draft's own ref callback and fight React over a prop it controls (`field.placeholder` flips as the input
    empties) -- more machinery than the part. A CSS overlay over the input was set aside as clever.
  - **The effect keys on `stage`**, as the handoff says, not `isLocked`: an extra fetch on a stage that is neither is
    cheap.
  - **The default `ifLocked`** reads the sidecar's `mask`, the field both demos store, so neither passes one.
  - **The first test switches keys** to `sk-test-Qz9w`: the world's key ends `0000`, which stamps and tokens in React's
    tree also hold, so a tail search on it fails for no secret reason.
* **Deviations**: none from the plan. `notes/wontfix.md`: a new row (a write in flight when the bank locks can leave
  the live tail in the page), and the thread 12 row's workaround no longer cites the query example.
* **Discoveries**: `notes/security.md`'s thread 12 entry saying the live reveal sits in the host's React Query cache is
  now wrong: neither demo holds it in any cache; it lives in the page alone. The orchestrator has it amended.
