/** A vault's box verbs from the host's side, on real seals: hello, getBox, delBox, and a damaged record set aside. */

import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { Sidecar, Whisper, boxlabel, makeWorld, makeWorldWithBox, makeWorldWithRubble, nextUnlisted, delTyping, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("vault.hello: the host's call for the list and the pushes", () => {
  it("is run by no box verb, a getBox fetching only its own box and holding only that one", async () => {
    const { openNextSession, tryListBoxes, tryGetBox } = await makeWorldWithBox()
    const next = await openNextSession()
    tryListBoxes.mockClear()
    tryGetBox.mockClear()
    expect(next.boxListing.things).to.deep.equal([])
    const box = await next.getBox(boxlabel)
    expect(box).to.eq(next.boxListing.at({ ...next.scope, boxlabel }))
    expect(box?.isFull).to.be.true
    expect(next.boxListing.things).to.deep.equal([box])
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(tryListBoxes).not.toHaveBeenCalled()
  })

  it("lists each box sparse, a get then hydrating it", async () => {
    const { openNextSession, tryListBoxes } = await makeWorldWithBox()
    const next = await openNextSession()
    tryListBoxes.mockClear()
    await expect(next.hello()).resolves.to.eq(next)
    const listed = next.boxListing.at({ ...next.scope, boxlabel })
    expect(listed?.isFull).to.be.false
    await next.getBox(boxlabel)
    expect(listed?.isFull).to.be.true
    expect(tryListBoxes).toHaveBeenCalledOnce()
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

  it("a put from another session reaches the box held", async () => {
    const { vault, openNextSession } = await makeWorldWithBox()
    const next = await openNextSession()
    await next.hello()
    const box = await next.getBox(boxlabel)
    await vault.putBox({ boxlabel, sidecar: { note: 'moved' } })
    await TH.eventually(() => box?.revision_seq === 1)
    expect(box?.sidecar).to.deep.equal({ note: 'moved' })
  })

  it("refuses 'vault_gone' for a vault deleted elsewhere, listing nothing", async () => {
    const { openNextSession, vault } = await makeWorldWithBox()
    const next = await openNextSession()
    await delTyping(vault)
    await TH.expectRefusal(next.hello(), 'vault_gone')
    expect(next.isPresent).to.be.false
    expect(next.boxListing.things).to.deep.equal([])
  })

  it("passes a listing's failure up, and the next hello lists the boxes", async () => {
    const { openNextSession, tryListBoxes } = await makeWorldWithBox()
    const next = await openNextSession()
    tryListBoxes.mockRejectedValueOnce(new Error('the wire is down'))
    await expect(next.hello()).rejects.toThrow('the wire is down')
    await expect(next.hello()).resolves.to.eq(next)
    expect(next.boxListing.at({ ...next.scope, boxlabel })?.boxlabel).to.eq(boxlabel)
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
    expect(JSON.stringify(err.meta ?? {})).not.to.include(Whisper)
    expect(err.message).not.to.include(Whisper)
  })
})

describe("a box verb the vaultDB refuses over its vault's row", () => {
  it("'vault_gone' delivers no box: the tombstone reaches the vault as its world, and no bad news is told", async () => {
    const { vault, restoreRow, demandStored, tryGetBox, opts: { world } } = await makeWorldWithBox()
    restoreRow({ ...omit(demandStored(), ['gate']), am: 'x', revision_seq: 5, revision_tok: 'rev-gone-5' })
    const tellBadNews = vi.spyOn(world, 'tellBadNews')
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.fetchBox(boxlabel), 'vault_gone')
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(vault.isPresent).to.be.false
    expect(tellBadNews).not.toHaveBeenCalled()
  })

  it("'vault_mismatch' delivers no box, and no bad news is told", async () => {
    const { vault, restoreRow, tryGetBox, opts: { world } } = await makeWorldWithBox()
    restoreRow({ ...await storedVaultRecord(), revision_seq: 5, revision_tok: 'rev-other-5' })
    const tellBadNews = vi.spyOn(world, 'tellBadNews')
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

  it("refuses a boxlabel that fails its check, and opts that fail theirs", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.getBox('Not A Label'), 'bad_scope')
    await TH.expectRefusal(vault.getBox(42 as never), 'bad_scope')
    await TH.expectRefusal(vault.getBox(boxlabel, { ifAbsent: 'shrug' } as never), 'bad_option')
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

  it("refuses a boxlabel that fails its check", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.delBox('Not A Label'), 'bad_scope')
    expect(await vault.tryDelBox('Not A Label')).to.deep.include({ ok: false })
  })
})

describe("a damaged record is set aside, and nothing acts on it", () => {
  it("lists it in damaged_rows, and refuses a get of it as 'damaged_row'", async () => {
    const { openNextSession } = await makeWorldWithRubble()
    const next = await openNextSession()
    await next.hello()
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.deep.equal(['rubble'])
    expect(next.boxListing.at({ ...next.scope, boxlabel: 'rubble' })).to.be.null
    await TH.expectRefusal(next.getBox('rubble'), 'damaged_row')
    await expect(next.getBox(boxlabel)).resolves.to.have.property('boxlabel', boxlabel)
  })

  it("lists a row under a label that fails its check, the boxes beside it still answering", async () => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set('Not A Label', { garbage: true })
    const next = await openNextSession()
    await next.hello()
    const box = await next.getBox(boxlabel)
    expect(await box?.extractWhisper()).to.deep.equal(Whisper)
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.deep.equal(['Not A Label'])
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

  it("refuses a birth over it as 'damaged_row', the row standing", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', whisper: Whisper }), 'damaged_row')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })

  it("is not deleted by tryDelBox when it names a revision: 'damaged_row', the row and its listing standing, tryDelDamagedBox then deleting it", async () => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set('revised', { ...boxrows.get(boxlabel) as object, boxlabel: 'revised', whisper_ciphered: 'garbled' })
    const next = await openNextSession()
    await next.hello()
    await TH.expectBad(next.tryDelBox('revised'), 'damaged_row')
    expect(boxrows.get('revised')).to.have.property('am', 'a')
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.deep.equal(['revised'])
    await TH.expectGood(next.tryDelDamagedBox('revised'))
    expect(boxrows.get('revised')).to.have.property('am', 'x')
    expect(next.boxListing.damaged_rows).to.deep.equal([])
  })

  it("is deleted by tryDelDamagedBox: the tombstone lands, the entry clears, a birth then goes over it", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await next.hello()
    expect(await next.tryDelDamagedBox('rubble')).to.deep.include({ ok: true })
    expect(boxrows.get('rubble')).to.have.property('am', 'x')
    expect(next.boxListing.damaged_rows).to.deep.equal([])
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
