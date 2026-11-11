# 20261111-strict_params: open questions ([#638](https://github.com/mrflip/safebyok/pull/638))

- requestCleartext left unchanged: it already refuses `requestCleartextThrew`; citing the host's message would break the guarantee that what a passphrase-hearing host function throws is replaced, never kept.
- `damaged_lease` used for a damaged lease row, not a new `bad_lease`: same thing, existing kind, and the damaged-is-the-row-alone ruling.
- `UNANSWERED` used, not `HUNG`: nothing hung; these refusals come before any request is sent.
- `listLeases` still sets a damaged row aside: refusing the list would make a vacate revoke no lease at all.
