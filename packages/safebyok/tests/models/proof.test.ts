/** The sprint's proof, and how the package is used: a host drives a bank through a whole life, and every step asserts what its components render, over real in-memory stores. */

import { describe, expect, it } from 'vitest'
import type { VaultError } from '../../src/errors'
import type { BankSnapshot } from '../../src/models/bank'
import type { Box, BoxSnapshot } from '../../src/models/box'
import type { RequestCleartext } from '../../src/models/gating'
import type { GatingKind } from '../../src/models/models-shapes'
import { Storable } from '../../src/models/storable'
import type { Vault, VaultSnapshot } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { AutolockMinutes, VaultBag, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { ticks } from '../test-helpers/timing'
import { NewPassphrase, Passphrase, byPasskey, byPassphrase } from '../test-helpers/vault-world'

useBankWorlds()

// == [A React host, in miniature]: mountComponent, bankStatus, vaultStatus, boxList, boxRow, makeDialog

type Store<SnapshotT> = { subscribe: (listener: () => void) => () => void, getSnapshot: () => SnapshotT }

/**
 * A component over `useSyncExternalStore(store.subscribe, store.getSnapshot)`, painting `view` of each snapshot.
 * A listener told with nothing new, or a snapshot that changed with no listener told, fails the next `expectRenders`.
 */
const mountComponent = <SnapshotT>(store: Store<SnapshotT>, view: (snapshot: SnapshotT) => string) => {
  let rendered = store.getSnapshot()
  let idleTells = 0
  const painted = [view(rendered)]
  const unmount = store.subscribe(() => {
    const next = store.getSnapshot()
    if (next === rendered) { idleTells += 1 }
    rendered = next
    painted.push(view(next))
  })
  return {
    unmount,
    /** Everything painted since the last call is exactly `paints`, the snapshot's identity moving exactly when a listener was told. */
    expectRenders: (paints: string[]) => {
      expect(store.getSnapshot(), 'a snapshot changed with no listener told').to.eq(rendered)
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

const boxRow = ({ boxlabel, present, sidecar, lockState }: BoxSnapshot): string => `${boxlabel} ${present ? JSON.stringify(sidecar) : 'deleted'} ${lockState}`

/** The component that shows the whisper itself: `box.whisper`, read afresh at each paint, as a snapshot never holds it. */
const whisperReveal = (box: Box) => (): string => {
  const { whisper } = box
  if (whisper === null) { return 'hidden' }
  return Storable.isLockedFUBag(whisper) ? 'locked' : JSON.stringify(whisper.val)
}

/** The host's dialog: it records what it was shown for, and hands over what the user will type. */
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

/** `vault.ensureUnlocked()` with the user mistyping once, and getting it right: answers the refusal the dialog showed. */
const unlockAfterAWrongPassphrase = async (vault: Vault, dialog: ReturnType<typeof makeDialog>): Promise<unknown> => {
  dialog.typing = [byPassphrase('not the passphrase'), byPassphrase(Passphrase)]
  await vault.ensureUnlocked()
  dialog.typing = byPassphrase(Passphrase)
  return dialog.refusals.shift()
}

/** A bank past its `hello` with the vault of `VaultBag` built and unlocked, and the dialog that did it, cleared. */
const makeHost = async () => {
  const world = makeBankWorld()
  const dialog = makeDialog()
  const bank = world.bankOn({ requestCleartext: dialog.requestCleartext })
  await bank.hello()
  const vault = await bank.ensureVault(VaultBag)
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

    // == The page opens: the bank is made, and renders before its hello lands.
    const bank = world.bankOn({ requestCleartext: dialog.requestCleartext })
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['made: no vaults'])

    await bank.hello()
    bankUi.expectRenders(['ready: no vaults'])

    // == Build: the first vault asks the user for a passphrase, and comes up unlocked.
    const vault = await bank.ensureVault(VaultBag)
    expect(dialog.shown.splice(0)).to.deep.equal(['build_vault'])
    bankUi.expectRenders(['ready: main locked', 'ready: main unlocked'])
    const vaultUi = mountComponent(vault, vaultStatus)
    vaultUi.expectRenders(['main unlocked'])
    const boxesUi = mountComponent(vault.boxListing, boxList)
    boxesUi.expectRenders(['no boxes'])

    // == Seal a box: storage holds only ciphertext, and the list shows it.
    const box = await vault.putBox(ApiKey)
    boxesUi.expectRenders(['anthropic_api_key'])
    const boxUi = mountComponent(box, boxRow)
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"} unlocked'])
    const revealUi = mountComponent(box, whisperReveal(box))
    revealUi.expectRenders(['hidden'])
    expect(JSON.stringify(box.toJSON())).not.to.include(ApiKey.whisper.val)

    // == Unseal it: extractWhisper hands over the whisper and keeps nothing; expose keeps it for the component.
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)
    boxUi.expectRenders([])
    await box.expose()
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"} unlocked'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders([JSON.stringify(ApiKey.whisper.val)])

    // == Lock: everything reads locked before lock() returns, nobody is asked, and the box refuses.
    vault.lock()
    bankUi.expectRenders(['ready: main locked'])
    vaultUi.expectRenders(['main locked'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"} locked'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders(['locked'])
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
    await TH.expectRefusal(vault.getBox(ApiKey.boxlabel), 'vault_locked')

    // == The user closes the dialog: the unlock refuses declined, and nothing moves.
    dialog.typing = []
    await TH.expectRefusal(vault.ensureUnlocked(), 'declined')
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders([])

    // == Unlock: the lock erased the cached lease, so the user is asked, and the wrong passphrase leaves the dialog open.
    const wrongThenRight = await unlockAfterAWrongPassphrase(vault, dialog)
    expect(wrongThenRight).to.include({ refusalkind: 'wrong_passphrase' })
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders(['ready: main unlocked'])
    vaultUi.expectRenders(['main unlocked'])
    boxUi.expectRenders(['anthropic_api_key {"nickname":"work"} unlocked'])
    boxesUi.expectRenders(['anthropic_api_key'])
    revealUi.expectRenders([JSON.stringify(ApiKey.whisper.val)])
    expect(await box.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // == Delete: the user proves it, the list empties, and the vault says it is gone.
    await vault.delVault()
    expect(dialog.shown.splice(0)).to.deep.equal(['del_vault'])
    bankUi.expectRenders(['ready: main locked', 'ready: no vaults'])
    vaultUi.expectRenders(['main locked', 'main deleted'])
    await TH.expectRefusal(vault.fetch(), 'vault_gone')
    expect(bank.vaultOf(VaultBag)).to.eq(vault)
    boxesUi.expectRenders(['anthropic_api_key', 'no boxes'])
    revealUi.expectRenders(['locked', 'locked'])
    await TH.expectRefusal(box.extractWhisper(), 'disabled')

    // == Rebuild over the tombstone: a new life, a new instance, a new vault_tok.
    const reborn = await bank.ensureVault(VaultBag)
    expect(dialog.shown.splice(0)).to.deep.equal(['build_vault'])
    expect(reborn).not.to.eq(vault)
    expect(reborn.vault_tok).not.to.eq(vault.vault_tok)
    bankUi.expectRenders(['ready: main locked', 'ready: main unlocked'])
    const rebornUi = mountComponent(reborn, vaultStatus)
    rebornUi.expectRenders(['main unlocked'])
    expect(await reborn.getBox(ApiKey.boxlabel, { ifAbsent: 'nil' })).to.be.null
    await reborn.putBox(ApiKey)

    // == A fresh Bank on the same stores: it lists the vault locked, and picks up the cached lease with nobody asked.
    const nextPage = world.bankOn({ requestCleartext: dialog.requestCleartext })
    const nextPageUi = mountComponent(nextPage, bankStatus)
    nextPageUi.expectRenders(['made: no vaults'])
    await nextPage.hello()
    nextPageUi.expectRenders(['made: main locked', 'ready: main locked'])
    const pickedUp = await nextPage.ensureVault(VaultBag)
    expect(pickedUp.vault_tok).to.eq(reborn.vault_tok)
    await pickedUp.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    nextPageUi.expectRenders(['ready: main unlocked'])

    // == It opens what the page before it sealed: the lease it picked up holds the same vaultKey.
    await pickedUp.hello()
    const nextBoxesUi = mountComponent(pickedUp.boxListing, boxList)
    nextBoxesUi.expectRenders(['anthropic_api_key'])
    const opened = await pickedUp.getBox(ApiKey.boxlabel)
    expect(await opened?.extractWhisper()).to.deep.equal(ApiKey.whisper)
    expect(dialog.shown).to.deep.equal([])
  })

  it("replacing the passphrase: nothing locks, and from then on only the new one opens the vault", async () => {
    const { bank, vault, dialog } = await makeHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await vault.replacePassphrase()
    expect(dialog.shown.splice(0)).to.deep.equal(['replace_passphrase'])
    bankUi.expectRenders(['ready: main unlocked'])
    expect(vault.isUnlocked).to.be.true

    vault.lock()
    bankUi.expectRenders(['ready: main locked'])
    dialog.typing = [byPassphrase(Passphrase), byPassphrase(NewPassphrase)]
    await vault.ensureUnlocked()
    expect(dialog.refusals.splice(0)).to.satisfy(([refusal]: VaultError[]) => refusal?.refusalkind === 'wrong_passphrase')
    bankUi.expectRenders(['ready: main unlocked'])
  })

  it("adding and revoking a passkey: the passkey opens the vault until it is revoked", async () => {
    const { bank, vault, dialog } = await makeHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    dialog.typing = { ...byPassphrase(Passphrase), ...await byPasskey('laptop') }
    await vault.addPasskey()
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
    await vault.revokePasskey()
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

  it("tidy locks a vault past its autolock, and the next hello's tidy leaves the next page asking", async () => {
    const { world, bank, vault, dialog } = await makeHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    // == Inside the autolock, tidy changes nothing.
    world.advance(AutolockMillis - 1)
    await bank.tidy()
    bankUi.expectRenders([])
    expect(world.leaseRows()).to.have.lengthOf(1)

    // == Past it, the lease is erased and the vault reads locked; the bank stays ready.
    world.advance(2)
    await bank.tidy()
    bankUi.expectRenders(['ready: main locked'])
    expect(world.leaseRows()).to.have.lengthOf(0)
    expect(vault.isUnlocked).to.be.false

    // == And a page opened late finds nothing cached: its unlock asks.
    await vault.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders(['ready: main unlocked'])
    world.advance(AutolockMillis + 1)
    const latePage = world.bankOn({ requestCleartext: dialog.requestCleartext })
    await latePage.hello()
    expect(world.leaseRows()).to.have.lengthOf(0)
    await latePage.vaultOf(VaultBag)?.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
  })

  it("signing out: bank.vacate empties the screen and this device, and the next hello lists the vault again, locked", async () => {
    const { world, bank, vault, dialog } = await makeHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    bank.vacate()
    bankUi.expectRenders(['made: main locked', 'made: no vaults'])
    await TH.expectRefusal(bank.ensureVault(VaultBag), 'bad_option')
    expect(world.leaseRows()).to.have.lengthOf(0)
    await TH.expectRefusal(vault.ensureUnlocked(), 'disabled')

    await bank.hello()
    bankUi.expectRenders(['made: main locked', 'ready: main locked'])
    const again = await bank.ensureVault(VaultBag)
    expect(again).not.to.eq(vault)
    await again.ensureUnlocked()
    expect(dialog.shown.splice(0)).to.deep.equal(['unlock_vault'])
    bankUi.expectRenders(['ready: main unlocked'])
  })

  it("the network goes: an unlocked vault stays unlocked and says so, a refused hello paints refused, and the next one recovers", async () => {
    const { world, bank, vault } = await makeHost()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['ready: main unlocked'])

    world.advance(StaleMillis)
    world.vaultDB._cheat_refuseGets('storage_error')
    expect(await vault.ensureUnlocked()).to.eq(vault)
    await TH.expectRefusal(bank.hello(), 'storage_error')
    bankUi.expectRenders(['refused: main unlocked'])
    expect(bank.snapshot.err?.refusalkind).to.eq('storage_error')
    TH.expectSyncRefusal(() => bank.vaultOf(VaultBag), 'storage_error')

    world.vaultDB._cheat_refuseGets(null)
    await bank.hello()
    bankUi.expectRenders(['ready: main unlocked'])
    expect(bank.vaultOf(VaultBag)).to.eq(vault)
  })

  it("a second device: what it does reaches this one's components through the watch, with nobody asked and no lock", async () => {
    const { world, bank, vault, dialog } = await makeHost()
    const box = await vault.putBox(ApiKey)
    const bankUi = mountComponent(bank, bankStatus)
    const boxesUi = mountComponent(vault.boxListing, boxList)
    bankUi.expectRenders(['ready: main unlocked'])
    boxesUi.expectRenders(['anthropic_api_key'])

    // == The second device has no lease cached, so its unlock asks; it then opens the box this one sealed.
    const phone = makeDialog()
    const phoneBank = world.bankOnAnotherDevice({ requestCleartext: phone.requestCleartext })
    await phoneBank.hello()
    const phoneVault = await phoneBank.ensureVault(VaultBag)
    await phoneVault.ensureUnlocked()
    expect(phone.shown.splice(0)).to.deep.equal(['unlock_vault'])
    const phoneBox = await phoneVault.getBox(ApiKey.boxlabel)
    expect(await phoneBox?.extractWhisper()).to.deep.equal(ApiKey.whisper)

    // == A box it adds lands in this device's list.
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'openai_api_key' })
    await ticks(1)
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key'])

    // == A store with no watch, or a watch ended: nothing arrives until the host says hello to the vault again, on its own timer.
    vault.boxListing.goodbye()
    await phoneVault.putBox({ ...ApiKey, boxlabel: 'gemini_api_key' })
    await ticks(1)
    boxesUi.expectRenders([])
    await vault.hello()
    boxesUi.expectRenders(['anthropic_api_key, openai_api_key, gemini_api_key'])

    // == It replaces the passphrase: this device stays unlocked and holds the new gate; a later unlock takes the new passphrase.
    phone.typing = { antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }
    await phoneVault.replacePassphrase()
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

    // == It deletes the vault: this device locks, erases its lease, and the vault leaves the list.
    phone.typing = byPassphrase(NewPassphrase)
    await phoneVault.delVault()
    await ticks(1)
    bankUi.expectRenders(['ready: no vaults'])
    expect(vault.isUnlocked).to.be.false
    expect(world.leaseRows()).to.have.lengthOf(0)
    await TH.expectRefusal(vault.ensureUnlocked(), 'vault_gone')
  })

  it("React StrictMode: effect, cleanup, effect paints no refusal", async () => {
    const world = makeBankWorld()
    const bank = world.bankOn()
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['made: no vaults'])

    // == The effect calls hello, its cleanup sweeps, and the effect runs again, as StrictMode does on mount.
    const firstEffect = bank.tryHello()
    bank.sweep()
    const secondEffect = bank.tryHello()
    await Promise.all([firstEffect, secondEffect])

    bankUi.expectRenders(['made: no vaults', 'ready: no vaults'])
    expect(await firstEffect).to.include({ ok: false })
    expect(await secondEffect).to.include({ ok: true })
  })

  it("React StrictMode over a vault already cached: the second effect's listing holds it, and picks up the lease with nobody asked", async () => {
    const { world, dialog } = await makeHost()
    const bank = world.bankOn({ requestCleartext: dialog.requestCleartext })
    const bankUi = mountComponent(bank, bankStatus)
    bankUi.expectRenders(['made: no vaults'])

    const firstEffect = bank.tryHello()
    bank.sweep()
    await Promise.all([firstEffect, bank.hello()])
    bankUi.expectRenders(['made: no vaults', 'made: main locked', 'ready: main locked'])

    const vault = await bank.ensureVault(VaultBag)
    await vault.ensureUnlocked()
    expect(dialog.shown).to.deep.equal([])
    bankUi.expectRenders(['ready: main unlocked'])
  })
})
