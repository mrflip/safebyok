# The transition to the new core

How to work while the new core, `packages/safebyok`, is built from `safebyok-big`, the old core, a piece at a time
(CLAUDE.md, *The move to a new core*). This file goes away when big does.

## Exports

The new core's public interfaces have not been settled, and will not be settled in advance. Export a new thing from the
new core when it is helpful, when big exports its counterpart, or when you choose to. Say what you exported in your
report and your PR, and go on: nobody needs to acknowledge or approve it.

When a host, or a signature the new core exports, needs something big defines (`VaultError`, a logger, a shape, a type a
field names), re-export it from the new core's entry point (`safebyok`, `safebyok/core`, `safebyok/storage`). Never
redefine it, since a copy would split one class in two. Say so in the PR.

## Using what big has

When the new core needs a facility from big:

* **a helper**: port its file into the new core.
* **anything it can share directly**: have big export it, through `safebyok-big/internals`. Making that export is the
  only change big's code takes.

Never reimplement something in a different way just because big does not export it, or because nobody planned to port
it.

## `notes/security.md`

For now, `notes/security.md` covers both packages. The usual process applies: a `sonnet` subagent records any new
findings in the file, following the file's header, and you report what the subagent says. Do not then direct it to
rewrite old entries, including ones that describe code the new core has since replaced. An addition is not an open
question: no human needs to acknowledge or approve it.
