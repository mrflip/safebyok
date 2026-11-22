# Guide: Next.js App Router

For a host on Next.js 16. It adds to the [plain-hooks guide](guide-react_query.md): the hooks, the
stage, `useVault()` and the three rules are as there, and the [Suspense guide](guide-suspense.md)'s
Actions work unchanged. A pencil sketch; *Not built yet* is at the foot.

## What runs where

* **The vault runs in the browser, and only there.** Keys are derived, and whispers unsealed, on the
  user's device. Your server stores and serves ciphertext, and never sees a passphrase or a key.
* **On the server, the provider does nothing.** It renders its children at stage `'starting'`, and
  the first render in the browser shows the same, so hydration matches. Everything past the stage
  switch renders in the browser only: no vault record is fetched, suspended on or streamed by the server.
* **`<form action>` here is a client Action.** Never put `'use server'` on a function that is handed
  a passphrase or a whisper: that sends it to your server.
* **Every entry point of the package is a client module** (`'use client'`), so a Server Component may
  import and render a part or a kit form directly.

## The root

```tsx
// app/layout.tsx: a Server Component. It knows who is signed in, and nothing else about the vault.
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const session = await auth()                           // your auth library's
  return <html lang="en"><body><Providers userid={session?.user.id}>{children}</Providers></body></html>
}

// app/providers.tsx
'use client'
export function Providers({ userid, children }: Readonly<{ userid: string | undefined, children: ReactNode }>) {
  const queryClient = getQueryClient()                   // TanStack's recipe: one per request on the server, one for the page in the browser
  return (
    <QueryClientProvider client={queryClient}>
      <SafebyokProvider userid={userid} vaultDB={vaultDB} keyDeriver={argon2idWebV1Deriver}>{children}</SafebyokProvider>
    </QueryClientProvider>
  )
}

// lib/vault-db.ts: imported on the server too, so making it touches no browser global. It first reaches out when the device starts.
export const vaultDB = fetchVaultDB('/api/vault')
```

## Storage: your backend has only ciphertext

```ts
// app/api/vault/route.ts: the server half. Each request is one of the vaultDB's own verbs, for the signed-in user's bank only.
export const POST = vaultRouteHandler({
  vaultDB:   postgresVaultDB(pool),
  getUserid: async () => (await auth())?.user.id,       // none: 401, and nothing is read
})

// Or Server Functions in place of a route. Good for writes, which are rare; a watch still needs a route that streams.
// app/vault-functions.ts
'use server'
export async function vaultCall(ask: VaultAsk): Promise<VaultAnswer> { return serveVaultAsk(postgresVaultDB(pool), await requireUserid(), ask) }
// lib/vault-db.ts
export const vaultDB = serverFunctionVaultDB(vaultCall)
```

## One API key

```tsx
// app/chat/page.tsx may stay a Server Component: it renders client components that use the vault.
export default function ChatPage() { return <><h1>Chat</h1><Chat /></> }

// components/chat.tsx
'use client'
export function Chat() {
  const vault = useVault()
  const stage = useBank((b) => b.stage)                  // 'starting' on the server and on the first render in the browser
  // The request goes from the browser to the model's API: your server never sees the key.
  const ask = useMutation({ mutationFn: (prompt: string) => vault.withWhisper('openai', ({ apiKey }) => callOpenAI(apiKey, prompt)) })
  if (stage === 'starting') { return <Skeleton /> }
  …
}
```

A model API that refuses calls from a browser leaves one choice: hand the key to a Server Function
inside the callback, `vault.withWhisper('openai', ({ apiKey }) => askOnServer(apiKey, prompt))`.
Your server then sees the key for the length of that request. Tell your users, and log nothing of it.

## Doppler-lite: many secrets, each with settings

```tsx
// app/secrets/page.tsx: the shell and its headings come from the server; the list is the browser's.
export default function SecretsPage() { return <><h1>Secrets</h1><SecretList /><UnlockDialog /></> }

// A sidecar is readable while locked, and it is still the user's: it is fetched in the browser, by the vaultDB, as the user.
// Never read the vault's rows in a Server Component to render titles: that puts them in the page your cache may retain.
```

## A password manager that never leaves the device

```tsx
// next.config.ts: no server at all. The vault is in IndexedDB, and the app is static files.
export default { output: 'export', reactCompiler: true } satisfies NextConfig

// app/providers.tsx
<SafebyokProvider userid="local" vaultDB={idbVaultDB()} keyDeriver={argon2idWebV1Deriver}>{children}</SafebyokProvider>
```

## Settings that matter

* **React Compiler** (`reactCompiler: true`): supported. The package follows the Rules of React.
* **Content Security Policy**: the key deriver is plain JavaScript, so no `'wasm-unsafe-eval'` is
  needed. A model API called from the browser needs its origin in `connect-src`.
* **Secure context**: the vault refuses to start outside HTTPS or `localhost`.
* **`proxy.ts`**: protects your pages and `/api/vault` as it does any route. The vault adds no rule of its own.
* **Caching** (`'use cache'`, Cache Components): nothing of the vault is rendered on the server, so nothing of it is cached there.

## Not built yet

* `fetchVaultDB`, `vaultRouteHandler`, `postgresVaultDB`, `serverFunctionVaultDB`, `idbVaultDB`: no
  adapter is ported to the new core. The demos' vault lives in `localStorage`, read as the module loads.
* React Compiler: parts and kit call hooks handed to them as props, which the Rules of React forbid.
