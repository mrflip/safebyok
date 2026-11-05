/** The sprint's proof, and how the package is used: a host drives a bank through a whole life, over real in-memory stores,
 * and every step asserts what its components render. */

import { afterEach, describe, expect, it } from 'vitest'
import type { VaultError } from '../../src/refusals/errors'
import type { Box } from '../../src/models/box'
import type { GatingKind } from '../../src/shapes/shapes-enums'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import type { BankSnapshot, BoxSnapshot, VaultSnapshot } from '../../src/shapes/shapes-vaultish'
import { Storable } from '../../src/models/storable'
import * as TH from '../test-helpers'
import { AutolockMinutes, VaultScopeGiven, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { ticks } from '../test-helpers/timing'
import { NewPassphrase, Passphrase, byPasskey, byPassphrase } from '../test-helpers/vault-world'

useBankWorlds()

/** What nobody asked to hear, which a host's `onBadNews` is told: a proof that left it to the logger would pass over it. */
const badNews: VaultError[] = []
const onBadNews = (news: VaultError): void => { badNews.push(news) }
const expectNoBadNews = (): void => { expect(badNews.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal([]) }
afterEach(expectNoBadNews)

// == [A React host, in miniature]: mountComponent, bankStatus, vaultStatus, boxList, boxRow, whisperReveal, makeDialog

type Store<SnapshotT> = { subscribe: (listener: () => void) => () => void, getSnapshot: () => SnapshotT }

/** A component over `useSyncExternalStore(subscribe, getSnapshot)`, both detached as React takes them, painting `view`.
 * A listener told with nothing new, or a snapshot that changed with no listener told, fails the next `expectRenders`.
 */
const mountComponent = <SnapshotT>({ subscribe, getSnapshot }: Store<SnapshotT>, view: (snapshot: SnapshotT) => string) => {
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

const bankStatus = ({ stage, vaults }: BankSnapshot): string => {
  const rows = vaults.map(({ vaultlabel, lockState }) => `${vaultlabel} ${lockState}`)
  return `${stage}: ${rows.join(', ') || 'no vaults'}`
}

const vaultStatus = ({ vaultlabel, present, lockState }: VaultSnapshot): string => `${vaultlabel} ${present ? lockState : 'deleted'}`

const boxList = (boxes: readonly BoxSnapshot[]): string => boxes.map(({ boxlabel }) => boxlabel).join(', ') || 'no boxes'

const boxRow = ({ boxlabel, present, sidecar }: BoxSnapshot): string => `${boxlabel} ${present ? JSON.stringify(sidecar) : 'deleted'}`

/** The component that shows the whisper itself: `box.whisper`, read afresh at each paint, as a snapshot never holds it. */
const whisperReveal = (box: Box) => (): string => {
  const { whisper } = box
  if (whisper === null) { return 'hidden' }
  return Storable.isLockedFUBag(whisper) ? 'locked' : JSON.stringify(whisper.val)
}

/** The host's dialog: it records what it was shown for, and attempts what the user types; typing nothing closes it. */
const makeDialog = () => {
  const dialog = {
    typing: byPassphrase(Passphrase) as object,
    refusals: [] as VaultError[],
    shown:  [] as GatingKind[],
    requestCleartext: (async (gating) => {
      dialog.shown.push(gating.gatingkind)
      for (const typing of [dialog.typing].flat()) {
        const outcome = await gating.attempt(typing as never)
        if (! outcome.ok) { dialog.refusals.push(outcome.err) }
      }
    }) as RequestCleartext,
  }
  return dialog
}
// --

/** A bank past its `hello` with the vault of `VaultScopeGiven` built and unlocked, and the dialog that did it, cleared. */
const buildHost = async () => {
  const world = makeBankWorld()
  const dialog = makeDialog()
  const bank = world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
  await bank.hello()
  const vault = await bank.ensureVault(VaultScopeGiven)
  dialog.shown.length = 0
  return { world, bank, vault, dialog }
}

const AutolockMillis = AutolockMinutes * 60_000

/** Longer than a vault waits before it asks the vaultDB again. */
const StaleMillis = 10 * 60_000

const ApiKey = Object.freeze({ boxlabel: 'anthropic_api_key', whisper: { val: 'sk-not-a-real-key' }, sidecar: { nickname: 'work' } })

describe("the proof", () => {
  it("a bank's whole life, as its components see it", async () => {
    const world = makeBankWorld()
    const dialog = makeDialog()

    // The page opens: the bank is made, and renders before its hello lands.
    const bank = world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['made: no vaults'])

    await bank.hello()
    bankUi.expectRenders(['ready: no vaults'])

    // Build: the first vault asks the user for a passphrase, and comes up unlocked.
    const vault = await bank.ensureVault(VaultScopeGiven)
    expect(dialog.shown.splice(0)).to.deep.equal(['build_vault'])
    bankUi.expectRenders(['ready: main locked', 'ready: main unlocked'])
    const vaultUi = mountComponent(vault, vaultStatus)
    vaultUi.expectRenders(['main unlocked'])
    const boxesUi = mountComponent(vault.boxListing, boxList)
    boxesUi.expectRenders(['no boxes'])

    // Seal a box: storage holds only ciphertext, and the list shows it.
    const box = await vault.putBox(ApiKey)
    boxesUi.expectRenders(['anthropic_api_key'])
    const boxUi = mountComponent(box, boxRow)
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    // The whisper's component watches the box for what's exposed, and the vault for the lock its getter checks.
    const revealUi = mountComponent(box, whisperReveal(box))
    const revealOfLockUi = mountComponent(vault, whisperReveal(box))
    revealUi.expectRenders(['hidden'])
    revealOfLockUi.expectRenders(['hidden'])
    const boxRows = [...world.vaultDB._cheat_boxRowsOf(vault.scope, vault.vault_tok).values()]
    expect(boxRows).to.have.lengthOf(1)
    expect(JSON.stringify(boxRows)).not.to.include(ApiKey.whisper.val)

    // Unseal it: extractWhisper hands over the whisper and keeps nothing; expose keeps it for the component.
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)
    boxUi.expectRenders([])
    await box.expose()
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders([JSON.stringify(ApiKey.whisper.val)])
    const snapshots = [bank.getSnapshot(), vault.getSnapshot(), vault.boxListing.getSnapshot(), box.getSnapshot()]
    expect(JSON.stringify(snapshots)).not.to.include(ApiKey.whisper.val)

    // Lock: every component watching the vault is told before lock() returns, the whisper leaves the screen, and the box refuses.
    vault.lock()
    bankUi.expectRenders(['ready: main locked'])
    vaultUi.expectRenders(['main locked'])
    boxUi.expectRenders([])
    boxesUi.expectRenders([])
    revealUi.expectRenders([])
    revealOfLockUi.expectRenders(['locked'])
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    await expect(vault.getBox(ApiKey.boxlabel)).resolves.to.eq(box)

    // The user closes the dialog: the unlock refuses declined, and nothing moves.
    dialog.typing = []
    await TH.expectRefusal(vault.ensureUnlocked(), 'declined')
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders([])

    // Unlock: the lock erased the cached lease, so the user is asked, and the wrong passphrase leaves the dialog open.
    dialog.typing = [byPassphrase('not the passphrase'), byPassphrase(Passphrase)]
    await vault.ensureUnlocked()
    expect(dialog.refusals.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal(['wrong_passphrase'])
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders(['ready: main unlocked'])
    vaultUi.expectRenders(['main unlocked'])
    boxUi.expectRenders([])
    boxesUi.expectRenders([])
    revealUi.expectRenders([])
    revealOfLockUi.expectRenders([JSON.stringify(ApiKey.whisper.val)])
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // Delete: the user proves it, the list empties, and the vault says it is gone.
    dialog.typing = byPassphrase(Passphrase)
    await vault.delVaultPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['del_vault'])
    bankUi.expectRenders(['ready: main locked', 'ready: no vaults'])
    vaultUi.expectRenders(['main locked', 'main deleted'])
    await TH.expectRefusal(vault.fetch(), 'vault_gone')
    expect(bank.vaultAt(VaultScopeGiven)).to.eq(vault)
    boxesUi.expectRenders(['no boxes'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"}'])
    revealUi.expectRenders(['locked'])
    revealOfLockUi.expectRenders(['locked', 'locked'])
    await TH.expectRefusal(box.extractWhisper(), 'disabled')

    // Rebuild over the tombstone: a new life, a new instance, a new vault_tok.
    const reborn = await bank.ensureVault(VaultScopeGiven)
    expect(dialog.shown.splice(0)).to.deep.equal(['build_vault'])
    expect(reborn).not.to.eq(vault)
    expect(reborn.vault_tok).not.to.eq(vault.vault_tok)
    bankUi.expectRenders(['ready: main locked', 'ready: main unlocked'])
    const rebornUi = mountComponent(reborn, vaultStatus)
    rebornUi.expectRenders(['main unlocked'])
    expect(await reborn.getBox(ApiKey.boxlabel, { ifAbsent: 'nil' })).to.be.null
    await reborn.putBox(ApiKey)

    // A fresh Bank on the same stores: it lists the vault locked, and picks up the cached lease with nobody asked.
    const nextPage = world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const nextPageUi = mountComponent(nextPage, bankStatus)
    nextPageUi.expectRenders(['made: no vaults'])
    await nextPage.hello()
    nextPageUi.expectRenders(['made: main locked', 'ready: main locked'])
    const pickedUp = await nextPage.ensureVault(VaultScopeGiven)
    expect(pickedUp.vault_tok).to.eq(reborn.vault_tok)
    await pickedUp.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    nextPageUi.expectRenders(['ready: main unlocked'])

    // It opens what the page before it sealed: the lease it picked up holds the same vaultKey.
    await pickedUp.hello()
    const nextBoxesUi = mountComponent(pickedUp.boxListing, boxList)
    nextBoxesUi.expectRenders(['anthropic_api_key'])
    const opened = await pickedUp.getBox(ApiKey.boxlabel)
    expect(await opened?.extractWhisper()).to.deep.equal(ApiKey.whisper)
    expect(dialog.shown).to.deep.equal([])
  })

  it("replacing the passphrase: nothing locks, and from then on only the new one opens the vault", async () => {
    const { bank, vault, dialog } = await buildHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await vault.replacePassphrasePrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['replace_passphrase'])
    bankUi.expectRenders(['ready: main unlocked'])
    expect(vault.isUnlocked).to.be.true

    vault.lock()
    bankUi.expectRenders(['ready: main locked'])
    dialog.typing = [byPassphrase(Passphrase), byPassphrase(NewPassphrase)]
    await vault.ensureUnlocked()
    expect(dialog.refusals.splice(0).map(({ refusalkind }) => refusalkind)).to.deep.equal(['wrong_passphrase'])
    bankUi.expectRenders(['ready: main unlocked'])
  })

  it("adding and revoking a passkey: the passkey opens the vault until it is revoked", async () => {
    const { bank, vault, dialog } = await buildHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { ...byPassphrase(Passphrase), ...await byPasskey('laptop') }
    await vault.addPasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['add_passkey'])
    bankUi.expectRenders(['ready: main unlocked'])
    expect(vault.gate.toJSON().passkey_wayin).not.to.be.null

    vault.lock()
    bankUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await vault.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders(['ready: main unlocked'])

    dialog.typing = byPassphrase(Passphrase)
    await vault.revokePasskeyPrompt()
    expect(dialog.shown.splice(0)).to.deep.equal(['revoke_passkey'])
    expect(vault.gate.toJSON().passkey_wayin).to.be.null
    bankUi.expectRenders(['ready: main unlocked'])

    vault.lock()
    bankUi.expectRenders(['ready: main locked'])
    dialog.typing = await byPasskey('laptop')
    await TH.expectRefusal(vault.ensureUnlocked(), 'absent_wayin')
    bankUi.expectRenders([])
    dialog.typing = byPassphrase(Passphrase)
    await vault.ensureUnlocked()
    bankUi.expectRenders(['ready: main unlocked'])
  })

  it("a host calling autolock locks a vault past its autolock, and a late page asks for a proof whether its host calls it or not", async () => {
    const { world, bank, vault, dialog } = await buildHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    // Inside the autolock duration, autolock changes nothing.
    world.advance(AutolockMillis - 1)
    await bank.autolock()
    bankUi.expectRenders([])
    expect(world.leaseRows()).to.have.lengthOf(1)

    // Past it, the lease is erased and the vault reads locked; the bank stays ready.
    world.advance(2)
    await bank.autolock()
    bankUi.expectRenders(['ready: main locked'])
    await TH.eventually(() => world.leaseRows().length === 0)
    expect(vault.isUnlocked).to.be.false

    // A page opened late whose host never calls autolock asks all the same: Lease.buildFromCache leaves the row and reads as no row.
    await vault.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders(['ready: main unlocked'])
    world.advance(AutolockMillis + 1)
    const latePage = world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const lateUi = mountComponent(latePage, bankStatus)
    await latePage.hello()
    lateUi.expectRenders(['made: no vaults', 'made: main locked', 'ready: main locked'])
    expect(world.leaseRows()).to.have.lengthOf(1)
    const expiredRow = world.leaseRows()[0]
    await latePage.vaultAt(VaultScopeGiven)?.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    lateUi.expectRenders(['ready: main unlocked'])
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect(world.leaseRows()[0]).to.not.deep.equal(expiredRow)

    // Its host calling autolock after hello erases the row before anyone asks.
    world.advance(AutolockMillis + 1)
    const laterPage = world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const laterUi = mountComponent(laterPage, bankStatus)
    await laterPage.hello()
    laterUi.expectRenders(['made: no vaults', 'made: main locked', 'ready: main locked'])
    await laterPage.autolock()
    laterUi.expectRenders([])
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("a row past autolock outlives a late page with no dialog, and the first page's bank.autolock finds it and locks", async () => {
    const { world, bank, vault } = await buildHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])
    world.advance(AutolockMillis + 1)
    const latePage = world.bankOn({ requestCleartext: undefined, onBadNews })
    await latePage.hello()
    await TH.expectRefusal(latePage.vaultAt(VaultScopeGiven)!.ensureUnlocked(), 'vault_locked')
    expect(world.leaseRows()).to.have.lengthOf(1)
    bankUi.expectRenders([])
    await bank.autolock()
    bankUi.expectRenders(['ready: main locked'])
    expect(vault.isLocked).to.be.true
    await TH.eventually(() => world.leaseRows().length === 0)
  })

  it("signing out: bank.vacate empties the screen and this device, and the next hello lists the vault again, locked", async () => {
    const { world, bank, vault, dialog } = await buildHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    bank.vacate()
    bankUi.expectRenders(['made: main locked', 'made: no vaults'])
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'bad_option')
    expect(world.leaseRows()).to.have.lengthOf(0)
    await TH.expectRefusal(vault.ensureUnlocked(), 'disabled')

    await bank.hello()
    bankUi.expectRenders(['made: main locked', 'ready: main locked'])
    const again = await bank.ensureVault(VaultScopeGiven)
    expect(again).not.to.eq(vault)
    await again.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders(['ready: main unlocked'])
  })

  it("the store goes out of reach: an unlocked vault keeps its lease, a refused hello paints refused, and the next one recovers", async () => {
    const { world, bank, vault } = await buildHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    world.advance(StaleMillis)
    world.vaultDB._cheat_refuseGets('storage_error')
    // A vault too stale to know whether it deserves its lease refuses the ask, and keeps the lease it has.
    await TH.expectRefusal(vault.ensureUnlocked(), 'storage_error')
    expect(vault.isUnlocked).to.be.true
    await TH.expectRefusal(bank.hello(), 'storage_error')
    bankUi.expectRenders(['refused: main unlocked'])
    expect(bank.snapshot.err?.refusalkind).to.eq('storage_error')
    TH.expectSyncRefusal(() => bank.vaultAt(VaultScopeGiven), 'storage_error')

    world.vaultDB._cheat_refuseGets(null)
    await bank.hello()
    bankUi.expectRenders(['ready: main unlocked'])
    expect(bank.vaultAt(VaultScopeGiven)).to.eq(vault)
  })

  it("a second device: what it does reaches this one's components through the watch, with nobody asked and no lock", async () => {
    const { world, bank, vault, dialog } = await buildHost()
    const box = await vault.putBox(ApiKey)
    await vault.hello()
    const bankUi = mountComponent(bank, bankStatus)
    const boxesUi = mountComponent(vault.boxListing, boxList)
    bankUi.expectRenders(['ready: main unlocked'])
    boxesUi.expectRenders(['anthropic_api_key'])

    // The second device has no lease cached, so its unlock asks; it then opens the box this one sealed.
    const phone = makeDialog()
    const phoneBank = world.bankOnAnotherDevice({ requestCleartext: phone.requestCleartext, onBadNews })
    await phoneBank.hello()
    const phoneVault = await phoneBank.ensureVault(VaultScopeGiven)
    await phoneVault.ensureUnlocked()
    expect(phone.shown.splice(0)).to.deep.equal(['unlock_vault'])
    const phoneBox = await phoneVault.getBox(ApiKey.boxlabel)
    expect(await phoneBox?.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // A box it adds lands in this device's list.
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'openai_api_key' })
    await ticks(1)
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key'])

    // A store with no watch, or a watch ended: nothing arrives until the host says hello to the vault again, on its own timer.
    vault.boxListing.goodbye()
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'gemini_api_key' })
    await ticks(1)
    boxesUi.expectRenders([])
    await vault.hello()
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key, gemini_api_key'])

    // It replaces the passphrase: this device stays unlocked and holds the new gate; a later unlock takes the new passphrase.
    phone.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await phoneVault.replacePassphrasePrompt()
    await ticks(1)
    bankUi.expectRenders(['ready: main unlocked'])
    expect(vault.isUnlocked).to.be.true
    expect(vault.gate.toJSON().gate_epoch).to.eq(phoneVault.gate.toJSON().gate_epoch)
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    vault.lock()
    bankUi.expectRenders(['ready: main locked'])
    dialog.typing = byPassphrase(NewPassphrase)
    await vault.ensureUnlocked()
    bankUi.expectRenders(['ready: main unlocked'])

    // It deletes the vault: this device locks, erases its lease, and the vault leaves the list.
    phone.typing = byPassphrase(NewPassphrase)
    await phoneVault.delVaultPrompt()
    await ticks(1)
    bankUi.expectRenders(['ready: no vaults'])
    expect(vault.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(0)
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_gone')
  })

  it("React StrictMode: effect, cleanup, effect paints no refusal", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn({ onBadNews })
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['made: no vaults'])

    // The effect calls hello, its cleanup sweeps, and the effect runs again, as StrictMode does on mount.
    const firstEffect = bank.tryHello()
    bank.sweep()
    const secondEffect = bank.tryHello()
    await Promise.all([firstEffect, secondEffect])

    bankUi.expectRenders(['made: no vaults', 'ready: no vaults'])
    const { err } = await firstEffect
    expect(err?.refusalkind).to.eq('disabled')
    expect(await secondEffect).to.include({ ok: true })
  })

  it("React StrictMode over a vault already cached: the second effect's listing holds it, and picks up the lease with nobody asked", async () => {
    const { world, dialog } = await buildHost()
    const bank = world.bankOn({ requestCleartext: dialog.requestCleartext, onBadNews })
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['made: no vaults'])

    const firstEffect = bank.tryHello()
    bank.sweep()
    await Promise.all([firstEffect, bank.hello()])
    bankUi.expectRenders(['made: no vaults', 'made: main locked', 'ready: main locked'])

    const vault = await bank.ensureVault(VaultScopeGiven)
    await vault.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    bankUi.expectRenders(['ready: main unlocked'])
  })
})
