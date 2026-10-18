---
name: turbochat
description: Run turbochat -- an "Open Matters" tab in a Claude Doc where the Coach answers many open questions at once, a row per matter with an answer box and a state chip. Sets the tab up, and on "go" acts on every row the Coach has flipped. Use when the Coach invokes /turbochat, asks for open questions to be gathered into a doc, or says "go" on an Open Matters tab.
argument-hint: "[setup | go] [clarifications]"
---

# Turbochat

Chat takes one question at a time, and a long session's open questions bury each other. Turbochat
moves them into an **Open Matters** tab: one row per matter, a box for the Coach's answer, and a
state chip. The Coach works down it at their own pace, from any device, and agents act on the
rows they have flipped. It is closer to chat than to a record: a ruled row moves to a
*Resolved* tab, swept into a resolutions file at the end, and what it settles is written where it
usually goes (a plan in `whiteboard/`, a note in `human/`, a TODO entry, a PR), with the ruling
carried back to where it was asked (*Carrying a ruling back*, below).

The Coach's words after the command: `$ARGUMENTS`. They are clarifications, and they win where
they conflict with this file.

## The tab

It lives in the doc the session already keeps (usually a sprint's), ordered first, so it is the
tab that opens. With no doc in the session, birth one named for the work. Load the Docs guide
(`topic.index`, `topic.editing`, `topic.tabs`) before the first write of a session: the surface
moves.

* **A lead**, a few lines long, saying what each state does.
* **The matters table**: `Coach answer | State | Matter`. *Coach Answer* is the Coach's and starts
  empty. *State* is a dropdown chip over one enum per doc, `State`, whose options are `drafting`,
  `proceed`, `explain`, `elevate`, and `noted`, in that order; every row is born `drafting`. *Matter* is the
  agents'.
* **Elevated matters**, a table near the bottom: `Matter | Tab`, one row per elevated matter, with
  a mention chip linking its tab.
* **Coach notes**, the last table: `Note | State`, one empty row born `drafting`. It is for
  whatever the Coach wants agents to know outside any matter. The states work the same.

Beside it, a **Resolved** tab: a one-line lead, then a bullet per ruled matter, appended at its
end (*Carrying a ruling back*). Agents write it and never read it, until the sweep.

A doc's dropdown options are append-only: an option can be neither renamed nor removed. So create
the enum with exactly these five options, once. Changing them later means a new enum, and swapping
every chip over to it.

## Writing a matter

One decision per row, and one row per decision: never roll a report's leftovers into one row, even
when they share a Rec. Lead with a bold handle of a few words, then **one to three sentences**: what
the matter is, why it matters, and what we recommend (**Rec:**). End with where it was raised
(`(#129)`, `(thread 7)`, `(human/…)`), so its ruling can be carried back. Write in language a little
less technical than the whiteboard's, so the Coach can answer without hunting through the files
behind it. A row that waits on the Coach's own action rather than their word (try it on a real
device, delete a file on their machine) starts **For coach:**. Inside a cell a PR is `#N`; in chat,
link it in full.

Agents may rewrite any *Matter* cell whenever they like. *Coach answer* is the Coach's only place
to speak, and agents never edit it.

When setting up, gather widely: TODO's open sections, the done and rulings notes in `human/`, the
reviews' leftovers, PRs left open, flakes CI met, housekeeping. Leave out another session's open
questions, and say so in the lead.

## The states

* **drafting**: the Coach's, possibly half written. Pass over it. Don't act on it or quote it; and
  if one is read by accident, that is no cause for alarm or a halt: it is simply not yet a request.
* **proceed**: sweep the row, and act as if the Coach had said in chat what *Coach answer* says
  (when it is empty, they took the Rec). The work goes where work goes: a thread in a sprint plan,
  a TODO entry, a worker you start, a commit on an open PR. The row then moves to *Resolved*.
* **explain**: bring in more of the explanation that already exists. Hand the matter to a cheap,
  fast subagent (`haiku`, or `sonnet` for a knotty one) with the whiteboard and `human/` files
  behind it, and more if they would help, and have it write the fuller *Matter* cell: still plain,
  a few sentences more. Put that in, reset the chip to `drafting`, and leave *Coach answer* as it
  was. When the Coach wants it grounded further, they say so in *Coach answer* ("resummarize from
  the code and more of the whiteboard") and flip it to `proceed`; then that is the work.
* **elevate**: sweep the row into a tab of its own, nested under Open Matters, and add a row to
  *Elevated matters* pointing to it. The tab is for the Coach to hand to an agent in another
  session, to discuss (below).
* **noted**: treat this as you would **drafting**

The chip is the only signal. An answer whose chip still says `drafting` is still drafting.

## When to read it

The Coach says "go" when they want something fast-tracked, or when a good batch is waiting. The
session that keeps the doc may act on flipped rows whenever it is there.

**That session keeps the tab.** In a sprint it is the orchestrator: a row that proceeds into a
thread goes into that thread's handoff as text -- the matter and the Coach's answer, or a
snapshot file in the sprint directory -- and the orchestrator moves the row to *Resolved* once
the work is under way. Other agents send what belongs in the tab -- a new matter, a row they have
settled -- to the session that keeps it, rather than writing it themselves.

1. **Read the tab once** per pass. A doc read returns that tab alone, not the session.
2. **Act on every flipped row** in that pass. Investigation goes to subagents, so the code they
   read stays out of the session's context and only their paragraph comes back; independent
   proceed work goes to workers or threads at once, carrying the row's text, not the doc.
3. **Edit by id, cell by cell.** Make every write from that one read, against the ids it gave:
   replace one *Matter* cell's paragraph, one chip's paragraph, or delete one ruled row. Each
   replace or delete of a whole block carries the guards that read printed for it, `ifHash` (its
   `h`) and `ifRev` (the read's rev). If the Coach has changed the block since, the write is
   refused rather than overwriting them: re-read that block and redo just that edit. Never
   re-read to check what you wrote, and never re-send the whole table. To reset a chip,
   `replace` its paragraph `"as":"markdown"`, content `<?claude block st?>`, with the chip in the
   `blocks` map (`{"st":{"type":"dropdown","enum":"<State enum id>","index":0}}`): an
   `"as":"blocks"` replace keeps the old chip beside the new. *Resolved* takes an insert at its
   end, with no read.
4. **Add new matters** as they surface, `drafting`, at the bottom of the matters table. Every open
   question an agent of the session reports (a worker's or reviewer's *Open matters*, a
   subagent's leftover) reaches the tab, put there by the session that keeps it. Leaving one out
   is a decision: say why in chat.
5. **Report in chat** in a few lines: what proceeded and where it went, what was explained, what
   was elevated. Don't repeat the answers: the Coach reads them in the doc.

Rows of *Coach notes* flipped to `proceed` are folded in where they belong (a plan's ground rules, a
memory, a TODO) and swept the same way.

Never ask the Coach to leave a doc comment for Claude: each one wakes the session as a full turn,
carrying all of its context. Typing in cells costs nothing until the next pass.

### Carrying a ruling back

When a matter is ruled (`proceed`, or an answer in chat), beside acting on it:

* **Resolved**: delete the row, and append a bullet to *Resolved*: the handle, the matter as the
  row put it, the Coach's answer word for word ("(empty: took the Rec)" on an empty `proceed`),
  the date, where it was raised, and where the work went.
* **The PR** it was raised on: `gh pr edit` puts `→ *Coach (YYYY-MM-DD):* <the ruling, briefly>`
  beside the question in its description, the question left in place. A question raised only in
  a file needs no line there: *Resolved* is the record.
* **At the end** of the sprint or session, a `sonnet` subagent reads *Resolved* once, writes it
  into the resolutions file, newest batch first -- in a sprint, `<sprint_name>-resolutions.md` in
  its directory; otherwise `YYYYMMDD-<label>-resolutions.md` in the session's whiteboard
  directory -- and clears the tab.

## An elevated matter's tab

Written for an agent in another session that has the repo and this tab and nothing else; it
reads the tab with the Claude Docs tools, given the doc's link. Text and bullet points, no
tables, so the Coach can write between the lines:

* **Where it stands**: what the tab assumes (usually main, after a named merge), with paths, line
  ranges, and PRs linked in full.
* **What's built**, **its weight** (what it costs), **what it's for**, **the options** lettered,
  **what each gives up**, and **the recommendation**.
* **Coach thoughts**: a last heading with one empty bullet, for the Coach.

Keep the tab true when what it describes changes (a merge, a rename): the session it is handed to
has no other memory of it.

## Keeping it cheap

A read comes back as XML with an id and a hash on every paragraph, cell and run of text, so it
costs about four times the tab's visible text: 25 matters came to about 10,000 tokens. That is why
ruled rows move to *Resolved*, which nothing reads until the sweep, elevated matters move to their
own tabs, and cells stay at three sentences.
Still, the tab is small next to the session: what costs more is the session's own context,
re-sent on every turn. So the session that
runs turbochat should be a lean one: once the matters that need a long session's memory are
drained, the doc and the repo carry the rest, and a fresh session with this skill and the doc's
link picks up from there.
