# Sprint adapter_port: paused (2026-11-25)

Sprint doc: https://claude.ai/artifact/LdbJqWk27MHUvdCNQGBFTK. Plan: whiteboard/20261125-adapter_port/adapter_port-plan.md.

## Filed (all drafts: #912 below them is a draft)

* **#916** thread A `big_names`: the adapters on big became `-big`; idb-lean and react-lean took the published names;
  postgres split; fastkey ported in place. With big's pointer fix and the notes sweep. Stacked on #912.
* **#914** thread C `graphql_design`: the design for a new-core safebyok-graphql, with the Coach's Q2–Q7 rulings.
  Docs only. Stacked on #912.
* **#923** thread B `convex_vault`: a new-core safebyok-convex, reviewed (fixed), with the three renames. Stacked on #916.

No worktree holds unfiled work.

## Waiting

* **Thread D (`graphql_vault`)** waits on the Coach's Q1 (how much of the wire to type; re-explained in the doc: the
  design types only the envelope), and on #905 (`doStats`) and #911 (`read_tc`) being in the line.
* **Open Matters** for the Coach: Q1; Convex upgrade empties vaults (TOP); try the Convex README's setup; sidecar keys
  Convex can't store; the unannounced write at Convex watch start.
* **Base checkout sync** held: this line stands on #912 alone, without #905, #906, #910, #911; lease_shelf's session
  may sync the same checkout. Sync once lease_shelf's line is one, this sprint on top.
* **A Closer Look** is offered over #916, #914, #923.
* **#923 rework** for `doStats` and `read_tc` once lease_shelf's line is one (*Cleanup*, *Finally*).
