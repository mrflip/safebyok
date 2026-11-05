/** A Box's fields: `box.field` following the whisper through a lock and a veil, reading edits on the way into hiding, `box.saveFields`, and the last unbind. */

import { describe, expect, it, vi } from 'vitest'
import { WhisperMask } from '../../src/helpers/consts'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

const Stored = { apiKey: 'sk-test-0000', org: { name: 'acme', seats: 3 }, tags: ['a', 'b'] }

/** A box storing {@link Stored}, not exposed. */
const unexposedOf = async (): Promise<TestableBox> => {
  const record = fullBoxRecord()
  held.mw.seedStore(record)
  const box = await boxListingOf(held.mw).build(record)
  return box.put({ whisper: Stored })
}

const elOf = (text = ''): { value: string } => ({ value: text })

describe("box.field: what an element shows", () => {
  const LeafCases = [
    ['apiKey',    'sk-test-0000', 'a top-level string'],
    ['org.name',  'acme',         'a dotted path'],
    ['org.seats', '3',            'a number, as text'],
    ['tags.1',    'b',            'a leaf of a list'],
    ['org',       '',             'an object: a blank'],
    ['tags',      '',             'a list: a blank'],
    ['nobody',    '',             'nothing there: a blank'],
    ['__proto__', '',             'a path the whisper cannot own: a blank'],
  ] as const
  for (const [path, shown, blurb] of LeafCases) {
    it(`writes ${blurb}`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const el = elOf('was here')
      box.field(path)(el)
      expect(el.value).to.eq(shown)
    })
  }

  it("is blank while not exposed, masked or not, and fills at an expose", async () => {
    const box = await unexposedOf()

    const blank = elOf('was here')
    const masked = elOf('was here')
    box.field('apiKey')(blank)
    box.field('apiKey', { whenLocked: 'mask' })(masked)
    expect([blank.value, masked.value]).to.deep.equal(['', ''])
    await box.expose()
    expect([blank.value, masked.value]).to.deep.equal([Stored.apiKey, Stored.apiKey])
  })

  it("answers the same ref callback for the same path and options, so a re-render does not unbind", async () => {
    const box = await unexposedOf()

    expect(box.field('apiKey')).to.eq(box.field('apiKey', { whenLocked: 'blank' }))
    expect(box.field('apiKey')).not.to.eq(box.field('org.name'))
    expect(box.field('apiKey')).not.to.eq(box.field('apiKey', { whenLocked: 'mask' }))
  })

  it("does nothing given null, as a React before 19 hands a ref at an unmount", async () => {
    const box = await unexposedOf()

    expect(box.field('apiKey')(null)).to.eq(undefined)
  })

  it("refuses 'bad_option' given no path, or options it does not know", async () => {
    const box = await unexposedOf()

    TH.expectSyncRefusal(() => box.field(''), 'bad_option')
    TH.expectSyncRefusal(() => box.field('apiKey', { whenLocked: 'loud' as 'mask' }), 'bad_option')
    TH.expectSyncRefusal(() => box.field('apiKey', { whenVeiled: 'mask' } as object), 'bad_option')
  })
})

describe("box.field: into hiding and back", () => {
  const HidingCases = [
    ['a lock',  () => { held.mw.setLockState('locked') }, () => { held.mw.setLockState('unlocked') }],
    ['a veil',  (box: TestableBox) => { box.veil() }, (box: TestableBox) => { box.unveil() }],
  ] as const
  for (const [blurb, hide, show] of HidingCases) {
    it(`writes a blank at ${blurb}, or a mask of fixed length if asked, and the value at its end`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const blank = elOf()
      const masked = elOf()
      box.field('apiKey')(blank)
      box.field('org.seats', { whenLocked: 'mask' })(masked)
      hide(box)
      expect([blank.value, masked.value]).to.deep.equal(['', WhisperMask])
      show(box)
      expect([blank.value, masked.value]).to.deep.equal([Stored.apiKey, '3'])
    })

    it(`reads an edit on the way into ${blurb}, and brings it back`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const el = elOf()
      box.field('apiKey')(el)
      el.value = 'sk-edited'
      hide(box)
      expect(el.value).to.eq('')
      show(box)
      expect(el.value).to.eq('sk-edited')
      expect(box.whisper).to.deep.equal({ ...Stored, apiKey: 'sk-edited' })
    })

    it(`never reads back what it writes for ${blurb}, or what is typed over it`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const exposed = box.whisper
      const el = elOf()
      box.field('apiKey', { whenLocked: 'mask' })(el)
      hide(box)
      el.value = `${WhisperMask}typed`
      show(box)
      expect(el.value).to.eq(Stored.apiKey)
      expect(box.whisper).to.eq(exposed)
    })
  }

  it("leaves a number a number when its text was not edited, through a hiding and a save", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    box.field('org.seats')(el)
    box.veil().unveil()
    await box.saveFields()
    expect(await box.extractWhisper()).to.deep.equal(Stored)
  })

  it("leaves an edit be at a tell that moved nothing of its leaf", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    box.field('apiKey')(el)
    el.value = 'sk-editing'
    box.patchWhisper({ org: { seats: 4 } })
    expect(el.value).to.eq('sk-editing')
  })

  it("follows a leaf that moved", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    box.field('apiKey')(el)
    box.patchWhisper({ apiKey: 'sk-patched' })
    expect(el.value).to.eq('sk-patched')
  })

  it("does not pollute any prototype with an edit at a path through one", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    box.field('__proto__.polluted')(el)
    el.value = 'edited'
    await box.saveFields()
    expect(({} as { polluted?: string }).polluted).to.eq(undefined)
    expect(await box.extractWhisper()).to.deep.equal(Stored)
  })

  const EndingCases = [
    ['box.unexpose()', (box: TestableBox) => { box.unexpose() }],
    ['a sweep',        (box: TestableBox) => { box.sweep() }],
    ['a vacate',       (box: TestableBox) => { box.vacate() }],
  ] as const
  for (const [blurb, end] of EndingCases) {
    it(`goes blank at ${blurb}, a mask too`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const el = elOf()
      box.field('apiKey', { whenLocked: 'mask' })(el)
      end(box)
      expect(el.value).to.eq('')
    })
  }

  it("goes blank at a delete", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    box.field('apiKey')(el)
    await box.del()
    expect(el.value).to.eq('')
  })
})

describe("box.saveFields", () => {
  it("merges each edited field over the value, and seals one put", async () => {
    const box = await unexposedOf()

    await box.expose()
    const keyEl = elOf()
    const nameEl = elOf()
    box.field('apiKey')(keyEl)
    box.field('org.name')(nameEl)
    keyEl.value = 'sk-saved'
    nameEl.value = 'zenith'
    const tryPutBox = vi.spyOn(held.mw.vaultDB, 'tryPutBox')
    expect(await box.saveFields()).to.eq(box)
    expect(tryPutBox).toHaveBeenCalledOnce()
    const merged = { ...Stored, apiKey: 'sk-saved', org: { name: 'zenith', seats: 3 } }
    expect(await box.extractWhisper()).to.deep.equal(merged)
    expect(box.whisper).to.deep.equal(merged)
    expect([keyEl.value, nameEl.value]).to.deep.equal(['sk-saved', 'zenith'])
  })

  it("makes a new whisper with an edit and tells, and keeps the one in hand with none", async () => {
    const box = await unexposedOf()

    await box.expose()
    const exposed = box.whisper
    const el = elOf()
    box.field('apiKey')(el)
    await box.saveFields()
    expect(box.whisper).to.eq(exposed)
    const told = vi.fn()
    box.subscribe(told)
    el.value = 'sk-saved'
    await box.saveFields()
    expect(box.whisper).not.to.eq(exposed)
    expect(exposed).to.deep.equal(Stored)
    expect(told).toHaveBeenCalled()
  })

  it("keeps the edit in the value when the put is refused", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    box.field('apiKey')(el)
    el.value = 'sk-unsaved'
    await TH.expectRefusal(box.saveFields({ ifPresent: 'nonesuch' as 'repl' }), 'bad_option')
    expect(box.whisper).to.deep.include({ apiKey: 'sk-unsaved' })
  })

  it("refuses 'bad_option' with no field bound, or none exposed, or while veiled, and 'vault_locked' while locked", async () => {
    const box = await unexposedOf()

    const noFields = await TH.expectRefusal(box.saveFields(), 'bad_option')
    expect(noFields.message).to.eq(Phrases.NoFieldsBound)
    box.field('apiKey')(elOf())
    const notExposed = await TH.expectRefusal(box.saveFields(), 'bad_option')
    expect(notExposed.message).to.eq(Phrases.NotExposed)
    await box.expose()
    box.veil()
    const veiled = await TH.expectRefusal(box.saveFields(), 'bad_option')
    expect(veiled.message).to.eq(Phrases.SavingVeiledFields)
    box.unveil()
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.saveFields(), 'vault_locked')
  })

  it("has a try form answering an outcome", async () => {
    const box = await unexposedOf()

    const outcome = await box.trySaveFields()
    expect(outcome.ok).to.be.false
  })
})

describe("box.field: the last unbind", () => {
  it("unexposes at the last, and not before, blanking each as it goes", async () => {
    const box = await unexposedOf()

    await box.expose()
    const first = elOf()
    const second = elOf()
    const unbindFirst = box.field('apiKey')(first)
    const unbindSecond = box.field('org.name')(second)
    unbindFirst?.()
    expect(first.value).to.eq('')
    expect(second.value).to.eq('acme')
    expect(box.getSnapshot().exposed).to.be.true
    unbindSecond?.()
    expect(second.value).to.eq('')
    expect(box.getSnapshot().exposed).to.be.false
  })

  it("stops hearing, so that a lock writes to no element let go", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    const unbind = box.field('apiKey', { whenLocked: 'mask' })(el)
    unbind?.()
    held.mw.setLockState('locked')
    expect(el.value).to.eq('')
  })

  it("binds again from nothing, and hears again", async () => {
    const box = await unexposedOf()

    const el = elOf()
    box.field('apiKey')(el)?.()
    await box.expose()
    box.field('apiKey', { whenLocked: 'mask' })(el)
    expect(el.value).to.eq(Stored.apiKey)
    held.mw.setLockState('locked')
    expect(el.value).to.eq(WhisperMask)
  })
})
