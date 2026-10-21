# 2026-10-21: docfix1_stores -- adapter doc blocks rewritten, two code/prose disagreements

A documentarian pass over the postgres, convex, indexeddb and graphql adapters: 1149 → 817
doc-block lines, doc blocks only. The PR lists every dropped fact. Open questions:

1. **Convex box limit.** `tallies.ts` said `MaxVaultBoxes` is twice the most a client's
   `maxBoxes` can be, but `convexVaultDB` declares `maxBoxes = MaxVaultBoxes`, and a vault with a
   tiny `maxWhisperBytes` can open at 8,000. I dropped the claim without changing behaviour.
   Should `convexVaultDB` declare half?
2. **GraphQL "never a record".** The resolvers' doc said no record crosses with a refusal. The
   code sends a stale write's `box_stored` in `extensions.meta`. The doc now says so. Is that in
   `notes/security.md`?
