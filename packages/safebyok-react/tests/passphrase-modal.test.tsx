import { Component, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ForeverMillis, ForcePassphraseReentryHours, VaultError, openVault, type Vault } from 'safebyok'
import { PassphraseModal } from '../src/passphrase-modal'
import * as TH from './test-helpers'

/** The window, in milliseconds, of a vault opened with the default forcePassphraseReentryHours. */
const DefaultWindowMillis = ForcePassphraseReentryHours * 3_600_000

/**
 * Just enough of a Vault for the dialog to read its state and window (the default, unless given);
 * it never unlocks one here.
 */
const vaultInState = (state: 'absent' | 'locked', reentryWindowMillis = DefaultWindowMillis) => (
  { getSnapshot: () => ({ state }), reentryWindowMillis }
) as unknown as Vault

/** A locked Vault whose unlock runs `unlock`, which gets the passphrase the dialog submits. */
const vaultUnlockingWith = (unlock: (passphrase: string) => Promise<void>) => (
  { getSnapshot: () => ({ state: 'locked' }), reentryWindowMillis: DefaultWindowMillis, unlock } as unknown as Vault
)

/** The dialog's `onDone` for tests that never submit. */
const noop = (_unlocked: boolean) => undefined

/** Types the passphrase in the dialog and presses Unlock. */
const submitPassphrase = (passphrase: string) => {
  fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: passphrase } })
  fireEvent.click(screen.getByText('Unlock'))
}

/** An error boundary that shows what it caught, as a host's would. */
class Catcher extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state = { caught: null as string | null }
  static getDerivedStateFromError(err: unknown) { return { caught: err instanceof Error ? err.message : 'not an Error' } }
  override render() { return this.state.caught === null ? this.props.children : <p>{`caught: ${this.state.caught}`}</p> }
}

/** The dialog's word to a user it cannot help, once something not theirs to mend went wrong. */
const Trouble = /This app ran into a problem of its own, not one you caused, and could not unlock your vault\. Your secrets are safe\./

/** A locked Vault whose every unlock is refused as a wrong passphrase. */
const wrong = () => vaultUnlockingWith(() => Promise.reject(new VaultError('wrong_passphrase', 'That passphrase did not open the vault.')))

afterEach(cleanup)

describe("PassphraseModal", () => {
  it("tells a user choosing a passphrase that nobody can recover it", () => {
    render(<PassphraseModal vault={vaultInState('absent')} onDone={noop} />)
    expect(screen.queryByText('Choose a vault passphrase')).to.not.be.null
    expect(screen.queryByText(/Nobody can recover it for you/)).to.not.be.null
    expect(screen.queryByText('Create vault')).to.not.be.null
  })

  it("tells a user unlocking that a forgotten passphrase cannot be recovered", () => {
    render(<PassphraseModal vault={vaultInState('locked')} onDone={noop} />)
    expect(screen.queryByText('Unlock your vault')).to.not.be.null
    expect(screen.queryByText(/forgotten passphrase cannot be recovered/)).to.not.be.null
  })

  it("hands the typed passphrase to the vault and reports an unlock", async () => {
    const heard: boolean[] = []
    const given: string[] = []
    const vault = vaultUnlockingWith((passphrase) => { given.push(passphrase); return Promise.resolve() })
    render(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
    submitPassphrase('pw one')
    await waitFor(() => { expect(heard).to.deep.equal([true]) })
    expect(given).to.deep.equal(['pw one'])
  })

  it("reports a dismissal when the user cancels", () => {
    const heard: boolean[] = []
    render(<PassphraseModal vault={vaultInState('locked')} onDone={(unlocked) => { heard.push(unlocked) }} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(heard).to.deep.equal([false])
  })

  it("closes as if dismissed when its unlock loses to a lock() called meanwhile", async () => {
    const heard: boolean[] = []
    const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('vault_locked', 'The vault was locked while this unlock was under way.')))
    render(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
    submitPassphrase('pw one')
    await waitFor(() => { expect(heard).to.deep.equal([false]) })
  })

  describe("a wrong passphrase", () => {

    it("stays in the dialog with the vault's calm message, and does not report done", async () => {
      const heard: boolean[] = []
      render(<PassphraseModal vault={wrong()} onDone={(unlocked) => { heard.push(unlocked) }} />)
      submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.queryByText('That passphrase did not open the vault.')).to.not.be.null })
      expect(heard).to.deep.equal([])
    })

    it("announces the message to a screen reader", async () => {
      render(<PassphraseModal vault={wrong()} onDone={noop} />)
      submitPassphrase('pw wrong')
      const said = await screen.findByRole('alert')
      expect(said.textContent).to.eq('That passphrase did not open the vault.')
    })

    it("clears the message once the user types again", async () => {
      render(<PassphraseModal vault={wrong()} onDone={noop} />)
      submitPassphrase('pw wrong')
      await waitFor(() => { expect(screen.queryByText('That passphrase did not open the vault.')).to.not.be.null })
      fireEvent.change(screen.getByPlaceholderText('vault passphrase'), { target: { value: 'pw wrong again' } })
      expect(screen.queryByText('That passphrase did not open the vault.')).to.be.null
    })
  })

  describe("any other failure of the unlock", () => {
    it("shows a condition in the dialog in place, as it does a wrong passphrase", async () => {
      const heard: boolean[] = []
      const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('storage_unavailable', 'Storage could not be reached; try again in a moment.')))
      render(<Catcher><PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} /></Catcher>)
      submitPassphrase('pw one')
      await waitFor(() => { expect(screen.queryByText('Storage could not be reached; try again in a moment.')).to.not.be.null })
      expect(heard).to.deep.equal([])
      expect(screen.queryByText(/caught:/)).to.be.null
    })

    it("meets misuse with a calm notice in the dialog, and reports the very error to React, leaving the page alone", async () => {
      const closed = new VaultError('vault_closed', 'The vault was closed.')
      const heard: boolean[] = []
      const { reported } = TH.renderReporting(<Catcher><PassphraseModal vault={vaultUnlockingWith(() => Promise.reject(closed))} onDone={(unlocked) => { heard.push(unlocked) }} /></Catcher>)
      submitPassphrase('pw one')
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(screen.getByRole('alertdialog', { name: 'Something went wrong' }).textContent).to.match(Trouble)
      expect(reported).to.deep.equal([closed])
      expect(reported[0]).to.equal(closed)
      expect(screen.queryByText(/caught:/)).to.be.null
      expect(screen.queryByText('The vault was closed.')).to.be.null
      expect(heard).to.deep.equal([])
    })

    it("forgets the typed passphrase with the form, and moves focus to Close", async () => {
      const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('bad_option', 'A bad option.')))
      TH.renderReporting(<PassphraseModal vault={vault} onDone={noop} />)
      submitPassphrase('pw one')
      await screen.findByText('Something went wrong')
      expect(screen.queryByPlaceholderText('vault passphrase')).to.be.null
      expect(screen.queryByDisplayValue('pw one')).to.be.null
      expect(document.activeElement).to.equal(screen.getByRole('button', { name: 'Close' }))
    })

    it("closes as if dismissed when the user presses Escape on the notice", async () => {
      const heard: boolean[] = []
      const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('vault_closed', 'The vault was closed.')))
      TH.renderReporting(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
      submitPassphrase('pw one')
      fireEvent.keyDown(await screen.findByRole('button', { name: 'Close' }), { key: 'Escape' })
      expect(heard).to.deep.equal([false])
    })

    it("closes as if dismissed when the user closes the notice", async () => {
      const heard: boolean[] = []
      const vault = vaultUnlockingWith(() => Promise.reject(new VaultError('unknown_key_deriver', 'This vault was made with a key deriver this package does not carry.')))
      TH.renderReporting(<PassphraseModal vault={vault} onDone={(unlocked) => { heard.push(unlocked) }} />)
      submitPassphrase('pw one')
      fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
      expect(heard).to.deep.equal([false])
    })

    it("meets a failure that is no VaultError the same way", async () => {
      const fell = new TypeError('fell over')
      const { reported } = TH.renderReporting(<Catcher><PassphraseModal vault={vaultUnlockingWith(() => Promise.reject(fell))} onDone={noop} /></Catcher>)
      submitPassphrase('pw one')
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(reported).to.deep.equal([fell])
      expect(screen.queryByText(/caught:|fell over/)).to.be.null
    })

    it("meets a rejection that is no Error at all the same way", async () => {
      const { reported } = TH.renderReporting(<Catcher><PassphraseModal vault={{ getSnapshot: () => ({ state: 'locked' }), reentryWindowMillis: DefaultWindowMillis, unlock: vi.fn().mockRejectedValue(null) } as unknown as Vault} onDone={noop} /></Catcher>)
      submitPassphrase('pw one')
      expect(await screen.findByText('Something went wrong')).to.not.be.null
      expect(reported).to.deep.equal([null])
    })
  })

  describe("how long it says an unlock lasts", () => {
    const WindowCases = [
      // regular usage:
      [undefined,         "Locks on this device in 7 days.",         'the default window is seven days'],
      [24,                "Locks on this device in 1 day.",          'one day is singular'],
      [72,                "Locks on this device in 3 days.",         'whole days read as days'],
      [8,                 "Locks on this device in 8 hours.",        'hours that do not make a day read as hours'],
      [1,                 "Locks on this device in 1 hour.",         'one hour is singular'],
      [36,                "Locks on this device in 36 hours.",       'a day and a half reads as hours'],
      [0.25,              "Locks on this device in 15 minutes.",     'a fraction of an hour reads as minutes'],
      [Infinity,          "Stays unlocked on this device until you lock it.",  'Infinity means until locked'],
      // edge cases:
      [1 / 60,            "Locks on this device in 1 minute.",       'one minute is singular'],
      [0.0001,            "Locks on this device in 1 minute.",       'a window under a minute rounds up to one'],
      [1.5,               "Locks on this device in 90 minutes.",     'an hour and a half reads as minutes'],
      [1e9,               "Stays unlocked on this device until you lock it.",  'a window longer than the vault can count means until locked'],
    ] as const

    // A real vault that has not been created reads 'Locks on', no 'again'. Each is from a vault
    // opened with the hours given, so the dialog reads what openVault made of them.
    for (const [hours, expected, blurb] of WindowCases) {
      it(blurb, async () => {
        const vault = await openVault(TH.memoryVaultOpts({ forcePassphraseReentryHours: hours }))
        render(<PassphraseModal vault={vault} onDone={noop} />)
        expect(screen.queryByText(expected)).to.not.be.null
        vault.close()
      })
    }

    it("reads ForeverMillis, the longest window a vault keeps, as until locked", () => {
      render(<PassphraseModal vault={vaultInState('locked', ForeverMillis)} onDone={noop} />)
      expect(screen.queryByText("Stays unlocked on this device until you lock it.")).to.not.be.null
    })

    it("drops the 'again' while the dialog creates the vault", () => {
      render(<PassphraseModal vault={vaultInState('absent')} onDone={noop} />)
      expect(screen.queryByText("Locks on this device in 7 days.")).to.not.be.null
    })

    it("keeps the 'again' on an ordinary unlock", () => {
      render(<PassphraseModal vault={vaultInState('locked')} onDone={noop} />)
      expect(screen.queryByText("Locks again on this device in 7 days.")).to.not.be.null
    })

    it("reads a millisecond short of ForeverMillis as a count, not as until locked", () => {
      render(<PassphraseModal vault={vaultInState('locked', ForeverMillis - 1)} onDone={noop} />)
      expect(screen.queryByText(/Locks again on this device in [\d,]+ minutes\./)).to.not.be.null
    })
  })
})
