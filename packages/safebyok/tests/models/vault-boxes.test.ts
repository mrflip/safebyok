/** A vault's box verbs from the host's side, on real seals: hello, getBox, delBox, and a damaged record set aside. */

import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import * as TH from '../test-helpers'
import { Sidecar, Whisper, boxlabel, makeWorld, makeWorldWithBox, makeWorldWithRubble, nextUnlisted, delTyping, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("vault.hello: the host's call for the list and the pushes", () => {
  it("is run by no box verb, a getBox fetching only its own box and listing only that one", async () => {
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

  it("a put from another session reaches the box listed", async () => {
    const { vault, openNextSession } = await makeWorldWithBox()
    const next = await openNextSession()
    await next.hello()
    const box = await next.getBox(boxlabel)
    await vault.putBox({ boxlabel, sidecar: { note: 'moved' } })
    await TH.eventually(() => box?.revision_seq === 1)
    expect(box?.sidecar).to.deep.equal({ note: 'moved' })
  })

  it("refuses for a vault deleted elsewhere, listing nothing", async () => {
    const { openNextSession, vault } = await makeWorldWithBox()
    const next = await openNextSession()
    await delTyping(vault)
    await TH.expectRefusal(next.hello())
    expect(next.isPresent).to.be.false
    expect(next.boxListing.things).to.deep.equal([])
  })

  it("passes a listing's failure up, and the next hello lists the boxes", async () => {
    const { openNextSession, tryListBoxes } = await makeWorldWithBox()
    const next = await openNextSession()
    tryListBoxes.mockRejectedValueOnce(new Error('the wire is down'))
    const refusal = await TH.expectRefusal(next.hello(), 'unexpected_error')
    expect(refusal.cause).to.have.property('message', 'the wire is down')
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

    it(`${verb} refuses on a vault deleted, as gone beats locked`, async () => {
      const { vault } = await makeWorld()
      await delTyping(vault)
      await TH.expectRefusal(call(vault))
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
  it("a vault found gone delivers no box: the tombstone reaches the vault as its world, and no bad news is told", async () => {
    const { vault, restoreRow, demandStored, tryGetBox, badnews } = await makeWorldWithBox()
    restoreRow({ ...omit(demandStored(), ['gate']), am: 'x', revision_seq: 5, revision_tok: 'rev-gone-5' })
    const toldBefore = badnews.length
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.fetchBox(boxlabel))
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(vault.isPresent).to.be.false
    expect(badnews).to.have.lengthOf(toldBefore)
  })

  it("a vault of another life delivers no box, and no bad news is told", async () => {
    const { vault, restoreRow, tryGetBox, badnews } = await makeWorldWithBox()
    restoreRow({ ...await storedVaultRecord(), revision_seq: 5, revision_tok: 'rev-other-5' })
    const toldBefore = badnews.length
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.fetchBox(boxlabel))
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(badnews).to.have.lengthOf(toldBefore)
  })
})

describe("vault.getBox", () => {
  it("takes the gate a box's answer brings: a row moved elsewhere, no notice heard, leaves the vault full with the new gate", async () => {
    const { vault, putBehindOurBack, demandStored } = await makeWorldWithBox()
    const stored = demandStored()
    const moved = putBehindOurBack({ ...stored, gate: { ...stored.gate, gate_epoch: stored.gate.gate_epoch + 1 } })
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
    await TH.expectRefusal(vault.getBox('Not A Label'))
    await TH.expectRefusal(vault.getBox(42 as never))
    await TH.expectRefusal(vault.getBox(boxlabel, { ifAbsent: 'shrug' } as never))
  })
})

describe("vault.delBox", () => {
  it("of a box stored and not listed hears 'stale_write' over the sentinel, the frontier delivered, and the retry is written", async () => {
    const { next, boxrows } = await nextUnlisted()
    await TH.expectRefusal(next.delBox(boxlabel), 'stale_write')
    expect(boxrows.get(boxlabel)).to.have.property('am', 'a')
    await next.delBox(boxlabel)
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
  })

  it("leaves the box listed in its tombstone, a get then absent, the whisper refused", async () => {
    const { vault, boxrows } = await makeWorldWithBox()
    const dead = await vault.delBox(boxlabel)
    expect(dead?.isPresent).to.be.false
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
    expect(JSON.stringify(boxrows.get(boxlabel))).not.to.include('whisper_ciphered')
    await TH.expectRefusal(vault.getBox(boxlabel), 'absent_box')
    await expect(dead?.extractWhisper()).rejects.toThrow()
  })

  it("resolves null for nothing stored, deleting nothing", async () => {
    const { vault, boxrows } = await makeWorld()
    expect(await vault.delBox(boxlabel)).to.be.null
    expect(boxrows.has(boxlabel)).to.be.false
  })

  it("refuses a boxlabel that fails its check", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.delBox('Not A Label'))
    expect(await vault.tryDelBox('Not A Label')).to.deep.include({ ok: false })
  })
})

describe("a row no listing can set aside", () => {
  const Unlistable = [
    ['is not an object',          (): unknown => ['rubble'],                'storage_issue'],
    ['names another user_id',     (row: object): unknown => ({ ...row, user_id: 'u2' }), 'storage_issue'],
  ] as const

  it.each(Unlistable)("fails the whole of vault.hello where one %s", async (_blurb, rowOf, refusalkind) => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set(boxlabel, rowOf(boxrows.get(boxlabel) as object))
    const next = await openNextSession()
    await TH.expectRefusal(next.hello(), refusalkind)
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

  it("drops an instance listed under it from the list, disabled", async () => {
    const { vault, box: listed, boxrows } = await makeWorldWithBox()
    boxrows.set(boxlabel, { garbage: true })
    await vault.hello()
    expect(vault.boxListing.at(listed.scope)).to.be.null
    expect(listed.isEnabled).to.be.false
  })

  it("refuses a birth over it as 'damaged_row', the row standing", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', whisper: Whisper }), 'damaged_row')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })

  it("is not deleted by tryDelBox, past reading or with its peek: 'damaged_row', the rows and the listing standing", async () => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set('rubble', { garbage: true })
    boxrows.set('revised', { ...boxrows.get(boxlabel) as object, boxlabel: 'revised', whisper_ciphered: 'garbled' })
    const next = await openNextSession()
    await next.hello()
    await TH.expectBad(next.tryDelBox('rubble'), 'damaged_row')
    await TH.expectBad(next.tryDelBox('revised'), 'damaged_row')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
    expect(boxrows.get('revised')).to.have.property('am', 'a')
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.have.members(['rubble', 'revised'])
  })
})
