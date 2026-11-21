# react_life: what the threads have taught

The orchestrator's alone. Newer than the plan wherever they disagree. Workers look things up here; each keeps its own
`thread-<N>-<label>.md` on its own branch.

## Before any thread (the design session, 2026-11-21)

* **The plan was prepared in one session and is orchestrated from another.** The design session's reasoning is in
  `react_life-design.md`; nothing else of it carries over.
* **Defaults a worker builds where the Coach has not ruled.** Each is an *Open Matters* row, and each was chosen to
  be cheap to reverse:
  * the new React layer is a private package, `safebyok-react-lean`;
  * the core's Device is the minder's friend, and `startDevice` lives outside core;
  * both demos run over `MemoryVaultDB`, saved to localStorage by a helper in the demo;
  * the teardown is `goodbye()` on the device and the minder, and it disables;
  * `unborn` is a stand-in in the device's snapshot;
  * the form helper that takes fields out of the `FormData` is private to the kit;
  * no bank boundary, and the provider's unmount does nothing;
  * the demos call `lock()` on sign-out, since a null userid changes nothing.
* **One survey claim was wrong:** fetching the bank's records does not need a Bank (`react_life-plan.md`, *Read
  first*).
* **Found in the code and not this sprint's to fix:** a lease's expiry is reported and enforced nowhere; `Device.make`
  ignores the deviceDB. Both are rows in *Open Matters*.
* **Uncommitted in the base checkout when the sprint was planned:** the Coach's own edits to
  `whiteboard/20261116-react_backwards/app-side.md` and `human/PROMPTS.md`. They are not the sprint's.
