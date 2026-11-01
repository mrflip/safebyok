# Ruling: the strength checker (the Coach, 2026-10-19), for B4

*Orchestrator:* the matter, as the *Open Matters* row put it: "The strength checker's name and
whether it is required. The Contract has an optional `strengthChecker`; the code has a required
`passphraseStrengthTest` option (the rename pass left it for the reform). A default would mean
shipping a strength estimator. Rec: B4 renames it `strengthChecker`, required."

An earlier ruling the same day: the strength checker's contract is "return a value saying good or
bad"; any throw from it is an `unexpected_error` naming the function, carrying none of the thrown
value's metadata.

The Coach's answer, word for word:

> safebyok/browser exports one for use. Have the default demonstrate the contract by rejecting
> every password as too weak and logging that the customer must choose a strength tester and refer
> them to a new file CUSTOMIZATION.md.
> In CUSTOMIZATION.md, section "## Pluggable Passphrase Strength Checker", reference
> safebyok/browser and explain that the one there is good but useless without the dictionary.
> Provide a prompt for an AI along the lines of  "I am using the (link to safebyok on npm)
> library. Please help me find a good passphrase strength checker. I'm not satisfied with the
> defaults because (I can't get it to work|I think I'm overriding but it's not treeshaking|I
> already have one I prefer, and want to override | It is too big a package | it's not in my app's
> language | it's too annoying and I just want it to let everything through, I understand the
> risks, you're not the boss of me'"
> (agent generating that prompt should write a good prompt inspired by, but not bound by, what I
> wrote; but leave the last part (..too annoying ... boss of me) as is)

*Orchestrator's reading:* the option is `strengthChecker`, optional. Its default refuses every
passphrase as too weak (a normal "not strong enough" answer, not a throw) and logs once, through
the host's logger, that the customer must choose a strength checker, pointing at CUSTOMIZATION.md.
`safebyok/browser` already exports a checker; CUSTOMIZATION.md says it is good but useless without
its dictionary, and carries the prompt.
