import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Suspense, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ForeverMillis, MinuteMillis, VaultError, localVaultDB, memoryDeviceDB, memoryStore, type GetProof, type ProofAnswer } from 'safebyok'
import { PassphraseModal, type PassphraseAdvice } from '../src/passphrase-modal'
import * as TH from './test-helpers'

// == [Test helpers]: vaultInState, noop, Trouble, wordingOf, lockedVault, usernameField, renderUnlocking, others

/** Just enough of a Vault for the dialog to read its state and window (the default, unless given). */
const vaultInState = (state: 'absent' | 'locked', leaseMillis = TH.DefaultLeaseMillis) => TH.stubVault({ state, leaseMillis })

/** The dialog's `onDone` for tests that never submit. */
const noop = (_answer: ProofAnswer) => undefined

/** Stands in for a host's dialog setter until its component renders. */
const noopShow = (_dialog: ReactNode) => undefined

/** An unsubscribe with nothing to undo. */
const silence = (): void => undefined
/** A store's subscribe that never rings. */
const neverRings = () => silence

/** The dialog's word to a user it cannot help, once something not theirs to mend went wrong. */
const Trouble = /This app ran into a problem of its own, not one you caused, and could not unlock your vault\. Your secrets are safe\./

/** What the dialog says of `relative` (null: until locked) while it creates the vault, or on an ordinary unlock. */
const wordingOf = (relative: string | null, creating: boolean) => {
  if (relative === null) { return "Stays unlocked on this device until you lock it." }
  return creating ? `Locks on this device ${relative}.` : `Locks again on this device ${relative}.`
}

/** A vault made under 'pw', holding one box, and locked, in memory. */
const lockedVault = async () => {
  const vault = await TH.settledVault(TH.memoryVaultOpts())
  await vault.unlock('pw')
  await vault.putBox('anthropic_api_key', 'sk-fake')
  await vault.lock()
  return vault
}

/** The dialog's username field, which a password manager files the passphrase under. */
const usernameField = () => {
  const found = document.querySelector<HTMLInputElement>('input[autocomplete="username"]')
  if (found === null) { throw new Error('the dialog has no username field') }
  return found
}

/** The passphraseAdvice @example: a word until the passphrase is twelve characters or more. */
const twelveOrMore = (typed: string) => (typed.length < 12 ? 'Twelve characters or more, please.' : null)

/** Advice that breaks, quoting what it was handed: as a host's might. */
const quotingAdvice = (typed: string) => { throw new Error(`could not judge ${typed}`) }

/** The polite region beside the field, which says the advice. */
const adviceRegion = () => screen.getByRole('status')

/** The dialog, unlocking through `unlocking`, rendered, and what reached its host: each onDone, and each error React reported. */
const renderUnlocking = (unlocking: Promise<undefined>) => {
  const heard: ProofAnswer[] = []
  const rendered = TH.renderReporting(<PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith(() => unlocking))} onDone={(unlocked) => { heard.push(unlocked) }} />)
  return { ...rendered, heard }
}

afterEach(cleanup)
// --

describe("PassphraseModal", () => {
  // == [Basic flow and unlock failures]: a wrong passphrase, vault created on another device, any other failure

  it("tells a user choosing a passphrase that nobody can recover it", () => {
    render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} onDone={noop} />)
    expect(screen.queryByText('Choose a vault passphrase')).to.not.be.null
    expect(screen.queryByText(/Nobody can recover it for you/)).to.not.be.null
    expect(screen.queryByText('Create vault')).to.not.be.null
  })

  it("tells a user unlocking that a forgotten passphrase cannot be recovered", () => {
    render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
    expect(screen.queryByText('Unlock your vault')).to.not.be.null
    expect(screen.queryByText(/forgotten passphrase cannot be recovered/)).to.not.be.null
  })

  it("hands the typed passphrase to the vault and reports an unlock", async () => {
    const heard: ProofAnswer[] = []
    const given: string[] = []
    const vault = TH.vaultUnlockingWith((passphrase) => { given.push(passphrase); return Promise.resolve() })
    render(<PassphraseModal ask={TH.askOf(vault)} onDone={(unlocked) => { heard.push(unlocked) }} />)
    TH.submitPassphrase('pw one')
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    expect(given).to.deep.equal(['pw one'])
  })

  it("reports a dismissal when the user cancels", () => {
    const heard: ProofAnswer[] = []
    render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(heard).to.deep.equal(['declined'])
  })

  it("closes as if dismissed when its unlock loses to a lock() called meanwhile", async () => {
    const heard: ProofAnswer[] = []
    const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('vault_locked', 'The vault was locked while this unlock was under way.')))
    render(<PassphraseModal ask={TH.askOf(vault)} onDone={(unlocked) => { heard.push(unlocked) }} />)
    TH.submitPassphrase('pw one')
    await waitFor(() => { expect(heard).to.deep.equal(['declined']) })
  })

  describe("a wrong passphrase", () => {

    it("stays in the dialog with the vault's calm message, and does not report done", async () => {
      const heard: ProofAnswer[] = []
      render(<PassphraseModal ask={TH.askOf(TH.wrong())} onDone={(unlocked) => { heard.push(unlocked) }} />)
      TH.submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.queryByText('That passphrase did not open the vault.')).to.not.be.null })
      expect(heard).to.deep.equal([])
    })

    it("announces the message to a screen reader, through a live region there from the start", async () => {
      render(<PassphraseModal ask={TH.askOf(TH.wrong())} onDone={noop} />)
      const region = screen.getByRole('alert')
      expect(region.textContent).to.eq('')
      TH.submitPassphrase('pw wrong')
      await waitFor(() => { expect(region.textContent).to.eq('That passphrase did not open the vault.') })
      expect(screen.getByRole('alert')).to.equal(region)
    })

    it("empties the live region at each submit, so the same word again is announced again", async () => {
      render(<PassphraseModal ask={TH.askOf(TH.wrong())} onDone={noop} />)
      TH.submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.getByRole('alert').textContent).to.not.eq('') })
      fireEvent.click(screen.getByText('Unlock'))
      expect(screen.getByRole('alert').textContent).to.eq('')
      await waitFor(() => { expect(screen.getByRole('alert').textContent).to.eq('That passphrase did not open the vault.') })
    })

    it("clears the message once the user types again", async () => {
      render(<PassphraseModal ask={TH.askOf(TH.wrong())} onDone={noop} />)
      TH.submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.queryByText('That passphrase did not open the vault.')).to.not.be.null })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw wrong again' } })
      expect(screen.queryByText('That passphrase did not open the vault.')).to.be.null
    })
  })

  describe("a vault created on another device meanwhile", () => {
    const Advice = 'A vault was just created for this label on another device, with a different passphrase than the one you entered. Enter the passphrase you chose there to unlock it.'
    const createdElsewhere = () => TH.stubVault({
      state:  'absent',
      unlock: () => Promise.reject(new VaultError('created_elsewhere', Advice)),
    })

    it("shows the vault's message as advice, quiet and not a gripe, in the live region, and not as a wrong passphrase", async () => {
      render(<PassphraseModal ask={TH.askOf(createdElsewhere())} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw one' } })
      fireEvent.click(screen.getByText('Create vault'))
      await waitFor(() => { expect(screen.getByRole('alert').textContent).to.eq(Advice) })
      const said = screen.getByText(Advice)
      expect(said.className).to.eq('quiet')
      expect(screen.queryByText(/didn't unlock|did not open/)).to.be.null
    })

    it("stays in the dialog for another try, not reporting done", async () => {
      const heard: ProofAnswer[] = []
      render(<PassphraseModal ask={TH.askOf(createdElsewhere())} onDone={(unlocked) => { heard.push(unlocked) }} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw one' } })
      fireEvent.click(screen.getByText('Create vault'))
      await waitFor(() => { expect(screen.queryByText(Advice)).to.not.be.null })
      expect(heard).to.deep.equal([])
      expect(screen.getByRole('dialog')).to.not.be.null
    })

    it("empties the passphrase field and focuses it, for the passphrase chosen on the other device", async () => {
      render(<PassphraseModal ask={TH.askOf(createdElsewhere())} onDone={noop} />)
      const field = screen.getByPlaceholderText<HTMLInputElement>('vault passphrase')
      fireEvent.change(field, { target: { value: 'pw one' } })
      screen.getByText('Cancel').focus()
      fireEvent.click(screen.getByText('Create vault'))
      await waitFor(() => { expect(screen.queryByText(Advice)).to.not.be.null })
      expect(screen.getByPlaceholderText('vault passphrase')).to.equal(field)
      expect(field.value).to.eq('')
      expect(document.activeElement).to.equal(field)
    })

    it("keeps the advice through typing, and clears it at the next submit, replaced by that submit's outcome", async () => {
      const outcomes = [new VaultError('created_elsewhere', Advice), new VaultError('wrong_passphrase', 'That passphrase did not open the vault.')]
      let tries = 0
      const vault = TH.stubVault({ state: 'absent', unlock: () => Promise.reject(outcomes[tries++] ?? new Error('no more outcomes')) })
      render(<PassphraseModal ask={TH.askOf(vault)} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw one' } })
      fireEvent.click(screen.getByText('Create vault'))
      await waitFor(() => { expect(screen.queryByText(Advice)).to.not.be.null })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw t' } })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw two' } })
      expect(screen.queryByText(Advice)).to.not.be.null
      fireEvent.click(screen.getByText('Create vault'))
      expect(screen.getByRole('alert').textContent).to.eq('')
      await waitFor(() => { expect(screen.getByRole('alert').textContent).to.eq('That passphrase did not open the vault.') })
    })

    it("turns, with a real vault that lost the race, into an unlock: the same field, emptied, focused, and asking for the current password", async () => {
      const store = memoryStore()
      const opts = TH.memoryVaultOpts({ vaultDB: localVaultDB({ store }) })
      // Deaf to the other device's create, so that it is met only at this device's own write.
      const deafDB = localVaultDB({ store: { ...store, subscribe: neverRings } })
      const here = await TH.settledVault({ ...opts, vaultDB: deafDB })
      const there = await TH.settledVault({ ...opts, deviceDB: memoryDeviceDB() })
      TH.beforeNextCall(deafDB, 'ensureVaultProps', () => there.unlock('pw one'))
      render(<PassphraseModal ask={TH.askOf(here)} onDone={noop} />)
      const field = screen.getByPlaceholderText<HTMLInputElement>('vault passphrase')
      fireEvent.change(field, { target: { value: 'pw two' } })
      fireEvent.click(screen.getByText('Create vault'))
      await waitFor(() => { expect(screen.getByRole('alert').textContent).to.match(/created for this label on another device/) })
      expect(screen.queryByText('Unlock your vault')).to.not.be.null
      expect(screen.getByPlaceholderText('vault passphrase')).to.equal(field)
      expect(field.value).to.eq('')
      expect(document.activeElement).to.equal(field)
      expect(field.getAttribute('autocomplete')).to.eq('current-password')
      expect(field.name).to.eq('current-password')
      here.close()
      there.close()
    })

    it("shows a wrong passphrase as a gripe still", async () => {
      render(<PassphraseModal ask={TH.askOf(TH.wrong())} onDone={noop} />)
      TH.submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.getByText('That passphrase did not open the vault.').className).to.eq('gripe') })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw again' } })
      expect(screen.queryByText('That passphrase did not open the vault.')).to.be.null
    })
  })

  describe("as a host's own getProof", () => {
    it("answers each ask it is shown for, unlocking through its attempt, as its first example shows", async () => {
      const opts = TH.memoryVaultOpts()
      const maker = await TH.settledVault(opts)
      await maker.unlock('pw')
      await maker.putBox('anthropic_api_key', 'sk-fake')
      await maker.lock()
      maker.close()
      const host: { show: (dialog: ReactNode) => void } = { show: noopShow }
      const Host = () => {
        const [shown, setShown] = useState<ReactNode>(null)
        host.show = setShown
        return shown
      }
      render(<Host />)
      const showDialog = (dialog: ReactNode) => { act(() => { host.show(dialog) }) }
      const getProof: GetProof = (ask) => new Promise((answer) => { showDialog(<PassphraseModal ask={ask} onDone={answer} />) })
      const vault = await TH.settledVault({ ...opts, getProof })
      const reading = vault.getWhisper('anthropic_api_key')
      await screen.findByPlaceholderText('vault passphrase')
      TH.submitPassphrase('pw')
      expect(await reading).to.eq('sk-fake')
      vault.close()
    })
  })

  describe("a lock landing while it asks", () => {
    it("closes, answering declined, once its ask's lockLanded settles (Contract: getProof, in React: closing on lockLanded)", async () => {
      const landing = TH.held()
      const heard: ProofAnswer[] = []
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'), { lockLanded: landing.promise })} onDone={(answer) => { heard.push(answer) }} />)
      expect(heard).to.deep.equal([])
      await act(async () => {
        landing.resolve(undefined)
        await TH.wakeupAtNextTick()
      })
      expect(heard).to.deep.equal(['declined'])
    })

    it("closes over a real vault as lock() lands, and the call that asked is refused vault_locked (Contract: ensureLease, Does 3.7)", async () => {
      const opts = TH.memoryVaultOpts()
      const maker = await TH.settledVault(opts)
      await maker.unlock('pw')
      await maker.lock()
      maker.close()
      const { vault, ask, ensuring } = await TH.askedBy(opts)
      const heard: ProofAnswer[] = []
      render(<PassphraseModal ask={ask} onDone={(answer) => { heard.push(answer) }} />)
      await act(async () => { await vault.lock() })
      expect(heard).to.deep.equal(['declined'])
      const { err } = await ensuring
      expect(err?.refusalkind).to.eq('vault_locked')
      vault.close()
    })

    it("answers unlocked when the vault comes to be unlocked under it, as by unlock() elsewhere in the app", async () => {
      const vault = await lockedVault()
      const heard: ProofAnswer[] = []
      render(<PassphraseModal ask={TH.askOf(vault)} onDone={(answer) => { heard.push(answer) }} />)
      await act(async () => { await vault.unlock('pw') })
      expect(heard).to.deep.equal(['unlocked'])
      vault.close()
    })

    it("answers once, however many ways it is answered", async () => {
      const landing = TH.held()
      const heard: ProofAnswer[] = []
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'), { lockLanded: landing.promise })} onDone={(answer) => { heard.push(answer) }} />)
      fireEvent.click(screen.getByText('Cancel'))
      await act(async () => {
        landing.resolve(undefined)
        await TH.wakeupAtNextTick()
      })
      expect(heard).to.deep.equal(['declined'])
    })
  })

  describe("any other failure of the unlock", () => {
    it("closes on storage out of reach, answering declined (Contract: getProof, attempt refuses: close the dialog)", async () => {
      const heard: ProofAnswer[] = []
      const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('storage_unavailable', 'Storage could not be reached; try again in a moment.')))
      render(<TH.Catcher><PassphraseModal ask={TH.askOf(vault)} onDone={(answer) => { heard.push(answer) }} /></TH.Catcher>)
      TH.submitPassphrase('pw one')
      await waitFor(() => { expect(heard).to.deep.equal(['declined']) })
      expect(screen.queryByText(/caught:/)).to.be.null
    })

    it("closes on a refusal the Contract does not name, such as bad news, answering declined (Contract: getProof, attempt refuses: close the dialog)", async () => {
      const heard: ProofAnswer[] = []
      const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('damaged_vault', "This vault's stored record is damaged.")))
      render(<PassphraseModal ask={TH.askOf(vault)} onDone={(answer) => { heard.push(answer) }} />)
      TH.submitPassphrase('pw one')
      await waitFor(() => { expect(heard).to.deep.equal(['declined']) })
    })

    it("shows a way in that cannot answer in place, the passphrase field still there to try (Contract: getProof, attempt refuses: offer another way in)", async () => {
      const heard: ProofAnswer[] = []
      const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('damaged_wayin', 'That way in is stored damaged: try another.')))
      render(<PassphraseModal ask={TH.askOf(vault)} onDone={(answer) => { heard.push(answer) }} />)
      TH.submitPassphrase('pw one')
      await screen.findByText('That way in is stored damaged: try another.')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(heard).to.deep.equal([])
    })

    it("meets misuse with a calm notice in the dialog, and reports the very error to React, leaving the page alone", async () => {
      const closed = new VaultError('vault_closed', 'The vault was closed.')
      const heard: ProofAnswer[] = []
      const { reported } = TH.renderReporting(<TH.Catcher><PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith(() => Promise.reject(closed)))} onDone={(unlocked) => { heard.push(unlocked) }} /></TH.Catcher>)
      TH.submitPassphrase('pw one')
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(screen.getByRole('alertdialog', { name: 'Something went wrong' }).textContent).to.match(Trouble)
      expect(reported).to.deep.equal([closed])
      expect(reported[0]).to.equal(closed)
      expect(screen.queryByText(/caught:/)).to.be.null
      expect(screen.queryByText('The vault was closed.')).to.be.null
      expect(heard).to.deep.equal([])
    })

    it("forgets the typed passphrase with the form, and moves focus to Close", async () => {
      const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('bad_option', 'A bad option.')))
      TH.renderReporting(<PassphraseModal ask={TH.askOf(vault)} onDone={noop} />)
      TH.submitPassphrase('pw one')
      await screen.findByText('Something went wrong')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
      expect(screen.queryByDisplayValue('pw one')).to.be.null
      expect(document.activeElement).to.equal(screen.getByRole('button', { name: 'Close' }))
    })

    it("closes as if dismissed when the user presses Escape on the notice", async () => {
      const heard: ProofAnswer[] = []
      const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('vault_closed', 'The vault was closed.')))
      TH.renderReporting(<PassphraseModal ask={TH.askOf(vault)} onDone={(unlocked) => { heard.push(unlocked) }} />)
      TH.submitPassphrase('pw one')
      fireEvent.keyDown(await screen.findByRole('button', { name: 'Close' }), { key: 'Escape' })
      expect(heard).to.deep.equal(['declined'])
    })

    it("closes as if dismissed when the user closes the notice", async () => {
      const heard: ProofAnswer[] = []
      const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry.')))
      TH.renderReporting(<PassphraseModal ask={TH.askOf(vault)} onDone={(unlocked) => { heard.push(unlocked) }} />)
      TH.submitPassphrase('pw one')
      fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
      expect(heard).to.deep.equal(['declined'])
    })

    it("meets a failure that is no VaultError the same way, as the vault answers it: unexpected_error, reported to React without what was thrown, its cause", async () => {
      const fell = new TypeError('fell over')
      const { reported } = TH.renderReporting(<TH.Catcher><PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith(() => Promise.reject(fell)))} onDone={noop} /></TH.Catcher>)
      TH.submitPassphrase('pw one')
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(reported).to.have.lengthOf(1)
      expect(reported[0]).to.include({ refusalkind: 'unexpected_error' })
      expect((reported[0] as Error).cause).to.be.undefined
      expect(screen.queryByText(/caught:|fell over/)).to.be.null
    })

    it("reports misuse to React with its kind, message and meta, but not its cause: a host key deriver's throw, which heard the passphrase", async () => {
      const meta = { capacity: { boxes: { used: 1, max: 100 }, bytes: { used: 48, max: 1000 } } }
      const misuse = new VaultError('unexpected_error', 'The key deriver threw.', { cause: new Error('could not derive from pw-the-passphrase'), meta })
      const { reported } = TH.renderReporting(<PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith(() => Promise.reject(misuse)))} onDone={noop} />)
      TH.submitPassphrase('pw-the-passphrase')
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(reported).to.have.lengthOf(1)
      const told = reported[0] as VaultError
      expect(told).to.include({ refusalkind: 'unexpected_error' })
      expect(told.message).to.match(/^The key deriver threw\. \(safebyok-react's PassphraseModal left this error's cause out/)
      expect(told.meta).to.deep.equal(meta)
      expect(told.cause).to.be.undefined
    })

    it("reports to React nothing of a key deriver's own VaultError, which heard the passphrase", async () => {
      const misuse = new VaultError('bad_option', 'pw-the-passphrase is not a passphrase I take.')
      const vault = await TH.settledVault(TH.memoryVaultOpts({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(misuse) } }))
      const { reported } = TH.renderReporting(<PassphraseModal ask={TH.askOf(vault)} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw-the-passphrase' } })
      fireEvent.click(screen.getByText('Create vault'))
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(reported).to.have.lengthOf(1)
      const told = reported[0] as VaultError
      expect(told.refusalkind).to.eq('unexpected_error')
      expect(told.message).to.not.include('pw-the-passphrase')
      expect(told.cause).to.be.undefined
      vault.close()
    })

    it("throws an attempt that throws -- a broken strength checker, met at Create -- on to the app's error boundary, quoting nothing of the passphrase", async () => {
      const misuse = new VaultError('bad_option', 'pw-the-passphrase is not a passphrase I take.')
      const vault = await TH.settledVault(TH.memoryVaultOpts({ strengthChecker: () => Promise.reject(misuse) }))
      // The host's advice says nothing, so the broken checker is met only at Create.
      const { reported } = TH.renderReporting(<TH.Catcher><PassphraseModal ask={TH.askOf(vault)} passphraseAdvice={() => null} onDone={noop} /></TH.Catcher>)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw-the-passphrase' } })
      fireEvent.click(screen.getByText('Create vault'))
      expect(await screen.findByText(/^caught: /)).to.not.be.null
      expect(screen.queryByText('Something went wrong')).to.be.null
      expect(reported).to.have.lengthOf(1)
      const told = reported[0] as VaultError
      expect(told.refusalkind).to.eq('unexpected_error')
      expect(told.message).to.match(/strengthChecker handed to Vault\.make threw/)
      expect(TH.thrownText(told)).to.not.include('pw-the-passphrase')
      vault.close()
    })

    it("answers declined once taken away by the boundary it threw to, so the call that asked is refused vault_locked, never left waiting", async () => {
      const host: { show: (dialog: ReactNode) => void } = { show: noopShow }
      const Host = () => {
        const [shown, setShown] = useState<ReactNode>(null)
        host.show = setShown
        return <TH.Catcher>{shown}</TH.Catcher>
      }
      TH.renderReporting(<Host />)
      const heard: ProofAnswer[] = []
      const getProof: GetProof = (ask) => new Promise((answer) => {
        act(() => { host.show(<PassphraseModal ask={ask} passphraseAdvice={() => null} onDone={(said) => { heard.push(said); answer(said) }} />) })
      })
      const vault = await TH.settledVault(TH.memoryVaultOpts({ strengthChecker: () => Promise.reject(new Error('down')), getProof }))
      const leasing = vault.tryEnsureLease()
      fireEvent.change(await screen.findByPlaceholderText('vault passphrase'), { target: { value: 'pw-the-passphrase' } })
      fireEvent.click(screen.getByText('Create vault'))
      expect(await screen.findByText(/^caught: /)).to.not.be.null
      expect(await leasing).to.have.nested.property('err.refusalkind', 'vault_locked')
      expect(heard).to.deep.equal(['declined'])
      vault.close()
    })

    it("closes its trouble notice as a lock lands, answering declined once, whatever its Close says after", async () => {
      const landing = TH.held()
      const heard: ProofAnswer[] = []
      const vault = TH.vaultUnlockingWith(() => Promise.reject(new VaultError('bad_option', 'A bad option.')))
      TH.renderReporting(<PassphraseModal ask={TH.askOf(vault, { lockLanded: landing.promise })} onDone={(answer) => { heard.push(answer) }} />)
      TH.submitPassphrase('pw one')
      await screen.findByText('Something went wrong')
      await act(async () => {
        landing.resolve(undefined)
        await TH.wakeupAtNextTick()
      })
      expect(heard).to.deep.equal(['declined'])
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(heard).to.deep.equal(['declined'])
    })

    it("answers its trouble notice unlocked when the vault comes to be unlocked under it, and its Close then says nothing more", async () => {
      const vault = await lockedVault()
      vi.spyOn(vault, 'tryUnlock').mockResolvedValueOnce({ ok: false, err: new VaultError('bad_option', 'A bad option.') })
      const heard: ProofAnswer[] = []
      TH.renderReporting(<PassphraseModal ask={TH.askOf(vault)} onDone={(answer) => { heard.push(answer) }} />)
      TH.submitPassphrase('pw')
      await screen.findByText('Something went wrong')
      await act(async () => { await vault.unlock('pw') })
      expect(heard).to.deep.equal(['unlocked'])
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(heard).to.deep.equal(['unlocked'])
      vault.close()
    })

    it("meets a rejection that is no Error at all the same way, as unexpected_error", async () => {
      const { reported } = TH.renderReporting(<TH.Catcher><PassphraseModal ask={TH.askOf(TH.stubVault({ unlock: vi.fn().mockRejectedValue(null) }))} onDone={noop} /></TH.Catcher>)
      TH.submitPassphrase('pw one')
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(reported).to.have.lengthOf(1)
      expect(reported[0]).to.have.property('refusalkind', 'unexpected_error')
    })
  })
  // --

  // == [Window wording and the dialog]: how long an unlock lasts, ForeverMillis, as a dialog

  describe("how long it says an unlock lasts", () => {
    const WindowCases = [
      // regular usage:
      [undefined,  "in 7 days",      'the default window is seven days'],
      [24,         "in 1 day",       'one day is singular'],
      [72,         "in 3 days",      'whole days read as days'],
      [8,          "in 8 hours",     'hours that do not make a day read as hours'],
      [1,          "in 1 hour",      'one hour is singular'],
      [36,         "in 36 hours",    'a day and a half reads as hours'],
      [0.25,       "in 15 minutes",  'a fraction of an hour reads as minutes'],
      [Infinity,   null,             'Infinity means until locked'],
      // edge cases:
      [1 / 60,     "in 1 minute",    'one minute is singular'],
      [0.0001,     "in 1 minute",    'a window under a minute rounds up to one'],
      [1.5,        "in 90 minutes",  'an hour and a half reads as minutes'],
    ] as const

    // Each from a vault opened with the hours given, so the dialog reads what Vault.make made of
    // them: one not yet created reads 'Locks on', one created and locked 'Locks again'.
    for (const [hours, relative, blurb] of WindowCases) {
      it(`${blurb}, while it creates the vault`, async () => {
        const vault = await TH.settledVault(TH.memoryVaultOpts({ leaseHours: hours }))
        render(<PassphraseModal ask={TH.askOf(vault)} onDone={noop} />)
        expect(screen.queryByText(wordingOf(relative, true))).to.not.be.null
        vault.close()
      })

      it(`${blurb}, on an ordinary unlock`, async () => {
        const vault = await TH.settledVault(TH.memoryVaultOpts({ leaseHours: hours }))
        await vault.unlock('pw')
        await vault.lock()
        render(<PassphraseModal ask={TH.askOf(vault)} onDone={noop} />)
        expect(screen.queryByText(wordingOf(relative, false))).to.not.be.null
        vault.close()
      })
    }

    it("reads ForeverMillis, the longest window a vault keeps, as until locked", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked', ForeverMillis))} onDone={noop} />)
      expect(screen.queryByText("Stays unlocked on this device until you lock it.")).to.not.be.null
    })

    it("reads anything within a minute of ForeverMillis as until locked, never comparing for equality", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked', ForeverMillis - MinuteMillis))} onDone={noop} />)
      expect(screen.queryByText("Stays unlocked on this device until you lock it.")).to.not.be.null
    })

    it("reads a window more than a minute short of ForeverMillis as a count", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked', ForeverMillis - MinuteMillis - 1))} onDone={noop} />)
      expect(screen.queryByText(/Locks again on this device in [\d,]+ minutes\./)).to.not.be.null
    })
  })

  describe("as a dialog", () => {
    it("is a modal dialog named by its heading and described by its blurb", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      const dialog = screen.getByRole('dialog', { name: 'Unlock your vault' })
      expect(dialog.getAttribute('aria-modal')).to.eq('true')
      expect(screen.getByRole('dialog', { description: /forgotten passphrase cannot be recovered/ })).to.equal(dialog)
    })

    it("cancels on Escape from the field, and the key goes no further than the dialog", () => {
      const heard: ProofAnswer[] = []
      const hostHeard: string[] = []
      const hostListener = (evt: KeyboardEvent) => { hostHeard.push(evt.key) }
      document.addEventListener('keydown', hostListener)
      try {
        render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={(unlocked) => { heard.push(unlocked) }} />)
        fireEvent.keyDown(screen.getByPlaceholderText('vault passphrase'), { key: 'Escape' })
        fireEvent.keyDown(screen.getByPlaceholderText('vault passphrase'), { key: 'a' })
      } finally {
        document.removeEventListener('keydown', hostListener)
      }
      expect(heard).to.deep.equal(['declined'])
      expect(hostHeard).to.deep.equal(['a'])
    })

    it("keeps Escape on the trouble notice to itself, too", async () => {
      const hostHeard: string[] = []
      const hostListener = (evt: KeyboardEvent) => { hostHeard.push(evt.key) }
      TH.renderReporting(<PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith(() => Promise.reject(new VaultError('vault_closed', 'The vault was closed.'))))} onDone={noop} />)
      TH.submitPassphrase('pw one')
      const close = await screen.findByRole('button', { name: 'Close' })
      document.addEventListener('keydown', hostListener)
      try {
        fireEvent.keyDown(close, { key: 'Escape' })
      } finally {
        document.removeEventListener('keydown', hostListener)
      }
      expect(hostHeard).to.deep.equal([])
    })

    it("follows the vault as it changes: one made on another device meanwhile turns 'choose' into 'unlock'", async () => {
      const opts = TH.memoryVaultOpts()
      const vault = await TH.settledVault(opts)
      render(<PassphraseModal ask={TH.askOf(vault)} onDone={noop} />)
      expect(screen.queryByText('Choose a vault passphrase')).to.not.be.null
      const elsewhere = await TH.settledVault({ ...opts, deviceDB: TH.memoryVaultOpts().deviceDB })
      await act(async () => { await elsewhere.unlock('pw') })
      elsewhere.close()
      await waitFor(() => { expect(screen.queryByText('Unlock your vault')).to.not.be.null })
      vault.close()
    })

    it("starts afresh when handed another vault, keeping nothing typed for the last", () => {
      const { rerender } = render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw for the first' } })
      rerender(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      expect(screen.queryByDisplayValue('pw for the first')).to.be.null
    })

    it("starts afresh after trouble when handed another vault", async () => {
      const { rerender } = TH.renderReporting(<PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith(() => Promise.reject(new VaultError('vault_closed', 'The vault was closed.'))))} onDone={noop} />)
      TH.submitPassphrase('pw one')
      await screen.findByText('Something went wrong')
      rerender(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      expect(screen.queryByText('Something went wrong')).to.be.null
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
    })
  })
  // --

  // == [Starting over]: forgotten passphrase, start over, delete

  describe("for a user who has forgotten the passphrase", () => {
    it("offers no way to start over unless asked to", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      expect(screen.queryByText('Forgot it? Start a new vault')).to.be.null
    })

    it("offers none while it creates the vault, with nothing to start over from", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} allowStartOver onDone={noop} />)
      expect(screen.queryByText('Forgot it? Start a new vault')).to.be.null
    })

    it("asks first, and keeping the vault goes back to the passphrase, deleting nothing", async () => {
      const vault = await lockedVault()
      render(<PassphraseModal ask={TH.askOf(vault)} allowStartOver onDone={noop} />)
      fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
      expect(screen.queryByText(/Remove this vault and start a new one\?/)).to.not.be.null
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
      expect(document.activeElement).to.equal(screen.getByText('Keep it'))
      fireEvent.click(screen.getByText('Keep it'))
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(vault.getSnapshot().state).to.eq('locked')
      vault.close()
    })

    it("deletes the vault once confirmed, a delete landing as a lock: the dialog closes, answering declined, and the next ask is to choose", async () => {
      const opts = TH.memoryVaultOpts()
      const maker = await TH.settledVault(opts)
      await maker.unlock('pw')
      await maker.putBox('anthropic_api_key', 'sk-fake')
      await maker.lock()
      maker.close()
      const { vault, ask, ensuring } = await TH.askedBy(opts)
      const heard: ProofAnswer[] = []
      render(<PassphraseModal ask={ask} allowStartOver onDone={(answer) => { heard.push(answer) }} />)
      fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
      fireEvent.click(screen.getByText('Remove and start over'))
      await waitFor(() => { expect(heard).to.deep.equal(['declined']) })
      expect(vault.getSnapshot().state).to.eq('absent')
      const { err } = await ensuring
      expect(err?.refusalkind).to.eq('vault_locked')
      vault.close()
    })

    it("shows a condition the delete meets in place, to try again", async () => {
      const del = vi.fn().mockRejectedValue(new VaultError('storage_unavailable', 'Storage could not be reached; try again in a moment.'))
      render(<PassphraseModal ask={TH.askOf(TH.stubVault({ del }))} allowStartOver onDone={noop} />)
      fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
      fireEvent.click(screen.getByText('Remove and start over'))
      await screen.findByText('Storage could not be reached; try again in a moment.')
      expect(screen.getByText('Remove and start over')).to.have.property('disabled', false)
    })

    it("deletes once for a double press, taking no second press while the delete runs", () => {
      const del = vi.fn(() => new Promise<void>(() => { /* still deleting */ }))
      render(<PassphraseModal ask={TH.askOf(TH.stubVault({ del }))} allowStartOver onDone={noop} />)
      fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
      fireEvent.click(screen.getByText('Remove and start over'))
      fireEvent.click(screen.getByText('Remove and start over'))
      expect(del).toHaveBeenCalledOnce()
      expect(screen.getByText('Remove and start over')).to.have.property('disabled', true)
    })

    it("meets a deletion that settles while a Suspense boundary hides it, offering it again once shown", async () => {
      const deleting = TH.held()
      const vault = TH.stubVault({ del: () => deleting.promise })
      const hiding = TH.held()
      const shown = (pending: Promise<undefined> | null) => (
        <Suspense fallback={<p>Loading</p>}>
          <TH.Hider hiding={pending} />
          <PassphraseModal ask={TH.askOf(vault)} allowStartOver onDone={noop} />
        </Suspense>
      )
      const { rerender } = render(shown(null))
      fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
      fireEvent.click(screen.getByText('Remove and start over'))
      await act(async () => {
        rerender(shown(hiding.promise))
        await TH.wakeupAtNextTick()
      })
      expect(screen.getByText('Loading')).to.not.be.null
      await act(async () => {
        deleting.reject(new VaultError('storage_unavailable', 'Storage could not be reached; try again in a moment.'))
        await TH.wakeupAtNextTick()
      })
      await act(async () => {
        hiding.resolve(undefined)
        await TH.wakeupAtNextTick()
      })
      expect(screen.queryByText('Loading')).to.be.null
      expect(screen.getByText('Storage could not be reached; try again in a moment.')).to.not.be.null
      expect(screen.getByText('Remove and start over')).to.have.property('disabled', false)
    })

    it("asks afresh once the vault it was asked of changed elsewhere, rather than deleting the one that stands", async () => {
      const del = vi.fn().mockRejectedValue(new VaultError('stale_write', 'The vault changed in storage since this device read it.'))
      render(<PassphraseModal ask={TH.askOf(TH.stubVault({ del }))} allowStartOver onDone={noop} />)
      fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
      fireEvent.click(screen.getByText('Remove and start over'))
      await screen.findByText('The vault changed in storage since this device read it.')
      expect(screen.queryByText('Remove and start over')).to.be.null
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      expect(del).toHaveBeenCalledOnce()
    })

    it("drops the question once the vault is deleted elsewhere, and never asks it of a vault made after", async () => {
      const opts = TH.memoryVaultOpts()
      const vault = await TH.settledVault(opts)
      await vault.unlock('pw')
      await vault.lock()
      render(<PassphraseModal ask={TH.askOf(vault)} allowStartOver onDone={noop} />)
      fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
      const deleter = await TH.settledVault({ ...opts, deviceDB: TH.memoryVaultOpts().deviceDB })
      await act(async () => { await deleter.del() })
      deleter.close()
      await screen.findByText('Choose a vault passphrase')
      const maker = await TH.settledVault({ ...opts, deviceDB: TH.memoryVaultOpts().deviceDB })
      await act(async () => { await maker.unlock('another pw') })
      maker.close()
      await screen.findByText('Unlock your vault')
      expect(screen.queryByText('Remove and start over')).to.be.null
      expect(screen.queryByPlaceholderText('vault passphrase')).to.not.be.null
      vault.close()
    })
  })
  // --

  // == [Password manager and advice]: password manager, username field, advice while choosing

  describe("for a password manager", () => {
    it("asks for a new password in a real form while it creates the vault", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} onDone={noop} />)
      const field = screen.getByPlaceholderText<HTMLInputElement>('vault passphrase')
      expect(field.closest('form')).to.not.be.null
      expect(field.type).to.eq('password')
      expect(field.getAttribute('autocomplete')).to.eq('new-password')
      expect(field.name).to.eq('new-password')
    })

    it("asks for the current password on an ordinary unlock", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      const field = screen.getByPlaceholderText<HTMLInputElement>('vault passphrase')
      expect(field.getAttribute('autocomplete')).to.eq('current-password')
      expect(field.name).to.eq('current-password')
    })

    it("files the passphrase under the user and the vault, in a hidden username field of the same form", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      expect(usernameField().value).to.eq('u1 (main vault)')
      expect(usernameField().hidden).to.be.true
      expect(usernameField().style.display).to.eq('none')
      expect(usernameField().form).to.eq(screen.getByPlaceholderText<HTMLInputElement>('vault passphrase').form)
    })

    it("keeps the username field hidden under a host stylesheet that shows every input", () => {
      const hostStyle = document.createElement('style')
      hostStyle.textContent = 'input { display: block }'
      document.head.append(hostStyle)
      try {
        render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
        expect(getComputedStyle(usernameField()).display).to.eq('none')
        expect(getComputedStyle(screen.getByPlaceholderText('vault passphrase')).display).to.eq('block')
      } finally {
        hostStyle.remove()
      }
    })

    it("files it under the host's passphraseUsername when given, as its example does", () => {
      const email = 'margo@example.com'
      render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseUsername={`${email} (vault)`} onDone={noop} />)
      expect(usernameField().value).to.eq('margo@example.com (vault)')
    })

    it("never capitalizes, corrects or spell-checks the passphrase", () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={noop} />)
      const field = screen.getByPlaceholderText('vault passphrase')
      expect(field.getAttribute('autocapitalize')).to.eq('none')
      expect(field.getAttribute('autocorrect')).to.eq('off')
      expect(field.getAttribute('spellcheck')).to.eq('false')
    })

    it("keeps the passphrase out of the page's markup, hidden or shown, and submits what was typed", async () => {
      const given: string[] = []
      render(<PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith((passphrase) => { given.push(passphrase); return Promise.resolve() }))} onDone={noop} />)
      const field = screen.getByPlaceholderText<HTMLInputElement>('vault passphrase')
      fireEvent.change(field, { target: { value: 'pw kept from the page' } })
      expect(field.hasAttribute('value')).to.be.false
      fireEvent.click(screen.getByRole('button', { name: 'Show' }))
      expect(field.type).to.eq('text')
      expect(screen.getByRole('button', { name: 'Hide' }).getAttribute('aria-pressed')).to.eq('true')
      expect(field.hasAttribute('value')).to.be.false
      expect(document.body.outerHTML).to.not.include('pw kept from the page')
      fireEvent.click(screen.getByText('Unlock'))
      await waitFor(() => { expect(given).to.deep.equal(['pw kept from the page']) })
    })
  })

  describe("advice while the user chooses a passphrase", () => {
    it("shows what passphraseAdvice says of the text typed, tied to the field and announced politely, as its example does", async () => {
      render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={twelveOrMore} onDone={noop} />)
      const field = screen.getByPlaceholderText('vault passphrase')
      expect(field.getAttribute('aria-describedby')).to.eq(adviceRegion().id)
      fireEvent.change(field, { target: { value: 'short' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('Twelve characters or more, please.') })
      fireEvent.change(field, { target: { value: 'four unrelated words here' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('') })
    })

    it("says nothing before anything is typed, nor once the field is emptied, without asking", async () => {
      const asked: string[] = []
      const advice = (typed: string) => { asked.push(typed); return 'Longer is stronger.' }
      render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={advice} onDone={noop} />)
      expect(adviceRegion().textContent).to.eq('')
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('Longer is stronger.') })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: '' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('') })
      expect(asked).to.deep.equal(['pw'])
    })

    it("shows only the answer to the latest text, however late an earlier answer arrives", async () => {
      const gate = TH.makeGate()
      const advice = async (typed: string) => {
        if (typed === 'slow') { await gate.pass() }
        return `said of ${typed}`
      }
      render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={advice} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'slow' } })
      await gate.reached
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'fast' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('said of fast') })
      await act(async () => {
        gate.release()
        await TH.wakeupAtNextTick()
      })
      expect(adviceRegion().textContent).to.eq('said of fast')
    })

    it("is never asked while unlocking, and has no region there", () => {
      const asked: string[] = []
      render(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} passphraseAdvice={(typed) => { asked.push(typed); return 'Longer.' }} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      expect(screen.queryByRole('status')).to.be.null
      expect(screen.getByPlaceholderText('vault passphrase').hasAttribute('aria-describedby')).to.be.false
      expect(asked).to.deep.equal([])
    })

    it("lets the user create the vault whatever it says: it is advice, and the vault decides", async () => {
      const given: unknown[] = []
      const vault = TH.stubVault({ state: 'absent', unlock: (passphrase) => { given.push(passphrase); return Promise.resolve() } })
      render(<PassphraseModal ask={TH.askOf(vault)} passphraseAdvice={() => 'Too short.'} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      await screen.findByText('Too short.')
      fireEvent.click(screen.getByText('Create vault'))
      await waitFor(() => { expect(given).to.deep.equal(['pw']) })
    })

    it("throws advice that throws on to the app's error boundary, a fixed unexpected_error quoting nothing of the throw, which heard the passphrase", async () => {
      const { reported } = TH.renderReporting(<TH.Catcher><PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={quotingAdvice} onDone={noop} /></TH.Catcher>)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw-the-passphrase' } })
      expect(await screen.findByText(/^caught: /)).to.not.be.null
      expect(screen.queryByText(Trouble)).to.be.null
      expect(reported).to.have.lengthOf(1)
      const told = reported[0] as VaultError
      expect(told).to.include({ refusalkind: 'unexpected_error' })
      expect(told.message).to.include('passphraseAdvice').and.not.include('pw-the-passphrase')
      expect(told.cause).to.be.undefined
    })

    it("reports a VaultError the host's advice throws as any throw of it, quoting nothing of it: the host may have put the passphrase in it", async () => {
      const refusal = new VaultError('bad_option', 'pw-the-passphrase is no passphrase I can judge.')
      const { reported } = TH.renderReporting(<TH.Catcher><PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={() => Promise.reject(refusal)} onDone={noop} /></TH.Catcher>)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw-the-passphrase' } })
      expect(await screen.findByText(/^caught: /)).to.not.be.null
      expect(reported).to.have.lengthOf(1)
      expect(reported[0]).to.not.eq(refusal)
      expect(reported[0]).to.include({ refusalkind: 'unexpected_error' })
      expect(TH.thrownText(reported[0])).to.not.include('pw-the-passphrase')
    })

    it("asks vault.checkPassphrase when the host gives no advice, saying its reason for a weak passphrase", async () => {
      const checkPassphrase = vi.fn((typed: string) => Promise.resolve(typed.length < 6 ? { strong: false as const, reason: 'Longer, please.' } : { strong: true as const }))
      render(<PassphraseModal ask={TH.askOf(TH.stubVault({ state: 'absent', checkPassphrase }))} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('Longer, please.') })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw longer' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('') })
      expect(checkPassphrase.mock.calls).to.deep.equal([['pw'], ['pw longer']])
    })

    it("throws a broken strength checker, met by its own advice as the user types, on to the app's error boundary as the vault's refusal", async () => {
      const vault = await TH.settledVault(TH.memoryVaultOpts({ strengthChecker: () => Promise.reject(new Error('could not judge pw-the-passphrase')) }))
      const { reported } = TH.renderReporting(<TH.Catcher><PassphraseModal ask={TH.askOf(vault)} onDone={noop} /></TH.Catcher>)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw-the-passphrase' } })
      expect(await screen.findByText(/^caught: /)).to.not.be.null
      expect(screen.queryByText(Trouble)).to.be.null
      expect(reported).to.have.lengthOf(1)
      expect(reported[0]).to.include({ refusalkind: 'unexpected_error' })
      expect((reported[0] as Error).message).to.match(/strengthChecker handed to Vault\.make threw/)
      expect(TH.thrownText(reported[0])).to.not.include('pw-the-passphrase')
      vault.close()
    })

    it("lets a superseded call's failure pass unseen: only the latest call can fail the dialog", async () => {
      const gate = TH.makeGate()
      const advice = async (typed: string) => {
        if (typed === 'slow') {
          await gate.pass()
          throw new Error('the superseded advice broke')
        }
        return `said of ${typed}`
      }
      const { reported } = TH.renderReporting(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={advice} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'slow' } })
      await gate.reached
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'fast' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('said of fast') })
      await act(async () => {
        gate.release()
        await TH.wakeupAtNextTick()
      })
      expect(screen.queryByText(Trouble)).to.be.null
      expect(reported).to.deep.equal([])
      expect(adviceRegion().textContent).to.eq('said of fast')
    })

    it("forgets what it said once the vault is made and deleted elsewhere, and an answer still on its way with it", async () => {
      const opts = TH.memoryVaultOpts()
      const vault = await TH.settledVault(opts)
      const gate = TH.makeGate()
      const advice = async (typed: string) => {
        if (typed === 'slow') { await gate.pass() }
        return `said of ${typed}`
      }
      render(<PassphraseModal ask={TH.askOf(vault)} passphraseAdvice={advice} onDone={noop} />)
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'quick' } })
      await waitFor(() => { expect(adviceRegion().textContent).to.eq('said of quick') })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'slow' } })
      await gate.reached
      const elsewhere = await TH.settledVault({ ...opts, deviceDB: TH.memoryVaultOpts().deviceDB })
      await act(async () => { await elsewhere.unlock('pw') })
      await screen.findByText('Unlock your vault')
      await act(async () => { await elsewhere.del() })
      elsewhere.close()
      await screen.findByText('Choose a vault passphrase')
      await act(async () => {
        gate.release()
        await TH.wakeupAtNextTick()
      })
      expect(adviceRegion().textContent).to.eq('')
      vault.close()
    })

    it("reads an undefined answer, from a host in JavaScript, as nothing to say, keeping its region", async () => {
      const silent = (() => undefined) as unknown as PassphraseAdvice
      render(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={silent} onDone={noop} />)
      const field = screen.getByPlaceholderText('vault passphrase')
      fireEvent.change(field, { target: { value: 'pw' } })
      await act(async () => { await TH.wakeupAtNextTick() })
      expect(adviceRegion().textContent).to.eq('')
      expect(field.getAttribute('aria-describedby')).to.eq(adviceRegion().id)
    })
  })
  // --

  // == [After it has gone]: once it has gone

  describe("once it has gone", () => {
    // Each call is held under way while the dialog unmounts -- its host took it away, or the test
    // that rendered it ended -- and settles after. A dialog gone touches neither its own state nor
    // its host's callbacks, whatever the outcome; one that stands meets the outcome as ever.

    it("meets a refusal that lands while it stands, as ever", async () => {
      const unlocking = TH.held()
      const { heard } = renderUnlocking(unlocking.promise)
      TH.submitPassphrase('pw')
      const updates = TH.watchStateUpdates()
      await act(async () => {
        unlocking.reject(new VaultError('wrong_passphrase', 'That passphrase did not open the vault.'))
        await TH.wakeupAtNextTick()
      })
      expect(screen.getByRole('alert').textContent).to.eq('That passphrase did not open the vault.')
      expect(updates.count()).to.be.above(0)
      expect(heard).to.deep.equal([])
    })

    const UnlockOutcomes = [
      [null,                                                                  'an unlock that succeeds'],
      [new VaultError('wrong_passphrase', 'That passphrase did not open it.'), 'a wrong passphrase'],
      [new VaultError('vault_locked', 'Locked meanwhile.'),                   'a lock that won meanwhile'],
      [new VaultError('vault_closed', 'This vault handle was closed.'),       'misuse: the handle its provider closed as it unmounted'],
      [new Error('not a VaultError'),                                         'a failure that is no VaultError'],
    ] as const

    for (const [refusal, blurb] of UnlockOutcomes) {
      it(`does nothing with ${blurb}, landing after it unmounted`, async () => {
        const unlocking = TH.held()
        const { heard, reported, unmount } = renderUnlocking(unlocking.promise)
        TH.submitPassphrase('pw')
        unmount()
        const updates = TH.watchStateUpdates()
        await act(async () => {
          if (refusal === null) { unlocking.resolve(undefined) } else { unlocking.reject(refusal) }
          await TH.wakeupAtNextTick()
        })
        expect(updates.count()).to.eq(0)
        expect(heard).to.deep.equal([])
        expect(reported).to.deep.equal([])
      })
    }

    it("does nothing with an unlock of the vault it was handed before, landing after another took its place", async () => {
      const unlocking = TH.held()
      const heard: ProofAnswer[] = []
      const onDone = (answer: ProofAnswer) => { heard.push(answer) }
      const { rerender } = render(<PassphraseModal ask={TH.askOf(TH.vaultUnlockingWith(() => unlocking.promise))} onDone={onDone} />)
      TH.submitPassphrase('pw')
      rerender(<PassphraseModal ask={TH.askOf(vaultInState('locked'))} onDone={onDone} />)
      const updates = TH.watchStateUpdates()
      await act(async () => {
        unlocking.resolve(undefined)
        await TH.wakeupAtNextTick()
      })
      expect(updates.count()).to.eq(0)
      expect(heard).to.deep.equal([])
      expect(screen.getByText('Unlock your vault')).to.not.be.null
    })

    const DelOutcomes = [
      [null,                                                                   'a delete that succeeds'],
      [new VaultError('stale_write', 'The vault changed in storage.'),         'a delete refused: the vault changed elsewhere'],
      [new VaultError('storage_unavailable', 'Storage could not be reached.'), 'a delete that meets a condition'],
      [new VaultError('vault_closed', 'This vault handle was closed.'),        'a delete that meets misuse: a closed handle'],
    ] as const

    for (const [refusal, blurb] of DelOutcomes) {
      it(`does nothing with ${blurb}, landing after it unmounted`, async () => {
        const deleting = TH.held()
        const heard: ProofAnswer[] = []
        const { reported, unmount } = TH.renderReporting(<PassphraseModal ask={TH.askOf(TH.stubVault({ del: () => deleting.promise }))} allowStartOver onDone={(unlocked) => { heard.push(unlocked) }} />)
        fireEvent.click(screen.getByText('Forgot it? Start a new vault'))
        fireEvent.click(screen.getByText('Remove and start over'))
        unmount()
        const updates = TH.watchStateUpdates()
        await act(async () => {
          if (refusal === null) { deleting.resolve(undefined) } else { deleting.reject(refusal) }
          await TH.wakeupAtNextTick()
        })
        expect(updates.count()).to.eq(0)
        expect(heard).to.deep.equal([])
        expect(reported).to.deep.equal([])
      })
    }

    const AdviceOutcomes = [
      ["Longer is stronger.",          'advice that answers'],
      [new Error('the advice failed'), 'advice that fails'],
    ] as const

    for (const [outcome, blurb] of AdviceOutcomes) {
      it(`does nothing with ${blurb}, landing after it unmounted`, async () => {
        const answering = TH.held<string | null>()
        const { reported, unmount } = TH.renderReporting(<PassphraseModal ask={TH.askOf(vaultInState('absent'))} passphraseAdvice={() => answering.promise} onDone={noop} />)
        fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw' } })
        unmount()
        const updates = TH.watchStateUpdates()
        await act(async () => {
          if (typeof outcome === 'string') { answering.resolve(outcome) } else { answering.reject(outcome) }
          await TH.wakeupAtNextTick()
        })
        expect(updates.count()).to.eq(0)
        expect(reported).to.deep.equal([])
      })
    }
  })
  // --
})
