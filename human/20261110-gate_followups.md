# 20261110-gate_followups: open questions

PR [#624](https://github.com/mrflip/safebyok/pull/624), branch `20261110-gate_followups`.

1. **Gating rewrite**: proposed as a thread of its own. One object per gating kind, holding its prove and run side by side;
   launch as `Gating.launchOn(vault, kind)` and `launchBirth(listing, scope, prior)`; drop `#gatingFriend` if G9 allows;
   keep the attempt state machine as it is. Waiting for a go.
2. **`revokePasskey` semantics**: carried over from #621, still held.
