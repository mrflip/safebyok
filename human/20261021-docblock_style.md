# 2026-10-21: Doc-block rules and the documentarian agent -- three questions open

The branch `claude/brave-hamilton-5kqewj` puts the first-line rule in CLAUDE.md, the test,
proportion, refusals and voice rules plus a before/after pair in STYLE.md, and a `documentarian`
agent in `.claude/agents/`.

1. Answered: STYLE.md now shows "lead with what it is" as an example pair, not a bare rule.
2. `@param`: left as STYLE.md has it. My proposal was "only for what the name and type can't say".
3. The putBox postcondition you dictated mentions its return value; putBox resolves `void` today,
   so the agent's example leaves the return value out.
4. The branch is harness-named, not `YYYYMMDD-<label>`, so the changeset was named by hand.
