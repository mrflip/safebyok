import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Vault, VaultError, type Box, type BoxSnapshot, type RequestCleartext, type Whisper, type BoxExposure, type LifecycleHandler } from 'safebyok'
import { MemoryVaultDB, type VaultQuery } from 'safebyok/storage'
import { BankProvider } from '../src/bank-provider'
import { useBank, useBankSnapshot, useBox, useBoxIsShowing, useBoxSnapshot, useBoxExposure, useBoxes, useVault, useVaultSnapshot, useWhisper } from '../src/hooks'
import * as TH from './test-helpers'

TH.sweepBankWorlds()
beforeEach(() => { TH.seenBanks.length = 0 })

const shown = (testid: 'bank' | 'vault') => screen.getByTestId(testid).textContent

/** A MemoryVaultDB whose listBoxes refuses, once told to, while its listVaults still answers. */
class BoxRefusingVaultDB extends MemoryVaultDB {
  refusing = false
  protected override doListBoxes(asked: VaultQuery) {
    if (this.refusing) { throw new VaultError('storage_unavailable', 'refused by the test') }
    return super.doListBoxes(asked)
  }
}

/** What useVault answers for the vault `main`: its stage, and the cause's kind once spent. */
const ShowsHeld = () => {
  const held = useVault('main')
  return <span data-testid="held">{held.stage === 'spent' ? `spent ${held.cause.refusalkind}` : held.stage}</span>
}

/** Calls `hook` as it renders, and renders nothing. */
const Calls = ({ hook }: { hook: () => unknown }) => { hook(); return null }

describe("the hooks outside a BankProvider", () => {
  const HookCases = [
    ['useBank',          () => useBank()],
    ['useBankSnapshot',  () => useBankSnapshot()],
    ['useVault',         () => useVault('main')],
    ['useVaultSnapshot', () => useVaultSnapshot('main')],
    ['useBoxes',         () => useBoxes('main')],
    ['useBox',           () => useBox('main', 'anthropic')],
  ] as const

  for (const [hookname, hook] of HookCases) {
    it(`${hookname} throws, naming the provider it needs`, () => {
      TH.renderReporting(<TH.Catcher><Calls hook={hook} /></TH.Catcher>)
      expect(screen.getByText(`caught: ${hookname} needs a <BankProvider> above it.`)).to.exist
    })
  }
})

describe("useVault and useVaultSnapshot", () => {
  it("read waiting until the bank is ready, then unborn for a vault never built", async () => {
    render(<BankProvider {...TH.providerPropsOf(TH.makeBankWorld())}><TH.ShowsVault /></BankProvider>)
    expect(shown('vault')).to.eq('waiting none')
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
  })

  it("read waiting while the bank's hello is refused, its snapshot saying so", async () => {
    const world = TH.makeBankWorld()
    world.vaultDB._cheat_refuseGets('storage_unavailable')
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(shown('bank')).to.eq('u1 refused') })
    expect(shown('vault')).to.eq('waiting none')
  })

  it("read waiting while the bank's hello is still on its way", async () => {
    const world = TH.makeBankWorld()
    const listing = TH.held<never>()
    vi.spyOn(world.vaultDB, 'listVaults').mockReturnValue(listing.promise)
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /><ShowsHeld /></BankProvider>)
    await waitFor(() => { expect(TH.seenBanks).to.have.lengthOf(1) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(shown('vault')).to.eq('waiting none')
    expect(screen.getByTestId('held').textContent).to.eq('waiting')
  })

  it("read spent once the bank is vacated, carrying the cause, and useVaultSnapshot null", async () => {
    const world = TH.makeBankWorld()
    const seeding = world.bankOn()
    await seeding.hello()
    await seeding.ensureVault(TH.VaultScopeGiven)
    seeding.sweep()
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /><ShowsHeld /></BankProvider>)
    await waitFor(() => { expect(screen.getByTestId('held').textContent).to.eq('present') })
    const cause = new VaultError('identity_revoked', 'signed out')
    await act(async () => { await TH.seenBanks[0]?.vacate({ cause }) })
    expect(screen.getByTestId('held').textContent).to.eq('spent identity_revoked')
    expect(shown('vault')).to.eq('spent none')
  })

  it("read a vault deleted elsewhere as unborn", async () => {
    const world = TH.makeBankWorld()
    const { vault } = await TH.makeBankWithVault(world)
    await vault.delVaultPrompt()
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(shown('vault')).to.eq('unborn none') })
  })

  it("read a vault built elsewhere as present, its snapshot following each unlock and lock", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const requestCleartext: RequestCleartext = async (gating) => { await gating.attempt(TH.byPassphrase(TH.Passphrase)) }
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext })}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
    fireEvent.click(screen.getByText('Open'))
    await waitFor(() => { expect(shown('vault')).to.eq('present unlocked') })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(shown('vault')).to.eq('present locked') })
  })

  it("say hello to each vault once, however many components ask for it", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    const hello = vi.spyOn(Vault.prototype, 'tryHello')
    render(<BankProvider {...TH.providerPropsOf(world)}><TH.ShowsVault /><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(screen.getAllByTestId('vault').map(({ textContent }) => textContent)).to.deep.equal(['present locked', 'present locked']) })
    await act(async () => { await TH.wakeupAtNextTick() })
    expect(hello).toHaveBeenCalledOnce()
  })

  it("leave a refused vault hello to the bank, which tells the host's onLifecycle", async () => {
    const world = TH.makeBankWorld()
    const vaultDB = new BoxRefusingVaultDB()
    const seeding = world.bankOn({ vaultDB })
    await seeding.hello()
    await seeding.ensureVault(TH.VaultScopeGiven)
    seeding.sweep()
    vaultDB.refusing = true
    const helloes: VaultError[] = []
    const onLifecycle: LifecycleHandler = (event) => { if (event.kind === 'helloed' && event.vault !== null && ! event.outcome.ok) { helloes.push(event.outcome.err) } }
    render(<BankProvider {...TH.providerPropsOf(world, { vaultDB, onLifecycle })}><TH.ShowsVault /></BankProvider>)
    await waitFor(() => { expect(helloes.map(({ refusalkind }) => refusalkind)).to.deep.equal(['storage_unavailable']) })
  })
})

// == [Box hooks]: typingPassphrase, BoxPage, seenBoxes, boxWorld

/** A requestCleartext that types the test's passphrase into every dialog. */
const typingPassphrase: RequestCleartext = async (gating) => { await gating.attempt(TH.byPassphrase(TH.Passphrase)) }

/** What a page shows of a box's snapshot: its revision and whether it is exposed. */
const boxWords = (snapshot: BoxSnapshot | null): string => {
  if (snapshot === null) { return 'none' }
  return `revision ${String(snapshot.revision_seq)}, ${snapshot.isExposed ? 'exposed' : 'sealed'}`
}

/** What a page shows of a whisper: its apiKey, and where it stands. */
const whisperWords = (whisper: Whisper, exposure: BoxExposure): string => `${String(whisper['apiKey'] ?? '-')} ${exposure}`

/** Shows what the box hooks say of no box. */
const NoBox = () => {
  const whisper = useWhisper(null)
  const snapshot = useBoxSnapshot(null)
  const isShowing = useBoxIsShowing(null)
  const exposure = useBoxExposure(null)
  return <p>{`${String(Object.keys(whisper).length)} ${exposure} ${String(snapshot === null)} ${String(isShowing)}`}</p>
}

/** The Box objects every {@link BoxPage} has been handed, each once. */
const seenBoxes: Box[] = []

/** What the box hooks say of `boxlabel` in the vault `main`, with the buttons a host's page would have. */
const BoxPage = ({ boxlabel = 'anthropic' }: { boxlabel?: string }) => {
  const { vault } = useVault('main')
  const boxes = useBoxes('main')
  const box = useBox('main', boxlabel)
  const snapshot = useBoxSnapshot(box)
  const whisper = useWhisper(box)
  const exposure = useBoxExposure(box)
  const isShowing = useBoxIsShowing(box)
  if (box !== null && ! seenBoxes.includes(box)) { seenBoxes.push(box) }
  const make = async () => {
    if (vault === null) { return }
    await vault.ensureUnlocked()
    const made = await vault.putBox({ boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent: 'add' })
    await made.expose()
  }
  return (
    <div>
      <p data-testid="boxes">{boxes === null ? 'none' : boxes.map((listed) => listed.boxlabel).join(',')}</p>
      <p data-testid="box">{boxWords(snapshot)}</p>
      <p data-testid="whisper">{whisperWords(whisper, exposure)}</p>
      <p data-testid="showing">{isShowing ? 'showing' : 'hidden'}</p>
      <button type="button" onClick={() => { void make() }}>Make</button>
      <button type="button" onClick={() => { vault?.lock() }}>Lock</button>
      <button type="button" onClick={() => { void vault?.ensureUnlocked() }}>Unlock</button>
    </div>
  )
}

/** Whether `anthropic` in the vault `main` shows, wears its veil and where its whisper stands, with the buttons that veil it, unexpose it and lock its vault. */
const VeilPage = () => {
  const { vault } = useVault('main')
  const box = useBox('main', 'anthropic')
  const isShowing = useBoxIsShowing(box)
  const isVeiled = useBoxSnapshot(box)?.isVeiled ?? false
  const exposure = useBoxExposure(box)
  const expose = async () => {
    if ((vault === null) || (box === null)) { return }
    await vault.ensureUnlocked()
    await box.expose()
  }
  return (
    <div>
      <p data-testid="veil">{`${isShowing ? 'showing' : 'hidden'} ${isVeiled ? 'veiled' : 'bare'} ${exposure}`}</p>
      <button type="button" disabled={box === null} onClick={() => { void expose() }}>Expose</button>
      <button type="button" onClick={() => { box?.veil() }}>Veil</button>
      <button type="button" onClick={() => { box?.unveil() }}>Unveil</button>
      <button type="button" onClick={() => { box?.unexpose() }}>Unexpose</button>
      <button type="button" onClick={() => { vault?.lock() }}>Lock</button>
      <button type="button" onClick={() => { void vault?.ensureUnlocked() }}>Unlock</button>
    </div>
  )
}

const shownOfBox = (testid: 'boxes' | 'box' | 'whisper' | 'showing' | 'veil') => screen.getByTestId(testid).textContent

/** A world whose vault `main` holds `anthropic`, its apiKey a fake, put from another device; and that device's vault. */
const boxWorld = async () => {
  const world = TH.makeBankWorld()
  const { vault } = await TH.makeBankWithVault(world)
  await vault.putBox({ boxlabel: 'anthropic', whisper: { apiKey: 'sk-ant-fake-stored' } }, { ifAbsent: 'add' })
  return { world, vault }
}
// --

describe("the box hooks", () => {
  beforeEach(() => { seenBoxes.length = 0 })

  it("read the boxes a present vault lists", async () => {
    const { world } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world)}><BoxPage /></BankProvider>)
    expect(shownOfBox('boxes')).to.eq('none')
    expect(shownOfBox('box')).to.eq('none')
    await waitFor(() => { expect(shownOfBox('boxes')).to.eq('anthropic') })
    expect(shownOfBox('box')).to.eq('revision 0, sealed')
  })

  it("read the box a click makes", async () => {
    const world = TH.makeBankWorld()
    await TH.makeBankWithVault(world)
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: typingPassphrase })}><BoxPage /></BankProvider>)
    await waitFor(() => { expect(shownOfBox('boxes')).to.eq('') })
    expect(shownOfBox('box')).to.eq('none')
    fireEvent.click(screen.getByText('Make'))
    await waitFor(() => { expect(shownOfBox('box')).to.eq('revision 0, exposed') })
    expect(shownOfBox('boxes')).to.eq('anthropic')
    expect(shownOfBox('whisper')).to.eq('- showing')
  })

  it("hand every component the same Box for a boxlabel", async () => {
    const { world } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world)}><BoxPage /><BoxPage /></BankProvider>)
    await waitFor(() => { expect(screen.getAllByTestId('box').map(({ textContent }) => textContent)).to.deep.equal(['revision 0, sealed', 'revision 0, sealed']) })
    expect(seenBoxes).to.have.lengthOf(1)
  })

  it("make a stored box through ifPresent get without writing, keeping its stored whisper", async () => {
    const { world, vault } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: typingPassphrase })}><BoxPage /></BankProvider>)
    await waitFor(() => { expect(shownOfBox('box')).to.eq('revision 0, sealed') })
    fireEvent.click(screen.getByText('Make'))
    await waitFor(() => { expect(shownOfBox('whisper')).to.eq('sk-ant-fake-stored showing') })
    expect(shownOfBox('box')).to.eq('revision 0, exposed')
    const stored = await vault.fetchBox('anthropic')
    expect(stored?.snapshot.revision_seq).to.eq(0)
    expect(await stored?.extractWhisper()).to.deep.equal({ apiKey: 'sk-ant-fake-stored' })
  })

  it("read why the whisper hides while it will not show", async () => {
    const { world } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: typingPassphrase })}><BoxPage /></BankProvider>)
    await waitFor(() => { expect(shownOfBox('whisper')).to.eq('- unexposed') })
    fireEvent.click(screen.getByText('Make'))
    await waitFor(() => { expect(shownOfBox('whisper')).to.eq('sk-ant-fake-stored showing') })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(shownOfBox('whisper')).to.eq('- locked') })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => { expect(shownOfBox('whisper')).to.eq('sk-ant-fake-stored showing') })
  })

  it("read whether the box shows its whisper, through expose and lock", async () => {
    const { world } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: typingPassphrase })}><BoxPage /></BankProvider>)
    await waitFor(() => { expect(shownOfBox('box')).to.eq('revision 0, sealed') })
    expect(shownOfBox('showing')).to.eq('hidden')
    fireEvent.click(screen.getByText('Make'))
    await waitFor(() => { expect(shownOfBox('showing')).to.eq('showing') })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(shownOfBox('showing')).to.eq('hidden') })
  })

  it("read none again for a box deleted", async () => {
    const { world, vault } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world)}><BoxPage /></BankProvider>)
    await waitFor(() => { expect(shownOfBox('boxes')).to.eq('anthropic') })
    await vault.delBox('anthropic')
    await waitFor(() => { expect(shownOfBox('box')).to.eq('none') })
    expect(shownOfBox('boxes')).to.eq('')
  })

  it("read none for a box whose vault is deleted elsewhere", async () => {
    const { world, vault } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world)}><BoxPage /></BankProvider>)
    await waitFor(() => { expect(shownOfBox('box')).to.eq('revision 0, sealed') })
    await vault.delVaultPrompt()
    await waitFor(() => { expect(shownOfBox('box')).to.eq('none') })
    expect(shownOfBox('boxes')).to.eq('none')
  })

  it("read whether a box shows and wears its veil", async () => {
    const { world } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: typingPassphrase })}><VeilPage /></BankProvider>)
    await waitFor(() => { expect(screen.getByText('Expose')).to.have.property('disabled', false) })
    expect(shownOfBox('veil')).to.eq('hidden bare unexposed')
    fireEvent.click(screen.getByText('Expose'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('showing bare showing') })
    fireEvent.click(screen.getByText('Veil'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('hidden veiled veiled') })
    fireEvent.click(screen.getByText('Lock'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('hidden veiled locked') })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('hidden veiled veiled') })
    fireEvent.click(screen.getByText('Unveil'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('showing bare showing') })
  })

  it("read the veil gone once the box is unexposed", async () => {
    const { world } = await boxWorld()
    render(<BankProvider {...TH.providerPropsOf(world, { requestCleartext: typingPassphrase })}><VeilPage /></BankProvider>)
    await waitFor(() => { expect(screen.getByText('Expose')).to.have.property('disabled', false) })
    fireEvent.click(screen.getByText('Expose'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('showing bare showing') })
    fireEvent.click(screen.getByText('Veil'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('hidden veiled veiled') })
    fireEvent.click(screen.getByText('Unexpose'))
    await waitFor(() => { expect(shownOfBox('veil')).to.eq('hidden bare unexposed') })
  })

  it("read the empty answers for no box", () => {
    render(<NoBox />)
    expect(screen.getByText('0 unexposed true false')).to.exist
  })
})
