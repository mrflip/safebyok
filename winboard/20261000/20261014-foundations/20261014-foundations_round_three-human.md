# 2026-10-14: Round three -- library-first sharpened, demo renamed, history rewritten

* **Guidance strengthened** (CLAUDE.md *Non-Negotiables*, PROCESS.md *Dependencies*): the small
  utility is named as the trap -- "it's only a dozen lines" now reads as the argument for the
  proven package, and the Coach's yes comes before a hand-roll exists. Strengthened, not
  forbidden. Practicing what it preaches: `src/stable-jsonify.ts` is now a thin alias of
  `safe-stable-stringify` (^2.5.0, the one you named; joins zod as a runtime dependency, noted in
  `notes/security.md`).
* **Demo renamed `safebyok-demo-react`**, `demo:` prefix in PROCESS.md (was `demos`), and the root
  gained `pnpm demo:react` (builds safebyok, starts the demo) -- which I read as the answer to round
  two's build-first-loop question.
* **React lint stack** installed in the demo (react, react-hooks, react-refresh, jsx-a11y) and
  the React-relevant subset in `packages/safebyok-react`; findings corrected.
* **History rewritten** into logical commits -- docs, library, binding, demo -- and
  force-pushed with lease to [#3](https://github.com/mrflip/safebyok/pull/3); the round-one demo
  commit is folded into the final demo.

Still open from round two: zod peer-vs-dep, the `api:` prefix for safebyok-react, whisper strictness.
