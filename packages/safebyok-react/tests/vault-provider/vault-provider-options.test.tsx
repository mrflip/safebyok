import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { AnyTextValidators, Label, VaultError, isVaultError, localVaultDB, memoryDeviceDB, memoryStore, type KeyDeriver, type PassphraseVerdict, type VaultScope, type VaultValidators } from 'safebyok'
import * as TH from '../test-helpers'
import { VaultProvider, type VaultProviderProps } from '../../src/vault-provider'
import { Probe, grabber, makeWorld, refuseAcme, shownState, expectShown, CatchingBoundary, hushConsole, lockedWorld, providerOf, twelveOrMore } from './world'

describe("VaultProvider", () => {
  // == [Options passed through]: keyDeriver, Bank.make options, validators, strengthChecker, logger, allowStartOver, others

  it("asks for a keyDeriver outright, as Bank.make does", () => {
    expectTypeOf<Pick<VaultProviderProps, 'keyDeriver'>>().toEqualTypeOf<{ keyDeriver: KeyDeriver }>()
  })

  it("passes every Bank.make option through, as given", async () => {
    // A fixed instant the vault accepts as a time: after 1981, before FarFuture.
    const ClockMillis = Date.UTC(2026, 9, 15)
    const { Grab, opened } = grabber()
    const vaultDB = localVaultDB({ store: memoryStore() })
    const told: VaultError[] = []
    const onBadNews = (news: VaultError) => { told.push(news) }
    render(
      <VaultProvider applabel="acme" vaultlabel="main" userId="u1" vaultDB={vaultDB} deviceDB={memoryDeviceDB()}
        keyDeriver={TH.testDeriver} strengthChecker={TH.anyStrengthChecker} clock={{ now: () => ClockMillis }} leaseHours={1} maxWhisperBytes={8} maxBoxes={1}
        staleMinutes={0} onBadNews={onBadNews}>
        <Grab />
      </VaultProvider>,
    )
    const vault = await opened()
    // No minute trusted: each hello reads, and bad news it meets is told to the handler given.
    const revoked = new VaultError('identity_revoked', 'Sign in again to reach this vault.')
    vi.spyOn(vaultDB, 'getVault').mockResolvedValueOnce(TH.bad(revoked))
    await TH.expectRefusal(vault.hello(), 'identity_revoked')
    expect(told).to.deep.equal([revoked])

    await vault.unlock('correct horse battery staple')
    // One hour, 3,600,000 ms, after the clock's time.
    expect(vault.getSnapshot().askPassphraseAt).to.eq(ClockMillis + 3_600_000)
    // 'sk-fake' is nine bytes of JSON, one over the limit given.
    await TH.expectRefusal(vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-fake'), 'whisper_too_large')
    // One box fills the vault: a second is refused for room.
    await vault.putBox({ boxlabel: 'openai_api_key' }, 'sk')
    await TH.expectRefusal(vault.putBox({ boxlabel: 'mistral_api_key' }, 'sk'), 'vault_full')
  })

  it("passes the validators through, reopening for a changed check but not for a bag rebuilt around the same ones", async () => {
    const { Grab, latest, opened } = grabber()
    const { props } = makeWorld()
    // A bag written in the props, as a host might: new at every render, around the same schemas.
    const tree = (boxlabelCheck: VaultValidators['boxlabel']) => (
      <VaultProvider {...props} userId="u1" validators={{ boxlabel: boxlabelCheck }}>
        <Grab />
      </VaultProvider>
    )
    const { rerender } = render(tree(AnyTextValidators.boxlabel))
    const first = await opened()
    await first.unlock('correct horse battery staple')
    await first.putBox({ boxlabel: 'Anthropic API key' }, 'sk-fake')
    rerender(tree(AnyTextValidators.boxlabel))
    expect(latest().vault).to.eq(first)
    // Another schema, a narrower one: a new check, so a new vault handle, which lists what is
    // stored as it stands, the checks running at entry only.
    rerender(tree(Label))
    await waitFor(() => { expect(latest().vault).to.not.be.null.and.not.eq(first) })
    expect(latest().vault?.getSnapshot().boxes.map((summary) => summary.boxlabel)).to.deep.equal(['Anthropic API key'])
  })

  it("passes strengthChecker through: the vault it opens refuses a weak new passphrase with the checker's reason", async () => {
    const { Grab, opened } = grabber()
    const { props } = makeWorld()
    render(<VaultProvider {...props} userId="u1" strengthChecker={refuseAcme}><Grab /></VaultProvider>)
    const vault = await opened()
    const err = await TH.expectRefusal(vault.unlock('acme acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('Not the name of the app, please.')
    await vault.unlock('correct horse battery staple')
    expect(vault.getSnapshot().state).to.eq('unlocked')
  })

  it("opens without a strengthChecker, the advice and the vault alike then refusing every new passphrase as too weak", async () => {
    const { strengthChecker: _admitsAny, ...props } = makeWorld().props
    const lacking = props as VaultProviderProps
    render(<VaultProvider {...lacking} userId="u1"><Probe /></VaultProvider>)
    fireEvent.click(await screen.findByText('put'))
    const field = await screen.findByPlaceholderText('vault passphrase')
    fireEvent.change(field, { target: { value: 'correct horse battery staple' } })
    await waitFor(() => { expect(screen.getByRole('status').textContent).to.match(/can't take a new passphrase yet/) })
  })

  it("throws to the error boundary a strengthChecker that is no function, as Bank.make refuses it", () => {
    hushConsole()
    const caught: unknown[] = []
    const { props } = makeWorld()
    const misfit = { ...props, strengthChecker: 12 } as unknown as VaultProviderProps
    render(<CatchingBoundary caught={caught}><VaultProvider {...misfit} userId="u1"><Probe /></VaultProvider></CatchingBoundary>)
    expect(shownState()).to.eq('boundary')
    expect(isVaultError(caught[0], 'bad_option')).to.be.true
    expect((caught[0] as Error).message).to.match(/^Bank\.make's strengthChecker: expected a function.*browserOpts/)
  })

  it("keeps its vault for a strengthChecker that keeps its identity, the vault running that checker", async () => {
    const { Grab, latest, opened } = grabber()
    const { props } = makeWorld()
    const tree = () => <VaultProvider {...props} userId="u1" strengthChecker={refuseAcme}><Grab /></VaultProvider>
    const { rerender } = render(tree())
    const first = await opened()
    rerender(tree())
    expect(latest().vault).to.eq(first)
    await TH.expectRefusal(first.unlock('acme acme acme acme'), 'weak_passphrase')
  })

  it("reopens for a strengthChecker that changes identity, as for any option: the new vault runs the new checker", async () => {
    const { Grab, latest, opened } = grabber()
    const { props } = makeWorld()
    const tree = (reason: string) => (
      <VaultProvider {...props} userId="u1" strengthChecker={(_typed) => ({ strong: false, reason })}>
        <Grab />
      </VaultProvider>
    )
    const { rerender } = render(tree('First reason.'))
    const first = await opened()
    rerender(tree('Second reason.'))
    await waitFor(() => { expect(latest().vault).to.not.be.null.and.not.eq(first) })
    const second = latest().vault
    if (second === null) { throw new Error('the provider opened no vault') }
    const err = await TH.expectRefusal(second.unlock('correct horse battery staple'), 'weak_passphrase')
    expect(err.message).to.eq('Second reason.')
    await TH.expectRefusal(first.unlock('correct horse battery staple'), 'vault_gone')
  })

  it("shows the vault locked when storage says its user signed out, as the vault locks itself", async () => {
    const { Grab, opened } = grabber()
    const { props, vaultDB } = makeWorld()
    render(
      <VaultProvider {...props} userId="u1">
        <Probe />
        <Grab />
      </VaultProvider>,
    )
    const vault = await opened()
    await vault.unlock('correct horse battery staple')
    await expectShown('unlocked')
    vi.spyOn(vaultDB, 'getBox').mockResolvedValueOnce(TH.bad(new VaultError('identity_revoked', 'No one is signed in: sign in, then try again.')))
    await TH.expectRefusal(vault.getWhisper('anthropic_api_key'), 'identity_revoked')
    await expectShown('locked')
  })

  it("passes the logger through: what the vault has nobody to throw to reaches it", async () => {
    const spy = TH.spyLogger()
    const store = memoryStore()
    const vaultDB = localVaultDB({ store })
    const { Grab, opened } = grabber()
    render(
      <VaultProvider {...makeWorld().props} vaultDB={vaultDB} userId="u1" logger={spy.logger}>
        <Grab />
      </VaultProvider>,
    )
    const vault = await opened()
    await vault.unlock('correct horse battery staple')
    // A change pushed from storage that the vault cannot read: its background refresh warns.
    vi.spyOn(vaultDB, 'getVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    store.write('elsewhere', '{}')
    await waitFor(() => { expect(spy.calls.map((heard) => heard.level)).to.deep.equal(['warn']) })
    expect(spy.calls[0]?.story).to.deep.equal({ call: 'refresh' })
  })

  it("uses the logger its vaultDB was made with when given none: the provider's warnings and its vault's reach the one logger", async () => {
    const spy = TH.spyLogger()
    const store = memoryStore()
    const vaultDB = localVaultDB({ store, logger: spy.logger })
    const reading = Date.UTC(2026, 9, 15)
    const { Grab, opened } = grabber()
    const providing = (clock: { now: () => number }) => (
      <VaultProvider {...makeWorld().props} vaultDB={vaultDB} userId="u1" clock={clock}>
        <Grab />
      </VaultProvider>
    )
    const { rerender } = render(providing({ now: () => reading }))
    await opened()
    rerender(providing({ now: () => reading }))
    await waitFor(() => { expect(spy.calls.map((heard) => heard.story?.['call'])).to.include('VaultProvider') })
    const vault = await opened()
    await vault.unlock('correct horse battery staple')
    vi.spyOn(vaultDB, 'getVault').mockResolvedValueOnce(TH.bad(new VaultError('storage_unavailable', 'The vault storage could not be reached.')))
    store.write('elsewhere', '{}')
    await waitFor(() => { expect(spy.calls).to.have.lengthOf(2) })
    expect(spy.calls.map((heard) => [heard.level, heard.story?.['call']])).to.deep.equal([['warn', 'VaultProvider'], ['warn', 'refresh']])
  })

  it("passes allowStartOver to the dialog: a user who forgot the passphrase may start a new vault, which the provider hands down novel with no retry", async () => {
    const world = await lockedWorld()
    render(<VaultProvider {...world.props} userId="u1" allowStartOver><world.Grab /></VaultProvider>)
    const vault = await world.opened()
    const reading = vault.tryGetWhisper('anthropic_api_key')
    fireEvent.click(await screen.findByText('Forgot it? Start a new vault'))
    fireEvent.click(screen.getByText('Remove and start over'))
    // The delete ends the prompt: the dialog closes, and the read that asked is refused, its Vault object gone.
    const { err } = await reading
    expect(err?.refusalkind).to.eq('vault_gone')
    await waitFor(() => { expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null })
    // The provider asks for the vault again on its own: the next life, novel, never an openError.
    await waitFor(() => { expect(world.latest().vault).to.not.be.null.and.not.eq(vault) })
    expect(world.latest().openError).to.be.null
    const next = await world.opened()
    expect(next.getSnapshot().state).to.eq('novel')
    // The next call asks the user to choose a passphrase for the new vault.
    const storing = next.tryPutBox({ boxlabel: 'anthropic_api_key' }, 'sk-new-fake')
    fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'a new pw' } })
    expect(screen.queryByText('Choose a vault passphrase')).to.not.be.null
    fireEvent.click(screen.getByText('Create vault'))
    const { ok } = await storing
    expect(ok).to.be.true
  })

  it("passes passphraseUsername and passphraseAdvice to the dialog: what a password manager files it under, and what is said as the user chooses", async () => {
    const world = makeWorld()
    render(
      <VaultProvider {...world.props} userId="u1" passphraseUsername="margo@example.com (vault)" passphraseAdvice={twelveOrMore}>
        <Probe />
      </VaultProvider>,
    )
    fireEvent.click(await screen.findByText('put'))
    const field = await screen.findByPlaceholderText('vault passphrase')
    expect(document.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.value).to.eq('margo@example.com (vault)')
    fireEvent.change(field, { target: { value: 'short' } })
    expect(await screen.findByText('Twelve characters or more, please.')).to.not.be.null
  })
  // --

  // == [Advice and developer warnings]: advice from strengthChecker, warning the developer once

  describe("advice, by default, from the strengthChecker", () => {
    it("says the checker's reason as the user chooses a weak passphrase, and nothing for one it admits", async () => {
      const world = makeWorld()
      render(<VaultProvider {...world.props} userId="u1" strengthChecker={refuseAcme}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      const field = await screen.findByPlaceholderText('vault passphrase')
      fireEvent.change(field, { target: { value: 'acme forever' } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('Not the name of the app, please.') })
      expect(field.getAttribute('aria-describedby')).to.eq(screen.getByRole('status').id)
      fireEvent.change(field, { target: { value: 'correct horse battery staple' } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('') })
    })

    it("fails the dialog, reporting to React, for a checker that throws: the vault's refusal, unexpected_error, carrying nothing of the throw", async () => {
      const world = makeWorld()
      const flaky = vi.fn(refuseAcme).mockRejectedValueOnce(new Error('could not judge acme'))
      const { reported } = TH.renderReporting(<VaultProvider {...world.props} userId="u1" strengthChecker={flaky}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'acme' } })
      await waitFor(() => { expect(reported).to.have.lengthOf(1) })
      expect(isVaultError(reported[0], 'unexpected_error')).to.be.true
      expect((reported[0] as Error).message).to.match(/strengthChecker handed to Bank\.make threw/)
      expect(TH.thrownText(reported[0])).to.not.include('could not judge')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
    })

    it("fails the dialog, reporting to React, for a checker that answers no verdict: the vault's refusal, bad_option", async () => {
      const world = makeWorld()
      const misfit = (() => ({ strong: 'yes' })) as unknown as VaultProviderProps['strengthChecker']
      const { reported } = TH.renderReporting(<VaultProvider {...world.props} userId="u1" strengthChecker={misfit}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'acme' } })
      await waitFor(() => { expect(reported).to.have.lengthOf(1) })
      expect(isVaultError(reported[0], 'bad_option')).to.be.true
      expect((reported[0] as Error).message).to.match(/answered something other than a verdict/)
    })

    it("says a blank passphrase is no passphrase, without the checker hearing it", async () => {
      const world = makeWorld()
      const heard = vi.fn(TH.anyStrengthChecker)
      render(<VaultProvider {...world.props} userId="u1" strengthChecker={heard}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: ' '.repeat(3) } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.match(/can't be empty or only spaces/) })
      expect(heard).not.toHaveBeenCalled()
    })

    it("hands the checker the vault's scope, as the vault does", async () => {
      const world = makeWorld()
      const heard = vi.fn((_typed: string, _scope: VaultScope): PassphraseVerdict => ({ strong: true }))
      render(<VaultProvider {...world.props} userId="u1" strengthChecker={heard}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'some words' } })
      await waitFor(() => { expect(heard).toHaveBeenCalledWith('some words', TH.scopeOf('u1')) })
    })

    it("gives way to the host's own passphraseAdvice, which the checker never hears", async () => {
      const world = makeWorld()
      const heard = vi.fn(refuseAcme)
      render(<VaultProvider {...world.props} userId="u1" strengthChecker={heard} passphraseAdvice={twelveOrMore}><Probe /></VaultProvider>)
      fireEvent.click(await screen.findByText('put'))
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'acme' } })
      await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('Twelve characters or more, please.') })
      expect(heard).not.toHaveBeenCalled()
    })

    it("asks nothing while unlocking: the test runs only on a passphrase being chosen", async () => {
      const world = await lockedWorld()
      const heard = vi.fn(TH.anyStrengthChecker)
      render(<VaultProvider {...world.props} userId="u1" strengthChecker={heard}><world.Grab /></VaultProvider>)
      const vault = await world.opened()
      void vault.tryGetWhisper('anthropic_api_key')
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      expect(screen.queryByRole('status')).to.be.null
      expect(heard).not.toHaveBeenCalled()
    })
  })

  describe("warning the developer once", () => {
    it("of a logger written inline, which reopens the vault at every render", async () => {
      const spy = TH.spyLogger()
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { logger: { ...spy.logger } }))
      await expectShown('novel')
      rerender(providerOf(world, { logger: { ...spy.logger } }))
      await expectShown('novel')
      rerender(providerOf(world, { logger: { ...spy.logger } }))
      await expectShown('novel')
      const warned = spy.calls.filter((heard) => heard.story?.['call'] === 'VaultProvider')
      expect(warned).to.have.lengthOf(1)
      expect(warned[0]?.level).to.eq('warn')
      expect(warned[0]?.story).to.deep.equal({ call: 'VaultProvider', props: ['logger'] })
      expect(warned[0]?.message).to.match(/define it once, outside the component, or memoize it/)
    })

    it("of a clock written inline, through the console when there is no logger", async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { /* kept out of the test output */ })
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { clock: { now: () => Date.now() } }))
      await expectShown('novel')
      rerender(providerOf(world, { clock: { now: () => Date.now() } }))
      await expectShown('novel')
      // Each open with the test deriver also warns, of the deriver: only the provider's own are counted.
      const warned = consoleWarn.mock.calls.map(([said]) => String(said)).filter((said) => said.startsWith('safebyok: VaultProvider'))
      expect(warned).to.have.lengthOf(1)
      expect(warned[0]).to.match(/^safebyok: VaultProvider reopened the vault because its clock changed identity/)
    })

    it("of a strengthChecker written inline, which reopens the vault at every render", async () => {
      const spy = TH.spyLogger()
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { logger: spy.logger, strengthChecker: () => ({ strong: true }) }))
      await expectShown('novel')
      rerender(providerOf(world, { logger: spy.logger, strengthChecker: () => ({ strong: true }) }))
      await expectShown('novel')
      rerender(providerOf(world, { logger: spy.logger, strengthChecker: () => ({ strong: true }) }))
      await expectShown('novel')
      const warned = spy.calls.filter((heard) => heard.story?.['call'] === 'VaultProvider')
      expect(warned).to.have.lengthOf(1)
      expect(warned[0]?.story).to.deep.equal({ call: 'VaultProvider', props: ['strengthChecker'] })
    })

    it("of nothing, for a logger and clock that keep their identity", async () => {
      const spy = TH.spyLogger()
      const clock = { now: () => Date.now() }
      const world = makeWorld()
      const { rerender } = render(providerOf(world, { logger: spy.logger, clock }))
      await expectShown('novel')
      rerender(providerOf(world, { logger: spy.logger, clock }))
      await expectShown('novel')
      expect(spy.calls).to.deep.equal([])
    })
  })
  // --
})
