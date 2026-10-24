/**
 * The demo's test helpers, star-imported as `TH`: everything `safebyok/testing` exports, and the
 * means to render a component as the demo's App does -- inside a BankProvider -- over stores in
 * memory, to fill its vault beforehand as another device would, to answer the passphrase
 * dialog the provider raises, to watch the vault beside a component, and to stand in for Anthropic.
 */
import type { ReactNode } from 'react'
import { expect } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { localVaultDB, memoryDeviceDB, memoryStore, type VaultDB, type Whisper } from 'safebyok'
import { BankProvider, useVault, useVaultSnapshot } from 'safebyok-react'
import { closeVault, memoryVaultOpts, settledVault, unlock } from 'safebyok/testing'
import { JokeModel } from '../src/lib/anthropic'
import { keepToClose } from './opened-vaults'

export * from 'safebyok/testing'

/** The passphrase every vault in the demo's tests is made with: an obvious fake. */
export const Passphrase = 'correct horse battery staple'

/**
 * A fresh world in memory for the demo's components: the vault's two stores; a render that wraps
 * a component in a BankProvider over them, signed in as `userId` and deriving through the cheap
 * test deriver; an opener for a look at the vault from outside the page; and a seeder that fills
 * the vault beforehand from another device, so the page finds it locked. Its vaults are in the
 * `acme` app, as `scopeOf` has them.
 *
 * @param stores - `vaultDB`, to put the vault behind an adapter of the test's own. Default: a
 *   fresh `localVaultDB` in memory.
 * @returns `vaultDB` and `deviceDB`, `renderInVault(ui, userId?)`, `open(userId?)`,
 *   `openUnlocked(userId?)`, unlocked with {@link Passphrase}, and `seed(whispers, userId?)`. The
 *   user is `u1` unless named. Each vault `open` and `openUnlocked` hand out is let go when the
 *   test ends, by tests/setup.ts.
 *
 * @example
 *   const world = TH.makeWorld()
 *   await world.seed({ anthropic_api_key: 'sk-ant-test-not-a-real-key' })
 *   world.renderInVault(<VaultDashboard />)
 */
export const makeWorld = ({ vaultDB = localVaultDB({ store: memoryStore() }) }: { vaultDB?: VaultDB } = {}) => {
  const opts = memoryVaultOpts({ vaultDB })
  const { deviceDB } = opts
  // The provider shows its own dialog: the scripted requestCleartext is for the vaults open() hands out.
  const { userId: _userId, vaultlabel: _vaultlabel, requestCleartext: _scripted, ...bankOpts } = opts

  const renderInVault = (ui: ReactNode, userId: string | null = 'u1') => (
    render(<BankProvider {...bankOpts} userId={userId}>{ui}</BankProvider>)
  )

  const open = async (userId = 'u1') => keepToClose(await settledVault({ ...opts, userId }))

  const openUnlocked = async (userId = 'u1') => {
    const vault = await open(userId)
    await unlock(vault, Passphrase)
    return vault
  }

  const seed = async (whispers: Record<string, Whisper>, userId = 'u1') => {
    const vault = await settledVault({ ...opts, userId, deviceDB: memoryDeviceDB() })
    try {
      await unlock(vault, Passphrase)
      for (const [boxlabel, whisper] of Object.entries(whispers)) {
        await vault.putBox({ boxlabel }, whisper)
      }
    } finally {
      closeVault(vault)
    }
  }

  return { vaultDB, deviceDB, renderInVault, open, openUnlocked, seed }
}

/**
 * Answers the passphrase dialog once it shows: types `passphrase` and submits, whether the dialog
 * is choosing a new vault's passphrase (typed again in its confirmation) or unlocking one.
 *
 * @param passphrase - What to type. Default: {@link Passphrase}.
 *
 * @example
 *   fireEvent.click(screen.getByText('view'))
 *   await TH.answerPassphraseDialog()
 */
export const answerPassphraseDialog = async (passphrase = Passphrase) => {
  const field = await screen.findByPlaceholderText('vault passphrase')
  fireEvent.change(field, { target: { value: passphrase } })
  const confirmation = screen.queryByPlaceholderText('confirm vault passphrase')
  if (confirmation !== null) { fireEvent.change(confirmation, { target: { value: passphrase } }) }
  const form = field.closest('form')
  if (form === null) { throw new Error('the passphrase dialog has no form to submit') }
  fireEvent.submit(form)
}

/** One request a {@link fakeAnthropic} heard: where it went, the API key it carried, its body. */
export type AnthropicRequest = {
  url:          string
  apiKeyHeader: string | null
  body:         { model: string, messages: unknown[] }
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
 *   anthropic.seen[0]?.apiKeyHeader  // => 'sk-ant-fake-key'
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
    : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    seen.push({
      url:          request.url,
      apiKeyHeader: request.headers.get('x-api-key'),
      body:         JSON.parse(await request.text()) as AnthropicRequest['body'],
    })
    return Response.json(reply, { status })
  }
  return { fetchFn, seen }
}

/**
 * The vault as a page sees it, to render beside a component under test: whether there is one
 * (`vault`: `none` or `open`), its `state` (`none` while there is none), its `boxes` (boxlabels,
 * comma-joined), a `read` button that reads `anthropic_api_key`, asking through the provider's dialog, and an
 * `unlock` button that has it unlocked (`ensureUnlocked`), asking through the provider's dialog too.
 *
 * @example world.renderInVault(<><SessionBar auth={auth} /><TH.VaultProbe /></>)
 */
export const VaultProbe = () => {
  const vault = useVault('main')?.vault ?? null
  const snapshot = useVaultSnapshot('main')
  return (
    <p>
      <span data-testid="vault">{vault === null ? 'none' : 'open'}</span>
      <span data-testid="state">{snapshot?.state ?? 'none'}</span>
      <span data-testid="boxes">{(snapshot?.boxes ?? []).map((box) => box.boxlabel).join(',')}</span>
      <button onClick={() => { void vault?.tryGetWhisper('anthropic_api_key') }}>read</button>
      <button onClick={() => { void vault?.tryEnsureUnlocked() }}>unlock</button>
    </p>
  )
}

/**
 * Waits until the {@link VaultProbe} shows the vault in `state`, failing if it never does.
 *
 * @param state - The snapshot state to wait for: `novel`, `locked` or `unlocked`.
 *
 * @example await TH.expectProbeState('locked')
 */
export const expectProbeState = async (state: string) => {
  await waitFor(() => { expect(screen.getByTestId('state').textContent).to.eq(state) })
}
