/** The bank's gate changed and the bank deleted through their prompts, as a device and the devices beside it see them; and a vault's delete, which asks nobody. */

import { describe, expect, it, vi } from 'vitest'
import { nowMillis } from '../../src/helpers/clock'
import type { StrengthChecker } from '../../src/helpers/passphrase-strength'
import { VaultError } from '../../src/refusals/errors'
import type { Bank } from '../../src/models/bank'
import type { Gating } from '../../src/models/gating'
import { Lease } from '../../src/models/lease'
import { PasskeyProving, PassphraseProving } from '../../src/models/proving'
import type { Gatingkind } from '../../src/shapes/shapes-enums'
import { passphraseCleartext } from '../../src/shapes/shapes-gateish'
import { Promptly } from '../../src/shapes/shapes-vaultish'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import * as TH from '../test-helpers'
import { isZeroed } from '../test-helpers/proving-world'
import { Dna, NewPassphrase, Passphrase, Sidecar, Whisper, addPasskeyTyping, bankTyping, boxlabel, byPasskey, byPassphrase, delTyping, makeBornVault, makeBornVaultWithPasskey, makeWorldWithBox, replaceTyping, revokeTyping, unlockTyping, useVaultWorlds, vaultRoundTrip } from '../test-helpers/vault-world'

useVaultWorlds()

// == [Helpers]: Born, dialogOf, proveBy, movedBeforeCommit, deafened, weakIfAsked, NewWhisper, Stamp

type Born = Awaited<ReturnType<typeof makeBornVault>>

/** Leaves the world's dialog up until the gating concludes, and shows the gating to the test. */
function dialogOf({ dialog }: Born) {
  const shown: unknown[] = []
  dialog.requestCleartext = (gating) => {
    shown.push(gating)
    return gating.whenConcluded
  }
  return {
    shown,
    gatingAt: <KindT extends Gatingkind>() => vi.waitFor(() => {
      if (shown.length === 0) { throw new Error("no dialog shown yet") }
      return shown[0] as Gating<KindT>
    }, { interval: 1 }),
  }
}

/** The proving of the bank's main gate that `passphrase` opens, refusing 'wrong_passphrase' otherwise. */
function proveBy(bank: Bank, passphrase: string) { return PassphraseProving.buildStored(bank.maingate, passphraseCleartext.parse(passphrase), bank) }

/** Moves the gate row past what the attempt read, as another device does just before `verb`'s commit reaches the bankDB. */
function movedBeforeCommit({ bankDB, demandStoredGate, putGateBehindOurBack }: Born, verb: 'tryReplacePassphrase' | 'tryAddPasskey' | 'tryRevokePasskey') {
  const commit = bankDB[verb].bind(bankDB)
  vi.spyOn(bankDB, verb).mockImplementationOnce((ask) => {
    putGateBehindOurBack(demandStoredGate())
    return commit(ask)
  })
}

/** `born` with its device's watch ended: what it has of its bank is what it last fetched. */
function deafened<WorldT extends Born>(born: WorldT): WorldT {
  born.bank.vaultListing.goodbye()
  return born
}

/** A strength checker that finds 'weak' weak and anything else strong. */
const weakIfAsked: StrengthChecker = (passphrase: string) => (passphrase === 'weak' ? { strong: false as const, reason: 'too short' } : { strong: true as const })

const NewWhisper = Object.freeze({ apiKey: 'sk-test-1111' })

const Stamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })
// --

describe("a lease cache that refuses", () => {
  it("leaves the passphrase replaced and the bank unlocked, and reports to onBadNews", async () => {
    const { bank, deviceDB, badnews } = await makeBornVault()
    const refusal = new VaultError('storage_unavailable', 'the disk is full')
    deviceDB.tryStow.mockResolvedValueOnce(TH.bad(refusal))
    await expect(replaceTyping(bank, Passphrase, NewPassphrase)).resolves.to.eq(bank.maingate)
    expect(bank.isUnlocked).to.be.true
    expect(badnews).to.deep.equal([refusal])
  })
})

describe("a gate changed on another device", () => {
  // The bankKey did not change, so a lease in force stays in force.
  it("heard through the watch leaves this bank unlocked, its lease still sealing", async () => {
    const { bank, vault, anotherDevice } = await makeBornVault()
    const theirs = await anotherDevice().ensureBank()
    await replaceTyping(theirs, Passphrase, NewPassphrase)
    await TH.eventually(() => bank.maingate.revision_tok === theirs.maingate.revision_tok)
    expect(bank.maingate.pickle()).to.deep.equal(theirs.maingate.pickle())
    expect(bank.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })

  it("taken from a fetch leaves this bank unlocked, its lease in force", async () => {
    const { bank, vault, anotherDevice, demandStoredGate } = deafened(await makeBornVaultWithPasskey())
    const ante = bank.maingate.pickle()
    const theirs = await anotherDevice().ensureBank()
    await replaceTyping(theirs, Passphrase, NewPassphrase)
    expect(bank.maingate.pickle()).to.deep.equal(ante)
    await bank.maingate.ensureTimely(0)
    expect(bank.maingate.pickle()).to.deep.equal(demandStoredGate())
    expect(bank.isUnlocked).to.be.true
    expect(await vaultRoundTrip(vault, vault)).to.eq('sk-test')
  })
})

describe("a passkey over a passphrase change", () => {
  // A decision: notes/wontfix.md, 2026-11-09.
  it("keeps the passkey wayin as stored, and the passkey still opens", async () => {
    const { bank, demandStoredGate } = await makeBornVaultWithPasskey()
    const { passkey0 } = demandStoredGate().wayins
    await replaceTyping(bank, Passphrase, NewPassphrase)
    expect(demandStoredGate().wayins.passkey0).to.deep.equal(passkey0)
    const proving = await PasskeyProving.buildStored(bank.maingate, await TH.passkeyOf('laptop'))
    expect(proving.wayinkind).to.eq('passkey')
  })
})

describe("gate.replacePassphrasePrompt()", () => {
  it("replaces the passphrase wayin, keeping the passkey and the gate's life", async () => {
    const { bank, demandStoredGate } = await makeBornVaultWithPasskey()
    const ante = demandStoredGate()
    expect(await replaceTyping(bank, Passphrase, NewPassphrase)).to.equal(bank.maingate)
    const stored = demandStoredGate()
    expect(stored).to.include({ revision_seq: ante.revision_seq + 1, gate_tok: ante.gate_tok, bank_tok: ante.bank_tok })
    expect(stored.wayins.passkey0).to.deep.equal(ante.wayins.passkey0)
    expect(bank.maingate.pickle()).to.deep.equal(stored)
    await proveBy(bank, NewPassphrase)
    await TH.expectRefusal(proveBy(bank, Passphrase), 'wrong_passphrase')
    await expect(PasskeyProving.buildStored(bank.maingate, await TH.passkeyOf('laptop'))).resolves.to.be.instanceOf(PasskeyProving)
  })

  it("leaves the dialog open on a wrong ante, a weak next or the same passphrase, putting nothing, and the next attempt lands", async () => {
    const born = await makeBornVault(byPassphrase(Passphrase), { strengthChecker: weakIfAsked })
    const { bank, demandStoredGate } = born
    const ante = demandStoredGate()
    const { gatingAt } = dialogOf(born)
    const replacing = bank.maingate.replacePassphrasePrompt()
    const gating = await gatingAt<'replace_passphrase'>()
    await TH.expectBad(gating.attempt({ antePassphraseClear: 'not it', nextPassphraseClear: NewPassphrase }), 'wrong_passphrase')
    await TH.expectBad(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: 'weak' }), 'weak_passphrase')
    const same = await TH.expectBad(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: Passphrase }), 'same_passphrase')
    expect(TH.thrownText(same)).to.not.include(Passphrase)
    expect(demandStoredGate()).to.equal(ante)
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }))
    expect(await replacing).to.equal(bank.maingate)
    await proveBy(bank, NewPassphrase)
  })

  it("unlocks with a change attempted after a lock", async () => {
    const born = await makeBornVault()
    const { bank, demandStoredGate } = born
    const ante = demandStoredGate()
    const { gatingAt } = dialogOf(born)
    const replacing = bank.maingate.replacePassphrasePrompt()
    const gating = await gatingAt<'replace_passphrase'>()
    bank.lock()
    expect(gating.isOpen).to.be.true
    await TH.expectGood(gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase }))
    await replacing
    expect(demandStoredGate()).to.not.equal(ante)
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses 'stale_write' a row moved since the attempt read it", async () => {
    const born = await makeBornVault()
    const { bank, demandStoredGate } = born
    movedBeforeCommit(born, 'tryReplacePassphrase')
    await TH.expectRefusal(replaceTyping(bank, Passphrase, NewPassphrase), 'stale_write')
    expect(bank.maingate.revision_seq).to.eq(demandStoredGate().revision_seq)
    expect(bank.isUnlocked).to.be.true
    await proveBy(bank, Passphrase)
  })

  it("leases citing the gate row it wrote, not a newer one that arrived meanwhile", async () => {
    const { bank, bankDB, deviceDB, demandStoredGate, putGateBehindOurBack } = await makeBornVault()
    const commit = bankDB.tryReplacePassphrase.bind(bankDB)
    let written = ''
    vi.spyOn(bankDB, 'tryReplacePassphrase').mockImplementationOnce(async (ask) => {
      const answer = await commit(ask)
      written = ask.record.revision_tok
      putGateBehindOurBack(demandStoredGate())
      await bank.maingate.ensureTimely(0)
      return answer
    })
    await replaceTyping(bank, Passphrase, NewPassphrase)
    expect(bank.maingate.revision_tok).to.eq(demandStoredGate().revision_tok)
    expect(bank.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.include({ gate_revision_tok: written })
  })

  it("refuses a bank deleted since the last fetch, its tombstone listed and the device left with no bank", async () => {
    const { device, bank, anotherDevice, storedBankNow } = deafened(await makeBornVault())
    await delTyping(await anotherDevice().ensureBank(), Passphrase)
    expect(bank.isPresent).to.be.true
    await TH.expectRefusal(replaceTyping(bank, Passphrase, NewPassphrase))
    expect(bank.isEnabled).to.be.false
    expect(bank.listing.at(bank.scope)).to.eq(bank)
    expect(bank.sparse).to.include({ am: 'x', bank_tok: storedBankNow()?.bank_tok, revision_seq: storedBankNow()?.revision_seq })
    expect(device.bank).to.be.null
  })

  it("tells the device's listeners once a bank of another life replaces the bank listed, with no gating open", async () => {
    const { device, bank, anotherDevice, storedBankNow } = deafened(await makeBornVault())
    bank.lock()
    const other = anotherDevice()
    await delTyping(await other.ensureBank(), Passphrase)
    await bankTyping(other, byPassphrase(NewPassphrase))
    const listener = vi.fn()
    device.subscribe(listener)
    bank.receiveParent(storedBankNow())
    expect(device.bank).to.be.null
    expect(device.snapshot.bank_tok).to.be.null
    expect(listener).toHaveBeenCalledOnce()
  })

  it("refuses a bank of another life stored since the last fetch, that life replacing the bank listed", async () => {
    const { device, bank, anotherDevice, storedBankNow } = deafened(await makeBornVault())
    const other = anotherDevice()
    await delTyping(await other.ensureBank(), Passphrase)
    await bankTyping(other, byPassphrase(NewPassphrase))
    await TH.expectRefusal(replaceTyping(bank, Passphrase, NewPassphrase))
    expect(bank.isEnabled).to.be.false
    expect(bank.sparse.bank_tok).to.eq(storedBankNow()?.bank_tok)
    expect(bank.bank_tok).to.not.eq(storedBankNow()?.bank_tok)
    expect(device.bank).to.be.null
    expect(device.snapshot.bank_tok).to.be.null
    expect(await device.ensureBank()).to.include({ bank_tok: storedBankNow()?.bank_tok, isLocked: true })
  })

  it("refuses 'stale_write' when a gate row arrives during the proving", async () => {
    let born: Born | null = null
    const crossing: StrengthChecker = async () => {
      if (born !== null) {
        born.putGateBehindOurBack(born.demandStoredGate())
        await born.bank.maingate.ensureTimely(0)
      }
      return { strong: true as const }
    }
    const made = await makeBornVault(byPassphrase(Passphrase), { strengthChecker: crossing })
    born = made
    await TH.expectRefusal(replaceTyping(made.bank, Passphrase, NewPassphrase), 'stale_write')
    await proveBy(made.bank, Passphrase)
  })

  it("the try form returns the refusal", async () => {
    const born = await makeBornVault()
    born.dialog.requestCleartext = (gating) => { gating.dismiss() }
    await TH.expectBad(born.bank.maingate.tryReplacePassphrasePrompt(), 'dismissed')
  })
})

describe("gating.attempt of another kind's cleartexts", () => {
  const WrongKindCases = [
    ["replacePassphrasePrompt",  'refuses a passphrase alone where an ante and a next are asked'],
    ["addPasskeyPrompt",         'refuses a passphrase alone where a passkey is asked beside it'],
  ] as const

  for (const [prompt, blurb] of WrongKindCases) {
    it(blurb, async () => {
      const born = await makeBornVault()
      const { bank, demandStoredGate } = born
      const ante = demandStoredGate()
      const { gatingAt } = dialogOf(born)
      const prompting = TH.expectRefusal(bank.maingate[prompt]())
      const gating = await gatingAt()
      const err = await TH.expectBad(gating.attempt({ passphraseClear: Passphrase }))
      await prompting
      expect(gating.isOpen).to.be.false
      expect(demandStoredGate()).to.equal(ante)
      expect(TH.thrownText(err)).to.not.include(Passphrase)
    })
  }
})

describe("gate.addPasskeyPrompt()", () => {
  it("adds the passkey wayin and keeps the passphrase's", async () => {
    const { bank, demandStoredGate } = await makeBornVault()
    const ante = demandStoredGate()
    expect(await addPasskeyTyping(bank, Passphrase, 'laptop')).to.equal(bank.maingate)
    const stored = demandStoredGate()
    expect(stored).to.include({ revision_seq: ante.revision_seq + 1, gate_tok: ante.gate_tok })
    expect(stored.wayins.main).to.deep.equal(ante.wayins.main)
    expect(bank.isUnlocked).to.be.true
    await proveBy(bank, Passphrase)
    await expect(PasskeyProving.buildStored(bank.maingate, await TH.passkeyOf('laptop'))).resolves.to.be.instanceOf(PasskeyProving)
  })

  it("refuses without showing a dialog when a passkey is already stored", async () => {
    const born = await makeBornVaultWithPasskey()
    const { shown } = dialogOf(born)
    await TH.expectRefusal(born.bank.maingate.addPasskeyPrompt())
    expect(shown).to.have.lengthOf(0)
  })

  it("keeps the passkey answer's PRF bytes after a wrong passphrase, and zeroes them when the gating concludes", async () => {
    const born = await makeBornVault()
    const { gatingAt } = dialogOf(born)
    const adding = born.bank.maingate.addPasskeyPrompt()
    const gating = await gatingAt<'add_passkey'>()
    const passkeyClear = await TH.passkeyOf('laptop')
    await TH.expectBad(gating.attempt({ passphraseClear: 'not it', passkeyClear }), 'wrong_passphrase')
    expect(isZeroed(passkeyClear.prfBytes)).to.be.false
    await TH.expectGood(gating.attempt({ passphraseClear: Passphrase, passkeyClear }))
    await adding
    expect(isZeroed(passkeyClear.prfBytes)).to.be.true
  })

  it("zeroes a bare ArrayBuffer of PRF bytes when refusing it", async () => {
    const born = await makeBornVault()
    const { gatingAt } = dialogOf(born)
    const adding = TH.expectRefusal(born.bank.maingate.addPasskeyPrompt())
    const gating = await gatingAt<'add_passkey'>()
    const { prfBytes, ...answer } = await TH.passkeyOf('laptop')
    const { buffer } = new Uint8Array(prfBytes)
    await TH.expectBad(gating.attempt({ passphraseClear: Passphrase, passkeyClear: { ...answer, prfBytes: buffer } as never }))
    await adding
    expect(isZeroed(new Uint8Array(buffer))).to.be.true
  })

  it("refuses a passkey added elsewhere while its dialog was open", async () => {
    const withPasskey = await makeBornVaultWithPasskey()
    const elsewhere = withPasskey.demandStoredGate().wayins.passkey0!
    const born = await makeBornVault()
    const { gatingAt } = dialogOf(born)
    const adding = TH.expectRefusal(born.bank.maingate.addPasskeyPrompt(), 'bad_option')
    const gating = await gatingAt<'add_passkey'>()
    const moved = born.putGateBehindOurBack({ ...born.demandStoredGate(), wayins: { main: born.demandStoredGate().wayins.main, passkey0: elsewhere } })
    born.advance(Promptly + 1)
    await gating.attempt({ passphraseClear: Passphrase, passkeyClear: await TH.passkeyOf('laptop') })
    await adding
    expect(born.demandStoredGate()).to.deep.equal(moved)
  })

  it("refuses 'stale_write' a row moved since the attempt read it", async () => {
    const born = await makeBornVault()
    movedBeforeCommit(born, 'tryAddPasskey')
    await TH.expectRefusal(addPasskeyTyping(born.bank, Passphrase, 'laptop'), 'stale_write')
    expect(born.demandStoredGate().wayins.passkey0).to.be.undefined
  })
})

describe("gate.revokePasskeyPrompt()", () => {
  it("removes the passkey wayin and keeps the passphrase's", async () => {
    const { bank, demandStoredGate } = await makeBornVaultWithPasskey()
    const ante = demandStoredGate()
    expect(await revokeTyping(bank, Passphrase)).to.equal(bank.maingate)
    const stored = demandStoredGate()
    expect(stored).to.include({ revision_seq: ante.revision_seq + 1, gate_tok: ante.gate_tok })
    expect(stored.wayins.passkey0).to.be.undefined
    expect(stored.wayins.main).to.deep.equal(ante.wayins.main)
    expect(bank.isUnlocked).to.be.true
  })

  it("is a no-op with no passkey stored", async () => {
    const born = await makeBornVault()
    const { bank, demandStoredGate } = born
    const ante = demandStoredGate()
    const { shown } = dialogOf(born)
    expect(await bank.maingate.revokePasskeyPrompt()).to.equal(bank.maingate)
    expect(shown).to.have.lengthOf(0)
    expect(demandStoredGate()).to.equal(ante)
  })

  it("revokes a passkey that another device added since the last fetch", async () => {
    const { bank, demandStoredGate, anotherDevice, advance } = deafened(await makeBornVault())
    await addPasskeyTyping(await anotherDevice().ensureBank(), Passphrase, 'laptop')
    advance(Promptly)
    expect(bank.maingate.passkey0).to.be.null
    await revokeTyping(bank, Passphrase)
    expect(demandStoredGate().wayins.passkey0).to.be.undefined
  })

  it("refuses 'wrong_passphrase' for a wrong passphrase, leaving the passkey wayin stored", async () => {
    const { bank, demandStoredGate } = await makeBornVaultWithPasskey()
    await TH.expectRefusal(revokeTyping(bank, 'not it'), 'wrong_passphrase')
    expect(demandStoredGate().wayins.passkey0).not.to.be.undefined
  })

  it("refuses 'stale_write' a row moved since the attempt read it", async () => {
    const born = await makeBornVaultWithPasskey()
    movedBeforeCommit(born, 'tryRevokePasskey')
    await TH.expectRefusal(revokeTyping(born.bank, Passphrase), 'stale_write')
    expect(born.demandStoredGate().wayins.passkey0).not.to.be.undefined
  })
})

describe("a gate change on other sessions", () => {
  it("leaves another session unlocked as it hears the new gate", async () => {
    const { bank, demandStoredGate, anotherSession } = await makeBornVault()
    const theirs = await anotherSession()
    await theirs.ensureUnlocked()
    await replaceTyping(bank, Passphrase, NewPassphrase)
    await TH.eventually(() => theirs.maingate.revision_tok === demandStoredGate().revision_tok)
    expect(theirs.maingate.pickle()).to.deep.equal(demandStoredGate())
    expect(theirs.isUnlocked).to.be.true
  })
})

describe("bank.delPrompt()", () => {
  it("deletes the bank, its gate, its vaults and their boxes once the passphrase proves, leaving the device no bank", async () => {
    const { device, bank, vault, deviceDB, bankDB, storedBankNow } = await makeWorldWithBox()
    expect(await delTyping(bank, Passphrase)).to.equal(bank)
    expect(storedBankNow()).to.include({ am: 'x' })
    expect(storedBankNow()?.bank_tok).to.not.eq(bank.bank_tok)
    const { gaterows, vaultrows } = bankDB._cheat_shelfOf(Dna)
    expect([gaterows.size, vaultrows.size]).to.deep.equal([0, 0])
    expect(bank).to.include({ isEnabled: false, isLocked: true })
    expect(bank.sparse).to.include({ am: 'x', bank_tok: storedBankNow()?.bank_tok })
    expect(vault.isEnabled).to.be.false
    expect(device.bank).to.be.null
    expect(device.snapshot.bank_tok).to.be.null
    await TH.eventually(() => deviceDB.cachedNow() === null)
  })

  it("leaves the dialog open on a wrong passphrase, deleting nothing", async () => {
    const born = await makeBornVault()
    const { bank, storedBankNow } = born
    const ante = storedBankNow()
    const { gatingAt } = dialogOf(born)
    const deleting = bank.delPrompt()
    const gating = await gatingAt<'del_bank'>()
    await TH.expectBad(gating.attempt({ passphraseClear: 'not it' }), 'wrong_passphrase')
    expect(gating.isOpen).to.be.true
    expect(storedBankNow()).to.equal(ante)
    expect(bank.isUnlocked).to.be.true
    await TH.expectGood(gating.attempt({ passphraseClear: Passphrase }))
    await deleting
    expect(storedBankNow()).to.include({ am: 'x' })
  })

  it("reaches another device through the watch: its lease forgotten and its device left with no bank", async () => {
    const { device, bank, anotherDevice } = await makeBornVault()
    const elsewhereDB = new MemoryDeviceDB()
    const theirs = await anotherDevice(elsewhereDB).ensureBank()
    await unlockTyping(theirs, byPassphrase(Passphrase))
    expect(elsewhereDB._cheat_leaseRows().size).to.eq(1)
    await delTyping(bank, Passphrase)
    await TH.eventually(() => ! theirs.isEnabled)
    expect(theirs.isLocked).to.be.true
    expect(theirs.device.bank).to.be.null
    await TH.eventually(() => elsewhereDB._cheat_leaseRows().size === 0)
    expect(device.bank).to.be.null
    await TH.expectRefusal(theirs.delPrompt())
  })

  it("leaves the next ensureBank to build a bank over the tombstone", async () => {
    const { device, bank, storedBankNow } = await makeBornVault()
    await delTyping(bank, Passphrase)
    const reborn = await bankTyping(device, byPassphrase(NewPassphrase))
    expect(reborn).to.not.eq(bank)
    expect(reborn.bank_tok).to.not.eq(bank.bank_tok)
    expect(reborn.isUnlocked).to.be.true
    expect(device.bank).to.eq(reborn)
    expect(storedBankNow()).to.include({ am: 'a', bank_tok: reborn.bank_tok })
  })

  it("the try form returns the refusal", async () => {
    const born = await makeBornVault()
    born.dialog.requestCleartext = (gating) => { gating.dismiss() }
    await TH.expectBad(born.bank.tryDelPrompt(), 'dismissed')
    expect(born.storedBankNow()).to.include({ am: 'a' })
  })
})

describe("vault.del()", () => {
  it("leaves a tombstone that refuses as gone, and reads the bank's lock", async () => {
    const { bank, vault, listing } = await makeBornVault()
    await vault.del(vault)
    const gone = listing.at(vault.scope)
    TH.expectSyncRefusal(() => gone?.demandPresent(), 'vault_gone')
    expect(gone?.bank.isLocked).to.eq(bank.isLocked)
  })

  it("deletes the vault and its boxes, asking nobody, the bank's lease untouched, the vault standing on as its tombstone", async () => {
    const born = await makeWorldWithBox()
    const { bank, vault, listing, storedNow, deviceDB } = born
    const { shown } = dialogOf(born)
    const boxes = vault.boxListing
    const lived = vault.vault_tok
    expect(await vault.del(vault)).to.equal(vault)
    expect(shown).to.have.lengthOf(0)
    const tombstone = storedNow()
    expect(tombstone).to.include({ am: 'x' })
    expect(tombstone?.vault_tok).to.not.eq(lived)
    expect(listing.at(vault.scope)).to.eq(vault)
    expect(vault).to.include({ isPresent: false, vault_tok: tombstone?.vault_tok })
    expect(bank.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
    TH.expectSyncRefusal(() => vault.boxListing, 'vault_gone')
    await TH.expectRefusal(boxes.get({ ...vault.scope, boxlabel }, { maxMillisSinceRefresh: 0 }), 'disabled')
  })

  it("refuses 'bank_locked' in a locked bank", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const ante = storedNow()
    const { shown } = dialogOf(born)
    vault.bank.lock()
    await TH.expectRefusal(vault.del(vault), 'bank_locked')
    expect(shown).to.have.lengthOf(0)
    expect(storedNow()).to.equal(ante)
  })

  it("the vault listing's own del deletes in a locked bank", async () => {
    const born = await makeBornVault()
    const { vault, storedNow } = born
    const { shown } = dialogOf(born)
    vault.bank.lock()
    expect(await vault.listing.del(vault.sparse)).to.equal(vault)
    expect(shown).to.have.lengthOf(0)
    expect(storedNow()).to.include({ am: 'x' })
  })

  it("refuses 'stale_write' a row moved since the del read it", async () => {
    const { vault, bankDB, demandStored, storedNow, putBehindOurBack } = await makeBornVault()
    const tryDelVault = bankDB.tryDelVault.bind(bankDB)
    vi.spyOn(bankDB, 'tryDelVault').mockImplementationOnce((ask) => {
      putBehindOurBack(demandStored())
      return tryDelVault(ask)
    })
    await TH.expectRefusal(vault.del(vault), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
    expect(vault.isPresent).to.be.true
    expect(vault.revision_seq).to.eq(demandStored().revision_seq)
  })

  it("refuses a vault deleted on another session", async () => {
    const { vault, storedNow, anotherSession } = deafened(await makeBornVault())
    const theirs = await anotherSession()
    const their = theirs.vaultAt(Dna)
    if (their === null) { throw new Error('the next session lists no vault') }
    await their.bank.ensureUnlocked()
    await their.del(their)
    const tombstone = storedNow()
    await TH.expectRefusal(vault.get({ maxMillisSinceRefresh: 0 }))
    await TH.expectRefusal(vault.del(vault))
    expect(storedNow()).to.equal(tombstone)
  })
})

describe("listing.del(ante)", () => {
  it("refuses 'stale_write' for a stale record, even when the listed vault is current", async () => {
    const { vault, listing, demandStored, storedNow, putBehindOurBack } = await makeBornVault()
    const ante = vault.sparse
    putBehindOurBack(demandStored())
    await vault.get({ maxMillisSinceRefresh: 0 })
    await TH.expectRefusal(listing.del(ante), 'stale_write')
    expect(storedNow()).to.include({ am: 'a' })
  })
})

// == [From halpimonfire.test.ts]: a gate change crossed by an ending or a lock

/** The next `Lease.buildGranted` runs `crossing` once its lease is made, as a slow wrap would let it. */
function crossingGrant(crossing: () => unknown) {
  const grant = Lease.buildGranted.bind(Lease)
  vi.spyOn(Lease, 'buildGranted').mockImplementationOnce(async (...args) => {
    const lease = await grant(...args)
    await crossing()
    return lease
  })
}

describe("A gate change after its record is stored", () => {
  it.each(['sweep', 'vacate'] as const)("a %s as the answer arrives refuses, though the row is stored", async (ending) => {
    const { device, bank, bankDB, demandStoredGate } = await makeBornVault()
    const ante = demandStoredGate()
    const commit = bankDB.tryReplacePassphrase.bind(bankDB)
    vi.spyOn(bankDB, 'tryReplacePassphrase').mockImplementationOnce(async (ask) => {
      const answer = await commit(ask)
      await Promise.resolve(device[ending]())
      return answer
    })
    await TH.expectRefusal(replaceTyping(bank, Passphrase, NewPassphrase))
    expect(demandStoredGate().revision_seq).to.eq(ante.revision_seq + 1)
    expect(bank.isUnlocked).to.be.false
  })

  it("stays unlocked on the new lease when lock() is called while that lease is made", async () => {
    const { bank, deviceDB } = await makeBornVault()
    deviceDB.forget.mockClear()
    crossingGrant(() => { bank.lock() })
    await expect(replaceTyping(bank, Passphrase, NewPassphrase)).resolves.to.eq(bank.maingate)
    expect(bank.isUnlocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
    expect(deviceDB.forget).toHaveBeenCalledOnce()
  })
})
// --

// == [From vault-life.test.ts]: the gate changed with a box sealed before the change

/** A born vault with a box put in it, and the vault of `Dna` in the next session on this device, its bank locked once this one's lease is gone. */
async function makeVaultWithBox(made: Promise<Born> = makeBornVault()) {
  const world = await made
  await world.vault.putBox({ boxlabel, whisper: Whisper, sidecar: Sidecar })
  /** The whisper in the box, as `vault` unseals it. */
  const unsealIn = async (vault: Born['vault']) => {
    const found = await vault.getBox(boxlabel, { maxMillisSinceRefresh: 0 })
    if (found === null) { throw new Error('no box stored') }
    return found.extractWhisper()
  }
  /** The vault of the next session on this device, once this session's lease row is forgotten. */
  const openNextSession = async () => {
    await TH.eventually(() => world.deviceDB.cachedNow() === null)
    const bank = await world.anotherSession()
    const vault = bank.vaultAt(Dna)
    if (vault === null) { throw new Error('the next session lists no vault') }
    return vault
  }
  return { ...world, unsealIn, openNextSession }
}

describe("Changing the gate, with a box sealed before the change", () => {
  it("after the passphrase is replaced, only the new passphrase and the passkey unlock the next session", async () => {
    const { bank, vault, unsealIn, openNextSession } = await makeVaultWithBox(makeBornVaultWithPasskey())
    await replaceTyping(bank, Passphrase, NewPassphrase)
    expect(bank.isUnlocked).to.be.true
    await vault.putBox({ boxlabel, whisper: NewWhisper, sidecar: Sidecar })
    bank.lock()
    const second = await openNextSession()
    await TH.expectRefusal(unlockTyping(second.bank, byPassphrase(Passphrase)), 'wrong_passphrase')
    await unlockTyping(second.bank, byPassphrase(NewPassphrase))
    expect(await unsealIn(second)).to.deep.equal(NewWhisper)
    second.bank.lock()
    const third = await openNextSession()
    await unlockTyping(third.bank, byPasskey('laptop'))
    expect(await unsealIn(third)).to.deep.equal(NewWhisper)
  })

  // PasskeyAnswer @example
  it("an added passkey alone unlocks the next session and opens the box sealed before it", async () => {
    const { bank, unsealIn, openNextSession } = await makeVaultWithBox()
    await addPasskeyTyping(bank, Passphrase, 'laptop')
    bank.lock()
    const again = await openNextSession()
    await unlockTyping(again.bank, byPasskey('laptop'))
    expect(again.bank.isUnlocked).to.be.true
    expect(await unsealIn(again)).to.deep.equal(Whisper)
  })

  it("after the passkey is revoked, only the passphrase unlocks the next session", async () => {
    const { bank, vault, unsealIn, openNextSession } = await makeVaultWithBox(makeBornVaultWithPasskey())
    bank.lock()
    await unlockTyping(vault.bank, byPasskey('laptop'))
    await revokeTyping(bank, Passphrase)
    expect(bank.isUnlocked).to.be.true
    await vault.putBox({ boxlabel, whisper: NewWhisper, sidecar: Sidecar })
    bank.lock()
    const again = await openNextSession()
    await TH.expectRefusal(unlockTyping(again.bank, byPasskey('laptop')), 'absent_wayin')
    await unlockTyping(again.bank, byPassphrase(Passphrase))
    expect(await unsealIn(again)).to.deep.equal(NewWhisper)
  })
})
// --

// == [From vault-lease.test.ts]: a lease renewed through a gate change

/** The gate one revision on from `revision_seq0`, the bank unlocked, and a lease cached citing the row stored. */
async function expectChangeUnlocked({ bank, deviceDB, demandStoredGate }: Born, revision_seq0: number): Promise<void> {
  expect(demandStoredGate().revision_seq).to.eq(revision_seq0 + 1)
  expect(bank.isUnlocked).to.be.true
  await TH.eventually(() => deviceDB.cachedNow() !== null)
}

describe("A lease renewed through a gate change", () => {
  it("is attached citing the gate row written, the bank never reporting locked", async () => {
    const { bank, vault, deviceDB, demandStoredGate } = await makeBornVault()
    const sealed = await vault.sealStampedString('sk-test', Stamp)
    const lockings: boolean[] = []
    bank.subscribe(() => { lockings.push(bank.isLocked) })
    await replaceTyping(bank, Passphrase, NewPassphrase)
    expect(bank.isUnlocked).to.be.true
    expect(lockings).to.not.include(true)
    expect(deviceDB.cachedNow()).to.deep.include({ gate_revision_tok: demandStoredGate().revision_tok })
    expect(await vault.unsealStampedString(sealed, Stamp)).to.eq('sk-test')
  })

  it("unlocks a bank that was locked at the start, and writes the change", async () => {
    const born = await makeBornVault()
    const revision_seq0 = born.bank.maingate.revision_seq
    born.bank.lock()
    await TH.eventually(() => born.deviceDB.cachedNow() === null)
    await replaceTyping(born.bank, Passphrase, NewPassphrase)
    await expectChangeUnlocked(born, revision_seq0)
  })

  it("leaves the bank unlocked where a lock() came after the attempt was submitted", async () => {
    const born = await makeBornVault()
    const revision_seq0 = born.bank.maingate.revision_seq
    born.dialog.requestCleartext = async (gating) => {
      const attempting = gating.attempt({ antePassphraseClear: Passphrase, nextPassphraseClear: NewPassphrase })
      born.bank.lock()
      await attempting
    }
    await born.bank.maingate.replacePassphrasePrompt()
    await expectChangeUnlocked(born, revision_seq0)
  })

  it("leaves the bank unlocked where a lock() came as the commit was written", async () => {
    const born = await makeBornVault()
    const { bank, bankDB } = born
    const revision_seq0 = bank.maingate.revision_seq
    const commit = bankDB.tryReplacePassphrase.bind(bankDB)
    vi.spyOn(bankDB, 'tryReplacePassphrase').mockImplementationOnce(async (ask) => {
      const written = await commit(ask)
      bank.lock()
      return written
    })
    await replaceTyping(bank, Passphrase, NewPassphrase)
    await expectChangeUnlocked(born, revision_seq0)
  })
})
// --

// == [From vault-unlock.test.ts]: the cached lease across a gate change

describe("The cached lease across a gate change", () => {
  it("is forgotten, not used, when it was cached under an older gate", async () => {
    const { bank, anotherSession, deviceDB } = await makeBornVault()
    const stale = deviceDB.cachedNow()
    await replaceTyping(bank, Passphrase, NewPassphrase)
    deviceDB.layCached(stale)
    const again = await anotherSession()
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(deviceDB.cachedNow()).to.be.null
    await unlockTyping(again, byPassphrase(NewPassphrase))
    expect(again.isUnlocked).to.be.true
  })

  it("is not used when another device cached it before the gate changed", async () => {
    const { bank, anotherDevice } = await makeBornVaultWithPasskey()
    const elsewhereDB = new MemoryDeviceDB()
    const theirs = await anotherDevice(elsewhereDB).ensureBank()
    await unlockTyping(theirs, byPasskey('laptop'))
    await revokeTyping(bank, Passphrase)
    const again = await anotherDevice(elsewhereDB).ensureBank()
    expect(elsewhereDB._cheat_leaseRows().size).to.eq(1)
    await TH.expectRefusal(again.ensureUnlocked(), 'dismissed')
    expect(again.maingate.passkey0).to.be.null
    expect(elsewhereDB._cheat_leaseRows().size).to.eq(0)
  })
})
// --

// == [From vault-listing.test.ts]: the gate listing's gate verbs

describe("the gate listing's gate verbs", () => {
  const MovedDevice = '00000000-0000-4000-8000-0000000000d2'
  const Passkey0 = { ...TH.passkeyWayin, wayinlabel: 'passkey0' as const }

  it("replacePassphrase sends the next revision with the new wayin, its gate_tok and bank_tok kept", async () => {
    const { bank, bankDB } = await makeBornVault()
    const ante = bank.maingate.pickle()
    const main = { ...ante.wayins.main, device_tok: MovedDevice }
    const replacing = vi.spyOn(bankDB, 'tryReplacePassphrase')
    const stored = await bank.gateListing.replacePassphrase(ante, main)
    const [ask] = replacing.mock.calls[0]!
    expect(ask.record).to.deep.include({ registered_at: ante.registered_at, revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate_tok: ante.gate_tok, bank_tok: ante.bank_tok, wayins: { ...ante.wayins, main } })
    expect(ask.record.revision_tok).to.not.eq(ante.revision_tok)
    expect(ask.expected).to.include({ revision_tok: ante.revision_tok, revision_seq: ante.revision_seq })
    expect(stored).to.deep.equal(ask.record)
  })

  it("addPasskey sends the next revision with the passkey", async () => {
    const { bank, bankDB } = await makeBornVault()
    const ante = bank.maingate.pickle()
    const adding = vi.spyOn(bankDB, 'tryAddPasskey')
    const stored = await bank.gateListing.addPasskey(ante, Passkey0)
    const [ask] = adding.mock.calls[0]!
    expect(ask.record).to.deep.include({ revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate_tok: ante.gate_tok, wayins: { ...ante.wayins, passkey0: Passkey0 } })
    expect(stored).to.deep.equal(ask.record)
  })

  it("revokePasskey sends the next revision with no passkey", async () => {
    const { bank, bankDB } = await makeBornVaultWithPasskey()
    const ante = bank.maingate.pickle()
    const revoking = vi.spyOn(bankDB, 'tryRevokePasskey')
    const stored = await bank.gateListing.revokePasskey(ante)
    const [ask] = revoking.mock.calls[0]!
    expect(ask.record).to.deep.include({ revision_seq: ante.revision_seq + 1, written_at: nowMillis(), gate_tok: ante.gate_tok, wayins: { main: ante.wayins.main } })
    expect(stored).to.deep.equal(ask.record)
  })

  it("refuses an answer that is not the record it sent", async () => {
    const { bank, bankDB } = await makeBornVault()
    const commit = bankDB.tryAddPasskey.bind(bankDB)
    vi.spyOn(bankDB, 'tryAddPasskey').mockImplementationOnce(async (ask) => {
      const answer = await commit(ask)
      return answer.ok ? { ...answer, val: { ...answer.val, revision_tok: 'rev-of-another' } } : answer
    })
    await TH.expectRefusal(bank.gateListing.addPasskey(bank.maingate.pickle(), Passkey0), 'storage_issue')
  })

  it("refuses a record of another user", async () => {
    const { bank } = await makeBornVault()
    const ante = bank.maingate.pickle()
    await TH.expectRefusal(bank.gateListing.replacePassphrase({ ...ante, user_id: 'someone_else' }, ante.wayins.main))
  })

  it("tryRevokePasskey returns the act, with the written record as its val", async () => {
    const { bank } = await makeBornVaultWithPasskey()
    const answer = await bank.gateListing.tryRevokePasskey(bank.maingate.pickle())
    expect(answer.ok).to.be.true
    expect(answer.act).to.eq('replaced')
    expect(answer.val).to.deep.include({ gate_tok: bank.maingate.gate_tok })
  })

  it("returns a bad answer once its device is swept, asking storage nothing", async () => {
    const { bank, bankDB } = await makeBornVaultWithPasskey()
    const ante = bank.maingate.pickle()
    const tryRevokePasskey = vi.spyOn(bankDB, 'tryRevokePasskey')
    bank.device.sweep()
    const answer = await bank.gateListing.tryRevokePasskey(ante)
    expect(answer.err?.refusalkind).to.eq('disabled')
    expect(tryRevokePasskey).not.toHaveBeenCalled()
  })
})
// --
