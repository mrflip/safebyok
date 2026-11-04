/** A vault's box verbs, from the host's side, on real seals. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import { VaultListing } from '../../src/models/vault-listing'
import * as Phrases from '../../src/phrases'
import * as VS from '../../src/storage/vault-db-shapes'
import * as TH from '../test-helpers'
import { Passphrase, byPassphrase, delTyping, makeBornVault, storedVaultRecord, unlockTyping, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const boxlabel = 'anthropic_api_key'
const Whisper  = Object.freeze({ val: 'sk-test-0000' })
const Sidecar  = Object.freeze({ note: 'work' })

/** A born vault, and the rows of its boxes as the vaultDB stores them. */
const makeWorld = async () => {
  const world = await makeBornVault()
  const boxrows = world.vaultDB._cheat_boxRowsOf(world.vault.scope, world.vault.vault_tok)
  const tryGetVault = vi.spyOn(world.vaultDB, 'tryGetVault')
  const tryPutBox   = vi.spyOn(world.vaultDB, 'tryPutBox')
  const tryGetBox   = vi.spyOn(world.vaultDB, 'tryGetBox')
  /** The next session on this device: a vault of the record stored, its boxes not yet listed, unlocked by the passphrase, sealing under the vaultKey the first holds. */
  const openNextSession = async () => {
    const vault = await world.anotherSession().build(world.demandStored())
    await unlockTyping(vault, byPassphrase(Passphrase))
    return vault
  }
  return { ...world, boxrows, tryGetVault, tryPutBox, tryGetBox, openNextSession }
}

/** A world whose vault has a box stored, and a next session that has not yet listed it. */
const makeWorldWithBox = async () => {
  const world = await makeWorld()
  const box = await world.vault.putBox({ boxlabel, whisper: Whisper, sidecar: Sidecar })
  return { ...world, box }
}

/** A next session that has listed nothing and fetched nothing, and spies cleared of the one before. */
const nextUnlisted = async () => {
  const world = await makeWorldWithBox()
  const next = await world.openNextSession()
  world.tryGetBox.mockClear()
  world.tryPutBox.mockClear()
  return { ...world, next }
}

/** A vault whose box row a next session finds failing its checks. */
const makeWorldWithRubble = async () => {
  const world = await makeWorldWithBox()
  world.boxrows.set('rubble', { garbage: true })
  return world
}

describe("vault.hello: the host's call for the list and the pushes", () => {
  it("is run by no box verb, a getBox fetching only its own box and holding only that one", async () => {
    const { openNextSession, tryGetVault, tryGetBox } = await makeWorldWithBox()
    const next = await openNextSession()
    tryGetVault.mockClear()
    tryGetBox.mockClear()
    expect(next.boxListing.things).to.deep.equal([])
    const box = await next.getBox(boxlabel)
    expect(box).to.eq(next.boxListing.at({ ...next.scope, boxlabel }))
    expect(box?.isFull).to.be.true
    expect(next.boxListing.things).to.deep.equal([box])
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(tryGetVault).not.toHaveBeenCalled()
  })

  it("lists each box sparse, a get then hydrating it", async () => {
    const { openNextSession, tryGetVault } = await makeWorldWithBox()
    const next = await openNextSession()
    tryGetVault.mockClear()
    await expect(next.hello()).resolves.to.eq(next)
    const listed = next.boxListing.at({ ...next.scope, boxlabel })
    expect(listed?.isFull).to.be.false
    await next.getBox(boxlabel)
    expect(listed?.isFull).to.be.true
    expect(tryGetVault).toHaveBeenCalledOnce()
  })

  it("lists the boxes of a vault still locked; getBox answers one, and its whisper refuses", async () => {
    const world = await makeWorldWithBox()
    const next = await world.anotherSession().build(world.demandStored())
    expect(next.isLocked).to.be.true
    await next.hello()
    expect(next.boxListing.at({ ...next.scope, boxlabel })?.boxlabel).to.eq(boxlabel)
    const box = (await next.getBox(boxlabel))!
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
  })

  it("starts the box listing's watch, so another session's put reaches the box held", async () => {
    const { vault, openNextSession } = await makeWorldWithBox()
    const next = await openNextSession()
    await next.hello()
    const box = await next.getBox(boxlabel)
    await vault.putBox({ boxlabel, sidecar: { note: 'moved' } })
    await TH.eventually(() => box?.revision_seq === 1)
    expect(box?.sidecar).to.deep.equal({ note: 'moved' })
  })

  it("delivers the vault's get, so a vault deleted elsewhere refuses 'vault_gone', listing nothing", async () => {
    const { openNextSession, vault } = await makeWorldWithBox()
    const next = await openNextSession()
    await delTyping(vault)
    await TH.expectRefusal(next.hello(), 'vault_gone')
    await TH.expectRefusal(next.getBox(boxlabel), 'vault_gone')
  })

  it("passes a get's failure up, and the next hello lists the boxes", async () => {
    const { openNextSession, tryGetVault } = await makeWorldWithBox()
    const next = await openNextSession()
    tryGetVault.mockRejectedValueOnce(new Error('the wire is down'))
    await expect(next.hello()).rejects.toThrow('the wire is down')
    await expect(next.hello()).resolves.to.eq(next)
    expect(next.boxListing.at({ ...next.scope, boxlabel })?.boxlabel).to.eq(boxlabel)
  })

  it("refuses a boxListing.hello given a list that fails its check as 'bad_record'", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.boxListing.hello({ boxes: 'none' } as never), 'bad_record')
  })
})

describe("the box verbs refuse a vault locked, or gone", () => {
  const Verbs = [
    ['getBox',   false, (vault) => vault.getBox(boxlabel)],
    ['fetchBox', false, (vault) => vault.fetchBox(boxlabel)],
    ['putBox',   true,  (vault) => vault.putBox({ boxlabel, whisper: Whisper })],
    ['delBox',   true,  (vault) => vault.delBox(boxlabel)],
  ] as const satisfies readonly (readonly [string, boolean, (vault: Awaited<ReturnType<typeof makeWorld>>['vault']) => Promise<unknown>])[]

  for (const [verb, refusesLocked, call] of Verbs) {
    if (refusesLocked) {
      it(`${verb} refuses 'vault_locked' while locked`, async () => {
        const { vault } = await makeWorld()
        vault.lock()
        await TH.expectRefusal(call(vault), 'vault_locked')
      })
    }

    it(`${verb} refuses 'vault_gone' on a vault deleted, as gone beats locked`, async () => {
      const { vault } = await makeWorld()
      await delTyping(vault)
      await TH.expectRefusal(call(vault), 'vault_gone')
    })
  }

  it("getBox and fetchBox answer the box while locked", async () => {
    const { vault, box } = await makeWorldWithBox()
    vault.lock()
    await expect(vault.getBox(boxlabel)).resolves.to.eq(box)
    await expect(vault.fetchBox(boxlabel)).resolves.to.eq(box)
  })

  it("a whisper a refusal was handed is not in the refusal", async () => {
    const { vault } = await makeWorld()
    vault.lock()
    const err = await TH.expectRefusal(vault.putBox({ boxlabel, whisper: Whisper }), 'vault_locked')
    expect(JSON.stringify(err.meta ?? {})).not.to.include(Whisper.val)
    expect(err.message).not.to.include(Whisper.val)
  })
})

describe("a box verb the vaultDB refuses over its vault's row", () => {
  it("'vault_gone' delivers no box, as its dbhas is the vault's: the tombstone reaches the vault as its world, and no bad news is told", async () => {
    const { vault, restoreRow, demandStored, tryGetBox } = await makeWorldWithBox()
    restoreRow({ ...omit(demandStored(), ['gate']), am: 'x', revision_seq: 5, revision_tok: 'rev-gone-5' })
    const tellBadNews = vi.spyOn(VaultListing.prototype, 'tellBadNews')
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.fetchBox(boxlabel), 'vault_gone')
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(vault.isPresent).to.be.false
    expect(tellBadNews).not.toHaveBeenCalled()
  })

  it("'vault_mismatch' delivers no box, as its dbhas is the vault's, and no bad news is told", async () => {
    const { vault, restoreRow, tryGetBox } = await makeWorldWithBox()
    restoreRow({ ...await storedVaultRecord(), revision_seq: 5, revision_tok: 'rev-other-5' })
    const tellBadNews = vi.spyOn(VaultListing.prototype, 'tellBadNews')
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.fetchBox(boxlabel), 'vault_mismatch')
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(tellBadNews).not.toHaveBeenCalled()
  })
})

describe("vault.getBox", () => {
  it("takes the gate a box's answer brings: a row moved elsewhere, no notice heard, leaves the vault full with the new gate", async () => {
    const { vault, storeBehindOurBack, demandStored } = await makeWorldWithBox()
    const stored = demandStored()
    const moved = storeBehindOurBack({ ...stored, gate: { ...stored.gate, gate_epoch: stored.gate.gate_epoch + 1 } })
    await vault.fetchBox(boxlabel)
    expect(vault.isFull).to.be.true
    expect(vault.revision_tok).to.eq(moved.revision_tok)
    expect(vault.gate.toJSON().gate_epoch).to.eq(moved.gate.gate_epoch)
  })

  const AbsentCases = [
    [{},                    'absent_box', 'refuses a box never stored as absent_box, by default'],
    [{ ifAbsent: 'fail' },  'absent_box', "refuses it so under ifAbsent 'fail'"],
    [{ ifAbsent: 'nil' },   null,         "resolves null under ifAbsent 'nil'"],
  ] as const

  for (const [opts, expected, blurb] of AbsentCases) {
    it(blurb, async () => {
      const { vault } = await makeWorld()
      if (expected === null) { expect(await vault.getBox(boxlabel, opts)).to.be.null } else { await TH.expectRefusal(vault.getBox(boxlabel, opts), expected) }
    })

    it(`${blurb}, over a tombstone`, async () => {
      const { vault } = await makeWorldWithBox()
      await vault.delBox(boxlabel)
      if (expected === null) { expect(await vault.getBox(boxlabel, opts)).to.be.null } else { await TH.expectRefusal(vault.getBox(boxlabel, opts), expected) }
    })
  }

  it("resolves the full box whose whisper opens, and its try form an Outcome", async () => {
    const { openNextSession } = await makeWorldWithBox()
    const next = await openNextSession()
    const box = await next.getBox(boxlabel)
    expect(box?.sidecar).to.deep.equal(Sidecar)
    expect(await box?.extractWhisper()).to.deep.equal(Whisper)
    expect(await next.tryGetBox(boxlabel)).to.deep.include({ ok: true, val: box })
    expect(await next.tryGetBox('nosuchbox')).to.deep.include({ ok: false })
  })

  it("answers within the horizon without a get; fetchBox always gets", async () => {
    const { vault, tryGetBox } = await makeWorldWithBox()
    tryGetBox.mockClear()
    await vault.getBox(boxlabel)
    expect(tryGetBox).not.toHaveBeenCalled()
    await vault.fetchBox(boxlabel)
    expect(tryGetBox).toHaveBeenCalledOnce()
  })

  it("refuses a boxlabel that fails its check as 'bad_scope', and opts that fail theirs as 'bad_option'", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.getBox('Not A Label'), 'bad_scope')
    await TH.expectRefusal(vault.getBox(42 as never), 'bad_scope')
    await TH.expectRefusal(vault.getBox(boxlabel, { ifAbsent: 'shrug' } as never), 'bad_option')
  })
})

describe("the box's birth: vault.putBox with no box listed", () => {
  it("seals over the sentinel prior, stores 'born', and delivers: the whisper opens, nothing of it in the row", async () => {
    const { vault, boxrows, tryPutBox } = await makeWorld()
    const box = await vault.putBox({ boxlabel, whisper: Whisper, sidecar: Sidecar })
    expect(tryPutBox).toHaveBeenCalledOnce()
    expect(tryPutBox.mock.calls[0]?.[1]).to.deep.include({ prior: VS.VoidRevision })
    expect(box.isPresent).to.be.true
    expect(box.sidecar).to.deep.equal(Sidecar)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
    expect(JSON.stringify(boxrows.get(boxlabel))).not.to.include(Whisper.val)
  })

  it("takes a sidecar of {} where left out", async () => {
    const { vault } = await makeWorld()
    const box = await vault.putBox({ boxlabel, whisper: Whisper })
    expect(box.sidecar).to.deep.equal({})
  })

  it("takes a whisper of { val: {} } where left out, and it opens under a real seal", async () => {
    const { vault, tryPutBox } = await makeWorld()
    const box = await vault.putBox({ boxlabel, sidecar: Sidecar })
    expect(tryPutBox).toHaveBeenCalledOnce()
    expect(box.sidecar).to.deep.equal(Sidecar)
    expect(await box.extractWhisper()).to.deep.equal({ val: {} })
  })

  it("under create, takes neither half, and the box opens to { val: {} } and a sidecar of {}", async () => {
    const { vault } = await makeWorld()
    const box = await vault.boxListing.create({ ...vault.scope, boxlabel })
    expect(box.isPresent).to.be.true
    expect(box.sidecar).to.deep.equal({})
    expect(await box.extractWhisper()).to.deep.equal({ val: {} })
  })

  const PatchCases = [
    [{ whisper: Whisper },                                'bad_scope',  'a patch with no boxlabel'],
    [undefined,                                           'bad_scope',  'no patch at all'],
    [{ boxlabel },                                        'bad_option', 'a patch naming neither half'],
    [{ boxlabel, whisper: { val: null } },                'bad_option', 'a whisper that fails its check'],
    [{ boxlabel, whisper: Whisper, sidecar: 'note' },     'bad_option', 'a sidecar that fails its check'],
    [{ boxlabel, whisper: Whisper, vaultlabel: 'other' }, 'bad_option', "the scope of another vault"],
  ] as const

  for (const [patch, kind, blurb] of PatchCases) {
    it(`refuses ${blurb} as '${kind}', storing nothing`, async () => {
      const { vault, tryPutBox } = await makeWorld()
      await TH.expectRefusal(vault.putBox(patch as never), kind)
      expect(tryPutBox).not.toHaveBeenCalled()
    })
  }

  it("is a 'reborn' put over the tombstone hello listed, under a new life", async () => {
    const { vault, openNextSession, boxrows } = await makeWorldWithBox()
    const old = await vault.getBox(boxlabel)
    const oldLife = old?.box_tok
    await vault.delBox(boxlabel)
    const next = await openNextSession()
    await next.hello()
    const reborn = await next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } })
    expect(reborn.isPresent).to.be.true
    expect(reborn.box_tok).not.to.eq(oldLife)
    expect(reborn.sidecar).to.deep.equal({})
    expect(await reborn.extractWhisper()).to.deep.equal({ val: 'sk-test-0001' })
    expect(boxrows.get(boxlabel)).to.have.property('am', 'a')
  })

  it("is reborn with an empty whisper from a sidecar alone over the tombstone, the deleted whisper gone", async () => {
    const { vault, boxrows } = await makeWorldWithBox()
    await vault.delBox(boxlabel)
    const reborn = await vault.putBox({ boxlabel, sidecar: Sidecar })
    expect(reborn.sidecar).to.deep.equal(Sidecar)
    expect(await reborn.extractWhisper()).to.deep.equal({ val: {} })
    expect(boxrows.get(boxlabel)).to.have.property('am', 'a')
  })

  it("hears 'stale_write' where another session's box landed since hello, the record delivered", async () => {
    const { boxrows, openNextSession } = await makeWorldWithBox()
    const row = boxrows.get(boxlabel)
    boxrows.delete(boxlabel)
    const next = await openNextSession()
    await next.hello()
    boxrows.set(boxlabel, row)
    await TH.expectRefusal(next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } }), 'stale_write')
    const delivered = await next.getBox(boxlabel)
    expect(await delivered?.extractWhisper()).to.deep.equal(Whisper)
  })

  it("hears 'stale_write' for a sidecar alone on a box stored but not listed, asking no getBox, and its retry keeps the whisper", async () => {
    const { next, tryGetBox, tryPutBox } = await nextUnlisted()
    await TH.expectRefusal(next.putBox({ boxlabel, sidecar: { note: 'home' } }), 'stale_write')
    expect(tryGetBox).not.toHaveBeenCalled()
    expect(tryPutBox).toHaveBeenCalledOnce()
    const box = await next.putBox({ boxlabel, sidecar: { note: 'home' } })
    expect(box.sidecar).to.deep.equal({ note: 'home' })
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("hears 'damaged_record' for a sidecar alone over a damaged row not listed, fetching nothing: a damaged row is the host's", async () => {
    const { boxrows, openNextSession } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', sidecar: Sidecar }), 'damaged_record')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })
})

describe("a void instance, then a put: no hello, no fetch", () => {
  it("with nothing stored, lands at seq 0 under a real box_tok, and the whisper opens", async () => {
    const { vault, tryGetBox } = await makeWorld()
    const box = await vault.boxListing.puttable({ ...vault.scope, boxlabel }).put({ whisper: Whisper })
    expect(box.revision_seq).to.eq(0)
    expect(box.box_tok).not.to.eq(VS.VoidLifeTok)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
    expect(tryGetBox).not.toHaveBeenCalled()
  })

  it("with a sidecar alone, lands an empty whisper at seq 0, and the same instance takes a whisper after", async () => {
    const { vault, tryGetBox } = await makeWorld()
    const shell = vault.boxListing.puttable({ ...vault.scope, boxlabel })
    await expect(shell.put({ sidecar: Sidecar })).resolves.to.eq(shell)
    expect(shell.revision_seq).to.eq(0)
    expect(await shell.extractWhisper()).to.deep.equal({ val: {} })
    await shell.put({ whisper: Whisper })
    expect(shell.revision_seq).to.eq(1)
    expect(await shell.extractWhisper()).to.deep.equal(Whisper)
    expect(tryGetBox).not.toHaveBeenCalled()
  })

  it("is held in things and left out of the snapshot until it lands", async () => {
    const { vault } = await makeWorld()
    const shell = vault.boxListing.puttable({ ...vault.scope, boxlabel })
    expect(vault.boxListing.things).to.deep.equal([shell])
    expect(vault.boxListing.snapshot).to.deep.equal([])
    await shell.put({ whisper: Whisper })
    expect(vault.boxListing.snapshot).to.have.lengthOf(1)
  })

  it("over a row stored, hears 'stale_write' with the frontier delivered, and the next put on that instance lands", async () => {
    const { next, box, boxrows, tryGetBox, tryPutBox } = await nextUnlisted()
    await TH.expectRefusal(next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } }), 'stale_write')
    const delivered = next.boxListing.at({ ...next.scope, boxlabel })
    expect(delivered?.revision_seq).to.eq(box.revision_seq)
    expect(delivered?.box_tok).to.eq(box.box_tok)
    expect(tryPutBox).toHaveBeenCalledOnce()
    const landed = await next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } })
    expect(landed).to.eq(delivered)
    expect(landed.revision_seq).to.eq(box.revision_seq + 1)
    expect(boxrows.get(boxlabel)).to.have.property('revision_seq', box.revision_seq + 1)
    expect(tryGetBox).not.toHaveBeenCalled()
  })

  it("over a row stored, hears 'camped' under ifPresent 'fail', the row standing", async () => {
    const { next, box, boxrows } = await nextUnlisted()
    const before = boxrows.get(boxlabel)
    await TH.expectRefusal(next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } }, { ifPresent: 'fail' }), 'camped')
    expect(boxrows.get(boxlabel)).to.deep.equal(before)
    expect(next.boxListing.at({ ...next.scope, boxlabel })?.revision_seq).to.eq(box.revision_seq)
  })

  it("over a box deleted, comes back on a plain put at the next seq, under a new box_tok", async () => {
    const { vault, box } = await makeWorldWithBox()
    const oldLife = box.box_tok
    await vault.delBox(boxlabel)
    const tombSeq = box.revision_seq
    const reborn = await box.put({ whisper: { val: 'sk-test-0001' } })
    expect(reborn).to.eq(box)
    expect(reborn.revision_seq).to.eq(tombSeq + 1)
    expect(reborn.box_tok).not.to.eq(oldLife)
    expect(await reborn.extractWhisper()).to.deep.equal({ val: 'sk-test-0001' })
  })

  it("as a void held within its horizon, has getBox ask nothing, and fetchBox hear the box stored, keeping the instance", async () => {
    const { next, box, tryGetBox } = await nextUnlisted()
    const shell = next.boxListing.puttable({ ...next.scope, boxlabel })
    expect(shell.isPresent).to.eq(false)
    await TH.expectRefusal(next.getBox(boxlabel), 'absent_box')
    await expect(next.getBox(boxlabel, { ifAbsent: 'nil' })).resolves.to.eq(null)
    expect(tryGetBox).not.toHaveBeenCalled()
    const got = await next.fetchBox(boxlabel)
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(got).to.eq(shell)
    expect(got?.revision_seq).to.eq(box.revision_seq)
    expect(await got?.extractWhisper()).to.deep.equal(Whisper)
  })

  it("as a tombstone held within its horizon, has getBox ask nothing, and fetchBox hear a box reborn elsewhere", async () => {
    const { vault, box, openNextSession, tryGetBox } = await makeWorldWithBox()
    await vault.delBox(boxlabel)
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } }), 'stale_write')
    await next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } })
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.getBox(boxlabel), 'absent_box')
    await expect(vault.getBox(boxlabel, { ifAbsent: 'nil' })).resolves.to.eq(null)
    expect(tryGetBox).not.toHaveBeenCalled()
    await expect(vault.fetchBox(boxlabel)).resolves.to.eq(box)
    expect(await box.extractWhisper()).to.deep.equal({ val: 'sk-test-0001' })
  })

  it("under ifAbsent 'fail', refuses 'absent_box' with the sentence naming vault.hello, storing nothing", async () => {
    const { next, tryPutBox } = await nextUnlisted()
    const err = await TH.expectRefusal(next.putBox({ boxlabel, whisper: Whisper }, { ifAbsent: 'fail' }), 'absent_box')
    expect(err.message).to.contain('vault.hello')
    expect(tryPutBox).not.toHaveBeenCalled()
  })
})

describe("vault.putBox over a live box", () => {
  it("under ifPresent 'fail', refuses a whole record, saying its data would be recycled, and stores nothing", async () => {
    const { vault, boxrows, tryPutBox } = await makeWorldWithBox()
    tryPutBox.mockClear()
    const err = await TH.expectRefusal(vault.putBox(boxrows.get(boxlabel) as never, { ifPresent: 'fail' }), 'bad_option')
    expect(err.message).to.eq(Phrases.RecordForNewBox)
    expect(tryPutBox).not.toHaveBeenCalled()
  })

  it("under ifAbsent 'fail' on a tombstone held, over a box reborn elsewhere, leaves it to the vaultDB: 'stale_write' with the frontier delivered", async () => {
    const { next, box } = await nextUnlisted()
    const elsewhere = await next.getBox(boxlabel)
    await elsewhere?.del()
    await box.fetch({ ifAbsent: 'nil' })
    const reborn = await elsewhere?.put({ whisper: Whisper })
    expect(box.isPresent).to.eq(false)
    await TH.expectRefusal(box.put({ whisper: Whisper }, { ifAbsent: 'fail' }), 'stale_write')
    expect(box.isPresent).to.eq(true)
    expect(box.revision_seq).to.eq(reborn?.revision_seq)
  })

  it("under ifAbsent 'fail' over a box deleted elsewhere, refuses 'absent_box' with the tombstone delivered", async () => {
    const { next, box } = await nextUnlisted()
    const elsewhere = await next.getBox(boxlabel)
    const deleted = await elsewhere?.del()
    await TH.expectRefusal(box.put({ whisper: Whisper }, { ifAbsent: 'fail' }), 'absent_box')
    expect(box.isPresent).to.eq(false)
    expect(box.revision_seq).to.eq(deleted?.revision_seq)
  })

  const IfPresentCases = [
    [undefined, 'sk-test-0001', 'replaces it by default'],
    ['get',     'sk-test-0000', "resolves the box as stored under 'get', the patch discarded"],
  ] as const

  for (const [ifPresent, expected, blurb] of IfPresentCases) {
    it(blurb, async () => {
      const { vault } = await makeWorldWithBox()
      const box = await vault.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } }, ifPresent === undefined ? {} : { ifPresent })
      expect(await box.extractWhisper()).to.deep.equal({ val: expected })
    })
  }

  it("refuses 'bad_option' opts before any guard", async () => {
    const { vault } = await makeWorldWithBox()
    vault.lock()
    await TH.expectRefusal(vault.putBox({ boxlabel, whisper: Whisper }, { ifPresent: 'shrug' } as never), 'bad_option')
  })
})

describe("a sidecar-only put", () => {
  it("unseals and reseals: the sidecar moves, the whisper opens as it was, sealed anew under the new stamp", async () => {
    const { box, boxrows } = await makeWorldWithBox()
    const before = boxrows.get(boxlabel) as { whisper_ciphered: unknown }
    await box.put({ sidecar: { note: 'home' } })
    const after = boxrows.get(boxlabel) as { whisper_ciphered: unknown }
    expect(box.sidecar).to.deep.equal({ note: 'home' })
    expect(after.whisper_ciphered).not.to.deep.equal(before.whisper_ciphered)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("opens the stored whisper, never the one exposed", async () => {
    const { box } = await makeWorldWithBox()
    box.whisper = { val: 'sk-test-exposed' }
    await box.put({ sidecar: { note: 'home' } })
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("is what putBox of a sidecar alone does to a box held", async () => {
    const { vault } = await makeWorldWithBox()
    const box = await vault.putBox({ boxlabel, sidecar: { note: 'home' } })
    expect(box.sidecar).to.deep.equal({ note: 'home' })
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("a whisper-only put keeps the sidecar", async () => {
    const { box } = await makeWorldWithBox()
    await box.put({ whisper: { val: 'sk-test-0001' } })
    expect(box.sidecar).to.deep.equal(Sidecar)
    expect(await box.extractWhisper()).to.deep.equal({ val: 'sk-test-0001' })
  })

  it("refuses 'vault_locked' while locked, storing nothing", async () => {
    const { vault, box, tryPutBox } = await makeWorldWithBox()
    vault.lock()
    tryPutBox.mockClear()
    await TH.expectRefusal(box.put({ sidecar: { note: 'home' } }), 'vault_locked')
    expect(tryPutBox).not.toHaveBeenCalled()
  })
})

describe("extractWhisper", () => {
  it("hands back the frozen holder, keeping nothing on the instance", async () => {
    const { box } = await makeWorldWithBox()
    const whisper = await box.extractWhisper()
    expect(Object.isFrozen(whisper)).to.be.true
    expect(box.whisper).to.be.null
    expect(await box.tryExtractWhisper()).to.deep.include({ ok: true, val: Whisper })
  })

  it("refuses 'vault_locked' once locked", async () => {
    const { vault, box } = await makeWorldWithBox()
    vault.lock()
    await TH.expectRefusal(box.extractWhisper(), 'vault_locked')
  })
})

describe("vault.delBox", () => {
  it("of a box stored and not held hears 'stale_write' over the sentinel, the frontier delivered, and the retry lands", async () => {
    const { next, boxrows } = await nextUnlisted()
    await TH.expectRefusal(next.delBox(boxlabel), 'stale_write')
    expect(boxrows.get(boxlabel)).to.have.property('am', 'a')
    await next.delBox(boxlabel)
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
  })

  it("leaves the box held in its tombstone, a get then absent, the whisper refused", async () => {
    const { vault, boxrows } = await makeWorldWithBox()
    const dead = await vault.delBox(boxlabel)
    expect(dead?.isPresent).to.be.false
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
    expect(JSON.stringify(boxrows.get(boxlabel))).not.to.include('whisper_ciphered')
    await TH.expectRefusal(vault.getBox(boxlabel), 'absent_box')
    await expect(dead?.extractWhisper()).rejects.toThrow()
  })

  it("resolves null for nothing stored, storing nothing", async () => {
    const { vault, boxrows } = await makeWorld()
    expect(await vault.delBox(boxlabel)).to.be.null
    expect(boxrows.has(boxlabel)).to.be.false
  })

  it("refuses a boxlabel that fails its check as 'bad_scope'", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.delBox('Not A Label'), 'bad_scope')
    expect(await vault.tryDelBox('Not A Label')).to.deep.include({ ok: false })
  })
})

describe("a damaged record is set aside, and nothing acts on it", () => {
  it("lists it in damaged_records, and refuses a get of it as 'damaged_record'", async () => {
    const { openNextSession } = await makeWorldWithRubble()
    const next = await openNextSession()
    await next.hello()
    expect(next.boxListing.damaged_records.map((row) => row.boxlabel)).to.deep.equal(['rubble'])
    expect(next.boxListing.at({ ...next.scope, boxlabel: 'rubble' })).to.be.null
    await TH.expectRefusal(next.getBox('rubble'), 'damaged_record')
    await expect(next.getBox(boxlabel)).resolves.to.have.property('boxlabel', boxlabel)
  })

  it("lists a row under a label that fails its check, the boxes beside it still answering", async () => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set('Not A Label', { garbage: true })
    const next = await openNextSession()
    await next.hello()
    const box = await next.getBox(boxlabel)
    expect(await box?.extractWhisper()).to.deep.equal(Whisper)
    expect(next.boxListing.damaged_records.map((row) => row.boxlabel)).to.deep.equal(['Not A Label'])
  })

  it("drops an instance held under it from the list, disabled", async () => {
    const { vault, box: held, boxrows } = await makeWorldWithBox()
    boxrows.set(boxlabel, { garbage: true })
    await vault.hello()
    expect(vault.boxListing.at(held.scope)).to.be.null
    expect(held.isEnabled).to.be.false
    expect(await vault.tryDelDamagedBox(boxlabel)).to.deep.include({ ok: true })
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
  })

  it("refuses a birth over it as 'damaged_record', the row standing", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', whisper: Whisper }), 'damaged_record')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })

  it("is not deleted by tryDelBox when it names a revision: 'damaged_record', the row and its listing standing, tryDelDamagedBox then deleting it", async () => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set('revised', { ...boxrows.get(boxlabel) as object, boxlabel: 'revised', whisper_ciphered: 'garbled' })
    const next = await openNextSession()
    await next.hello()
    await TH.expectBad(next.tryDelBox('revised'), 'damaged_record')
    expect(boxrows.get('revised')).to.have.property('am', 'a')
    expect(next.boxListing.damaged_records.map((row) => row.boxlabel)).to.deep.equal(['revised'])
    await TH.expectGood(next.tryDelDamagedBox('revised'))
    expect(boxrows.get('revised')).to.have.property('am', 'x')
    expect(next.boxListing.damaged_records).to.deep.equal([])
  })

  it("is deleted by tryDelDamagedBox: the tombstone lands, the entry clears, a birth then goes over it", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await next.hello()
    expect(await next.tryDelDamagedBox('rubble')).to.deep.include({ ok: true })
    expect(boxrows.get('rubble')).to.have.property('am', 'x')
    expect(next.boxListing.damaged_records).to.deep.equal([])
    const reborn = await next.putBox({ boxlabel: 'rubble', whisper: Whisper })
    expect(await reborn.extractWhisper()).to.deep.equal(Whisper)
  })
})

describe("vault.tryDelDamagedBox", () => {
  it("refuses a healthy box as 'absent_box', leaving the box alone", async () => {
    const { vault, boxrows } = await makeWorldWithBox()
    const err = await TH.expectBad(vault.tryDelDamagedBox(boxlabel), 'absent_box')
    expect(err.message).to.equal(Phrases.damagedBoxAbsent(boxlabel))
    expect(boxrows.get(boxlabel)).to.have.property('am', 'a')
    expect(vault.boxListing.at({ ...vault.scope, boxlabel })).not.to.be.null
  })

  it("refuses a boxlabel nothing is listed under as 'absent_box', storing nothing", async () => {
    const { vault, boxrows } = await makeWorld()
    await TH.expectBad(vault.tryDelDamagedBox(boxlabel), 'absent_box')
    expect(boxrows.has(boxlabel)).to.be.false
  })

  it("never throws: a boxlabel that fails its check, and a locked vault, answer a bad Outcome", async () => {
    const { vault } = await makeWorld()
    await TH.expectBad(vault.tryDelDamagedBox('Not A Label'), 'bad_scope')
    vault.lock()
    await TH.expectBad(vault.tryDelDamagedBox(boxlabel), 'vault_locked')
  })
})
