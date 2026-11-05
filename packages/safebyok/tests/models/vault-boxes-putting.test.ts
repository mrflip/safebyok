/** A vault's putBox on real seals: a box's birth, a put over a void instance or a live box, a sidecar-only put, and extractWhisper. */

import { describe, expect, it } from 'vitest'
import * as Phrases from '../../src/helpers/phrases'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { LOCKED } from '../../src/helpers/consts'
import type { WhisperHolder } from '../../src/shapes/shapes-vaultish'
import { Sidecar, Whisper, boxlabel, makeWorld, makeWorldWithBox, makeWorldWithRubble, nextUnlisted, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("the box's birth: vault.putBox with no box listed", () => {
  it("seals over the sentinel prior, stores 'born', and delivers: the whisper opens, nothing of it in the row", async () => {
    const { vault, boxrows, tryPutBox } = await makeWorld()
    const box = await vault.putBox({ boxlabel, whisper: Whisper, sidecar: Sidecar })
    expect(tryPutBox).toHaveBeenCalledOnce()
    expect(tryPutBox.mock.calls[0]?.[1]).to.deep.include({ prior: SX.VoidRevision })
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

  it("hears 'damaged_row' for a sidecar alone over a damaged row not listed, fetching nothing: a damaged row is the host's", async () => {
    const { boxrows, openNextSession } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', sidecar: Sidecar }), 'damaged_row')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })
})

describe("a void instance, then a put: no hello, no fetch", () => {
  it("with nothing stored, lands at seq 0 under a real box_tok, and the whisper opens", async () => {
    const { vault, tryGetBox } = await makeWorld()
    const box = await vault.boxListing.puttable({ ...vault.scope, boxlabel }).put({ whisper: Whisper })
    expect(box.revision_seq).to.eq(0)
    expect(box.box_tok).not.to.eq(SX.VoidLifeTok)
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

  it("refuses opts before any guard", async () => {
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

  it("neither reads nor clears the whisper exposed, opening the stored one for a put of the sidecar alone", async () => {
    const { box } = await makeWorldWithBox()
    await box.expose()
    await box.put({ whisper: { val: 'sk-test-0001' } })
    expect(box.whisper).to.deep.equal(Whisper)
    await box.put({ sidecar: { note: 'home' } })
    expect(box.whisper).to.deep.equal(Whisper)
    expect(await box.extractWhisper()).to.deep.equal({ val: 'sk-test-0001' })
  })

  it("stores box.whisper handed to it, the exposed holder taken as any other", async () => {
    const { box } = await makeWorldWithBox()
    await box.expose()
    const { revision_seq } = box
    await box.put({ whisper: box.whisper as WhisperHolder, sidecar: { note: 'home' } })
    expect(box.sidecar).to.deep.equal({ note: 'home' })
    expect(box.revision_seq).to.eq(revision_seq + 1)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("refuses box.whisper given while locked, or with nothing exposed, storing nothing", async () => {
    const { vault, box, tryPutBox } = await makeWorldWithBox()
    tryPutBox.mockClear()
    expect(box.whisper).to.be.null
    await TH.expectRefusal(box.put({ whisper: box.whisper as never, sidecar: {} }), 'bad_option')
    vault.lock()
    expect(box.whisper).to.eq(LOCKED)
    await TH.expectRefusal(box.put({ whisper: box.whisper as never, sidecar: {} }), 'bad_option')
    expect(tryPutBox).not.toHaveBeenCalled()
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
