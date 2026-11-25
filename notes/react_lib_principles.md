# Principles of the React library

What the Coach and the react_targets workshop settled about `safebyok-react` and its demos, in November 2026.
`docs/react-overview.md` has the layers and the supported targets; the four `docs/guide-*.md` sketch the interface each
audience is promised. This note is the reasoning behind them, for whoever changes the library next.

## You can have nice things

Nothing in the demos is exotic. Every feature of React and of TanStack Query is available to a host that uses the hooks,
the parts and the kit **correctly**. Where a feature is not, suspect first whatever we do that is not vanilla, and mend
that, before telling a host it cannot have the feature.

Three lines of React's manual shape how we meet this. None forbids a feature a demo needs.

* **Transitions batch together.** Nothing a second Action does can show while a first is still pending. So a form the
  library opens beneath a waiting caller runs on ordinary state (*The unlock dialog*, below).
* **A form's uncontrolled fields are reset after its action returns.** Anything of ours that tracks what such a field
  contains hears the form's `reset`: `useDraft` does, and so do the kit's new-passphrase forms.
* **An update from `useSyncExternalStore` is never a transition.** A stage change that reveals a suspending subtree
  shows its fallback (`notes/wontfix.md`).

## Do not bend a sound implementation to a thorny edge

An agent that meets a hard case tends to propose machinery for it. Refuse the machinery when its cost is out of
proportion: ask what the plain version of the code does, what we do that is not plain, and what fails, how, and with
what consequence. A case that loses typed text and corrupts nothing is a row in `notes/wontfix.md`. Refused on these
grounds: a `draft.saveAction`; `putBoxAction` handing a refused form its fields back; a check that the bundler wrote
`'use client'`.

An idiom is not machinery. The package and demos are what customers copy, so write React as React's docs teach it,
everywhere: an effect's cleanup ignoring a stale result, a keyed reset, an event handler where an effect is not needed.
Where such an idiom closes a crossing in a line or two, it beats a row in `notes/wontfix.md`. A counter, a token, a
lock or a new state is still machinery, and still a row.

## The layers, and what each owes a host

* **A demo is a pure exercise in one modality**, and passes the niece test: "would you offer it to your niece as an
  exemplary starting point?" Knock-Knock is plain hooks over React Query, every submit a mutation. Envman is Actions,
  every form a form Action. Not twelve demos, and never one written against the grain of its modality to prove a point.
* **The hooks and the parts support each modality fully**, offering more than one of a thing where a modality needs its
  own: `putBoxAction` for an Action and `putBoxMutation` for a mutation; a `SubmitButton` that serves either.
* **The kit is done once: right, and simply.** It is the best demo of the library. Its forms are Action forms as far as
  is reasonable.

## The unlock dialog

It is the one form the library opens by itself, from deep in the code to the front of the page, while a caller waits
(`await withWhisper(…)`). That is a stack: the caller is the outer layer, and may be a pending Action. So the dialog is
the standard library-opened modal: a call that returns a promise, one modal mounted at the root, running on its own
ordinary state.

Of these properties, have every one that can be had, and where they cannot all be had, drop from the left:
**operates like the other forms, Action-like, simple, low potential for interaction, well-behaved, easy to reason
about, secure.** Today only "Action-like" is dropped. Uniformity is the first thing given up, and security the last.

## Secrets

* **A secret never reaches anything React or TanStack retains**: not state, not a query's `data`, not a mutation's
  `variables`, not the `FormData` an action leaves behind. A whisper is read inside a callback, or typed into an
  uncontrolled input. `popField` returns a form field's text and deletes the field, and is called before the first
  `await`.
* **Cleartexts and semi-cleartexts are seen only within private methods of gating, proving and lease.** The threat this
  answers is an agent filing bug reports, not an attacker in the page: a small horizon lets a reviewer finish. It may
  be loosened where a React interface needs it, and only then.
* **A host's function is wrapped once, where it is handed in** (`bulletproofHandlerOf`), and the host is offered no
  option on how. An `Error` the host throws reaches it as thrown: a host's own error handling depends on that.
* **Never change a host's object**, even to redact it.
* **Trust TypeScript for errors.** The few places that can truly expect an error from outside (a host's callback, an
  adapter, a checker) make it an `Error` where the outside function is handed in. A `catch` that puts its `unknown` into
  something we type `Error` wraps it there, once, in place of a cast. Nothing else is wrapped.
* How errors are routed and redacted is not settled (`whiteboard/20261122-react_targets/react_targets-burndown.md`).

## Words

* **Modality**: one way of writing React that a host has chosen: plain hooks over React Query, Suspense and Actions,
  the Next.js App Router, headless.
* **Action**: an async function React runs and tracks. A **form Action** is one started by submitting a form
  (`<form action={fn}>`): no submit handler, no pending flag and no error state written by hand.
* **Transition**: React's low-priority lane, which every Action runs in. An **urgent update** is an ordinary state
  change, shown at once whatever transitions are pending.
* **Uncontrolled field**: an input whose text React does not have in state.
* **Mutation**: TanStack's tool for the same job as an Action, started from any event and tracked by urgent updates.
