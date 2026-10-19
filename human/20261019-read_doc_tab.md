# 2026-10-19: doc-tab-reader agent -- reading a Claude Doc tab without the base64 retype

`export` is the only cheap way to read a tab, and it returns the file as base64 in the tool
result, so a session must retype it into a shell to decode it. The `doc-tab-reader` agent does
that in its own context and hands back a scratchpad path, a byte count and an outline. CLAUDE.md's
*Notable files* says when to use it.

**What was tried (Thunks tab, 9,911 bytes):** haiku twice and sonnet once, each fetching and
decoding. All three files were byte-identical and matched `data.bytes` on the first attempt. Asked
to count the Principles bullets, haiku said 5 then 12 (the right answer), sonnet said 12; haiku's
second answer also misplaced the *(proposed)* markers. So haiku fetches, the caller reads.

**Findings from the docs guide:** `export` takes `maxBytes` as a ceiling it refuses at (it does
not truncate); `read` has one projection, `outline`; the markdown export comes back base64-wrapped (other formats not tried).

**Skills pointed at it:** CLAUDE.md, `/turbochat` and `/sprint` now say editing or interacting
with a doc loads the docs skill and the guides `topic.index`, `topic.tabs` and (if needed)
`topic.editing`; reading only spawns `doc-tab-reader`. Turbochat's elevated-matter tab is read
that way. Its `go` still uses `read`, which gives the ids and hashes an edit needs; whether the
markdown export keeps the State dropdown chips is untested. The guides run to about 12K tokens
(estimated); a curated copy was weighed and left, as the Docs surface moves.

**Open questions**

* Is an agent enough, or should it also be a skill so `/read-doc` works? I made only the agent:
  a skill is a second file to keep in step, and the CLAUDE.md line already says when to spawn it.
* The agent is not registered in a session already running; the tests used `general-purpose`
  with the same prompt. First use after a restart is its first real run.
* The Coach's uncommitted CLAUDE.md bullet in `/workspace/byok` ("read as markdown") covers the
  same ground and will conflict with this PR's bullet; this one supersedes it.
* A tab much larger than 10 KB is untested: the byte-count check should catch a mistyped copy,
  but a retype of 100 KB may be slow or fail.
