# Changesets

Each Markdown file here is one pull request's release note, waiting for the next release: which
packages it bumps, by how much, and a sentence or two for their CHANGELOGs. Write one with
`pnpm changeset` (or `pnpm changeset --empty` for a change that needs no release; with no terminal,
`pnpm changeset --package <name> --bump <level> --message "..."`), which names it
for the thread's branch, `YYYYMMDD-<label>.md`, with `-2`, `-3`, ... when that is taken. The
Version PR uses them up. How to write one is [PROCESS.md](../PROCESS.md), *Releases*; how a
release is made, [notes/releasing.md](../notes/releasing.md); changesets itself is documented at
<https://changesets.dev>.
