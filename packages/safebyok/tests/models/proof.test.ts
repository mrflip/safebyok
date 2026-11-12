/** The sprint's proof, and how the package is used: a host drives a device and its bank through a whole life, over a real in-memory BankDB and DeviceDB,
 * and every step asserts what its components render.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { VaultLogger } from '../../src/helpers/logger'
import type { VaultError } from '../../src/refusals/errors'
import type { Box } from '../../src/models/box'
import type { Gatingkind } from '../../src/shapes/shapes-enums'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import type { BadNews, BoxSnapshot, DeviceSnapshot, VaultSnapshot } from '../../src/shapes/shapes-vaultish'
import type { Whisper } from '../../src/shapes/shapes-core'
import * as TH from '../test-helpers'
import { AutolockMinutes, VaultScopeGiven, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { ticks } from '../test-helpers/timing'
import { NewPassphrase, Passphrase, byPasskey, byPassphrase } from '../test-helpers/vault-world'

useBankWorlds()

/** What nobody asked to hear, which a host's `onBadNews` is told: a proof that left it to the logger would pass over it. */
const badNews: VaultError[] = []
const onBadNews = ({ news }: BadNews): void => { badNews.push(news) }
const expectNoBadNews = (): void => { expect(badNews.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal([]) }
afterEach(expectNoBadNews)

// == [A React host, in miniature]: mountComponent, deviceStatus, vaultStatus, boxList, boxRow, whisperStoreOf, whisperRevealOf, makeDialog

type Store<SnapshotT> = { subscribe: (listener: () => void) => () => void, getSnapshot: () => SnapshotT }

/** A component over `useSyncExternalStore(subscribe, getSnapshot)`, both detached as React takes them, painting `view`.
 * A listener told with nothing new, or a snapshot that changed with no listener told, fails the next `expectRenders`.
 */
function mountComponent<SnapshotT>({ subscribe, getSnapshot }: Store<SnapshotT>, view: (snapshot: SnapshotT) => string) {
  let rendered = getSnapshot()
  let idleTells = 0
  const painted = [view(rendered)]
  subscribe(() => {
    const next = getSnapshot()
    if (next === rendered) { idleTells += 1 }
    rendered = next
    painted.push(view(next))
  })
  return {
    /** Everything painted since the last call is exactly `paints`, the snapshot moving exactly when a listener was told. */
    expectRenders: (paints: string[]) => {
      expect(getSnapshot(), 'a snapshot changed with no listener told').to.eq(rendered)
      expect(idleTells, 'a listener told with no new snapshot').to.eq(0)
      expect(painted.splice(0)).to.deep.equal(paints)
    },
  }
}

function lockWordOf(isLocked: boolean): string { return (isLocked ? 'locked' : 'unlocked') }

const deviceStatus = ({ stage, openGating, bank }: DeviceSnapshot): string => {
  const lockword = bank ? lockWordOf(bank.isLocked) : ''
  const rows = (bank?.vaults ?? []).map(({ vaultlabel }) => `${vaultlabel} ${lockword}`)
  const asking = openGating === null ? '' : ` (asking ${openGating.gatingkind})`
  return `${stage}: ${rows.join(', ') || 'no vaults'}${asking}`
}

const vaultStatus = ({ vaultlabel, isPresent }: VaultSnapshot): string => `${vaultlabel} ${isPresent ? 'present' : 'deleted'}`

const boxList = (boxes: readonly BoxSnapshot[]): string => boxes.map(({ boxlabel }) => boxlabel).join(', ') || 'no boxes'

const boxRow = ({ boxlabel, isPresent, sidecar }: BoxSnapshot): string => `${boxlabel} ${isPresent ? JSON.stringify(sidecar) : 'deleted'}`

/** The store of the component that shows the whisper itself: `box.whisper` is its snapshot, as the box's snapshot never has it. */
function whisperStoreOf(box: Box): Store<Whisper> { return { subscribe: box.subscribe, getSnapshot: () => box.whisper } }

/** The view of `box`'s whisper: the whisper while it shows, else where it stands. */
function whisperRevealOf(box: Box) { return (whisper: Whisper): string => (box.isShowing ? JSON.stringify(whisper) : box.exposure) }

/** The host's dialog: it records what it was shown for, and attempts what the user types; typing nothing closes it. */
function makeDialog() {
  const dialog = {
    typing: byPassphrase(Passphrase) as object,
    refusals: [] as VaultError[],
    shown:  [] as Gatingkind[],
    requestCleartext: (async (gating) => {
      dialog.shown.push(gating.gatingkind)
      for (const typing of [dialog.typing].flat()) {
        const outcome = await gating.attempt(typing)
        if (! outcome.ok) { dialog.refusals.push(outcome.err) }
      }
    }) as RequestCleartext,
  }
  return dialog
}
// --

/** A device with its bank built and unlocked and the vault of `VaultScopeGiven` in it, and the dialog that did it, cleared. */
async function buildHost(logger?: VaultLogger) {
  const world = makeBankWorld()
  const dialog = makeDialog()
  const device = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews, ...(logger && { logger }) })
  const bank = await device.ensureBank()
  const vault = await bank.ensureVault(VaultScopeGiven)
  dialog.shown.length = 0
  return { world, device, bank, vault, dialog }
}

const AutolockMillis = AutolockMinutes * 60_000

/** Longer than a vault waits before it asks the vaultDB again. */
const StaleMillis = 10 * 60_000

const ApiKey = Object.freeze({ boxlabel: 'anthropic_api_key', whisper: { apiKey: 'sk-not-a-real-key' }, sidecar: { nickname: 'work' } })

describe("the proof", () => {
  it("a device's whole life, as its components see it", async () => {
    const world = makeBankWorld()
    const dialog = makeDialog()

    // The page opens: Device.make makes the device, which renders before its ensureBank lands.
    const device = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['made: no vaults'])

    // Build: with no bank stored, ensureBank asks the user for a passphrase, and the bank comes up unlocked.
    const bank = await device.ensureBank()
    expect(dialog.shown.splice(0)).to.deep.equal(['build_bank'])
    deviceUi.expectRenders(['made: no vaults (asking build_bank)', 'made: no vaults', 'ready: no vaults'])
    expect(bank.isUnlocked).to.be.true

    // The first vault, in the unlocked bank, asks nobody, and comes up unlocked.
    const vault = await bank.ensureVault(VaultScopeGiven)
    expect(dialog.shown.splice(0)).to.deep.equal([])
    deviceUi.expectRenders(['ready: main unlocked'])
    const vaultUi = mountComponent(vault, vaultStatus)
    vaultUi.expectRenders(['main present'])
    const boxesUi = mountComponent(vault.boxListing, boxList)
    boxesUi.expectRenders(['no boxes'])

    // Seal a box: storage has stored only ciphertext, and the list shows it.
    const box = await vault.putBox(ApiKey)
    boxesUi.expectRenders(['anthropic_api_key'])
    const boxUi = mountComponent(box, boxRow)
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    // The whisper's component watches the box alone, whose snapshot shows its vault's lock.
    const revealUi = mountComponent(whisperStoreOf(box), whisperRevealOf(box))
    revealUi.expectRenders(['unexposed'])
    const boxRows = [...world.bankDB._cheat_boxRowsOf(vault.scope, vault.bank_tok, vault.vault_tok).values()]
    expect(boxRows).to.have.lengthOf(1)
    expect(JSON.stringify(boxRows)).not.to.include(ApiKey.whisper.apiKey)

    // Unseal it: extractWhisper hands over the whisper and keeps nothing; expose keeps it for the component.
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)
    boxUi.expectRenders([])
    await box.expose()
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders([JSON.stringify(ApiKey.whisper)])
    const snapshots = [device.getSnapshot(), vault.getSnapshot(), vault.boxListing.getSnapshot(), box.getSnapshot()]
    expect(JSON.stringify(snapshots)).not.to.include(ApiKey.whisper.apiKey)

    // Lock: every component watching the vault or its boxes is told before lock() returns, the whisper leaves the screen, and the box refuses.
    // The device's is told once, the bank's lock and its vaults' together.
    bank.lock()
    deviceUi.expectRenders(['ready: main locked'])
    vaultUi.expectRenders(['main present'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders(['locked'])
    await TH.expectRefusal(box.extractWhisper(), 'bank_locked')
    await expect(vault.getBox(ApiKey.boxlabel)).resolves.to.eq(box)

    // The user closes the dialog: the unlock refuses dismissed, and nothing moves.
    dialog.typing = []
    await TH.expectRefusal(bank.ensureUnlocked(), 'dismissed')
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_bank'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main locked'])

    // Unlock: the lock forgotten the cached lease, so the user is asked, and the wrong passphrase leaves the dialog open.
    dialog.typing = [byPassphrase('not the passphrase'), byPassphrase(Passphrase)]
    await bank.ensureUnlocked()
    expect(dialog.refusals.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal(['wrong_passphrase'])
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_bank'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main unlocked (asking unlock_bank)', 'ready: main unlocked'])
    vaultUi.expectRenders(['main present'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders([JSON.stringify(ApiKey.whisper)])
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // Delete: nobody is asked, the list empties, and the vault object, which stands for its scope through its lives, shows the tombstone.
    // Its boxes were of the life deleted: they answer nothing more, and the whisper leaves the screen.
    const deletedBoxes = vault.boxListing
    await vault.del(vault)
    expect(dialog.shown.splice(0)).to.deep.equal([])
    deviceUi.expectRenders(['ready: no vaults'])
    vaultUi.expectRenders(['main deleted'])
    await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'vault_gone')
    expect(bank.vaultAt(VaultScopeGiven)).to.eq(vault)
    expect(vault.boxListing).not.to.eq(deletedBoxes)
    boxesUi.expectRenders(['anthropic_api_key'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    revealUi.expectRenders(['unexposed'])
    await TH.expectRefusal(box.extractWhisper(), 'disabled')

    // Rebuild over the tombstone, in the unlocked bank: a new life of the same instance, a new vault_tok.
    const deletedTok = vault.vault_tok
    const reborn = await bank.ensureVault(VaultScopeGiven)
    expect(dialog.shown.splice(0)).to.deep.equal([])
    expect(reborn).to.eq(vault)
    expect(reborn.vault_tok).not.to.eq(deletedTok)
    deviceUi.expectRenders(['ready: main unlocked'])
    vaultUi.expectRenders(['main present'])
    expect(await reborn.getBox(ApiKey.boxlabel, { ifAbsent: 'nil' })).to.be.null
    await reborn.putBox(ApiKey)

    // The next page's Device on the same BankDB and DeviceDB: its bank lists the vault locked, and picks up the cached lease with nobody asked.
    const nextPage = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const nextPageUi = mountComponent(nextPage, deviceStatus)
    nextPageUi.expectRenders(['made: no vaults'])
    const nextBank = await nextPage.ensureBank()
    nextPageUi.expectRenders(['ready: main locked'])
    const pickedUp = await nextBank.ensureVault(VaultScopeGiven)
    expect(pickedUp.vault_tok).to.eq(reborn.vault_tok)
    await nextBank.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    nextPageUi.expectRenders(['ready: main unlocked'])

    // It opens what the page before it sealed: the lease it picked up has the same bankKey.
    await pickedUp.beginWatch()
    const nextBoxesUi = mountComponent(pickedUp.boxListing, boxList)
    nextBoxesUi.expectRenders(['anthropic_api_key'])
    const opened = await pickedUp.getBox(ApiKey.boxlabel)
    expect(await opened?.extractWhisper()).to.deep.equal(ApiKey.whisper)
    expect(dialog.shown).to.deep.equal([])
  })

  it("bank.autolock locks a vault past its autolock duration, and a page opened later asks for a proof", async () => {
    const { world, device, bank, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    // Inside the autolock duration, autolock changes nothing.
    world.advance(AutolockMillis - 1)
    await bank.autolock()
    deviceUi.expectRenders([])
    expect(world.leaseRows()).to.have.lengthOf(1)

    // Past it, the lease is forgotten and the vault reports locked; the device stays ready.
    world.advance(2)
    await bank.autolock()
    deviceUi.expectRenders(['ready: main locked'])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(bank.isUnlocked).to.be.false

    // A page opened late whose host never calls autolock asks all the same: Lease.buildFromCache leaves the row and reads as no row.
    await bank.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_bank'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main unlocked (asking unlock_bank)', 'ready: main unlocked'])
    world.advance(AutolockMillis + 1)
    const latePage = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const lateUi = mountComponent(latePage, deviceStatus)
    const lateBank = await latePage.ensureBank()
    lateUi.expectRenders(['made: no vaults', 'ready: main locked'])
    expect(world.leaseRows()).to.have.lengthOf(1)
    const expiredRow = world.leaseRows()[0]
    await lateBank.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_bank'])
    lateUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main unlocked (asking unlock_bank)', 'ready: main unlocked'])
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect(world.leaseRows()[0]).to.not.deep.equal(expiredRow)

    // Its host calling autolock after ensureBank forgets the row before anyone asks.
    world.advance(AutolockMillis + 1)
    const laterPage = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const laterUi = mountComponent(laterPage, deviceStatus)
    const laterBank = await laterPage.ensureBank()
    laterUi.expectRenders(['made: no vaults', 'ready: main locked'])
    await laterBank.autolock()
    laterUi.expectRenders([])
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("a lease row past autolock survives a late page's unanswered dialog, and the first page's bank.autolock then locks", async () => {
    const { world, device, bank } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])
    world.advance(AutolockMillis + 1)
    const latePage = await world.bankOn({ requestCleartext: () => undefined, onBadNews })
    await TH.expectRefusal(latePage.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.have.lengthOf(1)
    deviceUi.expectRenders([])
    await bank.autolock()
    deviceUi.expectRenders(['ready: main locked'])
    expect(bank.isLocked).to.be.true
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("signing out: device.vacate empties the screen and this device, and the next device lists the vault again, locked", async () => {
    const { world, device, bank, vault, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    await device.vacate()
    deviceUi.expectRenders(['disabled: no vaults'])
    expect(device.isEnabled).to.be.false
    expect(device.bank).to.be.null
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'disabled')
    await TH.expectRefusal(device.ensureBank(), 'disabled')
    expect(world.leaseRows()).to.have.lengthOf(0)
    await TH.expectRefusal(bank.ensureUnlocked())

    const next = await world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const again = await next.ensureVault(VaultScopeGiven)
    expect(again).not.to.eq(vault)
    expect(next.isLocked).to.be.true
    await next.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_bank'])
    expectNoBadNews()
  })

  it("the VaultDB goes out of reach: an unlocked vault keeps its lease, a page's refused ensureBank changes nothing on its screen, and its next one recovers", async () => {
    const spy = TH.spyLogger()
    const { world, device, bank, vault, dialog } = await buildHost(spy.logger)
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    world.advance(StaleMillis)
    world.bankDB._cheat_refuseGets('storage_unavailable')
    // A vault too stale to know whether it deserves its lease refuses the ask, and keeps the lease it has.
    await TH.expectRefusal(bank.ensureUnlocked(), 'storage_unavailable')
    expect(bank.isUnlocked).to.be.true
    deviceUi.expectRenders([])

    // A page opened meanwhile cannot list the vaults: its ensureBank refuses, and the page stays as it was made.
    const nextPage = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews, logger: spy.logger })
    const nextPageUi = mountComponent(nextPage, deviceStatus)
    await TH.expectRefusal(nextPage.ensureBank(), 'storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    nextPageUi.expectRenders(['made: no vaults'])
    expect(nextPage.snapshot.err).to.be.null
    expect(nextPage.bank).to.be.null

    world.bankDB._cheat_refuseGets(null)
    await nextPage.ensureBank()
    nextPageUi.expectRenders(['ready: main locked'])
    deviceUi.expectRenders([])
    expect(bank.vaultAt(VaultScopeGiven)).to.eq(vault)
  })

  it("replacing the passphrase: nothing locks, and from then on only the new one opens the bank", async () => {
    const { device, bank, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await bank.maingate.replacePassphrasePrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['replace_passphrase'])
    deviceUi.expectRenders(['ready: main unlocked (asking replace_passphrase)', 'ready: main unlocked (asking replace_passphrase)', 'ready: main unlocked'])
    expect(bank.isUnlocked).to.be.true

    bank.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = [byPassphrase(Passphrase), byPassphrase(NewPassphrase)]
    await bank.ensureUnlocked()
    expect(dialog.refusals.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal(['wrong_passphrase'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main unlocked (asking unlock_bank)', 'ready: main unlocked'])
  })

  it("adding and revoking a passkey: the passkey opens the bank until it is revoked", async () => {
    const { device, bank, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { ...byPassphrase(Passphrase), ...await byPasskey('laptop') }
    await bank.maingate.addPasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['add_passkey'])
    deviceUi.expectRenders(['ready: main unlocked (asking add_passkey)', 'ready: main unlocked (asking add_passkey)', 'ready: main unlocked'])
    expect(device.snapshot.bank?.maingate?.wayins.passkey0).not.to.be.undefined

    bank.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await bank.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_bank'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main unlocked (asking unlock_bank)', 'ready: main unlocked'])

    dialog.typing = byPassphrase(Passphrase)
    await bank.maingate.revokePasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['revoke_passkey'])
    expect(bank.maingate.passkey0).to.be.null
    deviceUi.expectRenders(['ready: main unlocked (asking revoke_passkey)', 'ready: main unlocked (asking revoke_passkey)', 'ready: main unlocked'])

    bank.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await TH.expectRefusal(bank.ensureUnlocked(), 'absent_wayin')
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main locked'])
    dialog.typing = byPassphrase(Passphrase)
    await bank.ensureUnlocked()
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main unlocked (asking unlock_bank)', 'ready: main unlocked'])
  })

  it("a second device's changes reach this device's components through the watch", async () => {
    const { world, device, bank, vault, dialog } = await buildHost()
    const box = await vault.putBox(ApiKey)
    await vault.beginWatch()
    const deviceUi = mountComponent(device, deviceStatus)
    const boxesUi = mountComponent(vault.boxListing, boxList)
    deviceUi.expectRenders(['ready: main unlocked'])
    boxesUi.expectRenders(['anthropic_api_key'])

    // The second device has no lease cached, so its unlock asks; it then opens the box this one sealed.
    const phone = makeDialog()
    const phoneBank = await world.bankOnAnotherDevice({ requestCleartext: phone.requestCleartext, onBadNews })
    const phoneVault = await phoneBank.ensureVault(VaultScopeGiven)
    await phoneBank.ensureUnlocked()
    expect(phone.shown.splice(0)).to.deep.equal(['unlock_bank'])
    const phoneBox = await phoneVault.getBox(ApiKey.boxlabel)
    expect(await phoneBox?.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // A box it adds is enlisted in this device's list.
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'openai_api_key' })
    await ticks(1)
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key'])

    // A BankDB with no watch, or a watch ended: nothing arrives until the host says hello to the vault again, on its own timer.
    vault.boxListing.goodbye()
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'gemini_api_key' })
    await ticks(1)
    boxesUi.expectRenders([])
    await vault.beginWatch()
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key, gemini_api_key'])

    // It replaces the passphrase: this device stays unlocked and hears the new gate; a later unlock takes the new passphrase.
    phone.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await phoneBank.maingate.replacePassphrasePrompt()
    await ticks(1)
    deviceUi.expectRenders(['ready: main unlocked'])
    expect(bank.isUnlocked).to.be.true
    expect(bank.maingate.revision_tok).to.eq(phoneBank.maingate.revision_tok)
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    bank.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = byPassphrase(NewPassphrase)
    await bank.ensureUnlocked()
    deviceUi.expectRenders(['ready: main locked (asking unlock_bank)', 'ready: main unlocked (asking unlock_bank)', 'ready: main unlocked'])

    // It deletes the bank: this device locks, forgets its lease, and has no bank until its next ensureBank.
    phone.typing = byPassphrase(NewPassphrase)
    await phoneBank.delPrompt()
    await ticks(1)
    deviceUi.expectRenders(['ready: no vaults'])
    expect(bank.isUnlocked).to.be.false
    expect(device.bank).to.be.null
    await TH.eventually(() => world.leaseRows().length === 0)
    await TH.expectRefusal(bank.ensureUnlocked())
  })

  it("under React StrictMode, the second effect's bank unlocks with the cached lease without asking", async () => {
    const { world, dialog } = await buildHost()
    const opts = { requestCleartext: dialog.requestCleartext, onBadNews }

    // The effect makes a device with Device.make and calls ensureBank, its cleanup sweeps the device, and the effect runs again, as StrictMode does on mount.
    const first = world.deviceOn(opts)
    const firstEffect = first.tryEnsureBank()
    first.sweep()
    const second = world.deviceOn(opts)
    const deviceUi = mountComponent(second, deviceStatus)
    const [, secondBank] = await Promise.all([firstEffect, second.ensureBank()])
    await TH.expectBad(firstEffect, 'disabled')
    deviceUi.expectRenders(['made: no vaults', 'ready: main locked'])

    await secondBank.ensureVault(VaultScopeGiven)
    await secondBank.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    deviceUi.expectRenders(['ready: main unlocked'])
    expectNoBadNews()
  })
})
