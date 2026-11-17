# Thread 4: epoch_millis (2026-10-15)

Branch `20261015-epoch_millis`, PR [#31](https://github.com/mrflip/safebyok/pull/31). Justify: green (core 242 tests, convex 210, react 7, demo 25, root 67).

* **Built**: the demo's account row (`demos/safebyok-demo-react/src/lib/auth.ts`) now records
  `created_at` as epoch milliseconds from `wallClock.now()` (was `new Date().toISOString()`), typed
  `number`, with a test that the stored row holds an integer near now. The core's `vault.test.ts`
  clock starts from the literal `1_791_979_200_000` instead of `Date.parse('2026-10-14T12:00:00Z')`
  (same instant). Empty changeset: no published package's behaviour changed.
* **Decisions taken**: the grep (`toISOString`, `Date.parse`, `new Date(`, `Date.now`, `_at`) found
  almost nothing outside the stored lockbox/bundle fields, so the thread is that small; nothing was
  invented. Used `wallClock` (the package's clock seam) in the demo rather than a bare `Date.now()`.
* **What the grep found and left alone, and why**:
  - Stored `created_at` / `updated_at` ISO strings: `src/vault.ts` (three `toISOString()`),
    `src/types.ts` (`Z.string()` on Lockbox and VaultBundle), Convex `validators.ts`, and the
    fixtures `tests/helpers.ts` (core and convex), `tests/vault-db-suite.ts`, convex
    `validators.test.ts`. All belong to the reservations thread (TODO roadmap 3), which retypes them
    with their fixtures together.
  - Device record `expires_at` (`DeviceUnlock`) is already a number (`Z.number()`); `expiresAt` in
    the snapshot likewise. Nothing to change.
  - `new Date(x).toLocaleString()` in the demo (`VaultDashboard.tsx`, `KnockKnock.tsx`) is display
    formatting, which the thread excludes; its inputs are the stored ISO strings today and will be
    numbers after reservations, which `new Date(number)` also accepts, so no demo change is needed then.
  - `new Date()` in `types.test.ts` and `vault.test.ts` is the "a Date is not a Whisper" negative case.
  - The React package holds no time values beyond `expiresAt: null` and the numeric `clock` in its test.
* **Discoveries**: existing demo accounts already in someone's localStorage keep an ISO
  `created_at`; nothing reads that field, so no migration (the demo is scaffolding).
* **For the Coach**: nothing needing a decision.
