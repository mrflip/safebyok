# React overview

`safebyok-react` is the React layer over `safebyok`'s core engine, with React and TanStack
Query v5 as peer dependencies. Each audience under *Supported Use Cases* has a guide: a pencil
sketch of the target interface.

## Supported targets

* **React 19.0** and later. Nothing in the package may need a later minor.
* **ES2022** output.
* **Next.js 16**, the LTS line, on the App Router.
* **Node 22 to Node 26**, for builds, tests and server rendering.

## The Three Toolkit->Turnkey Targets

The package has three layers, each built on the one before. A host stops at whichever suits it:
the hooks alone for full control, the kit for a working screen in an afternoon.

* **`hooks`** (`safebyok-react`, in `src/giver/`): the low-level hooks, over the host's own
  React Query. `reactGiver(config)` is made once at module scope; its `Provider` says who is signed
  in. Beneath it: `useWorld` for the stage a screen switches on, `useBox`, `useBoxList` and `useGate`
  for stored records, `withWhisper` for the one place a secret is read, `putBoxOnce`, `delBoxOnce`
  and `putBoxAction` for writes, `useDraft` for an editor, and a mutation for each form verb
  (`useUnlock`, `useBirth`, `useReplacePassphrase`, `useAddPasskey`, `useRevokePasskey`).
* **`parts`** (`safebyok-react/parts`): best-practice components for one field each, with no
  opinion on layout. `PassphraseInput` and `WhisperInput` are uncontrolled inputs with Show / Hide;
  `WhisperText` reveals a field of a whisper on request; `WhisperMask` shows its mask, with the
  tail while unlocked; `SubmitButton` disables itself while its form's action runs. A part writes
  a secret into the page, never into React's state.
* **`kit`** (`safebyok-react/kit`): prefabricated forms for a fast start, assembled from the
  parts over the hooks. `CreateVaultForm`, `UnlockForm` and `UnlockDialog`, `ReplacePassphraseForm`,
  `AddPasskeyForm`, `RevokePasskeyForm` and `PasskeyUnlockButton`, with `useNewPassphrase`, the
  passkey helpers and `ModalDialog` for a host's own forms.

Each demo is a pure exercise in one modality: Knock-Knock is plain hooks over React Query, envman is
Actions. The hooks and the parts support each modality fully, with a tool for each where a modality
needs its own (`putBoxAction` for an Action, `putBoxMutationOptions` for a mutation), and the kit is done
once. The reasoning is in [the principles of the React library](../notes/react_lib_principles.md).

## Supported Use Cases

| Who                                                                          | What they ask for                                                                                               | Cost                                                                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Plain-hooks majority](guide-react_query.md) (TanStack, Clerk, wagmi habits) | `import { useBox }` plus a provider, not `Knock.useBox()`                                                       | Near zero once each hook is a module-level function that reads context; the namespace stays as the typed binding                                 |
| [Suspense and `use()` users](guide-suspense.md)                              | `useSuspenseBox`                                                                                                | Small: `skipToken` cannot go to `useSuspenseQuery`, so the fetch refuses when the bank is not up; rendered under the stage switch it never fires |
| [Next App Router](guide-nextjs.md)                                           | Well-behaved provider & adapters, `<form action>` is a client action (`'use client'` on each entry point: done) | Small                                                                                                                                            |
| [Headless or shadcn users](guide-headless.md)                                | Own markup, styles and words for the kit                                                                        | Small: field hooks, overridable words, or the kit as copy-in source                                                                              |
| Form-library users (react-hook-form, TanStack Form)                          | Registered fields, not `useDraft`                                                                               | No code: `putBoxOnce` exists. A doc paragraph, and accepting that their library has the whisper while it is typed                                |

### React 18

Not supported. Supporting it would mean a second copy of every part and kit form: they are built on
React 19's form actions (`<form action>`, `useFormStatus`, `useActionState`), `ref` as a prop and
ref cleanup functions, none of which React 18 has. A baseline implementation would start by
lowering the floor of the hooks alone, which need two changes: `<Context.Provider>` in place of
`<Context value>`, and a `useDraft` ref that handles null in place of a cleanup. The parts and the
kit would stay on React 19.

### SWR, Apollo, Redux

The hooks read records through TanStack Query, so a host on another data library runs the two side
by side: it adds a `QueryClientProvider`, and safebyok's records stay out of its own cache. Reading
a box through SWR, Apollo's cache or a Redux store is not supported. A host whose backend speaks
GraphQL stores its vault through that API with the GraphQL adapter,
[`safebyok-graphql-big`](../packages/safebyok-graphql-big), which carries the storage interface over an
urql Client. It is built on `safebyok-big` today, and is not yet ported to the new core.
