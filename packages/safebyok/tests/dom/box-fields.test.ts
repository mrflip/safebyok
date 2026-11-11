/** A box's fields: `fields.bind` following the whisper through a lock and a veil, reading edits on the way into hiding, `fields.put`, and the last unbind. */

import { describe, expect, it, vi } from 'vitest'
import { BoxFields } from '../../src/dom/box-fields'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

const Stored = { apiKey: 'sk-test-0000', org: { name: 'acme', seats: 3 }, tags: ['a', 'b'] }

/** A box whose whisper is {@link Stored}, not exposed. */
async function unexposedOf(): Promise<TestableBox> {
  const record = fullBoxRecord()
  world.mw.seedPut(record)
  const box = await boxListingOf(world.mw).build(record)
  return box.put({ whisper: Stored })
}

const elOf = (text = ''): { value: string } => ({ value: text })

describe("BoxFields.of", () => {
  it("returns one instance per box", async () => {
    const box = await unexposedOf()

    expect(BoxFields.of(box)).to.eq(BoxFields.of(box))
    expect(BoxFields.of(box).box).to.eq(box)
  })

  it("refuses what is not a box", () => {
    const err = TH.expectSyncRefusal(() => BoxFields.of({ whisper: {} } as never), 'bad_option')
    expect(err.message).to.include(Phrases.BoxExpected)
  })
})

describe("fields.bind: what an element shows", () => {
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
      BoxFields.of(box).bind(path)(el)
      expect(el.value).to.eq(shown)
    })
  }

  it("is blank while not exposed, and fills at an expose", async () => {
    const box = await unexposedOf()

    const el = elOf('was here')
    BoxFields.of(box).bind('apiKey')(el)
    expect(el.value).to.eq('')
    await box.expose()
    expect(el.value).to.eq(Stored.apiKey)
  })

  it("returns the same ref callback for the same path", async () => {
    const box = await unexposedOf()

    expect(BoxFields.of(box).bind('apiKey')).to.eq(BoxFields.of(box).bind('apiKey'))
    expect(BoxFields.of(box).bind('apiKey')).not.to.eq(BoxFields.of(box).bind('org.name'))
  })

  it("does nothing when given null", async () => {
    const box = await unexposedOf()

    expect(BoxFields.of(box).bind('apiKey')(null)).to.eq(undefined)
  })

  it("refuses an empty path", async () => {
    const box = await unexposedOf()

    TH.expectSyncRefusal(() => BoxFields.of(box).bind(''), 'bad_option')
  })
})

describe("fields.bind: into hiding and back", () => {
  const HidingCases = [
    ['a lock',  () => { world.mw.setLocked(true) }, () => { world.mw.setLocked(false) }],
    ['a veil',  (box: TestableBox) => { box.veil() }, (box: TestableBox) => { box.unveil() }],
  ] as const
  for (const [blurb, hide, show] of HidingCases) {
    it(`writes a blank at ${blurb}, and the value at its end`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const keyEl = elOf()
      const seatsEl = elOf()
      BoxFields.of(box).bind('apiKey')(keyEl)
      BoxFields.of(box).bind('org.seats')(seatsEl)
      hide(box)
      expect([keyEl.value, seatsEl.value]).to.deep.equal(['', ''])
      show(box)
      expect([keyEl.value, seatsEl.value]).to.deep.equal([Stored.apiKey, '3'])
    })

    it(`reads an edit on the way into ${blurb}, and brings it back`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const el = elOf()
      BoxFields.of(box).bind('apiKey')(el)
      el.value = 'sk-edited'
      hide(box)
      expect(el.value).to.eq('')
      show(box)
      expect(el.value).to.eq('sk-edited')
      expect(box.whisper).to.deep.equal({ ...Stored, apiKey: 'sk-edited' })
    })

    it(`never reads back what is typed during ${blurb}`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const exposed = box.whisper
      const el = elOf()
      BoxFields.of(box).bind('apiKey')(el)
      hide(box)
      el.value = 'typed while hidden'
      show(box)
      expect(el.value).to.eq(Stored.apiKey)
      expect(box.whisper).to.eq(exposed)
    })
  }

  it("leaves a number a number when its text was not edited, through a hiding and a put", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    BoxFields.of(box).bind('org.seats')(el)
    box.veil().unveil()
    await BoxFields.of(box).put()
    expect(await box.extractWhisper()).to.deep.equal(Stored)
  })

  it("keeps an edit when another field changes", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    BoxFields.of(box).bind('apiKey')(el)
    el.value = 'sk-editing'
    box.patchWhisper({ org: { seats: 4 } })
    expect(el.value).to.eq('sk-editing')
  })

  it("shows the new value of a field that changed", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    BoxFields.of(box).bind('apiKey')(el)
    box.patchWhisper({ apiKey: 'sk-patched' })
    expect(el.value).to.eq('sk-patched')
  })

  it("does not pollute any prototype with an edit at a path through one", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    BoxFields.of(box).bind('__proto__.polluted')(el)
    el.value = 'edited'
    await BoxFields.of(box).put()
    expect(({} as { polluted?: string }).polluted).to.eq(undefined)
    expect(await box.extractWhisper()).to.deep.equal(Stored)
  })

  const EndingCases = [
    ['box.unexpose()', (box: TestableBox) => { box.unexpose() }],
    ['a sweep',        (box: TestableBox) => { box.sweep() }],
    ['a vacate',       (box: TestableBox) => { box.vacate() }],
  ] as const
  for (const [blurb, end] of EndingCases) {
    it(`goes blank at ${blurb}`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const el = elOf()
      BoxFields.of(box).bind('apiKey')(el)
      end(box)
      expect(el.value).to.eq('')
    })
  }

  it("goes blank at a delete", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    BoxFields.of(box).bind('apiKey')(el)
    await box.del(box.scope)
    expect(el.value).to.eq('')
  })
})

describe("fields.put", () => {
  it("merges each edited field over the value, and seals one put", async () => {
    const box = await unexposedOf()

    await box.expose()
    const keyEl = elOf()
    const nameEl = elOf()
    BoxFields.of(box).bind('apiKey')(keyEl)
    BoxFields.of(box).bind('org.name')(nameEl)
    keyEl.value = 'sk-saved'
    nameEl.value = 'zenith'
    const tryPutBox = vi.spyOn(world.mw.vaultDB, 'tryPutBox')
    expect(await BoxFields.of(box).put()).to.eq(box)
    expect(tryPutBox).toHaveBeenCalledOnce()
    const merged = { ...Stored, apiKey: 'sk-saved', org: { name: 'zenith', seats: 3 } }
    expect(await box.extractWhisper()).to.deep.equal(merged)
    expect(box.whisper).to.deep.equal(merged)
    expect([keyEl.value, nameEl.value]).to.deep.equal(['sk-saved', 'zenith'])
  })

  it("makes a new whisper only when a field was edited", async () => {
    const box = await unexposedOf()

    await box.expose()
    const exposed = box.whisper
    const el = elOf()
    BoxFields.of(box).bind('apiKey')(el)
    await BoxFields.of(box).put()
    expect(box.whisper).to.eq(exposed)
    const told = vi.fn()
    box.subscribe(told)
    el.value = 'sk-saved'
    await BoxFields.of(box).put()
    expect(box.whisper).not.to.eq(exposed)
    expect(exposed).to.deep.equal(Stored)
    expect(told).toHaveBeenCalled()
  })

  it("keeps the edit in the value when the put is refused", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    BoxFields.of(box).bind('apiKey')(el)
    el.value = 'sk-unsaved'
    await TH.expectRefusal(BoxFields.of(box).put({ ifPresent: 'nonesuch' as 'repl' }), 'bad_option')
    expect(box.whisper).to.deep.include({ apiKey: 'sk-unsaved' })
  })

  it("refuses with no field bound, with none exposed, while veiled, and while locked", async () => {
    const box = await unexposedOf()

    const noFields = await TH.expectRefusal(BoxFields.of(box).put(), 'bad_option')
    expect(noFields.message).to.eq(Phrases.NoFieldsBound)
    BoxFields.of(box).bind('apiKey')(elOf())
    const notExposed = await TH.expectRefusal(BoxFields.of(box).put(), 'bad_option')
    expect(notExposed.message).to.eq(Phrases.NotExposed)
    await box.expose()
    box.veil()
    const veiled = await TH.expectRefusal(BoxFields.of(box).put(), 'bad_option')
    expect(veiled.message).to.eq(Phrases.PuttingVeiledFields)
    box.unveil()
    world.mw.setLocked(true)
    await TH.expectRefusal(BoxFields.of(box).put(), 'vault_locked')
  })

  it("has a try form that returns an Outcome", async () => {
    const box = await unexposedOf()

    const outcome = await BoxFields.of(box).tryPut()
    expect(outcome.ok).to.be.false
  })
})

describe("fields.bind: the last unbind", () => {
  it("unexposes only when the last bound element unbinds", async () => {
    const box = await unexposedOf()

    await box.expose()
    const first = elOf()
    const second = elOf()
    const unbindFirst = BoxFields.of(box).bind('apiKey')(first)
    const unbindSecond = BoxFields.of(box).bind('org.name')(second)
    unbindFirst?.()
    expect(first.value).to.eq('')
    expect(second.value).to.eq('acme')
    expect(box.getSnapshot().isExposed).to.be.true
    unbindSecond?.()
    expect(second.value).to.eq('')
    expect(box.getSnapshot().isExposed).to.be.false
  })

  it("writes nothing to an unbound element at a lock", async () => {
    const box = await unexposedOf()

    await box.expose()
    const el = elOf()
    const unbind = BoxFields.of(box).bind('apiKey')(el)
    unbind?.()
    el.value = 'let go'
    world.mw.setLocked(true)
    expect(el.value).to.eq('let go')
  })

  it("follows the box again when bound after the last unbind", async () => {
    const box = await unexposedOf()

    const el = elOf()
    BoxFields.of(box).bind('apiKey')(el)?.()
    await box.expose()
    BoxFields.of(box).bind('apiKey')(el)
    expect(el.value).to.eq(Stored.apiKey)
    world.mw.setLocked(true)
    expect(el.value).to.eq('')
  })
})
