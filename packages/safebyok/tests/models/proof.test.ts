/** The sprint's proof, and how the package is used: a host drives a device and its bank through a whole life, over a real in-memory VaultDB and DeviceDB,
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
  const rows = (bank?.vaults ?? []).map(({ vaultlabel, isLocked }) => `${vaultlabel} ${lockWordOf(isLocked)}`)
  const asking = openGating === null ? '' : ` (asking ${openGating.gatingkind})`
  return `${stage}: ${rows.join(', ') || 'no vaults'}${asking}`
}

const vaultStatus = ({ vaultlabel, isPresent, isLocked }: VaultSnapshot): string => `${vaultlabel} ${isPresent ? lockWordOf(isLocked) : 'deleted'}`

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

/** A device with its bank ensured and the vault of `VaultScopeGiven` built and unlocked, and the dialog that did it, cleared. */
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

    const bank = await device.ensureBank()
    deviceUi.expectRenders(['ready: no vaults'])

    // Build: the first vault asks the user for a passphrase, and comes up unlocked.
    const vault = await bank.ensureVault(VaultScopeGiven)
    expect(dialog.shown.splice(0)).to.deep.equal(['build_vault'])
    deviceUi.expectRenders(['ready: no vaults (asking build_vault)', 'ready: main locked (asking build_vault)', 'ready: main unlocked (asking build_vault)', 'ready: main unlocked'])
    const vaultUi = mountComponent(vault, vaultStatus)
    vaultUi.expectRenders(['main unlocked'])
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
    const boxRows = [...world.vaultDB._cheat_boxRowsOf(vault.scope, vault.vault_tok).values()]
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
    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    vaultUi.expectRenders(['main locked'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders(['locked'])
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    await expect(vault.getBox(ApiKey.boxlabel)).resolves.to.eq(box)

    // The user closes the dialog: the unlock refuses dismissed, and nothing moves.
    dialog.typing = []
    await TH.expectRefusal(vault.ensureUnlocked(), 'dismissed')
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main locked'])

    // Unlock: the lock forgotten the cached lease, so the user is asked, and the wrong passphrase leaves the dialog open.
    dialog.typing = [byPassphrase('not the passphrase'), byPassphrase(Passphrase)]
    await vault.ensureUnlocked()
    expect(dialog.refusals.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal(['wrong_passphrase'])
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])
    vaultUi.expectRenders(['main unlocked'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders([JSON.stringify(ApiKey.whisper)])
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // Delete: the user proves it, the list empties, and the vault object goes quiet, locked: its tombstone is of another life, and another instance.
    dialog.typing = byPassphrase(Passphrase)
    await vault.delVaultPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['del_vault'])
    deviceUi.expectRenders(['ready: main unlocked (asking del_vault)', 'ready: main locked (asking del_vault)', 'ready: no vaults (asking del_vault)', 'ready: no vaults'])
    vaultUi.expectRenders(['main locked'])
    await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }), 'disabled')
    const gone = bank.vaultAt(VaultScopeGiven)
    expect(gone).not.to.eq(vault)
    expect(gone?.vault_tok).not.to.eq(vault.vault_tok)
    expect(vaultStatus(gone!.getSnapshot())).to.eq('main deleted')
    boxesUi.expectRenders(['anthropic_api_key', 'no boxes'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}', 'anthropic_api_key {"nickname":"work"}'])
    revealUi.expectRenders(['locked', 'unexposed'])
    await TH.expectRefusal(box.extractWhisper())

    // Rebuild over the tombstone: a new life, a new instance, a new vault_tok.
    const reborn = await bank.ensureVault(VaultScopeGiven)
    expect(dialog.shown.splice(0)).to.deep.equal(['build_vault'])
    expect(reborn).not.to.eq(vault)
    expect(reborn.vault_tok).not.to.eq(vault.vault_tok)
    deviceUi.expectRenders(['ready: no vaults (asking build_vault)', 'ready: main locked (asking build_vault)', 'ready: main unlocked (asking build_vault)', 'ready: main unlocked'])
    const rebornUi = mountComponent(reborn, vaultStatus)
    rebornUi.expectRenders(['main unlocked'])
    expect(await reborn.getBox(ApiKey.boxlabel, { ifAbsent: 'nil' })).to.be.null
    await reborn.putBox(ApiKey)

    // The next page's Device on the same VaultDB and DeviceDB: its bank lists the vault locked, and picks up the cached lease with nobody asked.
    const nextPage = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const nextPageUi = mountComponent(nextPage, deviceStatus)
    nextPageUi.expectRenders(['made: no vaults'])
    const nextBank = await nextPage.ensureBank()
    nextPageUi.expectRenders(['ready: main locked'])
    const pickedUp = await nextBank.ensureVault(VaultScopeGiven)
    expect(pickedUp.vault_tok).to.eq(reborn.vault_tok)
    await pickedUp.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    nextPageUi.expectRenders(['ready: main unlocked'])

    // It opens what the page before it sealed: the lease it picked up has the same vaultKey.
    await pickedUp.hello()
    const nextBoxesUi = mountComponent(pickedUp.boxListing, boxList)
    nextBoxesUi.expectRenders(['anthropic_api_key'])
    const opened = await pickedUp.getBox(ApiKey.boxlabel)
    expect(await opened?.extractWhisper()).to.deep.equal(ApiKey.whisper)
    expect(dialog.shown).to.deep.equal([])
  })

  it("replacing the passphrase: nothing locks, and from then on only the new one opens the vault", async () => {
    const { device, vault, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await vault.replacePassphrasePrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['replace_passphrase'])
    deviceUi.expectRenders(['ready: main unlocked (asking replace_passphrase)', 'ready: main unlocked (asking replace_passphrase)', 'ready: main unlocked'])
    expect(vault.isUnlocked).to.be.true

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = [byPassphrase(Passphrase), byPassphrase(NewPassphrase)]
    await vault.ensureUnlocked()
    expect(dialog.refusals.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal(['wrong_passphrase'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])
  })

  it("adding and revoking a passkey: the passkey opens the vault until it is revoked", async () => {
    const { device, vault, dialog } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { ...byPassphrase(Passphrase), ...await byPasskey('laptop') }
    await vault.addPasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['add_passkey'])
    deviceUi.expectRenders(['ready: main unlocked (asking add_passkey)', 'ready: main unlocked (asking add_passkey)', 'ready: main unlocked'])
    expect(vault.gate.toJSON().passkey_wayin).not.to.be.null

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await vault.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])

    dialog.typing = byPassphrase(Passphrase)
    await vault.revokePasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['revoke_passkey'])
    expect(vault.gate.toJSON().passkey_wayin).to.be.null
    deviceUi.expectRenders(['ready: main unlocked (asking revoke_passkey)', 'ready: main unlocked (asking revoke_passkey)', 'ready: main unlocked'])

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await TH.expectRefusal(vault.ensureUnlocked(), 'absent_wayin')
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main locked'])
    dialog.typing = byPassphrase(Passphrase)
    await vault.ensureUnlocked()
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])
  })

  it("bank.autolock locks a vault past its autolock duration, and a page opened later asks for a proof", async () => {
    const { world, device, bank, vault, dialog } = await buildHost()
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
    expect(vault.isUnlocked).to.be.false

    // A page opened late whose host never calls autolock asks all the same: Lease.buildFromCache leaves the row and reads as no row.
    await vault.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])
    world.advance(AutolockMillis + 1)
    const latePage = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const lateUi = mountComponent(latePage, deviceStatus)
    const lateBank = await latePage.ensureBank()
    lateUi.expectRenders(['made: no vaults', 'ready: main locked'])
    expect(world.leaseRows()).to.have.lengthOf(1)
    const expiredRow = world.leaseRows()[0]
    await lateBank.vaultAt(VaultScopeGiven)?.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    lateUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])
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
    const { world, device, bank, vault } = await buildHost()
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])
    world.advance(AutolockMillis + 1)
    const latePage = await world.bankOn({ requestCleartext: () => undefined, onBadNews })
    await TH.expectRefusal(latePage.vaultAt(VaultScopeGiven)!.ensureUnlocked(), 'dismissed')
    expect(world.leaseRows()).to.have.lengthOf(1)
    deviceUi.expectRenders([])
    await bank.autolock()
    deviceUi.expectRenders(['ready: main locked'])
    expect(vault.isLocked).to.be.true
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
    await TH.expectRefusal(vault.ensureUnlocked())

    const next = await world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const again = await next.ensureVault(VaultScopeGiven)
    expect(again).not.to.eq(vault)
    expect(again.isLocked).to.be.true
    await again.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    expectNoBadNews()
  })

  it("the VaultDB goes out of reach: an unlocked vault keeps its lease, a page's refused ensureBank changes nothing on its screen, and its next one recovers", async () => {
    const spy = TH.spyLogger()
    const { world, device, bank, vault, dialog } = await buildHost(spy.logger)
    const deviceUi = mountComponent(device, deviceStatus)
    deviceUi.expectRenders(['ready: main unlocked'])

    world.advance(StaleMillis)
    world.vaultDB._cheat_refuseGets('storage_unavailable')
    // A vault too stale to know whether it deserves its lease refuses the ask, and keeps the lease it has.
    await TH.expectRefusal(vault.ensureUnlocked(), 'storage_unavailable')
    expect(vault.isUnlocked).to.be.true
    deviceUi.expectRenders([])

    // A page opened meanwhile cannot list the vaults: its ensureBank refuses, and the page stays as it was made.
    const nextPage = world.deviceOn({ requestCleartext: dialog.requestCleartext, onBadNews, logger: spy.logger })
    const nextPageUi = mountComponent(nextPage, deviceStatus)
    await TH.expectRefusal(nextPage.ensureBank(), 'storage_unavailable')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    nextPageUi.expectRenders(['made: no vaults'])
    expect(nextPage.snapshot.err).to.be.null
    expect(nextPage.bank).to.be.null

    world.vaultDB._cheat_refuseGets(null)
    await nextPage.ensureBank()
    nextPageUi.expectRenders(['ready: main locked'])
    deviceUi.expectRenders([])
    expect(bank.vaultAt(VaultScopeGiven)).to.eq(vault)
  })

  it("a second device's changes reach this device's components through the watch", async () => {
    const { world, device, vault, dialog } = await buildHost()
    const box = await vault.putBox(ApiKey)
    await vault.hello()
    const deviceUi = mountComponent(device, deviceStatus)
    const boxesUi = mountComponent(vault.boxListing, boxList)
    deviceUi.expectRenders(['ready: main unlocked'])
    boxesUi.expectRenders(['anthropic_api_key'])

    // The second device has no lease cached, so its unlock asks; it then opens the box this one sealed.
    const phone = makeDialog()
    const phoneBank = await world.bankOnAnotherDevice({ requestCleartext: phone.requestCleartext, onBadNews })
    const phoneVault = await phoneBank.ensureVault(VaultScopeGiven)
    await phoneVault.ensureUnlocked()
    expect(phone.shown.splice(0)).to.deep.equal(['unlock_vault'])
    const phoneBox = await phoneVault.getBox(ApiKey.boxlabel)
    expect(await phoneBox?.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // A box it adds is enlisted in this device's list.
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'openai_api_key' })
    await ticks(1)
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key'])

    // A VaultDB with no watch, or a watch ended: nothing arrives until the host says hello to the vault again, on its own timer.
    vault.boxListing.goodbye()
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'gemini_api_key' })
    await ticks(1)
    boxesUi.expectRenders([])
    await vault.hello()
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key, gemini_api_key'])

    // It replaces the passphrase: this device stays unlocked and has the new gate; a later unlock takes the new passphrase.
    phone.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await phoneVault.replacePassphrasePrompt()
    await ticks(1)
    deviceUi.expectRenders(['ready: main unlocked'])
    expect(vault.isUnlocked).to.be.true
    expect(vault.gate.toJSON().gate_epoch).to.eq(phoneVault.gate.toJSON().gate_epoch)
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    vault.lock()
    deviceUi.expectRenders(['ready: main locked'])
    dialog.typing = byPassphrase(NewPassphrase)
    await vault.ensureUnlocked()
    deviceUi.expectRenders(['ready: main locked (asking unlock_vault)', 'ready: main unlocked (asking unlock_vault)', 'ready: main unlocked'])

    // It deletes the vault: this device locks, forgets its lease, and the vault leaves the list.
    phone.typing = byPassphrase(NewPassphrase)
    await phoneVault.delVaultPrompt()
    await ticks(1)
    deviceUi.expectRenders(['ready: no vaults'])
    expect(vault.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(0)
    await TH.expectRefusal(vault.ensureUnlocked())
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

    const vault = await secondBank.ensureVault(VaultScopeGiven)
    await vault.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    deviceUi.expectRenders(['ready: main unlocked'])
    expectNoBadNews()
  })
})
