/** A vault's box verbs from the host's side, on real seals: hello, getBox, delBox, and a damaged record set aside. */

import { describe, expect, it, vi } from 'vitest'
import { ENCRYPTED } from '../../src/helpers/consts'
import { parseLogger } from '../../src/helpers/logger'
import * as TH from '../test-helpers'
import { Dna, Passphrase, Sidecar, Whisper, boxlabel, byPassphrase, makeWorld, makeWorldWithBox, makeWorldWithRubble, nextUnlisted, unlockTyping, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("vault.beginWatch", () => {
  it("is not called by getBox, which lists only the box it fetched", async () => {
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
    await expect(next.beginWatch()).resolves.to.eq(next)
    const listed = next.boxListing.at({ ...next.scope, boxlabel })
    expect(listed?.isFull).to.be.false
    await next.getBox(boxlabel)
    expect(listed?.isFull).to.be.true
    expect(tryListBoxes).toHaveBeenCalledOnce()
  })

  it("lists the boxes of a vault that is still locked", async () => {
    const world = await makeWorldWithBox()
    const nextBank = await world.anotherSession()
    const next = nextBank.vaultAt(Dna)!
    expect(next.bank.isLocked).to.be.true
    await next.beginWatch()
    expect(next.boxListing.at({ ...next.scope, boxlabel })?.boxlabel).to.eq(boxlabel)
    const box = (await next.getBox(boxlabel))!
    await TH.expectRefusal(box.extractWhisper(), 'bank_locked')
  })

  it("a put from another session reaches the box listed", async () => {
    const { vault, openNextSession } = await makeWorldWithBox()
    const next = await openNextSession()
    await next.beginWatch()
    const box = await next.getBox(boxlabel)
    await vault.putBox({ boxlabel, sidecar: { note: 'moved' } })
    await TH.eventually(() => box?.revision_seq === 1)
    expect(box?.sidecar).to.deep.equal({ note: 'moved' })
  })

  it("refuses for a vault deleted elsewhere, whose tombstone the bank's watch delivers, listing nothing", async () => {
    const { openNextSession, vault } = await makeWorldWithBox()
    const next = await openNextSession()
    await vault.del(vault)
    await TH.eventually(() => ! next.isPresent)
    await TH.expectRefusal(next.beginWatch(), 'vault_gone')
    expect(next.boxListing.things).to.deep.equal([])
    expect(next.listing.at(next.scope)).to.eq(next)
  })

  it("passes a listing's failure up, and the next hello lists the boxes", async () => {
    const spy = TH.spyLogger()
    const { openNextSession, tryListBoxes } = await makeWorldWithBox({ logger: parseLogger(spy.logger) })
    const next = await openNextSession()
    tryListBoxes.mockRejectedValueOnce(new Error('the wire is down'))
    const refusal = await TH.expectRefusal(next.beginWatch(), 'unexpected_error')
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
    expect(refusal.cause).to.have.property('message', 'the wire is down')
    await expect(next.beginWatch()).resolves.to.eq(next)
    expect(next.boxListing.at({ ...next.scope, boxlabel })?.boxlabel).to.eq(boxlabel)
  })
})

describe("the box methods on a locked or deleted vault", () => {
  const Verbs = [
    ['getBox',   false, (vault) => vault.getBox(boxlabel)],
    ['fetchBox', false, (vault) => vault.fetchBox(boxlabel)],
    ['putBox',   true,  (vault) => vault.putBox({ boxlabel, whisper: Whisper })],
    ['delBox',   true,  (vault) => vault.delBox(boxlabel)],
  ] as const satisfies readonly (readonly [string, boolean, (vault: Awaited<ReturnType<typeof makeWorld>>['vault']) => Promise<unknown>])[]

  for (const [verb, asksUnlock, call] of Verbs) {
    if (asksUnlock) {
      it(`${verb} asks for the unlock while locked, refusing 'dismissed' where the user dismisses it`, async () => {
        const { vault } = await makeWorld()
        vault.bank.lock()
        await TH.expectRefusal(call(vault), 'dismissed')
      })
    }

    it(`${verb} refuses on a deleted vault`, async () => {
      const { vault } = await makeWorld()
      await vault.del(vault)
      await TH.expectRefusal(call(vault))
    })
  }

  it("getBox and fetchBox return the box while locked", async () => {
    const { vault, box } = await makeWorldWithBox()
    vault.bank.lock()
    await expect(vault.getBox(boxlabel)).resolves.to.eq(box)
    await expect(vault.fetchBox(boxlabel)).resolves.to.eq(box)
  })

  it("a refused put's whisper does not appear in the refusal", async () => {
    const { vault } = await makeWorld()
    vault.bank.lock()
    const err = await TH.expectRefusal(vault.putBox({ boxlabel, whisper: Whisper }), 'dismissed')
    expect(JSON.stringify(err.meta ?? {})).not.to.include(Whisper)
    expect(err.message).not.to.include(Whisper)
  })
})

describe("the boxes of a vault deleted", () => {
  it("drop their whispers exposed at a delete here, the vault's next box listing being of its next life", async () => {
    const { vault, box } = await makeWorldWithBox()
    const { boxListing } = vault
    await box.expose()
    await vault.del(vault)
    expect(box.isEnabled).to.be.false
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.getSnapshot()).to.deep.include({ isExposed: false, isVeiled: false })
    expect(vault.boxListing).not.to.eq(boxListing)
    expect(vault.boxListing.vault_tok).to.eq(vault.vault_tok)
  })

  it("drop their whispers exposed at a tombstone the bank's watch delivers from elsewhere", async () => {
    const { openNextSession, vault } = await makeWorldWithBox()
    const next = await openNextSession()
    const box = (await next.getBox(boxlabel))!
    await box.expose()
    await vault.del(vault)
    await TH.eventually(() => ! next.isPresent)
    expect(box.isEnabled).to.be.false
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.getSnapshot().isExposed).to.be.false
  })
})

describe("a box listed, through its bank's lock and unlock", () => {
  it("shows the bank's lock on its snapshot, notifying its listener once each way", async () => {
    const { bank, box } = await makeWorldWithBox()
    const listener = vi.fn()
    box.subscribe(listener)
    expect(box.getSnapshot().isLocked).to.be.false
    bank.lock()
    expect(box.getSnapshot().isLocked).to.be.true
    expect(listener).toHaveBeenCalledTimes(1)
    await unlockTyping(bank, byPassphrase(Passphrase))
    expect(box.getSnapshot().isLocked).to.be.false
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe("a box call the bankDB refuses over its vault's row", () => {
  it("a vault found deleted delivers no box", async () => {
    const { vault, restoreRow, demandStored, tryGetBox, badnews } = await makeWorldWithBox()
    restoreRow({ ...demandStored(), am: 'x', revision_seq: 5, revision_tok: 'rev-gone-5' })
    const toldBefore = badnews.length
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.fetchBox(boxlabel))
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(vault.isPresent).to.be.false
    expect(badnews).to.have.lengthOf(toldBefore)
  })

  it("a vault of another life delivers no box", async () => {
    const { vault, restoreRow, demandStored, tryGetBox, badnews } = await makeWorldWithBox()
    restoreRow({ ...demandStored(), vault_tok: 'vault-tok-other', revision_seq: 5, revision_tok: 'rev-other-5' })
    const toldBefore = badnews.length
    tryGetBox.mockClear()
    await TH.expectRefusal(vault.fetchBox(boxlabel))
    expect(tryGetBox).toHaveBeenCalledOnce()
    expect(badnews).to.have.lengthOf(toldBefore)
  })
})

describe("vault.getBox", () => {
  it("adopts the vault row that moved elsewhere, which the box's answer carries", async () => {
    const { vault, putBehindOurBack, demandStored } = await makeWorldWithBox()
    const moved = putBehindOurBack(demandStored())
    await vault.fetchBox(boxlabel)
    expect(vault.isFull).to.be.true
    expect(vault.revision_tok).to.eq(moved.revision_tok)
  })

  const AbsentCases = [
    [{},                    'absent_box', "refuses 'absent_box' for an absent box, by default"],
    [{ ifAbsent: 'fail' },  'absent_box', "refuses 'absent_box' for an absent box under ifAbsent 'fail'"],
    [{ ifAbsent: 'nil' },   null,         "resolves null for an absent box under ifAbsent 'nil'"],
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

  it("resolves the full box, whose whisper opens", async () => {
    const { openNextSession } = await makeWorldWithBox()
    const next = await openNextSession()
    const box = await next.getBox(boxlabel)
    expect(box?.sidecar).to.deep.equal(Sidecar)
    expect(await box?.extractWhisper()).to.deep.equal(Whisper)
    expect(await next.tryGetBox(boxlabel)).to.deep.include({ ok: true, val: box })
    expect(await next.tryGetBox('nosuchbox')).to.deep.include({ ok: false })
  })

  it("asks storage nothing within the horizon, where fetchBox always does", async () => {
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
  it("refuses 'stale_write' for a stored box that is not listed", async () => {
    const { next, boxrows } = await nextUnlisted()
    await TH.expectRefusal(next.delBox(boxlabel), 'stale_write')
    expect(boxrows.get(boxlabel)).to.have.property('am', 'a')
    await next.delBox(boxlabel)
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
  })

  it("leaves the box listed as a tombstone", async () => {
    const { vault, boxrows } = await makeWorldWithBox()
    const dead = await vault.delBox(boxlabel)
    expect(dead?.isPresent).to.be.false
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
    expect(JSON.stringify(boxrows.get(boxlabel))).not.to.include('whisper_ciphered')
    await TH.expectRefusal(vault.getBox(boxlabel), 'absent_box')
    await expect(dead?.extractWhisper()).rejects.toThrow()
  })

  it("refuses 'absent_box' for nothing stored, deleting nothing", async () => {
    const { vault, boxrows } = await makeWorld()
    await TH.expectRefusal(vault.delBox(boxlabel), 'absent_box')
    expect(boxrows.has(boxlabel)).to.be.false
  })

  it("refuses 'absent_box' for a box already deleted, its tombstone left as it was", async () => {
    const { vault, boxrows } = await makeWorldWithBox()
    await vault.delBox(boxlabel)
    const tombstone = boxrows.get(boxlabel)
    await TH.expectRefusal(vault.delBox(boxlabel), 'absent_box')
    expect(boxrows.get(boxlabel)).to.deep.equal(tombstone)
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

  it.each(Unlistable)("fails the whole of vault.beginWatch where one %s", async (_blurb, rowOf, refusalkind) => {
    const spy = TH.spyLogger()
    const { openNextSession, boxrows } = await makeWorldWithBox({ logger: parseLogger(spy.logger) })
    boxrows.set(boxlabel, rowOf(boxrows.get(boxlabel) as object))
    const next = await openNextSession()
    await TH.expectRefusal(next.beginWatch(), refusalkind)
    expect(spy.calls.map((call) => call.level)).to.deep.equal(['warn'])
  })
})

describe("a damaged record is set aside, and nothing acts on it", () => {
  it("lists it in damaged_rows, and refuses a get of it as 'damaged_row'", async () => {
    const { openNextSession } = await makeWorldWithRubble()
    const next = await openNextSession()
    await next.beginWatch()
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.deep.equal(['rubble'])
    expect(next.boxListing.at({ ...next.scope, boxlabel: 'rubble' })).to.be.null
    await TH.expectRefusal(next.getBox('rubble'), 'damaged_row')
    await expect(next.getBox(boxlabel)).resolves.to.have.property('boxlabel', boxlabel)
  })

  it("lists a row whose label fails its check as damaged, without disturbing the other boxes", async () => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set('Not A Label', { garbage: true })
    const next = await openNextSession()
    await next.beginWatch()
    const box = await next.getBox(boxlabel)
    expect(await box?.extractWhisper()).to.deep.equal(Whisper)
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.deep.equal(['Not A Label'])
  })

  it("drops an instance listed under it from the list, disabled", async () => {
    const { vault, box: listed, boxrows } = await makeWorldWithBox()
    boxrows.set(boxlabel, { garbage: true })
    await vault.beginWatch()
    expect(vault.boxListing.at(listed.scope)).to.be.null
    expect(listed.isEnabled).to.be.false
  })

  it("refuses 'damaged_row' for a put over it, leaving the row as it was", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', whisper: Whisper }), 'damaged_row')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })

  it("is not deleted by tryDelBox", async () => {
    const { openNextSession, boxrows } = await makeWorldWithBox()
    boxrows.set('rubble', { garbage: true })
    boxrows.set('revised', { ...boxrows.get(boxlabel) as object, boxlabel: 'revised', whisper_ciphered: 'garbled' })
    const next = await openNextSession()
    await next.beginWatch()
    await TH.expectBad(next.tryDelBox('rubble'), 'damaged_row')
    await TH.expectBad(next.tryDelBox('revised'), 'damaged_row')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
    expect(boxrows.get('revised')).to.have.property('am', 'a')
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.have.members(['rubble', 'revised'])
  })
})

describe("a damaged box row met by the box listing", () => {
  it("is reported as bad news, 'damaged_row', by each listing that finds it", async () => {
    const { openNextSession, badnews } = await makeWorldWithRubble()
    const next = await openNextSession()
    badnews.length = 0
    await next.beginWatch()
    expect(badnews.map((news) => news.refusalkind)).to.deep.equal(['damaged_row'])
    expect(next.boxListing.damaged_rows.map((row) => row.boxlabel)).to.deep.equal(['rubble'])
  })
})
