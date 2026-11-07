## Opus, correct to contract:

Run as a general-purpose agent on `model: opus`, in the base checkout, since it edits whiteboard files. Fill in the `<angle brackets>`. Cut a read-only tree first: `git worktree add --detach ../byok-docblock_src origin/main`.

The Coach (the human architect on this repo) has hand-written better doc blocks for some methods, after the old "slop" ones were stripped. Check their draft against the code and correct it.

**Files.** All under `<whiteboard folder>`:

- `<draft file>`: the Coach's draft. This is the file you edit. The Coach may have it open, so re-read it immediately before writing, and make targeted edits rather than rewriting it from an older copy.
- `docblock-needed.md`: new, you create it here. If it already exists, the Coach may have added to it, so keep their additions.

**Source of truth:** `/workspace/byok-docblock_src/packages/safebyok/src/`, read-only, at `origin/main`. Say which commit you read. Follow what a method calls as far as you need to state its contract truthfully. A file's section banners are its table of contents: `rg -n '// == ' <file>`.

**Constraints.**

- Write only those two markdown files. Copy nothing into `src`: the Coach asks for that separately, after reviewing your changes.
- Don't run `git add`, `commit`, `stash`, `checkout` or anything else that moves the index or a branch. The Coach may have staged changes in this checkout, and the staged copy of the draft is their record of the before version.
- Don't change anything under `packages/safebyok-old/`, and don't read `notes/security.md`.

**How to read the draft.**

- **Pairs.** A method appearing twice has the slop block first and the Coach's second. Leave the slop block and its signature byte for byte, even if they're wrong. Work only on the Coach's.
- **Pairs under different names.** Adjacent blocks can be one method under two names, because the Coach wrote a name the code doesn't use, or the method has been renamed since. Decide from the code, and say what you decided.
- **Singles.** A block appearing once is slop: don't touch or check it. The Coach names any exceptions here: `<singles that are the Coach's, or "none">`. Treat those as the Coach's blocks.

**Correcting a Coach's block.** In this order of priority:

1. Make it consistent with the method as implemented. If this conflicts with the next two, it wins, and the Coach will re-edit.
2. Make trivial fixes: JSDoc, typos, a missing Oxford comma.
3. Don't alter the prose materially. Keep their voice and brevity, and make the smallest change that makes it true. An omission isn't an error: don't add a caveat merely because it's true, or restore thoroughness they cut.

Correct the signature on the Coach's block to the code exactly, with defaults, modifiers, `#` and `override`.

Read `/workspace/byok/STYLE.md` *Comments and doc blocks* and *Naming*, and `/workspace/byok/VOCABULARY.md` for any term you touch. Name operations specifically (`ensureVault`, `lock()`), never "the read" or "the write".

**Names ahead of the code.** The draft may name something the code doesn't have yet. Correct the text to today's code, and flag it in your report as "may be an intended change", so the Coach can decide.

**No such method in `src`.** Leave the block's text alone, add a short `<!-- not in src: ... -->` comment above it, and report it. Placeholder text such as "blah blah" stays unless it states something false; report it.

**Examples.** Look at the slop block and the block in the source. Add an `@example` to a Coach's block only if it would save a future agent a lookup or prevent a likely mistake. Most won't qualify, and adding none is a fine result. Correct any you add to run against today's code.

**`docblock-needed.md`.** Add a one-line `# Doc blocks needed` heading, then one `## models/<file>.ts` section each for `<source files>`. List every method in those files the Coach hasn't provided, each exactly once, in file order, in the draft's format: a `ts` fence holding the doc block **exactly as it sits in the source**, followed by the exact signature. Not all of them are slop.

- A method whose only block in the draft is a slop single hasn't been provided, so it belongs here.
- Counts as a method: constructors, statics, public, protected and `#private` methods, getters, setters, `override`s, try forms, and arrow-function members.
- Doesn't count: module-level consts and types, and anything inherited but not written in that file.
- A method with no doc block in the source gets its signature alone. Keep `SLOPDOC:` prefixes as they are.
- The Coach will add to this file by hand, so keep it plain.

**Your report** is relayed to the Coach, who didn't see your working:

1. **Pairs:** one line each, including any under different names and what you decided.
2. **Every non-trivial change, one by one:** the method, what it said, what it says now, and the code that shows why, as `file:line`. Usage, typos and JSDoc formatting don't need listing. Group signature corrections separately. Mark "may be an intended change" where it applies.
3. **Examples added**, and why each was worth an agent's context, or say there were none.
4. **Blocks with no method in `src`**, and placeholder text left in place.
5. **`docblock-needed.md`:** counts per file, and how many had no doc block at all.
6. **Anything you were unsure of**, stated as such. Don't report a claim as verified unless you read the code for it.

## Sonnet(?), migrate changes

5. Backport the **trivial** changes only to my gallant-docblocks file.

## Fable:

Consult  the file `notes/gallant.md`, and my whiteboard's `docblocks-gallant.md` file. I would like to have a full bestiary of slop comments in docblocks-gallant.md for a documentarian, and illustrative examples in gallant.md for general code review and hunt-and-detect agents.

Format the gallant-docblocks file to match notes/gallant's format and register. Don't change the example or my version. Remove ones I didn't rewrite.

Identify, from among the docblock pairs I wrote, any that could illustrate an important lesson the `notes/gallant.md` file currently does not cover.
Move those out of the whiteboard file into the `notes/gallant.md`.
You are permitted to modify the goofus example to best demonstrate the solecism we aim to discourage -- not cartoonishly; a sharpen filter, not a Vogue covershot remake. Edit down to size once the point's been made.


  - vaultDB's addPasskey etc should themselves use VaultDB's putVault via the front door, making their specific additional integrity checks (eg that the gate epoch bumped by one, there's still at least one wayin, that the wayin used to authenticate the other matches what's already stored, etc. This must be done transactionally
