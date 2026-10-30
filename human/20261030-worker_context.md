# Worker context: one check after merge (2026-10-30)

`thread-worker.md` now has `disallowedTools: Artifact`. A probe could not confirm it takes the
Artifact tool away (a fresh user agents folder was not picked up mid-session). On the first sprint
after merge, check one worker's transcript: its first `api-request-shape` line should list ten
tools, none named `Artifact`:
`jq -r 'select(.type=="api-request-shape") | .shape.tools[].name' <agent>.jsonl | head -12`.
If `Artifact` is still there, the denylist did not apply, and the 10k a turn is not saved.
