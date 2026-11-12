# 20261111-prose_documents: open questions

PR: https://github.com/mrflip/safebyok/pull/647, a plain-English pass over CLAUDE.md, STYLE.md, PROCESS.md, notes/, the agents and skills, and the READMEs. Its body lists ten open questions. The ones most likely to matter:

1. documentarian.md: "one file per spawn" conflicts with grouping many files into a few commits for one PR.
2. CLAUDE.md and STYLE.md disagree on which safety hatches to report, and whether to report them in chat *and* in the PR, or *or*.
3. Unlocking with an empty passphrase seems to refuse `unexpected_error`, not `wrong_passphrase`.
4. STYLE.md's `Stored-` naming rule names no type that exists. `no-param-reassign` isn't enabled. A `read...` helper name clashes with the ban on `read`.

## Memories (outside the repository, edited in place)

The pass changed word-rule slips and descriptions only. A snapshot from before the pass is in the session scratchpad. The memory agent found these tensions, left as they are:

- damaged-is-the-row-alone names `box_damaged` and `vault_damaged`. A later ruling in answer-contract-thread uses `damaged_row` and `damaged_vault`.
- no-machinery-near-fate does not mention the exception answer-contract-thread records ("lifted for this thread", then "leave was for W2 only").
- no-back-compat-unreleased limits what a changeset says about old records more tightly than CLAUDE.md does.
- Two links point at memories that don't exist: `[[be-specific-about-names]]` and `[[test-backdoor-names]]`.
