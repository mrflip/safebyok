/** The demo's test helpers, star-imported as `TH`: everything `safebyok/testing` exports, and the means to render a component inside a BankProvider over storages in memory, to watch the vault beside it, to answer the dialogs the provider raises, and to stand in for Anthropic. */
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

/** `ui` inside a BankProvider signed in as `user_id`, over a fresh vaultDB in memory, deriving through the cheap test deriver; and that `vaultDB`.
 *
 * @example TH.renderInBank(<><SessionBar auth={auth} /><TH.VaultProbe /></>)
 */
export const renderInBank = (ui: ReactNode, user_id: string | null = 'u1') => {
  const vaultDB = new MemoryVaultDB()
  render(
    <BankProvider
      applabel="acme" user_id={user_id} vaultDB={vaultDB} deviceDB={new MemoryDeviceDB()}
      keyDeriver={testDeriver} strengthChecker={anyStrengthChecker} logger={quietLogger}
    >
      {ui}
    </BankProvider>,
  )
  return { vaultDB }
}

/** A StringStorage in memory, for the fake auth under test: each call a fresh, empty one. */
export const memoryStorage = (): StringStorage => {
  const texts = new Map<string, string>()
  return {
    get: (ckey) => texts.get(ckey) ?? null,
    put: (ckey, text) => { texts.set(ckey, text) },
    del: (ckey) => { texts.delete(ckey) },
  }
}

/** A fake auth over fresh storages in memory. */
export const makeAuth = (): Auth => createAuth({ applabel: 'acme', dbStorage: memoryStorage(), deviceStorage: memoryStorage() })

/** The SessionBar as a page renders it, handed the live session of `auth`. */
export const LiveSessionBar = ({ auth }: { auth: Auth }) => <SessionBar auth={auth} session={useSession(auth)} />

/** Types `userlabelText` into the sign-in strip and presses Sign in. */
export const signInAs = (userlabelText: string) => {
  fireEvent.change(screen.getByPlaceholderText('username'), { target: { value: userlabelText } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

/** Answers the passphrase dialog once it shows: types `passphrase` and submits, typing it again where the dialog asks to confirm it. */
export const answerPassphraseDialog = async (passphrase = Passphrase) => {
  const field = await screen.findByPlaceholderText('vault passphrase')
  fireEvent.change(field, { target: { value: passphrase } })
  const confirmation = screen.queryByPlaceholderText('confirm vault passphrase')
  if (confirmation !== null) { fireEvent.change(confirmation, { target: { value: passphrase } }) }
  const form = field.closest('form')
  if (form === null) { throw new Error('the passphrase dialog has no form to submit') }
  fireEvent.submit(form)
}

/** Answers the dialog that replaces the passphrase once it shows: types `antePassphrase`, then `nextPassphrase` twice, and submits. */
export const answerReplacementDialog = async (antePassphrase: string, nextPassphrase: string) => {
  const field = await screen.findByPlaceholderText('current passphrase')
  fireEvent.change(field, { target: { value: antePassphrase } })
  fireEvent.change(screen.getByPlaceholderText('new passphrase'), { target: { value: nextPassphrase } })
  fireEvent.change(screen.getByPlaceholderText('confirm new passphrase'), { target: { value: nextPassphrase } })
  const button = within(screen.getByRole('dialog')).getByRole<HTMLButtonElement>('button', { name: 'Change passphrase' })
  await waitFor(() => { if (button.disabled) { throw new Error('the strength check has not answered') } })
  fireEvent.click(button)
}

/** Answers the dialog that deletes the vault once it shows: types `passphrase` and presses Delete vault. */
export const answerDeletionDialog = async (passphrase = Passphrase) => {
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete vault' }))
}

/** Answers the dialog that adds a passkey once it shows: types `passphrase` and presses Add passkey, the browser's prompt answered by {@link installFakeAuthenticator}. */
export const answerPasskeyAddDialog = async (passphrase = Passphrase) => {
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add passkey' }))
}

/** Answers the dialog that removes the passkey once it shows: types `passphrase` and presses Remove passkey. */
export const answerPasskeyRevokeDialog = async (passphrase = Passphrase) => {
  fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove passkey' }))
}

/** A browser offering WebAuthn for one test, whose authenticator makes passkeys that answer the PRF extension at once, each with random bytes. */
export const installFakeAuthenticator = () => {
  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential)
  Object.defineProperty(navigator, 'credentials', { value: { create }, configurable: true })
  onTestFinished(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'credentials')
  })
}

/** The fake authenticator's `navigator.credentials.create`: a new passkey, its PRF answer random. */
const create = () => Promise.resolve({
  type:                      'public-key',
  rawId:                     crypto.getRandomValues(new Uint8Array(16)).buffer,
  getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: crypto.getRandomValues(new Uint8Array(32)) } } }),
})

/** Stands in for the browser's PublicKeyCredential, whose presence says the browser offers WebAuthn. */
class FakePublicKeyCredential {
  readonly type = 'public-key'
}

/** Waits, inside React's act, until each call `prompting` heard has settled and the handler that awaited it has heard. */
export const settlePrompts = async <PromptT extends () => Promise<unknown>>(prompting: MockInstance<PromptT>) => {
  // The handler awaited each promise before this does, so it hears the outcome first.
  await act(async () => { await Promise.allSettled(prompting.mock.results.map((result): unknown => result.value)) })
}

/** One request a {@link fakeAnthropic} heard: where it went, the API key it carried (the SDK sends it as a bearer token), its body. */
export type AnthropicRequest = {
  url:    string
  apiKey: string | null
  body:   { model: string, messages: unknown[] }
}

/**
 * Anthropic's messages endpoint, as `fetch` sees it: every request answered with `status` -- at
 * 200, a message whose text is `jokeText`; otherwise, an authentication error -- and recorded.
 * Hand its `fetchFn` to the code under test, or stub the global `fetch` with it.
 *
 * @param status - The status of every reply.
 * @param jokeText - The reply's text, at 200.
 * @returns `fetchFn`, the fake, and `seen`, each request it has answered so far.
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

/** `locked` or `unlocked` for a vault's snapshot, `none` for none. */
export const lockWordOf = (snapshot: VaultSnapshot | null): string => {
  if (snapshot === null) { return 'none' }
  return snapshot.isLocked ? 'locked' : 'unlocked'
}

/** The vault under 'main' as a page sees it, to render beside a component under test: its stage and lock as `<stage> <locked|unlocked>` (`none` with no vault), an Open button that builds or unlocks it, asking through the provider's dialog, and a Lock button.
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

/** Waits until the {@link VaultProbe} shows `shown`, as `<stage> <locked|unlocked>`, failing if it never does. */
export const expectProbe = async (shown: string) => {
  await waitFor(() => { expect(screen.getByTestId('vault').textContent).to.eq(shown) })
}
