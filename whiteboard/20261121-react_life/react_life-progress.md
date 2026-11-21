# react_life: what the threads have taught

The orchestrator's alone. Newer than the plan wherever they disagree. Workers look things up here; each keeps its own
`thread-<N>-<label>.md` on its own branch.

## Before any thread (the design session, 2026-11-21)

* **The plan was prepared in one session and is orchestrated from another.** The design session's reasoning is in
  `react_life-design.md`; nothing else of it carries over.
* **Ruled by the Coach on 2026-11-21, after the plan's first draft:** the new React layer is a private package,
  `safebyok-react-lean`; the device owns the minder, with query-core a peer of `safebyok`; the giver makes the
  bridge, with React Query a peer of the new package; a demo persists through the memory vaultDB saved to
  localStorage; nothing ends a device in this sprint, and the teardown code that exists is left alone.
* **Defaults a worker builds where the Coach has not ruled,** each an *Open Matters* row and cheap to reverse:
  * `unborn` is a stand-in in the device's snapshot;
  * the form helper that takes fields out of the `FormData` is private to the kit;
  * no bank boundary;
  * to change user or sign out, a demo clears its session and reloads the page.
* **One survey claim was wrong:** fetching the bank's records does not need a Bank (`react_life-plan.md`, *Read
  first*).
* **Found in the code and out of bounds here:** a lease's expiry is reported and enforced nowhere, and `Device.make`
  ignores the deviceDB. The Coach has ruled that neither is touched or raised in this sprint.
* **Uncommitted in the base checkout when the sprint was planned:** the Coach's own edits to
  `whiteboard/20261116-react_backwards/app-side.md` and `human/PROMPTS.md`. They are not the sprint's.
