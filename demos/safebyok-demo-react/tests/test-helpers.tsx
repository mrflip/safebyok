/** The demo's test helpers, star-imported as `TH`. Re-exports `safebyok/testing`, and adds helpers to render a component inside a BankProvider with in-memory storage, watch the vault beside it, fill in the provider's dialogs, and fake Anthropic. */
import type { ReactNode } from 'react'
import { expect, onTestFinished, vi, type MockInstance } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryDeviceDB, type VaultSnapshot } from 'safebyok'
import { MemoryVaultDB } from 'safebyok/storage'
import { Passphrase, anyStrengthChecker, quietLogger, testDeriver } from 'safebyok/testing'
import { BankProvider, useBank, useVault, useVaultSnapshot } from 'safebyok-react'
import { SessionBar } from '../src/components/SessionBar'
import { useSession } from '../src/hooks/useSession'
import { JokeModel } from '../src/lib/anthropic'
import { createAuth, type Auth } from '../src/lib/auth'
import type { StringStorage } from '../src/lib/string-storage'

export * from 'safebyok/testing'

/** Render `ui` inside a BankProvider signed in as `user_id`, with a fresh in-memory vaultDB and the cheap test deriver. Returns that `vaultDB`.
 *
 * @example TH.renderInBank(<><SessionBar auth={auth} /><TH.VaultProbe /></>)
 */
export const renderInBank = (ui: ReactNode, user_id: string | null = 'u1') => {
  const vaultDB = new MemoryVaultDB()
  render(
    <BankProvider
      user_id={user_id} banklabel="acme" vaultDB={vaultDB} deviceDB={new MemoryDeviceDB()}
      keyDeriver={testDeriver} strengthChecker={anyStrengthChecker} logger={quietLogger}
    >
      {ui}
    </BankProvider>,
  )
  return { vaultDB }
}

/** Make a fresh, empty in-memory StringStorage for the fake auth under test. */
export const memoryStorage = (): StringStorage => {
  const texts = new Map<string, string>()
  return {
    get: (ckey) => texts.get(ckey) ?? null,
    put: (ckey, text) => { texts.set(ckey, text) },
    del: (ckey) => { texts.delete(ckey) },
  }
}

/** Make a fake auth over fresh in-memory storage. */
export const makeAuth = (): Auth => createAuth({ banklabel: 'acme', dbStorage: memoryStorage(), deviceStorage: memoryStorage() })

/** The SessionBar as a page renders it, given the live session from `auth`. */
export const LiveSessionBar = ({ auth }: { auth: Auth }) => <SessionBar auth={auth} session={useSession(auth)} />

/** Type `userlabelText` into the sign-in strip and press Sign in. */
export const signInAs = (userlabelText: string) => {
  fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: userlabelText } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

/** Wait for the passphrase dialog, type `passphrase` (twice if the dialog asks to confirm it), and submit. */
export const answerPassphraseDialog = async (passphrase = Passphrase) => {
  const field = await screen.findByPlaceholderText('vault passphrase')
  fireEvent.change(field, { target: { value: passphrase } })
  const confirmation = screen.queryByPlaceholderText('confirm vault passphrase')
  if (confirmation !== null) { fireEvent.change(confirmation, { target: { value: passphrase } }) }
  const form = field.closest('form')
  if (form === null) { throw new Error('the passphrase dialog has no form to submit') }
  fireEvent.submit(form)
}

/** Wait for the change-passphrase dialog, type `antePassphrase`, then `nextPassphrase` twice, and submit. */
export const answerReplacementDialog = async (antePassphrase: string, nextPassphrase: string) => {
  const field = await screen.findByPlaceholderText('current passphrase')
  fireEvent.change(field, { target: { value: antePassphrase } })
  fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: nextPassphrase } })
  fireEvent.change(screen.getByPlaceholderText('confirm new passphrase'), { target: { value: nextPassphrase } })
  const button = within(screen.getByRole('dialog')).getByRole<HTMLButtonElement>('button', { name: 'Change passphrase' })
  await waitFor(() => { if (button.disabled) { throw new Error('the strength check has not answered') } })
  fireEvent.click(button)
}

/** Wait for the delete-vault dialog, type `passphrase`, and press Delete vault. */
export const answerDeletionDialog = async (passphrase = Passphrase) => {
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete vault' }))
}

/** Wait for the add-passkey dialog, type `passphrase`, and press Add passkey. {@link installFakeAuthenticator} answers the browser's own prompt. */
export const answerPasskeyAddDialog = async (passphrase = Passphrase) => {
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add passkey' }))
}

/** Wait for the remove-passkey dialog, type `passphrase`, and press Remove passkey. */
export const answerPasskeyRevokeDialog = async (passphrase = Passphrase) => {
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove passkey' }))
}

/** Make the browser appear to support WebAuthn for the current test. Its fake authenticator creates passkeys immediately, each with random PRF output. */
export const installFakeAuthenticator = () => {
  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential)
  Object.defineProperty(navigator, 'credentials', { value: { create }, configurable: true })
  onTestFinished(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'credentials')
  })
}

/** The fake authenticator's `navigator.credentials.create`: resolves a new passkey with random PRF output. */
const create = () => Promise.resolve({
  type:                      'public-key',
  rawId:                     crypto.getRandomValues(new Uint8Array(16)).buffer,
  getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: crypto.getRandomValues(new Uint8Array(32)) } } }),
})

/** A stand-in for the browser's PublicKeyCredential. Its presence is how code detects WebAuthn support. */
class FakePublicKeyCredential {
  readonly type = 'public-key'
}

/** Wait, inside React's act, until every call recorded by the `prompting` mock has settled and the handler awaiting it has run. */
export const settlePrompts = async <PromptT extends () => Promise<unknown>>(prompting: MockInstance<PromptT>) => {
  // The handler awaited each promise before this helper did, so the handler's continuation runs first.
  await act(async () => { await Promise.allSettled(prompting.mock.results.map((result): unknown => result.value)) })
}

/** One request recorded by {@link fakeAnthropic}: its URL, the API key it carried (the SDK sends it as a bearer token), and its body. */
export type AnthropicRequest = {
  url:    string
  apiKey: string | null
  body:   { model: string, messages: unknown[] }
}

/** Make a fake of Anthropic's messages endpoint, as a `fetch` function. It records every request and replies with `status`:
 * at 200 a message whose text is `jokeText`, and at any other status an authentication error.
 * Pass its `fetchFn` to the code under test, or stub the global `fetch` with it. `seen` lists the requests so far.
 *
 * @example
 *   const anthropic = TH.fakeAnthropic(200, 'Banana who? Banana split, gotta run!')
 *   await tellKnockKnockJoke('sk-ant-fake-key', 'Banana', anthropic.fetchFn)
 *   anthropic.seen[0]?.apiKey  // => 'sk-ant-fake-key'
 */
export const fakeAnthropic = (status: number, jokeText = '') => {
  const seen: AnthropicRequest[] = []
  const reply = status === 200
    ? {
      id: 'msg_fake', type: 'message', role: 'assistant', model: JokeModel,
      content: [{ type: 'text', text: jokeText }],
      stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
    }
    : { type: 'error', error: { type: 'authentication_error', message: 'invalid API key' } }
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    seen.push({
      url:    request.url,
      apiKey: request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null,
      body:   JSON.parse(await request.text()) as AnthropicRequest['body'],
    })
    return Response.json(reply, { status })
  }
  return { fetchFn, seen }
}

/** `'locked'` or `'unlocked'` for a vault snapshot, or `'none'` when there is no snapshot. */
export const lockWordOf = (snapshot: VaultSnapshot | null): string => {
  if (snapshot === null) { return 'none' }
  return snapshot.isLocked ? 'locked' : 'unlocked'
}

/** A probe to render beside a component under test. It shows the 'main' vault's stage and lock as `<stage> <locked|unlocked|none>`,
 * with an Open button that builds or unlocks the vault through the provider's dialog, and a Lock button.
 *
 * @example TH.renderInBank(<><SessionBar auth={auth} /><TH.VaultProbe /></>)
 */
export const VaultProbe = () => {
  const bank = useBank()
  const { stage, vault } = useVault('main')
  const snapshot = useVaultSnapshot('main')
  const open = async () => {
    if (bank === null) { return }
    const ensured = await bank.tryEnsureVault({ vaultlabel: 'main' })
    if (ensured.ok) { await ensured.val.tryEnsureUnlocked() }
  }
  return (
    <p>
      <span data-testid="vault">{`${stage} ${lockWordOf(snapshot)}`}</span>
      <button type="button" onClick={() => { void open() }}>Open</button>
      <button type="button" onClick={() => { vault?.lock() }}>Lock</button>
    </p>
  )
}

/** Wait until the {@link VaultProbe} shows `shown` (such as `'present unlocked'`). Fails if it never does. */
export const expectProbe = async (shown: string) => {
  await waitFor(() => { expect(screen.getByTestId('vault').textContent).to.eq(shown) })
}
