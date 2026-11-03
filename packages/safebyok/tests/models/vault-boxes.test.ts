/** A vault's box verbs, from the host's side, on real seals: `hello`, `getBox`, `putBox`, `delBox`, a box's `extractWhisper`, and the sidecar-only `send`. */

import { describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'
import { Passphrase, byPassphrase, delTyping, makeBornVault, unlockTyping, useVaultWorlds } from '../test-helpers/vault-world'

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

/** A vault whose box row a next session finds failing its checks. */
const makeWorldWithRubble = async () => {
  const world = await makeWorldWithBox()
  world.boxrows.set('rubble', { garbage: true })
  return world
}

describe("vault.hello: the first box call lists the boxes", () => {
  it("runs on the first box call and no other, holding each box listed sparse", async () => {
    const { openNextSession, tryGetVault } = await makeWorldWithBox()
    const next = await openNextSession()
    tryGetVault.mockClear()
    expect(next.boxListing.things).to.deep.equal([])
    const box = await next.getBox(boxlabel)
    expect(tryGetVault).toHaveBeenCalledOnce()
    expect(box).to.eq(next.boxListing.at({ ...next.scope, boxlabel }))
    await next.getBox(boxlabel)
    await next.fetchBox(boxlabel, { ifAbsent: 'nil' })
    expect(tryGetVault).toHaveBeenCalledOnce()
  })

  it("may be run sooner by the host: the box is listed sparse, a get then hydrating it", async () => {
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

  it("lists the boxes of a vault still locked, as nothing it holds is secret; a box verb still refuses", async () => {
    const world = await makeWorldWithBox()
    const next = await world.anotherSession().build(world.demandStored())
    expect(next.isLocked).to.be.true
    await next.hello()
    expect(next.boxListing.at({ ...next.scope, boxlabel })?.boxlabel).to.eq(boxlabel)
    await TH.expectRefusal(next.getBox(boxlabel), 'vault_locked')
  })

  it("starts the box listing's watch, so another session's put reaches the box held", async () => {
    const { vault, openNextSession } = await makeWorldWithBox()
    const next = await openNextSession()
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

  it("passes a get's failure up, and the next box call says hello again", async () => {
    const { openNextSession, tryGetVault } = await makeWorldWithBox()
    const next = await openNextSession()
    tryGetVault.mockRejectedValueOnce(new Error('the wire is down'))
    await expect(next.getBox(boxlabel)).rejects.toThrow('the wire is down')
    await expect(next.getBox(boxlabel)).resolves.to.have.property('boxlabel', boxlabel)
  })

  it("refuses a boxListing.hello given a list that fails its check as 'bad_record'", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.boxListing.hello({ boxes: 'none' } as never), 'bad_record')
  })
})

describe("the box verbs refuse a vault locked, or gone, before they touch storage", () => {
  const Verbs = [
    ['getBox',   (vault) => vault.getBox(boxlabel)],
    ['fetchBox', (vault) => vault.fetchBox(boxlabel)],
    ['putBox',   (vault) => vault.putBox({ boxlabel, whisper: Whisper })],
    ['delBox',   (vault) => vault.delBox(boxlabel)],
  ] as const satisfies readonly (readonly [string, (vault: Awaited<ReturnType<typeof makeWorld>>['vault']) => Promise<unknown>])[]

  for (const [verb, call] of Verbs) {
    it(`${verb} refuses 'vault_locked' while locked, with no vaultDB call`, async () => {
      const { vault, tryGetVault, tryPutBox, tryGetBox } = await makeWorld()
      vault.lock()
      tryGetVault.mockClear()
      await TH.expectRefusal(call(vault), 'vault_locked')
      expect(tryGetVault).not.toHaveBeenCalled()
      expect(tryGetBox).not.toHaveBeenCalled()
      expect(tryPutBox).not.toHaveBeenCalled()
    })

    it(`${verb} refuses 'vault_gone' on a vault deleted, as gone beats locked`, async () => {
      const { vault } = await makeWorld()
      await delTyping(vault)
      await TH.expectRefusal(call(vault), 'vault_gone')
    })
  }

  it("a whisper a refusal was handed is not in the refusal", async () => {
    const { vault } = await makeWorld()
    vault.lock()
    const err = await TH.expectRefusal(vault.putBox({ boxlabel, whisper: Whisper }), 'vault_locked')
    expect(JSON.stringify(err.meta ?? {})).not.to.include(Whisper.val)
    expect(err.message).not.to.include(Whisper.val)
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

  it("refuses a boxlabel or opts that fail their checks as 'bad_option'", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.getBox('Not A Label'), 'bad_option')
    await TH.expectRefusal(vault.getBox(42 as never), 'bad_option')
    await TH.expectRefusal(vault.getBox(boxlabel, { ifAbsent: 'shrug' } as never), 'bad_option')
  })
})

describe("the box's birth: vault.putBox with no box listed", () => {
  it("seals over the sentinel prior, stores 'born', and delivers: the whisper opens, nothing of it in the row", async () => {
    const { vault, boxrows, tryPutBox } = await makeWorld()
    const box = await vault.putBox({ boxlabel, whisper: Whisper, sidecar: Sidecar })
    expect(tryPutBox).toHaveBeenCalledOnce()
    expect(tryPutBox.mock.calls[0]?.[1]).to.deep.include({ prior: { revision_tok: 'deadbeef-never-stored', revision_seq: -1 } })
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

  it("refuses a birth with no whisper as 'no_whisper', storing nothing", async () => {
    const { vault, tryPutBox } = await makeWorld()
    await TH.expectRefusal(vault.putBox({ boxlabel, sidecar: Sidecar }), 'no_whisper')
    expect(tryPutBox).not.toHaveBeenCalled()
  })

  const PatchCases = [
    [{ whisper: Whisper },                               'a patch with no boxlabel'],
    [{ boxlabel },                                       'a patch naming neither half'],
    [{ boxlabel, whisper: { val: null } },               'a whisper that fails its check'],
    [{ boxlabel, whisper: Whisper, sidecar: 'note' },    'a sidecar that fails its check'],
    [{ boxlabel, whisper: Whisper, vaultlabel: 'other' }, "the scope of another vault"],
    [undefined,                                          'no patch at all'],
  ] as const

  for (const [patch, blurb] of PatchCases) {
    it(`refuses ${blurb} as 'bad_option', storing nothing`, async () => {
      const { vault, tryPutBox } = await makeWorld()
      await TH.expectRefusal(vault.putBox(patch as never), 'bad_option')
      expect(tryPutBox).not.toHaveBeenCalled()
    })
  }

  it("is a 'reborn' put over the tombstone hello listed, under a new life", async () => {
    const { vault, openNextSession, boxrows } = await makeWorldWithBox()
    const old = await vault.getBox(boxlabel)
    const oldLife = old?.box_tok
    await vault.delBox(boxlabel)
    const next = await openNextSession()
    const reborn = await next.putBox({ boxlabel, whisper: { val: 'sk-test-0001' } })
    expect(reborn.isPresent).to.be.true
    expect(reborn.box_tok).not.to.eq(oldLife)
    expect(reborn.sidecar).to.deep.equal({})
    expect(await reborn.extractWhisper()).to.deep.equal({ val: 'sk-test-0001' })
    expect(boxrows.get(boxlabel)).to.have.property('am', 'a')
  })

  it("refuses a rebirth with no whisper as 'no_whisper', the tombstone standing", async () => {
    const { vault, boxrows } = await makeWorldWithBox()
    await vault.delBox(boxlabel)
    await TH.expectRefusal(vault.putBox({ boxlabel, sidecar: Sidecar }), 'no_whisper')
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
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

  it("asks storage before refusing a sidecar alone: another session's box landed since hello takes the sidecar, the whisper kept", async () => {
    const { boxrows, openNextSession } = await makeWorldWithBox()
    const row = boxrows.get(boxlabel)
    boxrows.delete(boxlabel)
    const next = await openNextSession()
    await next.hello()
    boxrows.set(boxlabel, row)
    const box = await next.putBox({ boxlabel, sidecar: { note: 'home' } })
    expect(box.sidecar).to.deep.equal({ note: 'home' })
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("refuses a sidecar alone over a damaged row as 'damaged_record', not as no box stored", async () => {
    const { boxrows, openNextSession } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', sidecar: Sidecar }), 'damaged_record')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })
})

describe("vault.putBox over a live box", () => {
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

describe("a sidecar-only send", () => {
  it("unseals and reseals: the sidecar moves, the whisper opens as it was, sealed anew under the new stamp", async () => {
    const { box, boxrows } = await makeWorldWithBox()
    const before = boxrows.get(boxlabel) as { whisper_ciphered: unknown }
    await box.send({ sidecar: { note: 'home' } })
    const after = boxrows.get(boxlabel) as { whisper_ciphered: unknown }
    expect(box.sidecar).to.deep.equal({ note: 'home' })
    expect(after.whisper_ciphered).not.to.deep.equal(before.whisper_ciphered)
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("opens the stored whisper, never the one exposed", async () => {
    const { box } = await makeWorldWithBox()
    box.whisper = { val: 'sk-test-exposed' }
    await box.send({ sidecar: { note: 'home' } })
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("is what putBox of a sidecar alone does to a box held", async () => {
    const { vault } = await makeWorldWithBox()
    const box = await vault.putBox({ boxlabel, sidecar: { note: 'home' } })
    expect(box.sidecar).to.deep.equal({ note: 'home' })
    expect(await box.extractWhisper()).to.deep.equal(Whisper)
  })

  it("a whisper-only send keeps the sidecar", async () => {
    const { box } = await makeWorldWithBox()
    await box.send({ whisper: { val: 'sk-test-0001' } })
    expect(box.sidecar).to.deep.equal(Sidecar)
    expect(await box.extractWhisper()).to.deep.equal({ val: 'sk-test-0001' })
  })

  it("refuses 'vault_locked' while locked, storing nothing", async () => {
    const { vault, box, tryPutBox } = await makeWorldWithBox()
    vault.lock()
    tryPutBox.mockClear()
    await TH.expectRefusal(box.send({ sidecar: { note: 'home' } }), 'vault_locked')
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

  it("refuses a boxlabel that fails its check as 'bad_option'", async () => {
    const { vault } = await makeWorld()
    await TH.expectRefusal(vault.delBox('Not A Label'), 'bad_option')
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
    const box = await next.getBox(boxlabel)
    expect(await box?.extractWhisper()).to.deep.equal(Whisper)
    expect(next.boxListing.damaged_records.map((row) => row.boxlabel)).to.deep.equal(['Not A Label'])
  })

  it("drops an instance held under it from the list, disabled", async () => {
    const { vault, box: held, boxrows } = await makeWorldWithBox()
    boxrows.set(boxlabel, { garbage: true })
    await vault.hello()
    expect(vault.boxListing.at(held.scope)).to.be.null
    expect(held.isDisabled).to.be.true
    await vault.delBox(boxlabel)
    expect(boxrows.get(boxlabel)).to.have.property('am', 'x')
  })

  it("refuses a birth over it as 'damaged_record', the row standing", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await TH.expectRefusal(next.putBox({ boxlabel: 'rubble', whisper: Whisper }), 'damaged_record')
    expect(boxrows.get('rubble')).to.deep.equal({ garbage: true })
  })

  it("is deleted by its label: the tombstone lands, the entry clears, a birth then goes over it", async () => {
    const { openNextSession, boxrows } = await makeWorldWithRubble()
    const next = await openNextSession()
    await next.hello()
    await next.delBox('rubble')
    expect(boxrows.get('rubble')).to.have.property('am', 'x')
    expect(next.boxListing.damaged_records).to.deep.equal([])
    const reborn = await next.putBox({ boxlabel: 'rubble', whisper: Whisper })
    expect(await reborn.extractWhisper()).to.deep.equal(Whisper)
  })
})
