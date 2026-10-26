import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type RequestCleartext, type StrengthChecker, type Vault } from 'safebyok'
import { GatingModal } from '../src/gating-modal'
import type { DialogAnswer } from '../src/modal'
import * as TH from './test-helpers'

// == [Test helpers]: Passphrase, vaultOf, answersOf, typeInto, submit, theGripe

/** The passphrase every vault here is made with: an obvious fake. */
const Passphrase = 'correct horse battery staple'

/** `u1`'s vault in a fresh world, its passphrase set (and so unlocked), born of `overrides`; with a passkey too when `withPasskey`. */
const vaultOf = async (overrides: Partial<TH.BornVaultOpts> = {}, withPasskey = false): Promise<Vault> => {
  const vault = await TH.settledVault(TH.memoryVaultOpts(overrides))
  await TH.unlock(vault, Passphrase)
  if (withPasskey) { await TH.putWayin(vault, Passphrase, await TH.passkeyOf('laptop')) }
  return vault
}

/** A record of each answer the dialog gives, and the `onDone` that keeps it. */
const answersOf = () => {
  const heard: DialogAnswer[] = []
  return { heard, onDone: (answer: DialogAnswer) => { heard.push(answer) } }
}

/** Types `typed` into the field with the placeholder `fieldlabel`. */
const typeInto = (fieldlabel: string, typed: string) => {
  fireEvent.change(screen.getByPlaceholderText(fieldlabel), { target: { value: typed } })
}

/** Submits the dialog's form, as its submit button does. */
const submit = () => {
  const form = screen.getByRole('dialog').querySelector('form')
  if (form === null) { throw new Error('the dialog has no form') }
  fireEvent.submit(form)
}

/** What the dialog's live region says, once it says anything. */
const theGripe = async () => {
  await waitFor(() => { expect(screen.getByRole('alert').textContent).to.not.eq('') })
  return screen.getByRole('alert').textContent
}

/** A strength checker that finds `weak` weak, and every other passphrase strong. */
const weakIsWeak: StrengthChecker = (passphrase) => (passphrase === 'weak' ? { strong: false, reason: 'Too easy to guess.' } : { strong: true })

afterEach(() => { TH.uninstallFakeAuthenticator() })
// --

describe("GatingModal, by kind", () => {
  it("shows the passphrase dialog for a first passphrase and for an unlock", () => {
    render(<GatingModal gating={TH.stubGating({ state: 'novel' })} onDone={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Choose a vault passphrase' })).to.not.be.null
    render(<GatingModal gating={TH.stubGating({ state: 'locked' })} onDone={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Unlock your vault' })).to.not.be.null
  })

  it("answers every kind of gating a host's own requestCleartext hands it, as its example shows", async () => {
    const host: { show: (dialog: ReactNode) => void } = { show: () => undefined }
    const Host = () => {
      const [shown, setShown] = useState<ReactNode>(null)
      host.show = setShown
      return shown
    }
    render(<Host />)
    const showDialog = (dialog: ReactNode) => { act(() => { host.show(dialog) }) }
    const requestCleartext: RequestCleartext = (gating) => new Promise((closed) => {
      showDialog(<GatingModal gating={gating} onDone={() => { showDialog(null); closed() }} />)
    })
    const vault = await TH.settledVault(TH.memoryVaultOpts({ requestCleartext }))
    const ensuring = vault.ensureUnlocked()
    await screen.findByRole('dialog', { name: 'Choose a vault passphrase' })
    TH.typeNewPassphrase(Passphrase)
    submit()
    await ensuring
    const changing = vault.putWayin('passphrase')
    await screen.findByRole('dialog', { name: 'Change your vault passphrase' })
    typeInto('current passphrase', Passphrase)
    TH.typeNewPassphrase('a new passphrase', { fieldlabel: 'new passphrase' })
    submit()
    await changing
    const deleting = vault.del()
    await screen.findByRole('dialog', { name: 'Delete your vault' })
    typeInto('vault passphrase', 'a new passphrase')
    submit()
    await deleting
    await TH.expectRefusal(vault.getBox('anthropic_api_key'), 'vault_gone')
  })
})

describe("GatingModal, change_passphrase", () => {
  it("replaces the current passphrase with the next, answering unlocked, as TH.heldGatingOf's example shows", async () => {
    const vault = await vaultOf()
    const { gating, raising } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    expect(screen.getByRole('dialog', { name: 'Change your vault passphrase' })).to.not.be.null
    typeInto('current passphrase', Passphrase)
    TH.typeNewPassphrase('a new passphrase', { fieldlabel: 'new passphrase' })
    submit()
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    await TH.expectGood(raising)
    await vault.lock()
    await TH.expectBad(TH.tryUnlock(vault, Passphrase), 'wrong_passphrase')
    await TH.unlock(vault, 'a new passphrase')
  })

  it("keeps asking on a wrong current passphrase, saying so in place, and changes nothing", async () => {
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    const { heard, onDone } = answersOf()
    const before = vault.snapshot.gate?.passphrase
    render(<GatingModal gating={gating} onDone={onDone} />)
    typeInto('current passphrase', 'not it')
    TH.typeNewPassphrase('a new passphrase', { fieldlabel: 'new passphrase' })
    submit()
    expect(await theGripe()).to.match(/didn't unlock the vault/)
    expect(heard).to.deep.equal([])
    expect(vault.snapshot.gate?.passphrase).to.eq(before)
  })

  it("asks for another when the next is the current one again (same_passphrase), in place", async () => {
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    typeInto('current passphrase', Passphrase)
    TH.typeNewPassphrase(Passphrase, { fieldlabel: 'new passphrase' })
    submit()
    expect(await theGripe()).to.match(/already has: choose a different one/)
    expect(heard).to.deep.equal([])
    TH.typeNewPassphrase('a new passphrase', { fieldlabel: 'new passphrase' })
    expect(screen.getByRole('alert').textContent).to.eq('')
    submit()
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
  })

  it("advises on the next passphrase as it is typed, and shows a weak one refused in place", async () => {
    const vault = await vaultOf({ strengthChecker: weakIsWeak })
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    render(<GatingModal gating={gating} onDone={() => undefined} />)
    TH.typeNewPassphrase('weak', { fieldlabel: 'new passphrase' })
    await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('Too easy to guess.') })
    typeInto('current passphrase', Passphrase)
    submit()
    expect(await theGripe()).to.eq('Too easy to guess.')
  })

  it("refuses a next passphrase its confirmation does not match, in place, deriving no key and changing nothing, the passkey kept; once they match, it changes, as TH.typeNewPassphrase's example shows", async () => {
    const deriveKeyBytes = vi.fn((passphrase: string, saltBytes: Uint8Array) => TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
    const vault = await vaultOf({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes } }, true)
    const { gating, raising } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    const { heard, onDone } = answersOf()
    const before = vault.snapshot.gate?.passphrase
    const derivedBefore = deriveKeyBytes.mock.calls.length
    render(<GatingModal gating={gating} onDone={onDone} />)
    typeInto('current passphrase', Passphrase)
    TH.typeNewPassphrase('a new passphrase', { fieldlabel: 'new passphrase', confirming: 'a new passprase' })
    submit()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).to.eq("The new passphrase and its confirmation don't match: type the same one in both.")
    const confirmField = screen.getByPlaceholderText('confirm new passphrase')
    expect(confirmField.getAttribute('aria-invalid')).to.eq('true')
    expect(confirmField.getAttribute('aria-describedby')).to.eq(alert.id)
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(deriveKeyBytes.mock.calls).to.have.lengthOf(derivedBefore)
    expect(heard).to.deep.equal([])
    expect(vault.snapshot.gate?.passphrase).to.eq(before)
    expect(vault.getSnapshot().gate?.passkey).to.not.be.null
    expect(document.body.outerHTML).to.not.include('a new passprase')
    typeInto('confirm new passphrase', 'a new passphrase')
    expect(screen.getByRole('alert').textContent).to.eq('')
    submit()
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    await TH.expectGood(raising)
    await vault.lock()
    await TH.unlock(vault, 'a new passphrase')
  })

  it("asks the strength check of the next passphrase, never of its confirmation", async () => {
    const strengthChecker = vi.fn(weakIsWeak)
    const vault = await vaultOf({ strengthChecker })
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    render(<GatingModal gating={gating} onDone={() => undefined} />)
    const askedBefore = strengthChecker.mock.calls.length
    TH.typeNewPassphrase('weak', { fieldlabel: 'new passphrase', confirming: 'confirmed only' })
    await waitFor(() => { expect(screen.getByRole('status').textContent).to.eq('Too easy to guess.') })
    expect(strengthChecker.mock.calls.slice(askedBefore).map(([typed]) => typed)).to.deep.equal(['weak'])
  })

  it("says the passkey goes with the old passphrase, only for a vault that has one", async () => {
    const vault = await vaultOf({}, true)
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    render(<GatingModal gating={gating} onDone={() => undefined} />)
    expect(screen.getByText(/Your passkey goes with the old passphrase/)).to.not.be.null
    const plain = await vaultOf()
    const held = await TH.heldGatingOf(plain, (raised) => raised.tryPutWayin('passphrase'), 'change_passphrase')
    render(<GatingModal gating={held.gating} onDone={() => undefined} />)
    expect(screen.getAllByText(/Your passkey goes with the old passphrase/)).to.have.lengthOf(1)
  })

  it("is a change-password form a password manager knows: the username, the current passphrase, and the new one twice, in one form", async () => {
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    render(<GatingModal gating={gating} passphraseUsername="ada (main vault)" onDone={() => undefined} />)
    const form = screen.getByRole('dialog').querySelector('form')
    const autocompletes = [...(form?.querySelectorAll('input') ?? [])].map((input) => input.getAttribute('autocomplete'))
    expect(autocompletes).to.deep.equal(['username', 'current-password', 'new-password', 'new-password'])
    expect(form?.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.value).to.eq('ada (main vault)')
  })

  it("answers declined on Cancel, and putWayin refuses vault_locked, saying the passphrase is unchanged", async () => {
    const vault = await vaultOf()
    const { gating, raising, close } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={(answer) => { onDone(answer); close() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(heard).to.deep.equal(['declined'])
    const err = await TH.expectBad(raising, 'vault_locked')
    expect(err.message).to.match(/passphrase is unchanged/)
  })
})

describe("GatingModal, put_passkey", () => {
  it("adds a passkey: the passphrase, then one the browser makes, answering unlocked, filed under the username for the vault's app", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const vault = await vaultOf()
    const { gating, raising } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passkey'), 'put_passkey')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    expect(screen.getByRole('dialog', { name: 'Add a passkey' })).to.not.be.null
    typeInto('vault passphrase', Passphrase)
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }))
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    await TH.expectGood(raising)
    expect(vault.snapshot.gate?.passkey?.credential_id).to.eq(authenticator.credentialIds()[0])
    const made = authenticator.calls.create[0]?.publicKey
    expect(made?.rp).to.deep.equal({ name: 'acme' })
    expect(made?.user).to.include({ name: 'u1 (main vault)', displayName: 'u1 (main vault)' })
  })

  it("offers to replace the passkey of a vault that has one", async () => {
    TH.installFakeAuthenticator()
    const vault = await vaultOf({}, true)
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passkey'), 'put_passkey')
    render(<GatingModal gating={gating} onDone={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Replace your passkey' })).to.not.be.null
    expect(screen.getByRole('button', { name: 'Replace passkey' })).to.not.be.null
  })

  it("keeps asking, saying nothing, when the user dismisses the browser's prompt", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passkey'), 'put_passkey')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    authenticator.refuseNext('NotAllowedError')
    typeInto('vault passphrase', Passphrase)
    submit()
    await waitFor(() => { expect(authenticator.calls.create).to.have.lengthOf(1) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(heard).to.deep.equal([])
    expect(screen.getByRole('alert').textContent).to.eq('')
    expect(vault.snapshot.gate?.passkey).to.be.null
  })

  it("shows a wrong passphrase in place, the passkey made for it unused, and makes another at the next submit", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passkey'), 'put_passkey')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    typeInto('vault passphrase', 'not it')
    submit()
    expect(await theGripe()).to.match(/didn't unlock the vault/)
    expect(vault.snapshot.gate?.passkey).to.be.null
    typeInto('vault passphrase', Passphrase)
    submit()
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    expect(authenticator.credentialIds()).to.have.lengthOf(2)
    expect(vault.snapshot.gate?.passkey?.credential_id).to.eq(authenticator.credentialIds()[1])
  })

  it("says in place that a browser without WebAuthn offers no passkeys", async () => {
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passkey'), 'put_passkey')
    render(<GatingModal gating={gating} onDone={() => undefined} />)
    typeInto('vault passphrase', Passphrase)
    submit()
    expect(await theGripe()).to.match(/offers no passkeys/)
  })

  it("makes one passkey at a time, however often the user submits while it asks", async () => {
    const authenticator = TH.installFakeAuthenticator()
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passkey'), 'put_passkey')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    typeInto('vault passphrase', Passphrase)
    submit()
    submit()
    submit()
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    expect(authenticator.calls.create).to.have.lengthOf(1)
  })
})

describe("GatingModal, del_passkey", () => {
  it("removes the passkey, proven by the passphrase, answering unlocked", async () => {
    const vault = await vaultOf({}, true)
    const { gating, raising } = await TH.heldGatingOf(vault, (held) => held.tryDelWayin('passkey'), 'del_passkey')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    expect(screen.getByRole('dialog', { name: 'Remove your passkey' })).to.not.be.null
    typeInto('vault passphrase', Passphrase)
    fireEvent.click(screen.getByRole('button', { name: 'Remove passkey' }))
    await waitFor(() => { expect(heard).to.deep.equal(['unlocked']) })
    await TH.expectGood(raising)
    expect(vault.snapshot.gate?.passkey).to.be.null
  })

  it("shows a wrong passphrase in place, and the passkey stays", async () => {
    const vault = await vaultOf({}, true)
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryDelWayin('passkey'), 'del_passkey')
    render(<GatingModal gating={gating} onDone={() => undefined} />)
    typeInto('vault passphrase', 'not it')
    submit()
    expect(await theGripe()).to.match(/didn't unlock the vault/)
    expect(vault.snapshot.gate?.passkey).to.not.be.null
  })
})

describe("GatingModal, del_vault", () => {
  it("deletes the vault, proven by the passphrase, answering deleted: the Vault object is gone", async () => {
    const vault = await vaultOf()
    const { gating, raising } = await TH.heldGatingOf(vault, (held) => held.tryDel(), 'del_vault')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    expect(screen.getByRole('dialog', { name: 'Delete your vault' })).to.not.be.null
    expect(screen.getByText(/deleted for good, on every device/)).to.not.be.null
    typeInto('vault passphrase', Passphrase)
    fireEvent.click(screen.getByRole('button', { name: 'Delete vault' }))
    await waitFor(() => { expect(heard).to.deep.equal(['deleted']) })
    await TH.expectGood(raising)
    await TH.expectBad(vault.tryHello(), 'vault_gone')
  })

  it("shows a wrong passphrase in place, deleting nothing", async () => {
    const vault = await vaultOf()
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryDel(), 'del_vault')
    render(<GatingModal gating={gating} onDone={() => undefined} />)
    typeInto('vault passphrase', 'not it')
    submit()
    expect(await theGripe()).to.match(/didn't unlock the vault/)
    await TH.expectGood(vault.tryHello({ staleMinutes: 0 }))
  })

  it("answers declined on Escape, and del() refuses vault_locked, saying nothing was deleted", async () => {
    const vault = await vaultOf()
    const { gating, raising, close } = await TH.heldGatingOf(vault, (held) => held.tryDel(), 'del_vault')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={(answer) => { onDone(answer); close() }} />)
    fireEvent.keyDown(screen.getByPlaceholderText('vault passphrase'), { key: 'Escape' })
    expect(heard).to.deep.equal(['declined'])
    const err = await TH.expectBad(raising, 'vault_locked')
    expect(err.message).to.match(/Nothing was deleted/)
  })
})

describe("GatingModal, whatever the kind", () => {
  it("closes, answering declined, as a lock lands while it asks", async () => {
    const vault = await vaultOf({}, true)
    const { gating, raising } = await TH.heldGatingOf(vault, (held) => held.tryDelWayin('passkey'), 'del_passkey')
    const { heard, onDone } = answersOf()
    render(<GatingModal gating={gating} onDone={onDone} />)
    await act(async () => { await vault.lock() })
    expect(heard).to.deep.equal(['declined'])
    await TH.expectBad(raising, 'vault_locked')
  })

  it("meets misuse with the calm notice, saying what it could not do, and reports the vault's refusal to React, quoting nothing typed", async () => {
    const vault = await vaultOf({ strengthChecker: ((passphrase: string) => (passphrase === Passphrase ? { strong: true } : 'weak')) as unknown as StrengthChecker })
    const { gating } = await TH.heldGatingOf(vault, (held) => held.tryPutWayin('passphrase'), 'change_passphrase')
    const { heard, onDone } = answersOf()
    const { reported } = TH.renderReporting(<GatingModal gating={gating} onDone={onDone} />)
    typeInto('current passphrase', Passphrase)
    TH.typeNewPassphrase('pw-the-new-one', { fieldlabel: 'new passphrase' })
    submit()
    const notice = await screen.findByRole('alertdialog', { name: 'Something went wrong' })
    expect(notice.textContent).to.match(/could not change your passphrase/)
    expect(reported).to.have.lengthOf(1)
    expect(reported[0]).to.include({ refusalkind: 'bad_option' })
    expect(TH.thrownText(reported[0])).to.not.include('pw-the-new-one')
    fireEvent.click(within(notice).getByRole('button', { name: 'Close' }))
    expect(heard).to.deep.equal(['declined'])
  })

  it("starts afresh when handed another gating, keeping nothing typed for the last", async () => {
    const vault = await vaultOf({}, true)
    const first = await TH.heldGatingOf(vault, (held) => held.tryDelWayin('passkey'), 'del_passkey')
    const { rerender } = render(<GatingModal gating={first.gating} onDone={() => undefined} />)
    typeInto('vault passphrase', 'half typed')
    first.close()
    await TH.expectBad(first.raising, 'vault_locked')
    const second = await TH.heldGatingOf(vault, (held) => held.tryDelWayin('passkey'), 'del_passkey')
    rerender(<GatingModal gating={second.gating} onDone={() => undefined} />)
    expect(screen.getByPlaceholderText<HTMLInputElement>('vault passphrase').value).to.eq('')
  })
})
