# Worker context: a saving held in reserve (2026-10-30)

`thread-worker.md` carries `disallowedTools: Artifact`, commented out: the Artifact tool's schema
is about 10k tokens on every turn of every worker, and a worker publishes nothing. The Coach chose
to keep the tool for now. If it is turned on, check one worker's transcript on the next sprint:
its first `api-request-shape` line should list no tool named `Artifact`
(`jq -r 'select(.type=="api-request-shape") | .shape.tools[].name' <agent>.jsonl`). No probe
has yet confirmed the field takes.
